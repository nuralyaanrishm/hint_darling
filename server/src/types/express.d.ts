import type { ValidSession } from "../lib/session.js";

declare global {
  namespace Express {
    interface Request {
      /** Populated by `attachSession` when a valid session cookie is present. */
      auth?: {
        session: ValidSession;
        user: ValidSession["user"];
      };
    }
  }
}

export {};
