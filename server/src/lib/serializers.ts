import type { EventType, PrivacyMode } from "@prisma/client";

// Turns Prisma rows into stable JSON shapes: dates become ISO strings and
// Decimal prices become strings (so the client never receives a JS number it
// might round). Structural types keep these usable with any include/select.

interface ItemRecord {
  id: string;
  name: string;
  productUrl: string | null;
  imageUrl: string | null;
  price: { toString(): string } | null;
  currency: string;
  description: string | null;
  preferredColour: string | null;
  preferredSize: string | null;
  preferredVariation: string | null;
  quantity: number;
  notes: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Active claims, selected as ids only. Claimant names, user ids and tokens
   * are deliberately never loaded for owner views, so they cannot leak.
   */
  claims?: { id: string }[] | null;
}

interface WishlistRecord {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  shareToken: string;
  privacyMode: PrivacyMode;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface EventRecord {
  id: string;
  name: string;
  type: EventType;
  eventDate: Date | null;
  description: string | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WishlistItemDto {
  id: string;
  name: string;
  productUrl: string | null;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  description: string | null;
  preferredColour: string | null;
  preferredSize: string | null;
  preferredVariation: string | null;
  quantity: number;
  notes: string | null;
  position: number;
  /** True when a gift-giver has reserved this gift. Never reveals who. */
  isClaimed: boolean;
  /** Number of active claims. At most one in this version. */
  claimedCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toWishlistItemDto(item: ItemRecord): WishlistItemDto {
  // Only active claim ids are ever selected for owner views; the claimant's
  // identity (name, user id, token) is never loaded or serialised.
  const claimedCount = item.claims?.length ?? 0;

  return {
    id: item.id,
    name: item.name,
    productUrl: item.productUrl,
    imageUrl: item.imageUrl,
    price: item.price === null ? null : item.price.toString(),
    currency: item.currency,
    description: item.description,
    preferredColour: item.preferredColour,
    preferredSize: item.preferredSize,
    preferredVariation: item.preferredVariation,
    quantity: item.quantity,
    notes: item.notes,
    position: item.position,
    isClaimed: claimedCount > 0,
    claimedCount,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export interface WishlistDto {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  /** Only ever returned to the owner, who needs it to share the list. */
  shareToken: string;
  privacyMode: PrivacyMode;
  isActive: boolean;
  items: WishlistItemDto[];
  createdAt: string;
  updatedAt: string;
}

export function toWishlistDto(
  wishlist: WishlistRecord & { items: ItemRecord[] },
): WishlistDto {
  return {
    id: wishlist.id,
    eventId: wishlist.eventId,
    title: wishlist.title,
    description: wishlist.description,
    shareToken: wishlist.shareToken,
    privacyMode: wishlist.privacyMode,
    isActive: wishlist.isActive,
    items: wishlist.items.map(toWishlistItemDto),
    createdAt: wishlist.createdAt.toISOString(),
    updatedAt: wishlist.updatedAt.toISOString(),
  };
}

export interface WishlistSummaryDto {
  id: string;
  title: string;
  itemCount: number;
  /** How many gifts on this list are currently reserved. Never reveals who. */
  claimedCount: number;
}

export interface EventSummaryDto {
  id: string;
  name: string;
  type: EventType;
  eventDate: string | null;
  description: string | null;
  location: string | null;
  wishlist: WishlistSummaryDto | null;
  createdAt: string;
  updatedAt: string;
}

export function toEventSummaryDto(
  event: EventRecord & {
    wishlist: {
      id: string;
      title: string;
      _count: { items: number };
      /** Active claims selected as ids only; claimant details are never loaded. */
      items?: { id: string }[];
    } | null;
  },
): EventSummaryDto {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    eventDate: event.eventDate?.toISOString() ?? null,
    description: event.description,
    location: event.location,
    wishlist: event.wishlist
      ? {
          id: event.wishlist.id,
          title: event.wishlist.title,
          itemCount: event.wishlist._count.items,
          claimedCount: event.wishlist.items?.length ?? 0,
        }
      : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export interface EventDto extends Omit<EventSummaryDto, "wishlist"> {
  wishlist: WishlistDto | null;
}

export function toEventDto(
  event: EventRecord & {
    wishlist: (WishlistRecord & { items: ItemRecord[] }) | null;
  },
): EventDto {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    eventDate: event.eventDate?.toISOString() ?? null,
    description: event.description,
    location: event.location,
    wishlist: event.wishlist ? toWishlistDto(event.wishlist) : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
