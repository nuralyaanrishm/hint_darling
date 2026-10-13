-- Gift claiming.
--
-- `idempotencyKey` lets the API treat an accidental double-submit as a retry of
-- the same claim instead of creating a second one. NULLs are allowed and, in
-- PostgreSQL, many NULLs do not collide under a unique index.
ALTER TABLE "gift_claims" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "gift_claims_idempotencyKey_key" ON "gift_claims"("idempotencyKey");

-- Hard guarantee that an item can never carry more than one *active* claim.
-- Cancelled claims are excluded, so an item becomes claimable again after a
-- valid cancellation. Prisma cannot express a partial index, so this migration
-- is maintained by hand.
CREATE UNIQUE INDEX "gift_claims_one_active_per_item" ON "gift_claims"("wishlistItemId") WHERE "status" = 'CLAIMED';
