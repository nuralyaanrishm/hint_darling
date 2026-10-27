import { rateLimit } from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

const jsonHandler = (message: string) => ({
  error: { message, fields: [] as unknown[] },
});

/** Limits sign-in attempts to slow down credential stuffing. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many attempts. Please try again later."));
  },
});

/** Limits Google OAuth start/callback requests per IP. */
export const googleOAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many attempts. Please try again later."));
  },
});

/** Limits new account creation to slow down abuse. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 10_000 : 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many accounts created. Please try again later."));
  },
});

/** Limits code guessing for a single IP. */
export const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10_000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many attempts. Please request a new code."));
  },
});

/** Limits how often a new signup code can be requested from one IP. */
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 10_000 : 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many requests. Please try again later."));
  },
});

/**
 * Limits public wishlist lookups. Share tokens are 256-bit secrets that cannot
 * practically be guessed, but a cap still blunts scrapers and token probing.
 */
export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 100_000 : 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many requests. Please slow down."));
  },
});

/**
 * Limits claim creation and claim management calls. Claiming is a deliberate,
 * occasional action, so a low cap blunts token probing and automation without
 * affecting normal guests.
 */
export const claimLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isTest ? 100_000 : 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json(jsonHandler("Too many attempts. Please slow down."));
  },
});
