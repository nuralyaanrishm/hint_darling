-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PLUS', 'PRO');

-- AlterTable
ALTER TABLE "users"
    ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    ADD COLUMN "planUnlockedAt" TIMESTAMP(3);

-- Backfill existing one-time unlock purchases as Pro accounts.
UPDATE "users"
SET "plan" = 'PRO',
    "planUnlockedAt" = "proUnlockedAt"
WHERE "proUnlockedAt" IS NOT NULL;

-- Drop the old single-tier flag.
ALTER TABLE "users" DROP COLUMN "proUnlockedAt";

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'PRO';
ALTER TABLE "purchases" ALTER COLUMN "amountSen" DROP DEFAULT;
