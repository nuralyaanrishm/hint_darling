import { Prisma } from "@prisma/client";
import { Router } from "express";
import { isAdminEmail } from "../lib/admins.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js";
import {
  VERIFICATION_TTL_MINUTES,
  checkVerificationCode,
  clearVerificationCode,
  issueVerificationCode,
} from "../lib/emailVerification.js";
import { HttpError } from "../lib/errors.js";
import {
  buildGoogleAuthorizeUrl,
  clearOAuthCookies,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleRedirectUri,
  isGoogleOAuthConfigured,
  oauthStateMatches,
  readOAuthReturnTo,
  readOAuthState,
  safeReturnPath,
  setOAuthCookies,
  type GoogleProfile,
} from "../lib/googleOAuth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  RESET_TTL_MINUTES,
  checkPasswordResetCode,
  clearPasswordResetCode,
  issuePasswordResetCode,
} from "../lib/passwordReset.js";
import type { PlanTierName } from "../lib/plans.js";
import { prisma } from "../lib/prisma.js";
import {
  SESSION_COOKIE,
  clearCsrfCookie,
  clearSessionCookie,
  createSession,
  deleteOtherSessions,
  deleteSession,
  setSessionCookie,
} from "../lib/session.js";
import { generateToken } from "../lib/tokens.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  formatZodError,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../lib/validation.js";
import {
  changePasswordLimiter,
  forgotPasswordLimiter,
  googleOAuthLimiter,
  loginLimiter,
  registerLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} from "../middleware/rateLimit.js";
import { currentUserId, requireAuth } from "../middleware/auth.js";
import type { Request, Response } from "express";

export const authRouter = Router();

// A valid Argon2id hash of a throwaway value. Verified against when no user
// matches so response timing does not reveal whether an email exists.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$V4ZSd+SAg4X1nD3ZvaJDxg$ziZsimLgzy+TUpnfXiFMTbOn82o2cknN2U4xlgXF3To";

interface PublicUser {
  id: string;
  name: string;
  email: string;
  plan: PlanTierName;
  planUnlockedAt: string | null;
  /** False for Google-only accounts until they set a password. */
  hasPassword: boolean;
  isAdmin: boolean;
  createdAt: string;
}

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  plan: PlanTierName;
  planUnlockedAt: Date | null;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    planUnlockedAt: user.planUnlockedAt?.toISOString() ?? null,
    hasPassword: Boolean(user.passwordHash),
    // Only ever describes the caller; the admin list itself is never exposed.
    isAdmin: isAdminEmail(user.email),
    createdAt: user.createdAt.toISOString(),
  };
}

/** Reuses the CSRF token issued by `issueCsrfToken` for the new session. */
async function startSession(
  req: Request,
  res: Response,
  user: { id: string },
): Promise<void> {
  const csrfToken = res.locals.csrfToken as string;
  const { token, expiresAt } = await createSession({
    userId: user.id,
    csrfToken,
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip,
  });

  setSessionCookie(res, token, expiresAt);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// GET /api/auth/csrf — ensures a CSRF cookie exists and returns its value.
authRouter.get("/csrf", (_req, res) => {
  res.json({ csrfToken: res.locals.csrfToken });
});

/**
 * Finds the account for a Google profile, creating or linking it as needed.
 * Google has already verified the address, so Google-only accounts skip the
 * signup OTP. An unverified password account is linked only after its unverified
 * password is cleared: otherwise someone who registered the address without
 * owning it would keep a working password.
 */
async function findOrCreateGoogleUser(profile: GoogleProfile) {
  const linked = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
  });

  if (linked) {
    if (linked.emailVerifiedAt) {
      return linked;
    }

    return prisma.user.update({
      where: { id: linked.id },
      data: { emailVerifiedAt: new Date() },
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email: profile.email },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        googleId: existing.googleId ?? profile.googleId,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        ...(existing.emailVerifiedAt ? {} : { passwordHash: null }),
      },
    });
  }

  try {
    return await prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        emailVerifiedAt: new Date(),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    // A concurrent callback may have created the account first.
    const raced = await prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (raced) {
      return raced;
    }

    const racedEmail = await prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!racedEmail) {
      throw error;
    }

    return prisma.user.update({
      where: { id: racedEmail.id },
      data: {
        googleId: racedEmail.googleId ?? profile.googleId,
        emailVerifiedAt: racedEmail.emailVerifiedAt ?? new Date(),
        ...(racedEmail.emailVerifiedAt ? {} : { passwordHash: null }),
      },
    });
  }
}

function redirectToLoginError(res: Response, code: string): void {
  res.redirect(302, `/login?error=${encodeURIComponent(code)}`);
}

// GET /api/auth/google — starts the Google authorization code flow.
authRouter.get("/google", googleOAuthLimiter, (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    redirectToLoginError(res, "google_not_configured");
    return;
  }

  const state = generateToken(24);
  const authorizeUrl = buildGoogleAuthorizeUrl(req, state);

  if (!authorizeUrl) {
    redirectToLoginError(res, "google_not_configured");
    return;
  }

  const returnTo = safeReturnPath(req.query.redirect);
  setOAuthCookies(res, state, returnTo);
  res.redirect(302, authorizeUrl);
});

