-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'FESTIVE';

-- CreateEnum
CREATE TYPE "SurpriseMode" AS ENUM ('SOFT', 'FULL');

-- DropIndex
DROP INDEX "wishlists_eventId_idx";

-- AlterTable
ALTER TABLE "wishlists" ADD COLUMN "surpriseMode" "SurpriseMode" NOT NULL DEFAULT 'SOFT';

-- CreateIndex
CREATE UNIQUE INDEX "wishlists_eventId_key" ON "wishlists"("eventId");
