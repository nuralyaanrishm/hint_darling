import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";

// Ownership lookups. Every one returns a 404 (never 403) when a record is
// missing or belongs to somebody else, so changing an ID in a URL never
// reveals whether another user's data exists.

const itemOrder = [
  { position: "asc" as const },
  { createdAt: "asc" as const },
];

// Owner views load the claim ids and the optional guest display name. The
// serializers decide whether the name is included in the response (it is gated
// per event by an Event Pass or Pro). `claimantUserId` and `claimTokenHash` are
// never selected, so the account identity and management secret cannot leak.
function ownedItemsInclude() {
  return {
    orderBy: itemOrder,
    include: {
      claims: {
        where: { status: "CLAIMED" as const },
        select: { id: true, claimantName: true },
      },
    },
  };
}

/** Loads an event plus its wishlist and items, scoped to the owner. */
export async function getOwnedEvent(userId: string, eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId: userId },
    include: {
      wishlist: {
        include: {
          items: ownedItemsInclude(),
        },
      },
    },
  });

  if (!event) {
    throw new HttpError(404, "Not found");
  }

  return event;
}

/** Loads a wishlist plus its event, scoped to the event owner. */
export async function getOwnedWishlist(
  userId: string,
  wishlistId: string,
) {
  const wishlist = await prisma.wishlist.findFirst({
    where: { id: wishlistId, event: { ownerId: userId } },
    include: {
      event: { select: { id: true, name: true, ownerId: true } },
      items: ownedItemsInclude(),
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
