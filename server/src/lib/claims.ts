import { Prisma } from "@prisma/client";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import { generateToken, hashToken } from "./tokens.js";

// Gift-claiming logic.
//
// Concurrency: claiming is never "check then insert" from the application's
// point of view. A claim runs inside a single database transaction that takes a
// `FOR UPDATE` lock on the item row first, so two simultaneous requests for the
// same gift serialise: the loser re-reads the item after the winner commits,
// sees the winner's active claim and is rejected. As a hard guarantee, a
// partial unique index (`gift_claims_one_active_per_item`, see the hand-written
// migration) refuses a second active claim per item at the database level, so
// there can never be more than one active claim per item no matter what path
// writes to `gift_claims`.

export const ALREADY_CLAIMED_MESSAGE = "Oops, someone's got this for them! 🎁";
export const ALREADY_CLAIMED_CODE = "ALREADY_CLAIMED";

/** The friendly hint shown next to the “already claimed” error. */
export const SUGGEST_ANOTHER_MESSAGE =
  "Why not pick another gift instead? There are plenty to choose from.";

interface GiftClaimRecord {
  id: string;
  claimantName: string | null;
  status: "CLAIMED" | "CANCELLED";
  claimedAt: Date;
  cancelledAt: Date | null;
  wishlistItem: {
    name: string;
    imageUrl: string | null;
    price: { toString(): string } | null;
    currency: string;
    wishlist: {
      event: { name: string };
    };
  };
}

export interface ClaimedGiftResult {
  claim: {
    id: string;
    status: "CLAIMED";
    claimedAt: string;
    claimantName: string | null;
    /** Raw management token. Only ever handed to the claimant themselves. */
    manageToken: string;
  };
  /** True when this request created a new claim; false on an idempotent retry. */
  created: boolean;
}

/**
 * Atomically claims a gift from a public wishlist. Guarantees at most one
 * active claim per item; concurrent calls for the same item serialise and only
 * one succeeds. Returns `ALREADY_CLAIMED` (via `HttpError`) when the item is
 * already taken.
 */
