-- Google sign-in accounts have no local password.
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Google's stable subject identifier, unique per linked account.
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
