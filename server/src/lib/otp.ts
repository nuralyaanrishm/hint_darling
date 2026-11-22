import { createHmac, randomInt } from "node:crypto";

/**
 * Shared one-time-code primitives for every emailed OTP (signup verification and
 * password reset). Codes are only six digits, so they are stored as an HMAC
 * digest keyed by a server-side secret: a database leak on its own cannot
 * reverse them offline.
 */
export function otpSecret(): string {
  const secret = process.env.OTP_SECRET;

  if (secret && secret.length >= 16) {
    return secret;
  }

  if (process.env.NODE_ENV === "test") {
    return "test-only-otp-secret-value";
  }

  throw new Error(
    "OTP_SECRET must be set to a random value of at least 16 characters.",
  );
}

/** Six random digits, zero-padded (e.g. `004271`). */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** HMAC-SHA256 digest of a code, keyed by `OTP_SECRET`. */
export function hashOtpCode(code: string): string {
  return createHmac("sha256", otpSecret()).update(code).digest("hex");
}
