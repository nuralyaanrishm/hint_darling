import { Router } from "express";
import {
  cancelClaimForUser,
  listClaimsForUser,
} from "../lib/claims.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";

export const claimsRouter = Router();

// Gift-giver endpoints. Every route requires the caller to be signed in and is
// scoped to their own claims, so a gift-giver can see and manage their own
// reservations but never another claimant's.
claimsRouter.use(requireAuth);

// GET /api/claims — the signed-in user's own claims.
claimsRouter.get("/", async (req, res) => {
  const claims = await listClaimsForUser(currentUserId(req));
  res.set("Cache-Control", "no-store");
  res.json({ claims });
});

// POST /api/claims/:claimId/cancel — release one of the caller's own claims.
claimsRouter.post("/:claimId/cancel", async (req, res) => {
  const result = await cancelClaimForUser(
    currentUserId(req),
    req.params.claimId,
  );
  res.json({ claim: result.claim });
});
