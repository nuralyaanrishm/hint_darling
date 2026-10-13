import { Prisma } from "@prisma/client";
import { Router, type Request } from "express";
import {
  ALREADY_CLAIMED_CODE,
  ALREADY_CLAIMED_MESSAGE,
  cancelClaimByToken,
  claimGift,
  getClaimByToken,
  toPublicClaimDto,
} from "../lib/claims.js";
import { HttpError } from "../lib/errors.js";
import {
  isValidShareToken,
  loadPublicWishlist,
} from "../lib/publicWishlist.js";
import { parseOrThrow, createClaimSchema } from "../lib/validation.js";
import { claimLimiter, publicReadLimiter } from "../middleware/rateLimit.js";

export const publicRouter = Router();

// Public, unauthenticated guest endpoints under /api/public. Guests may read a
// shared wishlist and claim gifts, but they still need the CSRF token (enforced
// globally) for any mutation, and claiming a gift can only ever target an item
// the caller has reached through a valid public wishlist link.
publicRouter.use(publicReadLimiter);

// GET /api/public/wishlists/:shareToken — read a shared wishlist as a guest.
//
// Unknown, malformed, inactive and private lists all return the same 404 so a
// caller cannot tell an unused token from a disabled one. Responses are never
// cached, so a list that is switched off stops being publicly readable
// immediately.
publicRouter.get("/wishlists/:shareToken", async (req, res) => {
  const { shareToken } = req.params;

  if (!isValidShareToken(shareToken)) {
    throw new HttpError(404, "Not found");
  }

  const wishlist = await loadPublicWishlist(shareToken);

  if (!wishlist) {
    throw new HttpError(404, "Not found");
  }

  res.set("Cache-Control", "no-store");
  res.json({ wishlist });
});

// POST /api/public/wishlists/:shareToken/items/:itemId/claims — claim a gift.
//
// Reserved for guests (and signed-in visitors): it only works through an item
// that lives on an active, link-shareable wishlist. Claiming is atomic — two
// simultaneous requests for the same item can never both succeed.
publicRouter.post(
  "/wishlists/:shareToken/items/:itemId/claims",
  claimLimiter,
  async (
    req: Request<{ shareToken: string; itemId: string }>,
    res,
  ) => {
    const { shareToken, itemId } = req.params;

    if (!isValidShareToken(shareToken)) {
      throw new HttpError(404, "Not found");
    }

    const data = parseOrThrow(createClaimSchema, req.body);

    try {
      const result = await claimGift({
        shareToken,
        itemId,
        claimantUserId: req.auth?.user.id ?? null,
        claimantName: data.claimantName ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
      });

      res.status(result.created ? 201 : 200).json({ claim: result.claim });
    } catch (error) {
      // The partial unique index is the last line of defence. If two writes
      // slip past the row lock (e.g. different app instances), a violated
      // constraint is still reported as the same friendly conflict.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        typeof error.meta?.target === "object" &&
        error.meta.target !== null
      ) {
        throw new HttpError(
          409,
          ALREADY_CLAIMED_MESSAGE,
          undefined,
          ALREADY_CLAIMED_CODE,
        );
      }
      throw error;
    }
  },
);

// GET /api/public/claims/:token — view a claim with its management token.
//
// The token is an unguessable secret only ever shown to the gift-giver at claim
// time; it is stored hashed and grants access to exactly one claim.
publicRouter.get(
  "/claims/:token",
  claimLimiter,
  async (req: Request<{ token: string }>, res) => {
    const { token } = req.params;

    if (!isValidShareToken(token)) {
      throw new HttpError(404, "Not found");
    }

    const claim = await getClaimByToken(token);
    res.set("Cache-Control", "no-store");
    res.json({ claim: toPublicClaimDto(claim) });
  },
);

// POST /api/public/claims/:token/cancel — a gift-giver releases their claim.
//
// Only the holder of the management token can cancel. A cancelled item becomes
// available for another guest to claim. Cancelling an already-cancelled claim
// is idempotent.
publicRouter.post(
  "/claims/:token/cancel",
  claimLimiter,
  async (req: Request<{ token: string }>, res) => {
    const { token } = req.params;

    if (!isValidShareToken(token)) {
      throw new HttpError(404, "Not found");
    }

    const result = await cancelClaimByToken(token);
    res.json({ claim: result.claim });
  },
);