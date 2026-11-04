import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  PLAN_CONFIG,
  PLAN_ORDER,
  UNLOCK_CURRENCY,
  isPlanTier,
  planRank,
  type PlanDefinition,
  type PlanFeatureKey,
  type PlanFeatures,
  type PlanTierName,
} from "./plans.js";
import { prisma } from "./prisma.js";
import {
  amountToSen,
  billPaymentUrl,
  callbackAmountToSen,
  createToyyibPayBill,
  fetchBillTransactions,
  verifyCallbackHash,
} from "./toyyibpay.js";

// One-time plan purchases.
//
// A purchase row is the audit trail and the idempotency key for ToyyibPay.
// `externalReference` is our opaque order id; ToyyibPay echoes it back as
// `order_id` in the callback, which is how we match the payment to the account.
// Once a purchase is PAID we raise User.plan to the purchased tier. Plans never
// downgrade, and each tier is a single lifetime payment.

export interface BillingSummary {
  plan: PlanTierName;
  planLabel: string;
  planUnlockedAt: string | null;
  activeWishlistLimit: number | null;
  itemLimit: number | null;
  features: PlanFeatures;
  comingSoon: PlanFeatureKey[];
  isPaid: boolean;
  prices: Record<PlanTierName, number>;
  plans: PlanDefinition[];
  currency: string;
}

export function toBillingSummary(user: {
  plan: PlanTierName;
  planUnlockedAt: Date | null;
}): BillingSummary {
  const current = PLAN_CONFIG[user.plan];

  return {
    plan: user.plan,
    planLabel: current.label,
    planUnlockedAt: user.planUnlockedAt?.toISOString() ?? null,
    activeWishlistLimit: current.activeWishlistLimit,
    itemLimit: current.itemLimit,
    features: current.features,
    comingSoon: current.comingSoon,
    isPaid: user.plan !== "FREE",
    prices: {
      FREE: PLAN_CONFIG.FREE.priceSen,
      PLUS: PLAN_CONFIG.PLUS.priceSen,
      PRO: PLAN_CONFIG.PRO.priceSen,
    },
    plans: PLAN_ORDER.map((tier) => PLAN_CONFIG[tier]),
    currency: UNLOCK_CURRENCY,
  };
}

export async function getBillingSummary(
  userId: string,
): Promise<BillingSummary> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planUnlockedAt: true },
  });

  if (!user) {
    throw new HttpError(404, "Not found");
  }

  return toBillingSummary(user);
}

interface PendingCheckout {
  existingBillCode: string | null;
  purchase: { id: string; externalReference: string } | null;
  user: { name: string; email: string };
  plan: PlanTierName;
}

/**
 * Starts a one-time checkout for a paid tier.
 *
 * The user row is locked while we look for a recent pending bill, so a
 * double-click cannot create two payable bills. The actual ToyyibPay call runs
 * outside the transaction (network calls must not hold database locks).
 */
export async function createPlanCheckout(
  userId: string,
  targetPlan: PlanTierName,
): Promise<{ paymentUrl: string }> {
  if (!isPlanTier(targetPlan) || targetPlan === "FREE") {
    throw new HttpError(400, "Choose Plus or Pro to continue.");
  }

  // If a previous bill was paid but its callback never arrived, settle it now
  // so the user is never asked to pay twice.
  await reconcilePendingPurchases(userId);

  const checkout = await prisma.$transaction<PendingCheckout>(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        plan: true,
        planUnlockedAt: true,
      },
    });

    if (!user) {
      throw new HttpError(404, "Not found");
    }

    if (planRank(targetPlan) <= planRank(user.plan)) {
      throw new HttpError(
        409,
        "You're already on this plan or a higher one.",
        undefined,
        "PLAN_NOT_UPGRADABLE",
      );
    }

    const recent = new Date(Date.now() - 30 * 60 * 1000);
    const pending = await tx.purchase.findFirst({
      where: {
        userId,
        plan: targetPlan,
        status: "PENDING",
        billCode: { not: null },
        createdAt: { gte: recent },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, billCode: true },
    });

    if (pending?.billCode) {
      return {
        existingBillCode: pending.billCode,
        purchase: null,
        user,
        plan: targetPlan,
      };
    }

    const definition = PLAN_CONFIG[targetPlan];

    const purchase = await tx.purchase.create({
      data: {
        userId,
        plan: targetPlan,
        amountSen: definition.priceSen,
        currency: UNLOCK_CURRENCY,
        externalReference: randomBytes(16).toString("hex"),
      },
      select: { id: true, externalReference: true },
    });

    return {
      existingBillCode: null,
      purchase: { id: purchase.id, externalReference: purchase.externalReference },
      user,
      plan: targetPlan,
    };
  });

  if (checkout.existingBillCode) {
    return { paymentUrl: billPaymentUrl(checkout.existingBillCode) };
  }

  if (!checkout.purchase) {
    throw new HttpError(500, "We couldn't start the payment. Please try again.");
  }

  const definition = PLAN_CONFIG[checkout.plan];

  try {
    const bill = await createToyyibPayBill({
      name: `Hint Darling ${definition.shortLabel}`,
      description: `Unlock ${definition.label}`,
      amountSen: definition.priceSen,
      externalReference: checkout.purchase.externalReference,
      payerName: checkout.user.name,
      payerEmail: checkout.user.email,
    });

    await prisma.purchase.update({
      where: { id: checkout.purchase.id },
      data: { billCode: bill.billCode },
    });

    return { paymentUrl: bill.paymentUrl };
  } catch (error) {
    await prisma.purchase
      .update({
        where: { id: checkout.purchase.id },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);
    throw error;
  }
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "Invalid payment callback");
  }
  return value;
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asJson(body: Record<string, unknown>): Prisma.InputJsonValue {
  return body as Prisma.InputJsonValue;
}

