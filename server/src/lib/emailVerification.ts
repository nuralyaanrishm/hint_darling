import { generateOtpCode, hashOtpCode } from "./otp.js";
import { prisma } from "./prisma.js";
import { safeEqual } from "./tokens.js";

// Kept under their original names so existing callers and tests are unaffected.
export {
  generateOtpCode as generateVerificationCode,
  hashOtpCode as hashVerificationCode,
};

/** How long a signup code stays valid. */
export const VERIFICATION_TTL_MS = 10 * 60 * 1000;
/** Wrong-code attempts allowed before the code must be resent. */
export const MAX_VERIFICATION_ATTEMPTS = 5;
/** Minimum time between code sends for one account. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_TTL_MINUTES = VERIFICATION_TTL_MS / 60_000;

export interface IssuedVerification {
  /** False when the resend cooldown suppressed a second email. */
  sent: boolean;
  /** Present only when `sent` is true, for the caller to email. */
  code: string | null;
}

/**
 * Creates or rotates the account's code. Returns `sent: false` when a code was
 * issued less than `RESEND_COOLDOWN_MS` ago, so callers can avoid spamming.
 */
export async function issueVerificationCode(
  userId: string,
): Promise<IssuedVerification> {
  const existing = await prisma.emailVerification.findUnique({
    where: { userId },
    select: { lastSentAt: true },
  });

  if (
    existing &&
    Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    return { sent: false, code: null };
  }

  const code = generateOtpCode();
  const now = new Date();

  await prisma.emailVerification.upsert({
    where: { userId },
    create: {
      userId,
      codeHash: hashOtpCode(code),
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
      lastSentAt: now,
    },
    update: {
      codeHash: hashOtpCode(code),
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    },
  });

  return { sent: true, code };
}

export type VerifyCodeResult =
  | "ok"
  | "invalid"
  | "expired"
  | "too_many_attempts";

/** Checks a submitted code without marking the account verified. */
export async function checkVerificationCode(
  userId: string,
  code: string,
): Promise<VerifyCodeResult> {
  const record = await prisma.emailVerification.findUnique({
    where: { userId },
  });

  if (!record) {
    return "invalid";
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.emailVerification
      .deleteMany({ where: { userId } })
      .catch(() => undefined);
    return "expired";
  }

  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return "too_many_attempts";
  }

  if (!safeEqual(hashOtpCode(code), record.codeHash)) {
    await prisma.emailVerification.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
    return "invalid";
  }

  return "ok";
}

/** Removes the code once the account is verified. */
export async function clearVerificationCode(userId: string): Promise<void> {
  await prisma.emailVerification.deleteMany({ where: { userId } });
}