// GET /api/auth/google/callback — verifies state, links the account, signs in.
authRouter.get("/google/callback", googleOAuthLimiter, async (req, res) => {
  const expectedState = readOAuthState(req);
  const returnTo = readOAuthReturnTo(req);
  clearOAuthCookies(res);

  if (typeof req.query.error === "string") {
    redirectToLoginError(res, "google_denied");
    return;
  }

  if (!oauthStateMatches(expectedState, req.query.state)) {
    redirectToLoginError(res, "google_failed");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";

  if (!code) {
    redirectToLoginError(res, "google_failed");
    return;
  }

  try {
    const accessToken = await exchangeGoogleCode(
      code,
      googleRedirectUri(req),
    );
    const profile = await fetchGoogleProfile(accessToken);

    if (!profile.emailVerified) {
      redirectToLoginError(res, "google_email_unverified");
      return;
    }

    const user = await findOrCreateGoogleUser(profile);
    await startSession(req, res, user);
    res.redirect(302, returnTo ?? "/dashboard");
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    redirectToLoginError(res, "google_failed");
  }
});

/** Sends the current signup code, cleaning it up if Brevo rejects the mail. */
async function deliverVerificationCode(
  user: { id: string; email: string; name: string },
  code: string,
): Promise<void> {
  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      code,
      expiresInMinutes: VERIFICATION_TTL_MINUTES,
    });
  } catch (error) {
    await clearVerificationCode(user.id).catch(() => undefined);
    console.error("Failed to send verification email:", error);
    throw new HttpError(
      502,
      "We couldn't send the verification email. Please try again.",
      [],
      "EMAIL_SEND_FAILED",
    );
  }
}

// POST /api/auth/register — creates an unverified account and emails a code.
// No session is started until the address is verified.
authRouter.post("/register", registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "Please check the form and try again.",
      formatZodError(parsed.error),
    );
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing?.emailVerifiedAt) {
    throw new HttpError(409, "An account with that email already exists.");
  }

  let user: { id: string; email: string; name: string };

  if (existing) {
    // The address is still unverified, so no usable account exists yet. Let the
    // latest signup replace the details and receive a fresh code.
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { name, passwordHash },
    });
  } else {
    try {
      user = await prisma.user.create({
        data: { name, email, passwordHash },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new HttpError(409, "An account with that email already exists.");
      }
      throw error;
    }
  }

  const issued = await issueVerificationCode(user.id);

  if (issued.sent && issued.code) {
    await deliverVerificationCode(user, issued.code);
  }

  res.status(202).json({
    message: "Check your email for a 6-digit verification code.",
    email: user.email,
  });
});

// POST /api/auth/verify-email — confirms the code and starts the session.
authRouter.post("/verify-email", verifyEmailLimiter, async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "Please check the form and try again.",
      formatZodError(parsed.error),
    );
  }

  const { email, code } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.emailVerifiedAt) {
    throw new HttpError(
      400,
      "That code is incorrect. Please try again.",
      [],
      "INVALID_CODE",
    );
  }

  const result = await checkVerificationCode(user.id, code);

  if (result === "expired") {
    throw new HttpError(
      400,
      "That code has expired. Request a new one.",
      [],
      "EXPIRED_CODE",
    );
  }

  if (result === "too_many_attempts") {
    throw new HttpError(
      400,
      "Too many incorrect attempts. Request a new code.",
      [],
      "TOO_MANY_ATTEMPTS",
    );
  }

  if (result === "invalid") {
    throw new HttpError(
      400,
      "That code is incorrect. Please try again.",
      [],
      "INVALID_CODE",
    );
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  await clearVerificationCode(user.id);
  await startSession(req, res, verified);
  res.json({ user: toPublicUser(verified) });
});

// POST /api/auth/resend-verification — always answers generically so it cannot
// be used to discover which email addresses have accounts.
authRouter.post(
  "/resend-verification",
  resendVerificationLimiter,
  async (req, res) => {
    const parsed = resendVerificationSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "Please check the form and try again.",
        formatZodError(parsed.error),
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    if (user && !user.emailVerifiedAt) {
      const issued = await issueVerificationCode(user.id);

      if (issued.sent && issued.code) {
        try {
          await deliverVerificationCode(user, issued.code);
        } catch {
          // The response stays generic; the error is already logged and the
          // code was removed so the user can retry.
        }
      }
    }

    res.status(202).json({
      message:
        "If that email needs verification, a new code is on its way.",
    });
  },
);