interface ActivationInput {
  billCode: string | null;
  refno: string | null;
  transactionId: string | null;
  paymentChannel: string | null;
  raw: Prisma.InputJsonValue;
}

/** Marks a purchase paid and raises the account's plan exactly once. */
async function activatePurchase(
  purchaseId: string,
  input: ActivationInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "purchases" WHERE "id" = ${purchaseId} FOR UPDATE`;

    const purchase = await tx.purchase.findUnique({
      where: { id: purchaseId },
      select: { userId: true, status: true, plan: true },
    });

    if (!purchase || purchase.status === "PAID") {
      return;
    }

    const now = new Date();

    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: "PAID",
        billCode: input.billCode,
        refno: input.refno,
        transactionId: input.transactionId,
        paymentChannel: input.paymentChannel,
        paidAt: now,
        rawCallback: input.raw,
      },
    });

    const user = await tx.user.findUnique({
      where: { id: purchase.userId },
      select: { plan: true },
    });

    // A late callback for an older/lower tier must never downgrade the account.
    if (!user || planRank(purchase.plan) <= planRank(user.plan)) {
      return;
    }

    await tx.user.update({
      where: { id: purchase.userId },
      data: { plan: purchase.plan, planUnlockedAt: now },
    });
  });
}

/**
 * Applies a ToyyibPay server-to-server callback. The caller has already parsed
 * the urlencoded body. Throws on an invalid signature, unknown order, bill
 * mismatch or amount mismatch; repeated valid callbacks are harmless.
 */
export async function applyToyyibPayCallback(
  body: Record<string, unknown>,
): Promise<void> {
  const status = requiredString(body, "status");
  const orderId = requiredString(body, "order_id");
  const refno = requiredString(body, "refno");
  const billcode = requiredString(body, "billcode");
  const amount = requiredString(body, "amount");
  const hash = requiredString(body, "hash");

  if (!verifyCallbackHash({ status, orderId, refno, hash })) {
    throw new HttpError(400, "Invalid payment signature");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { externalReference: orderId },
  });

  if (!purchase) {
    throw new HttpError(404, "Not found");
  }

  if (purchase.billCode && purchase.billCode !== billcode) {
    throw new HttpError(400, "Payment bill does not match this purchase");
  }

  if (purchase.status === "PAID") {
    return;
  }

  // 1 = success, 2 = pending, 3 = failure. Only a success unlocks the account.
  if (status !== "1") {
    if (status === "3") {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "FAILED", rawCallback: asJson(body) },
      });
    }
    return;
  }

  const paidSen = callbackAmountToSen(amount);
  if (paidSen !== purchase.amountSen) {
    throw new HttpError(400, "Payment amount does not match this purchase");
  }

  await activatePurchase(purchase.id, {
    billCode: billcode,
    refno,
    transactionId: optionalString(body, "transaction_id"),
    paymentChannel: null,
    raw: asJson(body),
  });
}

/**
 * Fallback for missed callbacks. ToyyibPay fires callbacks once and does not
 * retry, so the return page asks us to reconcile any still-pending bill.
 */
export async function reconcilePendingPurchases(
  userId: string,
): Promise<{ reconciled: boolean }> {
  const pending = await prisma.purchase.findMany({
    where: {
      userId,
      status: "PENDING",
      billCode: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      billCode: true,
      externalReference: true,
      amountSen: true,
      refno: true,
    },
  });

  let reconciled = false;

  for (const purchase of pending) {
    if (!purchase.billCode) continue;

    let transactions;
    try {
      transactions = await fetchBillTransactions(purchase.billCode);
    } catch (error) {
      console.error("Failed to reconcile ToyyibPay bill:", error);
      continue;
    }

    const successful = transactions.find(
      (transaction) => transaction.billpaymentStatus === "1",
    );

    if (!successful) continue;

    if (
      successful.billExternalReferenceNo &&
      successful.billExternalReferenceNo !== purchase.externalReference
    ) {
      continue;
    }

    if (
      !successful.billpaymentAmount ||
      amountToSen(successful.billpaymentAmount) !== purchase.amountSen
    ) {
      continue;
    }

    await activatePurchase(purchase.id, {
      billCode: purchase.billCode,
      refno:
        successful.billpaymentInvoiceNo ?? purchase.refno ?? null,
      transactionId: successful.billpaymentInvoiceNo ?? null,
      paymentChannel: successful.billpaymentChannel ?? null,
      raw: successful as unknown as Prisma.InputJsonValue,
    });

    reconciled = true;
  }

  return { reconciled };
}
