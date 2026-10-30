import express, { Router } from "express";
import { applyToyyibPayCallback } from "../lib/purchases.js";

// ToyyibPay's server-to-server callback. This router is mounted before the
// app's CSRF middleware because ToyyibPay cannot send our CSRF header, and it
// is intentionally unauthenticated: the MD5 checksum is the authentication.
export const toyyibpayRouter = Router();

toyyibpayRouter.use(express.urlencoded({ extended: false }));

toyyibpayRouter.post("/callback", async (req, res) => {
  try {
    await applyToyyibPayCallback(req.body as Record<string, unknown>);
    // ToyyibPay expects a plain acknowledgement. A 200 tells it the callback
    // was handled; the payment is already persisted before we respond.
    res.status(200).type("text/plain").send("OK");
  } catch (error) {
    console.error("ToyyibPay callback rejected:", error);
    res.status(400).type("text/plain").send("Invalid callback");
  }
});
