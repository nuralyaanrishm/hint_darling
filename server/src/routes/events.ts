import { Router } from "express";
import { isEventUnlocked } from "../lib/entitlements.js";
import { HttpError } from "../lib/errors.js";
import { getOwnedEvent, getOwnedWishlist } from "../lib/ownership.js";
import {
  PLAN_CONFIG,
  activeEventLimitFor,
  type PlanTierName,
} from "../lib/plans.js";
import { prisma } from "../lib/prisma.js";
import {
  toEventDto,
  toEventSummaryDto,
  toWishlistDto,
  type OwnerViewer,
} from "../lib/serializers.js";
import { generateToken } from "../lib/tokens.js";
import {
  createEventSchema,
  createWishlistSchema,
  parseOrThrow,
  updateEventSchema,
  updateWishlistSchema,
} from "../lib/validation.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";

export const eventsRouter = Router();

// Claim status is public (guests see it on the share link); only the guest's
// display name is gated, and only per event.
function ownerViewer(
  canViewClaimantNames: boolean,
  eventUnlocked: boolean,
): OwnerViewer {
  return { canViewClaimantNames, eventUnlocked };
}

const lockedViewer: OwnerViewer = {
  canViewClaimantNames: false,
  eventUnlocked: false,
};

async function viewerFor(userId: string, eventId: string): Promise<OwnerViewer> {
  const unlocked = await isEventUnlocked(userId, eventId);
  return ownerViewer(unlocked, unlocked);
}

/**
 * Active means the wishlist is visible and its event has not started yet.
 * Ended events keep their data but no longer occupy a plan slot.
 */
function activeWishlistWhere(userId: string, now: Date) {
  return {
    isActive: true,
    event: {
      ownerId: userId,
      OR: [
        { eventStartsAt: null },
        { eventStartsAt: { gt: now } },
      ],
    },
  };
}

function eventLimitMessage(plan: PlanTierName, limit: number): string {
  if (plan === "FREE") {
    return `Your Free plan includes ${limit} active event. Upgrade to Darling Pro for up to ${PLAN_CONFIG.PRO.activeEventLimit} events — RM${(
      PLAN_CONFIG.PRO.priceSen / 100
    ).toFixed(2)} one-time.`;
  }

  return `Darling Pro includes ${limit} active events at once. Archive an event to free up a slot.`;
}

// Every event route requires a signed-in owner.
eventsRouter.use(requireAuth);

// GET /api/events — the owner's events, newest first, with wishlist summaries.
eventsRouter.get("/", async (req, res) => {
  const events = await prisma.event.findMany({
    where: { ownerId: currentUserId(req) },
    orderBy: { createdAt: "desc" },
    include: {
      wishlist: {
        select: {
          id: true,
          title: true,
          _count: { select: { items: true } },
          // Only claimed item ids are selected; the gift-giver stays private.
          items: {
            where: { claims: { some: { status: "CLAIMED" } } },
            select: { id: true },
          },
        },
      },
    },
  });

  res.json({
    events: events.map((event) => toEventSummaryDto(event, lockedViewer)),
  });
});

