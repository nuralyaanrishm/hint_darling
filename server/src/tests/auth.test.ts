import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it, type TestContext } from "node:test";
import { prisma } from "../lib/prisma.js";
import {
  makeRunId,
  startTestServer,
  TestClient,
  type TestHarness,
  uniqueEmail,
} from "./testClient.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const runId = makeRunId();
const password = "correct-horse-battery";
const createdEmails = new Set<string>();

let harness: TestHarness;
let baseUrl = "";
let dbReady = false;

function freshEmail(label: string): string {
  const email = uniqueEmail(label, runId);
  createdEmails.add(email);
  return email;
}

function skipWithoutDb(t: TestContext): boolean {
  if (!dbReady) {
    t.skip("PostgreSQL is not reachable; skipping database-backed test");
    return true;
  }
  return false;
}

before(async () => {
  harness = await startTestServer();
  baseUrl = harness.baseUrl;
  dbReady = harness.dbReady;
});

after(async () => {
  if (dbReady && createdEmails.size > 0) {
    await prisma.user
      .deleteMany({ where: { email: { in: [...createdEmails] } } })
      .catch(() => undefined);
  }

  await harness.close();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("authentication", () => {
  it("registers a user, starts a session, and never stores a plaintext password", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const email = freshEmail("register");

    const response = await client.request("POST", "/api/auth/register", {
      json: { name: "Ada Lovelace", email, password },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, email);
    assert.equal(response.body.user.name, "Ada Lovelace");
    assert.ok(!("passwordHash" in response.body.user));
    assert.ok(client.sessionCookie, "session cookie should be set");

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.notEqual(stored.passwordHash, password);
    assert.match(stored.passwordHash, /^\$argon2id\$/);

    const future = await client.request("GET", "/api/auth/me");
    assert.equal(future.status, 200);
    assert.equal(future.body.user.email, email);
  });

  it("rejects a duplicate email with 409", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("duplicate");
    const first = new TestClient(baseUrl);
    await first.ensureCsrf();
    const created = await first.request("POST", "/api/auth/register", {
      json: { name: "First", email, password },
    });
    assert.equal(created.status, 201);

    const second = new TestClient(baseUrl);
    await second.ensureCsrf();
    const duplicate = await second.request("POST", "/api/auth/register", {
      json: { name: "Second", email, password },
    });

    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.message, "An account with that email already exists.");

    const count = await prisma.user.count({ where: { email } });
    assert.equal(count, 1);
  });

  it("rejects invalid input with field errors", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();

    const response = await client.request("POST", "/api/auth/register", {
      json: { name: "", email: "not-an-email", password: "short" },
    });

    assert.equal(response.status, 400);
    const fields = response.body.error.fields.map((f: { field: string }) => f.field);
    assert.ok(fields.includes("name"));
    assert.ok(fields.includes("email"));
    assert.ok(fields.includes("password"));
  });

  it("logs in with correct credentials and keeps the session across requests", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("login");
    const registerClient = new TestClient(baseUrl);
    await registerClient.ensureCsrf();
    await registerClient.request("POST", "/api/auth/register", {
      json: { name: "Grace Hopper", email, password },
    });

    const loginClient = new TestClient(baseUrl);
    await loginClient.ensureCsrf();
    const login = await loginClient.request("POST", "/api/auth/login", {
      json: { email, password },
    });

    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, email);

    for (let i = 0; i < 2; i += 1) {
      const me = await loginClient.request("GET", "/api/auth/me");
      assert.equal(me.status, 200);
      assert.equal(me.body.user.email, email);
    }
  });

  it("rejects an incorrect password with 401 and starts no session", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("wrongpass");
    const registerClient = new TestClient(baseUrl);
    await registerClient.ensureCsrf();
    await registerClient.request("POST", "/api/auth/register", {
      json: { name: "Alan Turing", email, password },
    });

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const login = await client.request("POST", "/api/auth/login", {
      json: { email, password: "definitely-not-it" },
    });

    assert.equal(login.status, 401);
    assert.equal(login.body.error.message, "Incorrect email or password.");
    assert.equal(client.sessionCookie, undefined);
  });

  it("does not reveal whether an email exists on login", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const login = await client.request("POST", "/api/auth/login", {
      json: { email: `missing-${runId}@example.com`, password },
    });

    assert.equal(login.status, 401);
    assert.equal(login.body.error.message, "Incorrect email or password.");
  });

  it("logs out and invalidates the session", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("logout");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await client.request("POST", "/api/auth/register", {
      json: { name: "Katherine Johnson", email, password },
    });

    const before = await client.request("GET", "/api/auth/me");
    assert.equal(before.status, 200);

    const logout = await client.request("POST", "/api/auth/logout");
    assert.equal(logout.status, 204);

    const me = await client.request("GET", "/api/auth/me");
    assert.equal(me.status, 401);
    assert.equal(client.sessionCookie, undefined);
  });

  it("protects authenticated routes", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    const me = await client.request("GET", "/api/auth/me");
    assert.equal(me.status, 401);
    assert.equal(me.body.error.message, "Not authenticated");
  });

  it("rejects state-changing requests without a matching CSRF token", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("csrf");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();

    const missingHeader = await client.request("POST", "/api/auth/register", {
      csrf: false,
      json: { name: "No CSRF", email, password },
    });
    assert.equal(missingHeader.status, 403);
    assert.equal(missingHeader.body.error.message, "Invalid or missing CSRF token");

    const count = await prisma.user.count({ where: { email } });
    assert.equal(count, 0);
  });
});