export async function claimGift(input: {
  shareToken: string;
  itemId: string;
  claimantUserId: string | null;
  claimantName: string | null;
  idempotencyKey: string | null;
}): Promise<ClaimedGiftResult> {
  return prisma.$transaction(async (tx) => {
    // Lock the item's row inside the transaction. Two simultaneous claims for
    // the same gift queue here; the second re-reads after the first commits and
    // therefore sees its claim. Only active, non-private lists are claimable.
    const matches = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT wi."id"
        FROM "wishlist_items" AS wi
        JOIN "wishlists" AS w ON w."id" = wi."wishlistId"
        WHERE wi."id" = ${input.itemId}
          AND w."shareToken" = ${input.shareToken}
          AND w."isActive" = true
          AND w."privacyMode" <> 'PRIVATE'
        FOR UPDATE OF wi
      `,
    );

    if (matches.length === 0) {
      throw new HttpError(404, "Not found");
    }

    // An idempotent retry returns the original claim (with a fresh management
    // token, since the first token was only ever sent to this caller once). A
    // cancelled claim being requested again with the same key means the guest
    // is re-claiming, which simply reactivates the same row.
    if (input.idempotencyKey) {
      const existing = await tx.giftClaim.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (existing && existing.wishlistItemId === input.itemId) {
        const manageToken = generateToken();

        if (existing.status === "CLAIMED") {
          const refreshed = await tx.giftClaim.update({
            where: { id: existing.id },
            data: { claimTokenHash: hashToken(manageToken) },
          });

          return {
            claim: toClaimResponse(refreshed, manageToken),
            created: false,
          };
        }

        await tx.giftClaim.update({
          where: { id: existing.id },
          data: {
            status: "CLAIMED",
            claimTokenHash: hashToken(manageToken),
            claimedAt: new Date(),
            cancelledAt: null,
          },
        });

        const reactivated = await tx.giftClaim.findUniqueOrThrow({
          where: { id: existing.id },
        });

        return {
          claim: toClaimResponse(reactivated, manageToken),
          created: true,
        };
      }

      if (existing) {
        throw new HttpError(
          409,
          ALREADY_CLAIMED_MESSAGE,
          undefined,
          ALREADY_CLAIMED_CODE,
        );
      }
    }

    const active = await tx.giftClaim.findFirst({
      where: { wishlistItemId: input.itemId, status: "CLAIMED" },
      select: { id: true },
    });

    if (active) {
      throw new HttpError(
        409,
        ALREADY_CLAIMED_MESSAGE,
        undefined,
        ALREADY_CLAIMED_CODE,
      );
    }

    const manageToken = generateToken();
    const claim = await tx.giftClaim.create({
      data: {
        wishlistItemId: input.itemId,
        claimantUserId: input.claimantUserId,
        claimantName: input.claimantName,
        claimTokenHash: hashToken(manageToken),
        idempotencyKey: input.idempotencyKey,
        status: "CLAIMED",
      },
    });

    return { claim: toClaimResponse(claim, manageToken), created: true };
  });
}

function toClaimResponse(
  claim: {
    id: string;
    claimantName: string | null;
    claimedAt: Date;
  },
  manageToken: string,
): ClaimedGiftResult["claim"] {
  return {
    id: claim.id,
    status: "CLAIMED",
    claimedAt: claim.claimedAt.toISOString(),
    claimantName: claim.claimantName,
    // The raw token is the only secret handed to the gift-giver. It is never
    // persisted, never logged, and never included in any public response.
    manageToken,
  };
}

export interface PublicClaimDto {
  status: "CLAIMED" | "CANCELLED";
  claimedAt: string;
  cancelledAt: string | null;
  claimantName: string | null;
  gift: {
    name: string;
    imageUrl: string | null;
    price: string | null;
    currency: string;
  };
  event: { name: string };
}

/** Public projection of a claim for its rightful holder (the gift-giver). */
export function toPublicClaimDto(claim: GiftClaimRecord): PublicClaimDto {
  return {
    status: claim.status,
    claimedAt: claim.claimedAt.toISOString(),
    cancelledAt: claim.cancelledAt?.toISOString() ?? null,
    // The gift-giver may only ever see their *own* name.
    claimantName: claim.claimantName,
    gift: {
      name: claim.wishlistItem.name,
      imageUrl: claim.wishlistItem.imageUrl,
      price:
        claim.wishlistItem.price === null
          ? null
          : claim.wishlistItem.price.toString(),
      currency: claim.wishlistItem.currency,
    },
    event: { name: claim.wishlistItem.wishlist.event.name },
  };
}

/** Looks up a claim from its raw management token. */
export async function getClaimByToken(rawToken: string) {
  const claim = await prisma.giftClaim.findUnique({
    where: { claimTokenHash: hashToken(rawToken) },
    include: {
      wishlistItem: {
        select: {
          name: true,
          imageUrl: true,
          currency: true,
          price: true,
          wishlist: {
            select: { event: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!claim) {
    throw new HttpError(404, "Not found");
  }

  return claim;
}

export interface CancelledClaimResult {
  claim: { status: "CANCELLED"; cancelledAt: string };
}

// ---------------------------------------------------------------------------
// Signed-in gift-giver views
//
// These helpers answer a single question — "what has *this* user claimed?" —
// and are always scoped by `claimantUserId`. They never return another person's
// claim, and the selected fields deliberately exclude every other claimant's
// identity and the management-token hash.
// ---------------------------------------------------------------------------

export interface MyClaimDto {
  id: string;
  status: "CLAIMED" | "CANCELLED";
  claimedAt: string;
  cancelledAt: string | null;
  /** The signed-in gift-giver's own display name, when they provided one. */
  claimantName: string | null;
  gift: {
    id: string;
    name: string;
    imageUrl: string | null;
    price: string | null;
    currency: string;
  };
  event: {
    id: string;
    name: string;
    eventDate: string | null;
  };
}

interface MyClaimRecord {
  id: string;
  status: "CLAIMED" | "CANCELLED";
  claimedAt: Date;
  cancelledAt: Date | null;
  claimantName: string | null;
  wishlistItem: {
    id: string;
    name: string;
    imageUrl: string | null;
    price: { toString(): string } | null;
    currency: string;
    wishlist: {
      event: { id: string; name: string; eventDate: Date | null };
    };
  };
}

function toMyClaimDto(claim: MyClaimRecord): MyClaimDto {
  return {
    id: claim.id,
    status: claim.status,
    claimedAt: claim.claimedAt.toISOString(),
    cancelledAt: claim.cancelledAt?.toISOString() ?? null,
    claimantName: claim.claimantName,
    gift: {
      id: claim.wishlistItem.id,
      name: claim.wishlistItem.name,
      imageUrl: claim.wishlistItem.imageUrl,
      price:
        claim.wishlistItem.price === null
          ? null
          : claim.wishlistItem.price.toString(),
      currency: claim.wishlistItem.currency,
    },
    event: {
      id: claim.wishlistItem.wishlist.event.id,
      name: claim.wishlistItem.wishlist.event.name,
      eventDate:
        claim.wishlistItem.wishlist.event.eventDate?.toISOString() ?? null,
    },
  };
}

/** Lists the claims made by one signed-in gift-giver; nobody else's. */
export async function listClaimsForUser(userId: string): Promise<MyClaimDto[]> {
  const claims = await prisma.giftClaim.findMany({
    where: { claimantUserId: userId },
    orderBy: [{ status: "asc" }, { claimedAt: "desc" }],
    include: {
      wishlistItem: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          price: true,
          currency: true,
          wishlist: {
            select: {
              event: { select: { id: true, name: true, eventDate: true } },
            },
          },
        },
      },
    },
  });

  return claims.map(toMyClaimDto);
}

/**
 * Releases one of the signed-in gift-giver's own claims. The `claimantUserId`
 * filter means a caller can never touch another person's reservation; an id
 * they do not own surfaces as a 404, exactly like a missing claim.
 */
export async function cancelClaimForUser(
  userId: string,
  claimId: string,
): Promise<CancelledClaimResult> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.giftClaim.findFirst({
      where: { id: claimId, claimantUserId: userId },
      select: { id: true, status: true, cancelledAt: true },
    });

    if (!claim) {
      throw new HttpError(404, "Not found");
    }

    if (claim.status === "CANCELLED") {
      return {
        claim: {
          status: "CANCELLED" as const,
          cancelledAt: (claim.cancelledAt ?? new Date()).toISOString(),
        },
      };
    }

    const cancelled = await tx.giftClaim.update({
      where: { id: claim.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    return {
      claim: {
        status: "CANCELLED",
        cancelledAt: cancelled.cancelledAt!.toISOString(),
      },
    };
  });
}

/**
 * Cancels a claim using its management token. Only the holder of the token —
 * the gift-giver — can do this. Cancelling frees the item so another guest can
 * claim it. Cancelling an already-cancelled claim is idempotent.
 */
export async function cancelClaimByToken(rawToken: string): Promise<CancelledClaimResult> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.giftClaim.findUnique({
      where: { claimTokenHash: hashToken(rawToken) },
      select: { id: true, status: true, cancelledAt: true },
    });

    if (!claim) {
      throw new HttpError(404, "Not found");
    }

    if (claim.status === "CANCELLED") {
      return {
        claim: {
          status: "CANCELLED" as const,
          cancelledAt: (claim.cancelledAt ?? new Date()).toISOString(),
        },
      };
    }

    const cancelled = await tx.giftClaim.update({
      where: { id: claim.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    return {
      claim: {
        status: "CANCELLED",
        cancelledAt: cancelled.cancelledAt!.toISOString(),
      },
    };
  });
}