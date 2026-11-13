import type { EventType, PrivacyMode } from "@prisma/client";

// Turns Prisma rows into stable JSON shapes: dates become ISO strings and
// Decimal prices become strings (so the client never receives a JS number it
// might round). Structural types keep these usable with any include/select.

/**
 * Owner-facing serializers need to know whether *this event* is unlocked. Claim
 * status is always included (guests can see it on the share link anyway); the
 * guest's display name is only included for unlocked events.
 */
export interface OwnerViewer {
  canViewClaimantNames: boolean;
  /** True when the event has an Event Pass or the owner is on Pro. */
  eventUnlocked: boolean;
}

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
   * Active claims. Raw user ids and management tokens are never selected for
   * owner views. The display name is loaded with the owner query but only
   * serialised for unlocked events (Event Pass or Pro).
   */
  claims?: { id: string; claimantName?: string | null }[] | null;
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
  eventStartsAt: Date | null;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
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
  /** True when a gift-giver has reserved this gift. */
  isClaimed: boolean;
  /** Number of active claims. At most one in this version. */
  claimedCount: number;
  /**
   * The optional display name of the gift-giver. Only present when this event is
   * unlocked; `null` otherwise, for unnamed guests, or for unclaimed gifts.
   */
  claimantName: string | null;
  /** True when the owner must unlock this event to see who reserved gifts. */
  claimantNamesLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toWishlistItemDto(
  item: ItemRecord,
  viewer: OwnerViewer,
): WishlistItemDto {
  // Claim status is public information (the share page shows it), so every
  // owner receives it. Only the guest's display name is gated by the event
  // unlock. Claimant user ids and management tokens are never selected.
  const claimedCount = item.claims?.length ?? 0;
  const claimantName = viewer.canViewClaimantNames
    ? (item.claims?.find((claim) => claim.claimantName)?.claimantName ?? null)
    : null;

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
    claimantName,
    claimantNamesLocked: !viewer.canViewClaimantNames,
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
  /** True when the owner must unlock this event to see who reserved gifts. */
  claimantNamesLocked: boolean;
  /** True when this event has an Event Pass or the owner is on Pro. */
  eventUnlocked: boolean;
  items: WishlistItemDto[];
  createdAt: string;
  updatedAt: string;
}

export function toWishlistDto(
  wishlist: WishlistRecord & { items: ItemRecord[] },
  viewer: OwnerViewer,
): WishlistDto {
  return {
    id: wishlist.id,
    eventId: wishlist.eventId,
    title: wishlist.title,
    description: wishlist.description,
    shareToken: wishlist.shareToken,
    privacyMode: wishlist.privacyMode,
    isActive: wishlist.isActive,
    claimantNamesLocked: !viewer.canViewClaimantNames,
    eventUnlocked: viewer.eventUnlocked,
    items: wishlist.items.map((item) => toWishlistItemDto(item, viewer)),
    createdAt: wishlist.createdAt.toISOString(),
    updatedAt: wishlist.updatedAt.toISOString(),
  };
}

export interface WishlistSummaryDto {
  id: string;
  title: string;
  itemCount: number;
  /** How many gifts are currently reserved. Never reveals who. */
  claimedCount: number;
}

export interface EventSummaryDto {
  id: string;
  name: string;
  type: EventType;
  eventDate: string | null;
  /** Absolute instant the celebration starts; claiming closes at this moment. */
  startsAt: string | null;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
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
  _viewer?: OwnerViewer,
): EventSummaryDto {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    eventDate: event.eventDate?.toISOString() ?? null,
    startsAt: event.eventStartsAt?.toISOString() ?? null,
    description: event.description,
    location: event.location,
    latitude: event.latitude,
    longitude: event.longitude,
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
  viewer: OwnerViewer,
): EventDto {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    eventDate: event.eventDate?.toISOString() ?? null,
    startsAt: event.eventStartsAt?.toISOString() ?? null,
    description: event.description,
    location: event.location,
    latitude: event.latitude,
    longitude: event.longitude,
    wishlist: event.wishlist ? toWishlistDto(event.wishlist, viewer) : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
