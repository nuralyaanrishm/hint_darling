import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";

// Ownership lookups. Every one returns a 404 (never 403) when a record is
// missing or belongs to somebody else, so changing an ID in a URL never
// reveals whether another user's data exists.

const itemOrder = [
  { position: "asc" as const },
  { createdAt: "asc" as const },
];

// Owner views only ever need to know *that* a gift is claimed. We select claim
// ids alone, never `claimantName`, `claimantUserId` or `claimTokenHash`, so the
// private gift-giver identity is not even loaded from the database.
const activeClaimSelect = {
  where: { status: "CLAIMED" as const },
  select: { id: true },
};

const ownedItemsInclude = {
  orderBy: itemOrder,
  include: { claims: activeClaimSelect },
};

/** Loads an event plus its wishlist and items, scoped to the owner. */
export async function getOwnedEvent(userId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId: userId },
    include: {
      wishlist: {
        include: { items: ownedItemsInclude },
      },
    },
  });

  if (!event) {
    throw new HttpError(404, "Not found");
  }

  return event;
}

/** Loads a wishlist plus its event, scoped to the event owner. */
export async function getOwnedWishlist(userId: string, wishlistId: string) {
  const wishlist = await prisma.wishlist.findFirst({
    where: { id: wishlistId, event: { ownerId: userId } },
    include: {
      event: { select: { id: true, name: true, ownerId: true } },
      items: ownedItemsInclude,
    },
  });

  if (!wishlist) {
    throw new HttpError(404, "Not found");
  }

  return wishlist;
}

/** Loads a single item, scoped to the owner of the wishlist's event. */
export async function getOwnedItem(userId: string, itemId: string) {
  const item = await prisma.wishlistItem.findFirst({
    where: { id: itemId, wishlist: { event: { ownerId: userId } } },
    include: { wishlist: { select: { id: true } } },
  });

  if (!item) {
    throw new HttpError(404, "Not found");
  }

  return item;
}
