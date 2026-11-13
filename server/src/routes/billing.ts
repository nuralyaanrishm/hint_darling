import { Router } from "express";
import { createCheckout, getBillingSummary, reconcilePendingPurchases } from "../lib/purchases.js";
import { checkoutSchema, parseOrThrow } from "../lib/validation.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";
import { billingLimiter } from "../middleware/rateLimit.js";

export const billingRouter = Router();

billingRouter.use(requireAuth);

// GET /api/billing — the caller's plan, limits, features and price catalog.
billingRouter.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ billing: await getBillingSummary(currentUserId(req)) });
});

// POST /api/billing/checkout — start a one-time Event Pass or Pro checkout.
billingRouter.post("/checkout", billingLimiter, async (req, res) => {
  const data = parseOrThrow(checkoutSchema, req.body);
  const result = await createCheckout(
    currentUserId(req),
    data.product,
    data.eventId ?? null,
  );
  res.status(201).json({ paymentUrl: result.paymentUrl });
});

// POST /api/billing/unlock — deprecated alias that buys the lifetime Pro plan.
billingRouter.post("/unlock", billingLimiter, async (req, res) => {
  const result = await createCheckout(currentUserId(req), "PRO");
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
    activated: result.activated,
  });
});
