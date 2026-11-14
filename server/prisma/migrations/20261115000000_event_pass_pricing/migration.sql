-- Event Pass pricing: replace the three-tier plan model with Free/Pro plus a
-- per-event unlock. Existing Plus accounts are grandfathered into Pro.

-- AlterEnum: PlanTier is now FREE | PRO. PLUS rows keep full (Pro) access.
CREATE TYPE "PlanTier_new" AS ENUM ('FREE', 'PRO');

ALTER TABLE "users" ALTER COLUMN "plan" DROP DEFAULT;

ALTER TABLE "users"
    ALTER COLUMN "plan" TYPE "PlanTier_new"
    USING (
        CASE
            WHEN "plan"::text = 'PLUS' THEN 'PRO'::"PlanTier_new"
            ELSE "plan"::text::"PlanTier_new"
        END
    );

ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'FREE'::"PlanTier_new";

DROP TYPE "PlanTier";
ALTER TYPE "PlanTier_new" RENAME TO "PlanTier";

-- CreateEnum
CREATE TYPE "PurchaseProduct" AS ENUM ('EVENT_PASS', 'PRO');

-- AlterTable: purchases now record which product they bought, and Event Pass
-- rows point at the event they unlock.
ALTER TABLE "purchases"
    ADD COLUMN "product" "PurchaseProduct" NOT NULL DEFAULT 'PRO',
    ADD COLUMN "eventId" TEXT;

-- Older rows were all lifetime plan unlocks.
UPDATE "purchases" SET "product" = 'PRO';

ALTER TABLE "purchases" DROP COLUMN "plan";

-- CreateIndex
CREATE INDEX "purchases_eventId_status_idx" ON "purchases"("eventId", "status");

-- AddForeignKey
ALTER TABLE "purchases"
    ADD CONSTRAINT "purchases_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
