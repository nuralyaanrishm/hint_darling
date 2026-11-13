import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { UNLOCK_CURRENCY } from "../lib/plans.js";
import {
  buildSeries,
  SERIES_DAYS,
  startOfUtcDay,
} from "../lib/adminSeries.js";

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
  const windowStart = startOfUtcDay(new Date());
  windowStart.setUTCDate(windowStart.getUTCDate() - (SERIES_DAYS - 1));

  const [
    users,
    verifiedUsers,
    paidUsers,
    payingUserGroups,
    usersWithEvents,
    usersWithItems,
    events,
    wishlists,
    items,
    activeClaims,
    cancelledClaims,
    revenueByProduct,
    purchaseStatusGroups,
    recentSignups,
    recentPurchases,
    recentClaims,
    seriesSignups,
    seriesClaims,
    seriesPurchases,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    // Plan-based count: Pro accounts only. Event Pass buyers stay on FREE, so
    // the separate `payingUsers` count below is the true "has paid" number.
    prisma.user.count({ where: { plan: { not: "FREE" } } }),
    prisma.purchase.groupBy({ by: ["userId"], where: { status: "PAID" } }),
    prisma.user.count({ where: { events: { some: {} } } }),
    prisma.user.count({
      where: { events: { some: { wishlist: { items: { some: {} } } } } },
    }),
    prisma.event.count(),
    prisma.wishlist.count(),
    prisma.wishlistItem.count(),
    prisma.giftClaim.count({ where: { status: "CLAIMED" } }),
    prisma.giftClaim.count({ where: { status: "CANCELLED" } }),
    prisma.purchase.groupBy({
      by: ["product"],
      where: { status: "PAID" },
      _count: true,
      _sum: { amountSen: true },
    }),
    prisma.purchase.groupBy({ by: ["status"], _count: true }),
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
        product: true,
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
    prisma.user.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true },
    }),
    prisma.giftClaim.findMany({
      where: { claimedAt: { gte: windowStart } },
      select: { claimedAt: true },
    }),
    prisma.purchase.findMany({
      where: { status: "PAID", paidAt: { gte: windowStart } },
      select: { paidAt: true, amountSen: true },
    }),
  ]);

  const productRevenue = new Map(
    revenueByProduct.map((row) => [
      row.product,
      { purchases: row._count, grossSen: row._sum.amountSen ?? 0 },
    ]),
  );
  const pro = productRevenue.get("PRO") ?? { purchases: 0, grossSen: 0 };
  const eventPass = productRevenue.get("EVENT_PASS") ?? {
    purchases: 0,
    grossSen: 0,
  };

  const statusCounts = new Map(
    purchaseStatusGroups.map((row) => [row.status, row._count]),
  );

  res.json({
    counts: {
      users,
      verifiedUsers,
      paidUsers,
      payingUsers: payingUserGroups.length,
      usersWithEvents,
      usersWithItems,
      events,
      wishlists,
      items,
      activeClaims,
      cancelledClaims,
    },
    revenue: {
      currency: UNLOCK_CURRENCY,
      total: {
        purchases: pro.purchases + eventPass.purchases,
        grossSen: pro.grossSen + eventPass.grossSen,
      },
      pro,
      eventPass,
    },
    checkout: {
      pending: statusCounts.get("PENDING") ?? 0,
      paid: statusCounts.get("PAID") ?? 0,
      failed: statusCounts.get("FAILED") ?? 0,
    },
    series: buildSeries(
      windowStart,
      seriesSignups,
      seriesClaims,
      seriesPurchases,
    ),
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
      product: purchase.product,
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
