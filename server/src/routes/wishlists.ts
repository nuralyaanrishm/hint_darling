import { Router } from "express";
import { isEventUnlocked } from "../lib/entitlements.js";
import { HttpError } from "../lib/errors.js";
import { getOwnedWishlist } from "../lib/ownership.js";
import {
  EVENT_PASS,
  itemLimitFor,
} from "../lib/plans.js";
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

// Claim status is public; only the guest's display name is gated, per event.
async function viewerFor(
  userId: string,
  eventId: string,
): Promise<OwnerViewer> {
  const unlocked = await isEventUnlocked(userId, eventId);
  return { canViewClaimantNames: unlocked, eventUnlocked: unlocked };
}

// Every wishlist and item route requires a signed-in owner.
wishlistsRouter.use(requireAuth);

// GET /api/wishlists/:wishlistId — wishlist detail with its items.
wishlistsRouter.get("/:wishlistId", async (req, res) => {
  const userId = currentUserId(req);
  const owned = await getOwnedWishlist(userId, req.params.wishlistId);
  const viewer = await viewerFor(userId, owned.event.id);
  res.json({ wishlist: toWishlistDto(owned, viewer) });
});

// PATCH /api/wishlists/:wishlistId — update title/description.
wishlistsRouter.patch("/:wishlistId", async (req, res) => {
  const userId = currentUserId(req);
  const owned = await getOwnedWishlist(userId, req.params.wishlistId);
  const data = parseOrThrow(updateWishlistSchema, req.body);

  await prisma.wishlist.update({
    where: { id: owned.id },
    data: {
      title: data.title,
      description: data.description,
      ...(data.privacyMode ? { privacyMode: data.privacyMode } : {}),
    },
  });

  const viewer = await viewerFor(userId, owned.event.id);
  const wishlist = await getOwnedWishlist(userId, owned.id);
  res.json({ wishlist: toWishlistDto(wishlist, viewer) });
});

// POST /api/wishlists/:wishlistId/items — append a gift item.
//
// Without an unlocked event, a wishlist may hold at most the plan's item limit
// (Free: five). An Event Pass or Pro account unlocks unlimited gifts. The count
// and insert run inside one transaction with the wishlist row locked, so two
// simultaneous requests cannot both slip through on the last free slot.
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

    const unlocked = await isEventUnlocked(
      userId,
      wishlist.event.id,
      tx,
    );
    const itemLimit = itemLimitFor(owner.plan, unlocked);

    if (itemLimit !== null) {
      const itemCount = await tx.wishlistItem.count({
        where: { wishlistId: wishlist.id },
      });

      if (itemCount >= itemLimit) {
        const passPrice = (EVENT_PASS.priceSen / 100).toFixed(2);
        throw new HttpError(
          402,
          `Your event includes ${itemLimit} gifts. Unlock this event for RM${passPrice} to add unlimited gifts.`,
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
        claims: {
          where: { status: "CLAIMED" },
          select: { id: true, claimantName: true },
        },
      },
    });
  });

  const viewer = await viewerFor(userId, wishlist.event.id);
  res.status(201).json({ item: toWishlistItemDto(item, viewer) });
});

// PATCH /api/wishlists/:wishlistId/items/reorder — persist a new item order.
// Registered before the `:itemId` route so "reorder" is not read as an id.
wishlistsRouter.patch("/:wishlistId/items/reorder", async (req, res) => {
  const userId = currentUserId(req);
  const wishlist = await getOwnedWishlist(userId, req.params.wishlistId);
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

  const viewer = await viewerFor(userId, wishlist.event.id);
  const fresh = await getOwnedWishlist(userId, wishlist.id);
  res.json({ wishlist: toWishlistDto(fresh, viewer) });
});

// PATCH /api/wishlists/:wishlistId/items/:itemId — update a gift item.
wishlistsRouter.patch("/:wishlistId/items/:itemId", async (req, res) => {
  const userId = currentUserId(req);
  const wishlist = await getOwnedWishlist(userId, req.params.wishlistId);
  const data = parseOrThrow(updateWishlistItemSchema, req.body);

  const item = await prisma.wishlistItem.findFirst({
    where: { id: req.params.itemId, wishlistId: wishlist.id },
  });

  if (!item) {
    throw new HttpError(404, "Not found");
  }

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
        select: { id: true, claimantName: true },
      },
    },
  });

  const viewer = await viewerFor(userId, wishlist.event.id);
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
