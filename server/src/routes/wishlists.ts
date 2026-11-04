import { Router } from "express";
import type { Request } from "express";
import { HttpError } from "../lib/errors.js";
import { getOwnedWishlist } from "../lib/ownership.js";
import { PLAN_CONFIG, hasClaimTracking, itemLimitFor } from "../lib/plans.js";
import { prisma } from "../lib/prisma.js";
import {
  toWishlistDto,
  toWishlistItemDto,
  type OwnerViewer,
} from "../lib/serializers.js";
import {
  createWishlistItemSchema,
  parseOrThrow,
  reorderItemsSchema,
  updateWishlistItemSchema,
  updateWishlistSchema,
} from "../lib/validation.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";

export const wishlistsRouter = Router();

// Claim insights are a Plus/Pro feature; the serializer uses this to decide
// whether claimed counts and per-item claim status are included in responses.
function ownerViewer(req: Request): OwnerViewer {
  return {
    canViewClaims: req.auth ? hasClaimTracking(req.auth.user.plan) : false,
  };
}

// Every wishlist and item route requires a signed-in owner.
wishlistsRouter.use(requireAuth);

// GET /api/wishlists/:wishlistId — wishlist detail with its items.
wishlistsRouter.get("/:wishlistId", async (req, res) => {
  const viewer = ownerViewer(req);
  const wishlist = await getOwnedWishlist(
    currentUserId(req),
    req.params.wishlistId,
    { includeClaimantName: viewer.canViewClaims },
  );
  res.json({ wishlist: toWishlistDto(wishlist, viewer) });
});

// PATCH /api/wishlists/:wishlistId — update title/description.
wishlistsRouter.patch("/:wishlistId", async (req, res) => {
  const owned = await getOwnedWishlist(
    currentUserId(req),
    req.params.wishlistId,
  );
  const data = parseOrThrow(updateWishlistSchema, req.body);

  await prisma.wishlist.update({
    where: { id: owned.id },
    data: {
      title: data.title,
      description: data.description,
      ...(data.privacyMode ? { privacyMode: data.privacyMode } : {}),
    },
  });

  const viewer = ownerViewer(req);
  const wishlist = await getOwnedWishlist(currentUserId(req), owned.id, {
    includeClaimantName: viewer.canViewClaims,
  });
  res.json({ wishlist: toWishlistDto(wishlist, viewer) });
});

// POST /api/wishlists/:wishlistId/items — append a gift item.
//
// Free accounts may add at most their plan's item limit per wishlist. Paid
// tiers are unlimited. The count and insert run inside one transaction with the
// wishlist row locked, so two simultaneous requests cannot both slip through on
// the last free slot.
wishlistsRouter.post("/:wishlistId/items", async (req, res) => {
  const userId = currentUserId(req);
  const wishlist = await getOwnedWishlist(userId, req.params.wishlistId);
  const data = parseOrThrow(createWishlistItemSchema, req.body);

  const item = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "wishlists" WHERE "id" = ${wishlist.id} FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new HttpError(404, "Not found");
    }

    const owner = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });

    const itemLimit = itemLimitFor(owner.plan);

    if (itemLimit !== null) {
      const itemCount = await tx.wishlistItem.count({
        where: { wishlistId: wishlist.id },
      });

      if (itemCount >= itemLimit) {
        const plusPrice = PLAN_CONFIG.PLUS.priceSen / 100;
        throw new HttpError(
          402,
          `Your ${PLAN_CONFIG[owner.plan].label} plan includes ${itemLimit} gifts per wishlist. Upgrade to Darling Plus for unlimited gifts from RM${plusPrice.toFixed(2)}.`,
          undefined,
          "ITEM_LIMIT_REACHED",
        );
      }
    }

    const aggregate = await tx.wishlistItem.aggregate({
      where: { wishlistId: wishlist.id },
      _max: { position: true },
    });
    const position = (aggregate._max.position ?? -1) + 1;

    return tx.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        name: data.name,
        productUrl: data.productUrl ?? null,
        imageUrl: data.imageUrl ?? null,
        price: data.price ?? null,
        currency: data.currency ?? "GBP",
        description: data.description ?? null,
        preferredColour: data.preferredColour ?? null,
        preferredSize: data.preferredSize ?? null,
        preferredVariation: data.preferredVariation ?? null,
        quantity: data.quantity ?? 1,
        notes: data.notes ?? null,
        position,
      },
      include: {
        claims: { where: { status: "CLAIMED" }, select: { id: true } },
      },
    });
  });

  res.status(201).json({ item: toWishlistItemDto(item, ownerViewer(req)) });
});

// PATCH /api/wishlists/:wishlistId/items/reorder — persist a new item order.
// Registered before the `:itemId` route so "reorder" is not read as an id.
wishlistsRouter.patch("/:wishlistId/items/reorder", async (req, res) => {
  const wishlist = await getOwnedWishlist(
    currentUserId(req),
    req.params.wishlistId,
  );
  const { itemIds } = parseOrThrow(reorderItemsSchema, req.body);

  const existing = await prisma.wishlistItem.findMany({
    where: { wishlistId: wishlist.id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((item) => item.id));

  if (
    itemIds.length !== existingIds.size ||
    !itemIds.every((id) => existingIds.has(id))
  ) {
    throw new HttpError(
      400,
      "That order is out of date. Please refresh and try again.",
    );
  }

  await prisma.$transaction(
    itemIds.map((id, index) =>
      prisma.wishlistItem.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );

  const viewer = ownerViewer(req);
  const fresh = await getOwnedWishlist(currentUserId(req), wishlist.id, {
    includeClaimantName: viewer.canViewClaims,
  });
  res.json({ wishlist: toWishlistDto(fresh, viewer) });
});

// PATCH /api/wishlists/:wishlistId/items/:itemId — update a gift item.
wishlistsRouter.patch("/:wishlistId/items/:itemId", async (req, res) => {
  const wishlist = await getOwnedWishlist(
    currentUserId(req),
    req.params.wishlistId,
  );
  const data = parseOrThrow(updateWishlistItemSchema, req.body);

  const item = await prisma.wishlistItem.findFirst({
    where: { id: req.params.itemId, wishlistId: wishlist.id },
  });

  if (!item) {
    throw new HttpError(404, "Not found");
  }

  const viewer = ownerViewer(req);
  const updated = await prisma.wishlistItem.update({
    where: { id: item.id },
    data: {
      name: data.name,
      productUrl: data.productUrl,
      imageUrl: data.imageUrl,
      price: data.price,
      currency: data.currency,
      description: data.description,
      preferredColour: data.preferredColour,
      preferredSize: data.preferredSize,
      preferredVariation: data.preferredVariation,
      quantity: data.quantity,
      notes: data.notes,
    },
    include: {
      claims: {
        where: { status: "CLAIMED" },
        select: viewer.canViewClaims
          ? { id: true, claimantName: true }
          : { id: true },
      },
    },
  });

  res.json({ item: toWishlistItemDto(updated, viewer) });
});

// DELETE /api/wishlists/:wishlistId/items/:itemId — remove a gift item.
wishlistsRouter.delete("/:wishlistId/items/:itemId", async (req, res) => {
  const wishlist = await getOwnedWishlist(
    currentUserId(req),
    req.params.wishlistId,
  );

  const item = await prisma.wishlistItem.findFirst({
    where: { id: req.params.itemId, wishlistId: wishlist.id },
    select: { id: true },
  });

  if (!item) {
    throw new HttpError(404, "Not found");
  }

  await prisma.wishlistItem.delete({ where: { id: item.id } });
  res.status(204).end();
});
