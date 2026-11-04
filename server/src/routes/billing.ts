import { Router } from "express";
import { HttpError } from "../lib/errors.js";
import { isPlanTier } from "../lib/plans.js";
import {
  createPlanCheckout,
  getBillingSummary,
  reconcilePendingPurchases,
} from "../lib/purchases.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";
import { billingLimiter } from "../middleware/rateLimit.js";

export const billingRouter = Router();

billingRouter.use(requireAuth);

// GET /api/billing — the caller's plan, limits, features and price catalog.
billingRouter.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ billing: await getBillingSummary(currentUserId(req)) });
});

// POST /api/billing/checkout — start a one-time Plus or Pro checkout.
billingRouter.post("/checkout", billingLimiter, async (req, res) => {
  const plan = (req.body as { plan?: unknown } | undefined)?.plan;

  if (!isPlanTier(plan) || plan === "FREE") {
    throw new HttpError(
      400,
      "Choose Plus or Pro to continue.",
      undefined,
      "INVALID_PLAN",
    );
  }

  const result = await createPlanCheckout(currentUserId(req), plan);
  res.status(201).json({ paymentUrl: result.paymentUrl });
});

// POST /api/billing/unlock — deprecated alias that buys Pro.
billingRouter.post("/unlock", billingLimiter, async (req, res) => {
  const result = await createPlanCheckout(currentUserId(req), "PRO");
  res.status(201).json({ paymentUrl: result.paymentUrl });
});

// POST /api/billing/reconcile — safety net when a ToyyibPay callback is missed.
billingRouter.post("/reconcile", billingLimiter, async (req, res) => {
  const userId = currentUserId(req);
  const result = await reconcilePendingPurchases(userId);

  res.set("Cache-Control", "no-store");
  res.json({
    billing: await getBillingSummary(userId),
    reconciled: result.reconciled,
  });
});