// POST /api/auth/forgot-password — emails a reset code. Always answers the same
// way so it cannot be used to discover which addresses have accounts.
authRouter.post(
  "/forgot-password",
  forgotPasswordLimiter,
  async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "Please check the form and try again.",
        formatZodError(parsed.error),
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    // Unverified accounts cannot sign in yet, so a reset would only confuse.
    if (user?.emailVerifiedAt) {
      const issued = await issuePasswordResetCode(user.id);

      if (issued.sent && issued.code) {
        try {
          await sendPasswordResetEmail({
            to: user.email,
            name: user.name,
            code: issued.code,
            expiresInMinutes: RESET_TTL_MINUTES,
          });
        } catch (error) {
          // Stay generic: surfacing delivery failures here would reveal that
          // the address has an account.
          await clearPasswordResetCode(user.id).catch(() => undefined);
          console.error("Failed to send password reset email:", error);
        }
      }
    }

    res.status(202).json({
      message:
        "If an account exists for that email, a reset code is on its way.",
    });
  },
);

// POST /api/auth/reset-password — checks the code, sets the new password and
// signs the user in. Every other session is revoked first.
authRouter.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "Please check the form and try again.",
      formatZodError(parsed.error),
    );
  }

  const { email, code, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user?.emailVerifiedAt) {
    throw new HttpError(
      400,
      "That code is incorrect. Please try again.",
      [],
      "INVALID_CODE",
    );
  }

  const result = await checkPasswordResetCode(user.id, code);

  if (result === "expired") {
    throw new HttpError(
      400,
      "That code has expired. Request a new one.",
      [],
      "EXPIRED_CODE",
    );
  }

  if (result === "too_many_attempts") {
    throw new HttpError(
      400,
      "Too many incorrect attempts. Request a new code.",
      [],
      "TOO_MANY_ATTEMPTS",
    );
  }

  if (result === "invalid") {
    throw new HttpError(
      400,
      "That code is incorrect. Please try again.",
      [],
      "INVALID_CODE",
    );
  }

  // Reusing the password they forgot would leave the old credential valid.
  if (user.passwordHash && (await verifyPassword(user.passwordHash, password))) {
    throw new HttpError(
      400,
      "Choose a password you haven't used here before.",
      [{ field: "password", message: "Choose a password you haven't used here before." }],
      "PASSWORD_REUSED",
    );
  }

  const passwordHash = await hashPassword(password);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await clearPasswordResetCode(user.id);
  // Drop every session (including any an attacker may hold) before issuing the
  // new one, so the reset cannot leave an old login alive.
  await deleteOtherSessions(user.id);
  await startSession(req, res, updated);

  res.json({ user: toPublicUser(updated) });
});

// POST /api/auth/change-password — signed-in password change. Google-only
// accounts can use it to add a password (no current password to confirm).
authRouter.post(
  "/change-password",
  requireAuth,
  changePasswordLimiter,
  async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new HttpError(
        400,
        "Please check the form and try again.",
        formatZodError(parsed.error),
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { id: currentUserId(req) },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new HttpError(404, "Not found");
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        throw new HttpError(
          400,
          "Enter your current password.",
          [{ field: "currentPassword", message: "Enter your current password." }],
          "CURRENT_PASSWORD_REQUIRED",
        );
      }

      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new HttpError(
          400,
          "That's not your current password.",
          [
            {
              field: "currentPassword",
              message: "That's not your current password.",
            },
          ],
          "INVALID_CURRENT_PASSWORD",
        );
      }

      if (await verifyPassword(user.passwordHash, newPassword)) {
        throw new HttpError(
          400,
          "Choose a password you haven't used here before.",
          [
            {
              field: "newPassword",
              message: "Choose a password you haven't used here before.",
            },
          ],
          "PASSWORD_REUSED",
        );
      }
    }

    const passwordHash = await hashPassword(newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Keep this session signed in, but sign out everywhere else.
    await deleteOtherSessions(user.id, req.auth?.session.id);

    res.json({ user: toPublicUser(updated) });
  },
);

// POST /api/auth/logout-other-devices — signs out every session except this one.
authRouter.post(
  "/logout-other-devices",
  requireAuth,
  async (req, res) => {
    await deleteOtherSessions(currentUserId(req), req.auth?.session.id);
    res.status(204).end();
  },
);

// POST /api/auth/login
authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "Please check the form and try again.",
      formatZodError(parsed.error),
    );
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    password,
  );

  if (!user || !passwordMatches) {
    throw new HttpError(401, "Incorrect email or password.");
  }

  if (!user.emailVerifiedAt) {
    throw new HttpError(
      403,
      "Please verify your email before signing in.",
      [],
      "EMAIL_NOT_VERIFIED",
    );
  }

  await startSession(req, res, user);
  res.json({ user: toPublicUser(user) });
});

// POST /api/auth/logout
authRouter.post("/logout", async (req, res) => {
  const rawToken = req.cookies?.[SESSION_COOKIE];

  if (typeof rawToken === "string" && rawToken.length > 0) {
    await deleteSession(rawToken);
  }

  clearSessionCookie(res);
  clearCsrfCookie(res);
  res.status(204).end();
});

// GET /api/auth/me
authRouter.get("/me", (req, res) => {
  if (!req.auth) {
    throw new HttpError(401, "Not authenticated");
  }

  res.json({ user: toPublicUser(req.auth.user) });
});
