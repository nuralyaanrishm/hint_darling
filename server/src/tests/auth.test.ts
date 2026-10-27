import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it, type TestContext } from "node:test";
import { prisma } from "../lib/prisma.js";
import {
  lastVerificationCode,
  makeRunId,
  registerVerified,
  startTestServer,
  TestClient,
  type TestHarness,
  uniqueEmail,
  verificationEmailCount,
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

/** Registers an unverified account and returns the address plus email. */
async function registerUnverified(
  client: TestClient,
  label: string,
): Promise<string> {
  const email = freshEmail(label);
  await client.ensureCsrf();
  const response = await client.request("POST", "/api/auth/register", {
    json: { name: "Ada Lovelace", email, password },
  });
  assert.equal(response.status, 202);
  return email;
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
  it("registers an unverified user, emails a hashed OTP, and verifies it", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    const email = await registerUnverified(client, "register");

    assert.equal(client.sessionCookie, undefined, "no session before verifying");

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(stored.emailVerifiedAt, null);
    assert.notEqual(stored.passwordHash, password);
    assert.match(stored.passwordHash, /^\$argon2id\$/);

    const code = lastVerificationCode(email);
    assert.ok(code, "a verification email should have been sent");
    assert.match(code, /^\d{6}$/);

    const record = await prisma.emailVerification.findUniqueOrThrow({
      where: { userId: stored.id },
    });
    assert.notEqual(record.codeHash, code, "the raw code must not be stored");
    assert.match(record.codeHash, /^[0-9a-f]{64}$/);

    const verified = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code },
    });

    assert.equal(verified.status, 200);
    assert.equal(verified.body.user.email, email);
    assert.ok(!("passwordHash" in verified.body.user));
    assert.ok(client.sessionCookie, "session cookie should be set");

    const afterVerify = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.ok(afterVerify.emailVerifiedAt instanceof Date);
    assert.equal(
      await prisma.emailVerification.count({ where: { userId: stored.id } }),
      0,
    );

    const me = await client.request("GET", "/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  it("rejects a duplicate email once the account is verified", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("duplicate");
    const first = new TestClient(baseUrl);
    const verified = await registerVerified(first, {
      name: "First",
      email,
      password,
    });
    assert.equal(verified.status, 200);

    const second = new TestClient(baseUrl);
    await second.ensureCsrf();
    const duplicate = await second.request("POST", "/api/auth/register", {
      json: { name: "Second", email, password },
    });

    assert.equal(duplicate.status, 409);
    assert.equal(
      duplicate.body.error.message,
      "An account with that email already exists.",
    );

    const count = await prisma.user.count({ where: { email } });
    assert.equal(count, 1);
  });

  it("lets an unverified account re-register and replaces its credentials", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("reregister");
    const first = new TestClient(baseUrl);
    await first.ensureCsrf();
    const initial = await first.request("POST", "/api/auth/register", {
      json: { name: "Old Name", email, password },
    });
    assert.equal(initial.status, 202);

    const before = await prisma.user.findUniqueOrThrow({ where: { email } });

    const second = new TestClient(baseUrl);
    await second.ensureCsrf();
    const updated = await second.request("POST", "/api/auth/register", {
      json: { name: "New Name", email, password: "a-new-long-password" },
    });
    assert.equal(updated.status, 202);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(stored.name, "New Name");
    assert.notEqual(stored.passwordHash, before.passwordHash);
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

  it("blocks login until the email is verified", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("unverified-login");
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

    assert.equal(login.status, 403);
    assert.equal(login.body.error.code, "EMAIL_NOT_VERIFIED");
    assert.equal(loginClient.sessionCookie, undefined);
  });

  it("logs in with correct credentials and keeps the session across requests", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("login");
    const registerClient = new TestClient(baseUrl);
    const verified = await registerVerified(registerClient, {
      name: "Grace Hopper",
      email,
      password,
    });
    assert.equal(verified.status, 200);

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
    await registerVerified(registerClient, {
      name: "Alan Turing",
      email,
      password,
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
    await registerVerified(client, {
      name: "Katherine Johnson",
      email,
      password,
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

  it("rejects a wrong code and counts the attempt", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    const email = await registerUnverified(client, "wrong-code");
    const code = lastVerificationCode(email) as string;
    const wrongCode = code === "000000" ? "111111" : "000000";

    const response = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code: wrongCode },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_CODE");
    assert.equal(client.sessionCookie, undefined);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const record = await prisma.emailVerification.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(record.attempts, 1);

    const verified = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code },
    });
    assert.equal(verified.status, 200);
  });

  it("rejects an expired code", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    const email = await registerUnverified(client, "expired-code");
    const code = lastVerificationCode(email) as string;

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.emailVerification.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "EXPIRED_CODE");
    assert.equal(
      await prisma.emailVerification.count({ where: { userId: user.id } }),
      0,
    );
  });

  it("stops accepting codes after too many wrong attempts", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    const email = await registerUnverified(client, "too-many");
    const code = lastVerificationCode(email) as string;
    const wrongCode = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) {
      const response = await client.request("POST", "/api/auth/verify-email", {
        json: { email, code: wrongCode },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "INVALID_CODE");
    }

    const blocked = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code },
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.error.code, "TOO_MANY_ATTEMPTS");
  });

  it("resends after the cooldown, rotates the code, and invalidates the old one", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    const email = await registerUnverified(client, "resend");
    const firstCode = lastVerificationCode(email) as string;
    assert.equal(verificationEmailCount(email), 1);

    // A second request inside the cooldown is suppressed, not emailed again.
    const immediate = await client.request("POST", "/api/auth/resend-verification", {
      json: { email },
    });
    assert.equal(immediate.status, 202);
    assert.equal(verificationEmailCount(email), 1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.emailVerification.update({
      where: { userId: user.id },
      data: { lastSentAt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    const resent = await client.request("POST", "/api/auth/resend-verification", {
      json: { email },
    });
    assert.equal(resent.status, 202);
    assert.equal(verificationEmailCount(email), 2);

    const secondCode = lastVerificationCode(email) as string;
    assert.notEqual(secondCode, firstCode);

    const stale = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code: firstCode },
    });
    assert.equal(stale.status, 400);
    assert.equal(stale.body.error.code, "INVALID_CODE");

    const verified = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code: secondCode },
    });
    assert.equal(verified.status, 200);
  });

  it("answers resend requests generically for unknown addresses", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const response = await client.request(
      "POST",
      "/api/auth/resend-verification",
      { json: { email: `nobody-${runId}@example.com` } },
    );

    assert.equal(response.status, 202);
    assert.match(response.body.message, /If that email needs verification/);
  });

  it("validates the verification code format", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const response = await client.request("POST", "/api/auth/verify-email", {
      json: { email: "someone@example.com", code: "abc" },
    });

    assert.equal(response.status, 400);
    const fields = response.body.error.fields.map((f: { field: string }) => f.field);
    assert.ok(fields.includes("code"));
  });
});
