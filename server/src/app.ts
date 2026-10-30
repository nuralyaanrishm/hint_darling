import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { HttpError } from "./lib/errors.js";
import { loadPublicWishlist } from "./lib/publicWishlist.js";
import { injectShareMeta } from "./lib/sharePreview.js";
import {
  attachSession,
  csrfProtection,
  issueCsrfToken,
} from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter } from "./routes/billing.js";
import { claimsRouter } from "./routes/claims.js";
import { eventsRouter } from "./routes/events.js";
import { healthRouter } from "./routes/health.js";
import { publicRouter } from "./routes/public.js";
import { toyyibpayRouter } from "./routes/toyyibpay.js";
import { wishlistsRouter } from "./routes/wishlists.js";

// The built client, when it exists, is served by this app in production so the
// API and web app share an origin (cookies, links and link previews all work).
// Both `server/src` (dev) and `server/dist` (built) sit two levels below the
// repo root, so this resolves to the repo's client build in either case.
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(serverDir, "../../client/dist");
const clientIndex = path.join(clientDist, "index.html");

// Builds the Express application. Keeping this separate from server startup
// makes the app easy to import in tests.
export function createApp() {
  const app = express();

  // Vercel terminates TLS at its edge and forwards the original protocol and
  // client IP. Trusting the immediate proxy keeps req.protocol/req.ip correct.
  app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  // ToyyibPay posts urlencoded callbacks and cannot send a CSRF token, so this
  // router must run before cookie parsing and CSRF enforcement.
  app.use("/api/public/toyyibpay", toyyibpayRouter);

  app.use(cookieParser());

  // Issue a CSRF token to every visitor, resolve any existing session, then
  // enforce CSRF on unsafe methods before routes run.
  app.use(issueCsrfToken);
  app.use(attachSession);
  app.use(csrfProtection);

  // All API routes live under /api (the Vite dev server proxies /api here).
  app.use("/api", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/wishlists", wishlistsRouter);
  // One-time Pro unlock and billing status (signed-in only).
  app.use("/api/billing", billingRouter);
  // A gift-giver's own reservations (signed-in only).
  app.use("/api/claims", claimsRouter);
  // Guest-facing, read-only endpoints. No session required.
  app.use("/api/public", publicRouter);

  // Unknown API routes.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { message: "Not found", fields: [] } });
  });

  // Serve the built client (if present). The public wishlist route gets
  // per-wishlist link-preview metadata so social crawlers can unfurl it.
  if (existsSync(clientIndex)) {
    app.use(express.static(clientDist, { index: false }));

    app.get("/w/:shareToken", async (req, res) => {
      let html = readFileSync(clientIndex, "utf8");

      try {
        const wishlist = await loadPublicWishlist(req.params.shareToken);

        if (wishlist) {
          const image =
            wishlist.items.find((item) => item.imageUrl)?.imageUrl ?? null;
          const origin = `${req.protocol}://${req.get("host")}`;
          const giftCount = wishlist.items.length;

          html = injectShareMeta(html, {
            title: `${wishlist.event.name} · ${wishlist.title}`,
            description:
              wishlist.description ??
              `A wishlist with ${giftCount} ${
                giftCount === 1 ? "gift" : "gifts"
              } for ${wishlist.event.name}.`,
            url: `${origin}${req.originalUrl}`,
            image,
          });
        }
      } catch (error) {
        // A preview is a nicety; never let it block the app from loading.
        console.error("Failed to build wishlist link preview:", error);
      }

      res.set("Cache-Control", "no-store");
      res.type("html").send(html);
    });

    // Single-page-app fallback for every other non-API GET request.
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      res.sendFile(clientIndex);
    });
  }

  // Central error handler. Express 5 forwards rejected promises here.
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({
          error: {
            message: error.message,
            fields: Array.isArray(error.details) ? error.details : [],
            ...(error.code ? { code: error.code } : {}),
          },
        });
        return;
      }

      console.error(error);
      res
        .status(500)
        .json({ error: { message: "Something went wrong.", fields: [] } });
    },
  );

  return app;
}
