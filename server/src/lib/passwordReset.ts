import { generateOtpCode, hashOtpCode } from "./otp.js";
import { prisma } from "./prisma.js";
import { safeEqual } from "./tokens.js";

// Password-reset codes live in their own table (`password_resets`) rather than
// sharing `email_verifications`, so a signup code can never be replayed as a
// reset code and requesting a reset never invalidates a pending signup code.

/** How long a reset code stays valid. */
export const RESET_TTL_MS = 10 * 60 * 1000;
export const RESET_TTL_MINUTES = RESET_TTL_MS / 60_000;
/** Wrong-code attempts allowed before the code must be resent. */
export const MAX_RESET_ATTEMPTS = 5;
/** Minimum time between code sends for one account. */
export const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

export interface IssuedReset {
  /** False when the resend cooldown suppressed a second email. */
  sent: boolean;
  /** Present only when `sent` is true, for the caller to email. */
  code: string | null;
}

/**
 * Creates or rotates the account's reset code. Returns `sent: false` when a code
 * was issued less than `RESET_RESEND_COOLDOWN_MS` ago so callers do not spam.
 */
export async function issuePasswordResetCode(
  userId: string,
): Promise<IssuedReset> {
  const existing = await prisma.passwordReset.findUnique({
    where: { userId },
    select: { lastSentAt: true },
  });

  if (
    existing &&
    Date.now() - existing.lastSentAt.getTime() < RESET_RESEND_COOLDOWN_MS
  ) {
    return { sent: false, code: null };
  }

  const code = generateOtpCode();
  const now = new Date();

  await prisma.passwordReset.upsert({
    where: { userId },
    create: {
      userId,
      codeHash: hashOtpCode(code),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      lastSentAt: now,
    },
    update: {
      codeHash: hashOtpCode(code),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    },
  });

  return { sent: true, code };
}

export type ResetCodeResult = "ok" | "invalid" | "expired" | "too_many_attempts";

/** Checks a submitted reset code without changing the password. */
export async function checkPasswordResetCode(
  userId: string,
  code: string,
): Promise<ResetCodeResult> {
  const record = await prisma.passwordReset.findUnique({
    where: { userId },
  });

  if (!record) {
    return "invalid";
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.passwordReset
      .deleteMany({ where: { userId } })
      .catch(() => undefined);
    return "expired";
  }

  if (record.attempts >= MAX_RESET_ATTEMPTS) {
    return "too_many_attempts";
  }

  if (!safeEqual(hashOtpCode(code), record.codeHash)) {
    await prisma.passwordReset.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
    return "invalid";
  }

  return "ok";
}

/** Removes the code once it has been used, so it cannot be replayed. */
export async function clearPasswordResetCode(userId: string): Promise<void> {
  await prisma.passwordReset.deleteMany({ where: { userId } });
}
