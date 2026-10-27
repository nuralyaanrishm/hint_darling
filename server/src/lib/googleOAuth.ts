import type { Request, Response } from "express";
import { safeEqual } from "./tokens.js";

// Minimal Google OAuth 2.0 (authorization code) client. The flow is:
//   1. `/api/auth/google` stores a random state in an HTTP-only cookie and
//      redirects the browser to Google's consent screen.
//   2. Google redirects back to `/api/auth/google/callback` with a code.
//   3. We exchange the code for an access token and read the verified profile
//      from Google's OpenID Connect userinfo endpoint, then start a session.
// No Google tokens are stored on our side.

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const OAUTH_STATE_COOKIE = "hd_oauth_state";
export const OAUTH_REDIRECT_COOKIE = "hd_oauth_redirect";

// Both cookies are scoped to the OAuth routes; the browser must send them back
// on the callback for the state check and return-path to work.
const OAUTH_COOKIE_PATH = "/api/auth/google";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_RETURN_PATH_LENGTH = 512;

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  path: OAUTH_COOKIE_PATH,
};

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return googleConfig() !== null;
}

/**
 * The callback URL must match the one registered in Google Cloud exactly. It is
 * derived from the incoming request so it works on localhost and any deployed
 * host; set `GOOGLE_REDIRECT_URI` to override it.
 */
export function googleRedirectUri(req: Request): string {
  const override = process.env.GOOGLE_REDIRECT_URI?.trim();

  if (override) {
    return override;
  }

  return `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
}

export function buildGoogleAuthorizeUrl(
  req: Request,
  state: string,
): string | null {
  const config = googleConfig();

  if (!config) {
    return null;
  }

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Stores the state (and optional post-login path) for the callback to check. */
export function setOAuthCookies(
  res: Response,
  state: string,
  returnTo: string | null,
): void {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...cookieOptions,
    maxAge: OAUTH_STATE_TTL_MS,
  });

  if (returnTo) {
    res.cookie(OAUTH_REDIRECT_COOKIE, returnTo, {
      ...cookieOptions,
      maxAge: OAUTH_STATE_TTL_MS,
    });
  } else {
    res.clearCookie(OAUTH_REDIRECT_COOKIE, cookieOptions);
  }
}

export function clearOAuthCookies(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions);
  res.clearCookie(OAUTH_REDIRECT_COOKIE, cookieOptions);
}

export function readOAuthState(req: Request): string | null {
  const value = req.cookies?.[OAUTH_STATE_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readOAuthReturnTo(req: Request): string | null {
  return safeReturnPath(req.cookies?.[OAUTH_REDIRECT_COOKIE]);
}

/**
 * Only same-site, absolute paths are allowed as post-login redirects. This
 * blocks open redirects such as `//evil.example` or `https://evil.example`.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (
    value.length === 0 ||
    value.length > MAX_RETURN_PATH_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }

  return value;
}

export function oauthStateMatches(expected: string | null, received: unknown): boolean {
  return (
    typeof expected === "string" &&
    typeof received === "string" &&
    expected.length > 0 &&
    received.length > 0 &&
    safeEqual(expected, received)
  );
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<string> {
  const config = googleConfig();

  if (!config) {
    throw new Error("Google OAuth is not configured");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: unknown };

  if (typeof data.access_token !== "string" || data.access_token.length === 0) {
    throw new Error("Google token exchange returned no access token");
  }

  return data.access_token;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export async function fetchGoogleProfile(
  accessToken: string,
): Promise<GoogleProfile> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
  };

  const googleId = typeof data.sub === "string" ? data.sub.trim() : "";
  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";

  if (!googleId || !email) {
    throw new Error("Google profile is missing an account id or email");
  }

  const name =
    (typeof data.name === "string" && data.name.trim()) ||
    email.split("@")[0] ||
    "Friend";

  return {
    googleId,
    email,
    name,
    emailVerified:
      data.email_verified === true || data.email_verified === "true",
  };
}
