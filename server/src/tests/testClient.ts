import type { Server } from "node:http";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

/** Generates a per-run suffix so test data never collides between runs. */
export function makeRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A unique, obviously-test email address. */
export function uniqueEmail(label: string, runId: string): string {
  return `hd-test-${label}-${runId}@example.com`;
}

/** A minimal cookie-jar HTTP client that also echoes the CSRF cookie. */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  async request(
    method: string,
    path: string,
    options: { json?: unknown; csrf?: boolean } = {},
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {};
    const { json, csrf = true } = options;

    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    }

    if (csrf && method !== "GET" && method !== "HEAD") {
      const token = this.cookies.get("hd_csrf");
      if (token) {
        headers["X-CSRF-Token"] = token;
      }
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });

    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ""] = setCookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();

      if (!name) {
        continue;
      }

      if (value === "") {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { status: response.status, body };
  }

  async ensureCsrf(): Promise<string> {
    const { body } = await this.request("GET", "/api/auth/csrf", { csrf: false });
    return (body as { csrfToken: string }).csrfToken;
  }

  get sessionCookie(): string | undefined {
    return this.cookies.get("hd_session");
  }
}

export interface TestHarness {
  server: Server;
  baseUrl: string;
  dbReady: boolean;
  close: () => Promise<void>;
}

/**
 * Starts the real Express app on an ephemeral port and reports whether
 * PostgreSQL is reachable so database-backed tests can skip gracefully.
 */
export async function startTestServer(): Promise<TestHarness> {
  let dbReady = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbReady = false;
    console.warn(
      "\n[database tests] PostgreSQL unreachable — set DATABASE_URL and start the database to run these tests.\n",
    );
  }

  const app = createApp();
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const address = server.address();
  const baseUrl =
    address && typeof address === "object"
      ? `http://127.0.0.1:${address.port}`
      : "";

  return {
    server,
    baseUrl,
    dbReady,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
