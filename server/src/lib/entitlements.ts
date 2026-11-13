import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

// Per-event entitlements. An event is unlocked when its owner is on Pro or when
// a PAID Event Pass purchase exists for that event. The purchase row *is* the
// entitlement, so there is no expiry to drift out of sync with billing.

/** Query surface shared by the Prisma client and transaction clients. */
type Db = Prisma.TransactionClient;

/**
 * True when this user's event is unlocked for unlimited gifts and claimant
 * names. Pro accounts unlock every event they own.
 */
export async function isEventUnlocked(
  userId: string,
  eventId: string,
  db: Db = prisma,
): Promise<boolean> {
  const [user, pass] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { plan: true } }),
    db.purchase.findFirst({
      where: {
        userId,
        eventId,
        product: "EVENT_PASS",
        status: "PAID",
      },
      select: { id: true },
    }),
  ]);

  return user?.plan === "PRO" || pass !== null;
}
