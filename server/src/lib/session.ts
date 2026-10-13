import type { Response } from "express";
import { prisma } from "./prisma.js";
import { generateToken, hashToken } from "./tokens.js";

export const SESSION_COOKIE = "hd_session";
export const CSRF_COOKIE = "hd_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** How long a session stays valid after sign-in. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === "production";

const baseCookie = {
  sameSite: "lax" as const,
  secure: isProduction,
  path: "/",
};

/** The session cookie is unreadable to JavaScript (mitigates XSS token theft). */
export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    ...baseCookie,
    httpOnly: true,
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...baseCookie, httpOnly: true });
}

/**
 * The CSRF cookie is intentionally readable by script so the client can echo
 * it back in the `X-CSRF-Token` header (double-submit pattern).
 */
export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    ...baseCookie,
    httpOnly: false,
    maxAge: SESSION_TTL_MS,
  });
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE, { ...baseCookie, httpOnly: false });
}

export interface CreateSessionInput {
  userId: string;
  csrfToken: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashToken(token),
      csrfHash: hashToken(input.csrfToken),
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export interface ValidSession {
  id: string;
  csrfHash: string;
  expiresAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
  };
}

/**
 * Looks up a session by raw cookie token. Expired sessions are deleted lazily
 * so abandoned rows do not accumulate indefinitely.
 */
export async function findValidSession(
  rawToken: string,
): Promise<ValidSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: {
        select: { id: true, name: true, email: true, createdAt: true },
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }

  return {
    id: session.id,
    csrfHash: session.csrfHash,
    expiresAt: session.expiresAt,
    user: session.user,
  };
}

export async function deleteSession(rawToken: string): Promise<void> {
  await prisma.session
    .deleteMany({ where: { tokenHash: hashToken(rawToken) } })
    .catch(() => undefined);
}

export async function deleteSessionById(id: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id } }).catch(() => undefined);
}
