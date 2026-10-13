import { Prisma } from "@prisma/client";
import { Router } from "express";
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
} from "../lib/validation.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimit.js";
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

// POST /api/auth/register
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

  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    await startSession(req, res, user);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new HttpError(409, "An account with that email already exists.");
    }
    throw error;
  }
});

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
