-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "proUnlockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "amountSen" INTEGER NOT NULL DEFAULT 100,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
    "externalReference" TEXT NOT NULL,
    "billCode" TEXT,
    "refno" TEXT,
    "transactionId" TEXT,
    "paymentChannel" TEXT,
    "paidAt" TIMESTAMP(3),
    "rawCallback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_externalReference_key" ON "purchases"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_billCode_key" ON "purchases"("billCode");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_refno_key" ON "purchases"("refno");

-- CreateIndex
CREATE INDEX "purchases_userId_status_idx" ON "purchases"("userId", "status");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