// POST /api/events — create an event.
eventsRouter.post("/", async (req, res) => {
  const data = parseOrThrow(createEventSchema, req.body);

  const event = await prisma.event.create({
    data: {
      ownerId: currentUserId(req),
      name: data.name,
      type: data.type,
      eventDate: data.eventDate ?? null,
      eventStartsAt: data.startsAt ?? null,
      description: data.description ?? null,
      location: data.location ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });

  res
    .status(201)
    .json({ event: toEventDto({ ...event, wishlist: null }, lockedViewer) });
});

// GET /api/events/:eventId — event detail with its wishlist and items.
eventsRouter.get("/:eventId", async (req, res) => {
  const userId = currentUserId(req);
  const viewer = await viewerFor(userId, req.params.eventId);
  const event = await getOwnedEvent(userId, req.params.eventId);
  res.json({ event: toEventDto(event, viewer) });
});

// PATCH /api/events/:eventId — update an event.
eventsRouter.patch("/:eventId", async (req, res) => {
  const userId = currentUserId(req);
  const owned = await getOwnedEvent(userId, req.params.eventId);
  const data = parseOrThrow(updateEventSchema, req.body);

  await prisma.event.update({
    where: { id: owned.id },
    data: {
      name: data.name,
      type: data.type,
      eventDate: data.eventDate,
      eventStartsAt: data.startsAt,
      description: data.description,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });

  const viewer = await viewerFor(userId, owned.id);
  const event = await getOwnedEvent(userId, owned.id);
  res.json({ event: toEventDto(event, viewer) });
});

// DELETE /api/events/:eventId — delete an event (cascades to wishlist/items).
eventsRouter.delete("/:eventId", async (req, res) => {
  const owned = await getOwnedEvent(currentUserId(req), req.params.eventId);
  await prisma.event.delete({ where: { id: owned.id } });
  res.status(204).end();
});

// POST /api/events/:eventId/archive — hide the wishlist and free up a slot.
// The event and its gifts stay intact, so an archived list can be restored.
eventsRouter.post("/:eventId/archive", async (req, res) => {
  const userId = currentUserId(req);
  const event = await getOwnedEvent(userId, req.params.eventId);

  if (!event.wishlist) {
    throw new HttpError(404, "Not found");
  }

  await prisma.wishlist.update({
    where: { id: event.wishlist.id },
    data: { isActive: false },
  });

  res.status(204).end();
});

// POST /api/events/:eventId/unarchive — restore an archived wishlist when the
// plan still has a free active-event slot.
eventsRouter.post("/:eventId/unarchive", async (req, res) => {
  const userId = currentUserId(req);
  const event = await getOwnedEvent(userId, req.params.eventId);

  if (!event.wishlist) {
    throw new HttpError(404, "Not found");
  }

  if (event.wishlist.isActive) {
    res.status(204).end();
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

    const owner = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });

    const limit = activeEventLimitFor(owner.plan);

    if (limit !== null) {
      const activeCount = await tx.wishlist.count({
        where: activeWishlistWhere(userId, new Date()),
      });

      if (activeCount >= limit) {
        throw new HttpError(
          402,
          eventLimitMessage(owner.plan, limit),
          undefined,
          "WISHLIST_LIMIT_REACHED",
        );
      }
    }

    await tx.wishlist.update({
      where: { id: event.wishlist!.id },
      data: { isActive: true },
    });
  });

  res.status(204).end();
});

// POST /api/events/:eventId/wishlist — create the event's wishlist.
//
// Free includes one active event, Pro ten concurrent ones. Wishlists whose
// event has already started no longer count, so a host can move on to the next
// celebration without upgrading. The user row is locked while we count and
// create so two simultaneous requests cannot both slip through on the last slot.
eventsRouter.post("/:eventId/wishlist", async (req, res) => {
  const userId = currentUserId(req);
  const event = await getOwnedEvent(userId, req.params.eventId);

  if (event.wishlist) {
    throw new HttpError(409, "This event already has a wishlist.");
  }

  const data = parseOrThrow(createWishlistSchema, req.body);

  const wishlist = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

    const owner = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });

    const limit = activeEventLimitFor(owner.plan);

    if (limit !== null) {
      const activeCount = await tx.wishlist.count({
        where: activeWishlistWhere(userId, new Date()),
      });

      if (activeCount >= limit) {
        throw new HttpError(
          402,
          eventLimitMessage(owner.plan, limit),
          undefined,
          "WISHLIST_LIMIT_REACHED",
        );
      }
    }

    return tx.wishlist.create({
      data: {
        eventId: event.id,
        title: data.title,
        description: data.description ?? null,
        privacyMode: data.privacyMode ?? "LINK_ONLY",
        shareToken: generateToken(),
      },
      include: { items: true },
    });
  });

  const viewer = await viewerFor(userId, event.id);
  res.status(201).json({ wishlist: toWishlistDto(wishlist, viewer) });
});

// PATCH /api/events/:eventId/wishlist — update title/description and privacy.
eventsRouter.patch("/:eventId/wishlist", async (req, res) => {
  const userId = currentUserId(req);
  const event = await getOwnedEvent(userId, req.params.eventId);

  if (!event.wishlist) {
    throw new HttpError(404, "Not found");
  }

  const data = parseOrThrow(updateWishlistSchema, req.body);

  await prisma.wishlist.update({
    where: { id: event.wishlist.id },
    data: {
      title: data.title,
      description: data.description,
      ...(data.privacyMode ? { privacyMode: data.privacyMode } : {}),
    },
  });

  const viewer = await viewerFor(userId, event.id);
  const wishlist = await getOwnedWishlist(userId, event.wishlist.id);
  res.json({ wishlist: toWishlistDto(wishlist, viewer) });
});
