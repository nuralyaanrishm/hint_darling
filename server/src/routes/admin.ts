import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { UNLOCK_CURRENCY } from "../lib/plans.js";

/**
 * Read-only admin overview. Mounted behind `requireAuth` + `requireAdmin`
 * (see app.ts), so every handler can assume an allowlisted caller.
 *
 * Everything is selected explicitly: password hashes, Google ids, session
 * tokens and claim-management tokens must never reach this payload. Claims stay
 * anonymous here too — the admin sees what owners see, never who claimed.
 */
export const adminRouter = Router();

const RECENT_LIMIT = 10;

adminRouter.get("/overview", async (_req, res) => {
  const [
    users,
    verifiedUsers,
    paidUsers,
    events,
    wishlists,
    items,
    activeClaims,
    paidPurchases,
    recentSignups,
    recentPurchases,
    recentClaims,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.user.count({ where: { plan: { not: "FREE" } } }),
    prisma.event.count(),
    prisma.wishlist.count(),
    prisma.wishlistItem.count(),
    prisma.giftClaim.count({ where: { status: "CLAIMED" } }),
    prisma.purchase.aggregate({
      where: { status: "PAID" },
      _count: true,
      _sum: { amountSen: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        createdAt: true,
        _count: { select: { events: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        amountSen: true,
        currency: true,
        paidAt: true,
        user: { select: { email: true } },
      },
    }),
    prisma.giftClaim.findMany({
      where: { status: "CLAIMED" },
      orderBy: { claimedAt: "desc" },
      take: RECENT_LIMIT,
      // Claimant name/user id/token are deliberately not selected.
      select: {
        claimedAt: true,
        wishlistItem: {
          select: {
            name: true,
            wishlist: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  res.json({
    counts: {
      users,
      verifiedUsers,
      paidUsers,
      events,
      wishlists,
      items,
      activeClaims,
    },
    revenue: {
      paidPurchases: paidPurchases._count,
      grossSen: paidPurchases._sum.amountSen ?? 0,
      currency: UNLOCK_CURRENCY,
    },
    recentSignups: recentSignups.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      eventCount: user._count.events,
      createdAt: user.createdAt.toISOString(),
    })),
    recentPurchases: recentPurchases.map((purchase) => ({
      email: purchase.user.email,
      amountSen: purchase.amountSen,
      currency: purchase.currency,
      paidAt: purchase.paidAt?.toISOString() ?? null,
    })),
    recentClaims: recentClaims.map((claim) => ({
      itemName: claim.wishlistItem.name,
      wishlistTitle: claim.wishlistItem.wishlist.title,
      claimedAt: claim.claimedAt.toISOString(),
    })),
  });
});
