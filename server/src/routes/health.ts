import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

type DatabaseStatus = "connected" | "disconnected";

// GET /api/health
// Reports that the API is up and whether PostgreSQL is reachable.
// It never throws if the database is down, so the frontend can show an honest status.
healthRouter.get("/health", async (_req, res) => {
  let database: DatabaseStatus = "disconnected";

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }

  res.json({
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  });
});
