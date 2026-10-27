import type { EventType } from "@prisma/client";
import { prisma } from "./prisma.js";

// Public (guest-facing) projection of a wishlist.
//
// This module is the single place that decides what a guest may see. It never
// returns the owner, the owner's email or any account data, the internal
// wishlist/event ids, the share token, private item notes, or any information
// about who claimed a gift. Only records that are explicitly meant to be public
// are returned: an unknown, inactive or private list is treated as missing.

const itemOrder = [
  { position: "asc" as const },
  { createdAt: "asc" as const },
];

// Tokens are 32 random bytes encoded as base64url (43 chars). Accept a slightly
// wider range so future token lengths keep working, while rejecting anything
// that could not be a real token before touching the database.
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export interface PublicGiftDto {
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
  /** Active claim count. In this version at most one claim can be active. */
  claimedCount: number;
  /** True when the gift has been reserved by a gift-giver. */
  isClaimed: boolean;
  /** How many units remain available (0 once the item is claimed). */
  remaining: number;
  /** True when every unit has been claimed. */
  isFullyClaimed: boolean;
}

export interface PublicWishlistDto {
  title: string;
  description: string | null;
  event: {
    name: string;
    type: EventType;
    eventDate: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    description: string | null;
  };
  items: PublicGiftDto[];
  updatedAt: string;
}

interface PublicWishlistItemRecord {
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
  claims: { id: string }[];
}

interface PublicWishlistRecord {
  title: string;
  description: string | null;
  updatedAt: Date;
  event: {
    name: string;
    type: EventType;
    eventDate: Date | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    description: string | null;
  };
  items: PublicWishlistItemRecord[];
}

function toPublicGiftDto(item: PublicWishlistItemRecord): PublicGiftDto {
  const claimedCount = item.claims.length;
  // This version allows at most one active claim per item (enforced both by the
  // transaction in `claims.claimGift` and by a partial unique index), so
  // availability is binary: an item is either available or reserved.
  const isClaimed = claimedCount > 0;
  const remaining = isClaimed ? 0 : item.quantity;

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
    claimedCount,
    isClaimed,
    remaining,
    isFullyClaimed: isClaimed,
  };
}

export function toPublicWishlistDto(
  wishlist: PublicWishlistRecord,
): PublicWishlistDto {
  return {
    title: wishlist.title,
    description: wishlist.description,
    event: {
      name: wishlist.event.name,
      type: wishlist.event.type,
      eventDate: wishlist.event.eventDate?.toISOString() ?? null,
      location: wishlist.event.location,
      latitude: wishlist.event.latitude,
      longitude: wishlist.event.longitude,
      description: wishlist.event.description,
    },
    items: wishlist.items.map(toPublicGiftDto),
    updatedAt: wishlist.updatedAt.toISOString(),
  };
}

export function isValidShareToken(token: string): boolean {
  return SHARE_TOKEN_PATTERN.test(token);
}

/**
 * Loads an active, link-shareable wishlist by its opaque share token.
 * Returns `null` for unknown, inactive or private lists so callers can respond
 * with an indistinguishable 404 and never reveal whether a token exists.
 */
export async function loadPublicWishlist(
  shareToken: string,
): Promise<PublicWishlistDto | null> {
  if (!isValidShareToken(shareToken)) {
    return null;
  }

  const wishlist = await prisma.wishlist.findUnique({
    where: { shareToken },
    select: {
      title: true,
      description: true,
      isActive: true,
      privacyMode: true,
      updatedAt: true,
      event: {
        select: {
          name: true,
          type: true,
          eventDate: true,
          location: true,
          latitude: true,
          longitude: true,
          description: true,
        },
      },
      items: {
        orderBy: itemOrder,
        select: {
          id: true,
          name: true,
          productUrl: true,
          imageUrl: true,
          price: true,
          currency: true,
          description: true,
          preferredColour: true,
          preferredSize: true,
          preferredVariation: true,
          quantity: true,
          // Only the existence of a claim is needed; claimant details are never
          // selected, so they cannot leak into any response.
          claims: {
            where: { status: "CLAIMED" },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!wishlist || !wishlist.isActive || wishlist.privacyMode === "PRIVATE") {
    return null;
  }

  return toPublicWishlistDto(wishlist);
}
