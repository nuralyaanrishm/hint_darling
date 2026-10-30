import { Router } from "express";
import {
  createUnlockCheckout,
  getBillingSummary,
  reconcilePendingPurchases,
} from "../lib/purchases.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";
import { billingLimiter } from "../middleware/rateLimit.js";

export const billingRouter = Router();

billingRouter.use(requireAuth);

// GET /api/billing — the caller's plan, limits and price.
billingRouter.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ billing: await getBillingSummary(currentUserId(req)) });
});

// POST /api/billing/unlock — start a one-time RM1 ToyyibPay checkout.
billingRouter.post("/unlock", billingLimiter, async (req, res) => {
  const result = await createUnlockCheckout(currentUserId(req));
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
