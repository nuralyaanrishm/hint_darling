import { Prisma } from "@prisma/client";
import { Router } from "express";
import { sendVerificationEmail } from "../lib/email.js";
import {
  VERIFICATION_TTL_MINUTES,
  checkVerificationCode,
  clearVerificationCode,
  issueVerificationCode,
} from "../lib/emailVerification.js";
import { HttpError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import {
  SESSION_COOKIE,
  clearCsrfCookie,
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
} from "../lib/session.js";
import {
  formatZodError,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from "../lib/validation.js";
import {
  loginLimiter,
  registerLimiter,
  resendVerificationLimiter,
  verifyEmailLimiter,
} from "../middleware/rateLimit.js";
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
  createdAt: string;
}

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
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

/** Sends the current signup code, cleaning it up if Mailgun rejects the mail. */
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
