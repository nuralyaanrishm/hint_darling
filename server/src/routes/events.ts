import { Router } from "express";
import type { Request } from "express";
import { HttpError } from "../lib/errors.js";
import { getOwnedEvent, getOwnedWishlist } from "../lib/ownership.js";
import { isProUser } from "../lib/plans.js";
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

// Claim insights are a Pro feature; the serializer uses this to decide whether
// claimed counts and per-item claim status are included in owner responses.
function ownerViewer(req: Request): OwnerViewer {
  return { isPro: isProUser(req.auth?.user) };
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
    events: events.map((event) => toEventSummaryDto(event, ownerViewer(req))),
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
      description: data.description ?? null,
      location: data.location ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });

  res.status(201).json({ event: toEventDto({ ...event, wishlist: null }, ownerViewer(req)) });
});

// GET /api/events/:eventId — event detail with its wishlist and items.
eventsRouter.get("/:eventId", async (req, res) => {
  const event = await getOwnedEvent(currentUserId(req), req.params.eventId);
  res.json({ event: toEventDto(event, ownerViewer(req)) });
});

// PATCH /api/events/:eventId — update an event.
eventsRouter.patch("/:eventId", async (req, res) => {
  const owned = await getOwnedEvent(currentUserId(req), req.params.eventId);
  const data = parseOrThrow(updateEventSchema, req.body);

  await prisma.event.update({
    where: { id: owned.id },
    data: {
      name: data.name,
      type: data.type,
      eventDate: data.eventDate,
      description: data.description,
      location: data.location,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });

  const event = await getOwnedEvent(currentUserId(req), req.params.eventId);
  res.json({ event: toEventDto(event, ownerViewer(req)) });
});

// DELETE /api/events/:eventId — delete an event (cascades to wishlist/items).
eventsRouter.delete("/:eventId", async (req, res) => {
  const owned = await getOwnedEvent(currentUserId(req), req.params.eventId);
  await prisma.event.delete({ where: { id: owned.id } });
  res.status(204).end();
});

// POST /api/events/:eventId/wishlist — create the event's wishlist.
eventsRouter.post("/:eventId/wishlist", async (req, res) => {
  const event = await getOwnedEvent(currentUserId(req), req.params.eventId);

  if (event.wishlist) {
    throw new HttpError(409, "This event already has a wishlist.");
  }

  const data = parseOrThrow(createWishlistSchema, req.body);

  const wishlist = await prisma.wishlist.create({
    data: {
      eventId: event.id,
      title: data.title,
      description: data.description ?? null,
      privacyMode: data.privacyMode ?? "LINK_ONLY",
      shareToken: generateToken(),
    },
    include: { items: true },
  });

  res.status(201).json({ wishlist: toWishlistDto(wishlist, ownerViewer(req)) });
});

// PATCH /api/events/:eventId/wishlist — update title/description.
eventsRouter.patch("/:eventId/wishlist", async (req, res) => {
  const event = await getOwnedEvent(currentUserId(req), req.params.eventId);

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

  const wishlist = await getOwnedWishlist(currentUserId(req), event.wishlist.id);
  res.json({ wishlist: toWishlistDto(wishlist, ownerViewer(req)) });
});
