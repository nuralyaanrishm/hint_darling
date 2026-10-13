import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors.js";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  findValidSession,
  setCsrfCookie,
} from "../lib/session.js";
import { generateToken, hashToken, safeEqual } from "../lib/tokens.js";

/**
 * Reads the session cookie and, when valid, exposes the user on `req.auth`.
 * Runs on every request; missing or invalid cookies simply leave `req.auth`
 * undefined so public routes still work.
 */
export async function attachSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken = req.cookies?.[SESSION_COOKIE];

  if (!rawToken || typeof rawToken !== "string") {
    next();
    return;
  }

  try {
    const session = await findValidSession(rawToken);
    if (session) {
      req.auth = { session, user: session.user };
    }
  } catch (error) {
    // Treat session lookup failures as "not signed in" so public routes (like
    // the health check) still respond honestly if the database is down.
    console.error("Failed to resolve session:", error);
  }

  next();
}

/** Rejects the request unless a valid session was resolved by `attachSession`. */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  next();
}

/**
 * The signed-in user's id. Only call this from routes that run after
 * `requireAuth`, which guarantees `req.auth` is set.
 */
export function currentUserId(req: Request): string {
  if (!req.auth) {
    throw new HttpError(401, "Authentication required");
  }

  return req.auth.user.id;
}

/**
 * Issues a CSRF token in a script-readable cookie when one is not already set,
 * so the client can echo it back in the `X-CSRF-Token` header. The resolved
 * token is stored on `res.locals.csrfToken` as the single source of truth.
 */
export function issueCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const existing = req.cookies?.[CSRF_COOKIE];
  let token =
    typeof existing === "string" && existing.length > 0 ? existing : null;

  if (!token) {
    token = generateToken(24);
    setCsrfCookie(res, token);
  }

  res.locals.csrfToken = token;
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF protection. Unsafe methods must send a token that matches
 * the CSRF cookie; authenticated requests must also match the session's
 * stored CSRF digest, tying the token to the session.
 */
export function csrfProtection(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (
    typeof cookieToken !== "string" ||
    typeof headerToken !== "string" ||
    cookieToken.length === 0 ||
    !safeEqual(cookieToken, headerToken)
  ) {
    next(new HttpError(403, "Invalid or missing CSRF token"));
    return;
  }

  if (
    req.auth &&
    !safeEqual(hashToken(headerToken), req.auth.session.csrfHash)
  ) {
    next(new HttpError(403, "Invalid or missing CSRF token"));
    return;
  }

  next();
}
