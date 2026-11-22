import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it, type TestContext } from "node:test";
import { prisma } from "../lib/prisma.js";
import { hashToken, generateToken } from "../lib/tokens.js";
import {
  lastPasswordResetCode,
  lastVerificationCode,
  makeRunId,
  passwordResetEmailCount,
  registerVerified,
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
const newPassword = "a-fresh-new-password";
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

/** A verified, signed-in account plus its credentials. */
async function verifiedAccount(
  label: string,
): Promise<{ client: TestClient; email: string }> {
  const client = new TestClient(baseUrl);
  const email = freshEmail(label);
  const registered = await registerVerified(client, {
    name: "Ada Lovelace",
    email,
    password,
  });
  assert.equal(registered.status, 200);
  return { client, email };
}

/** A second signed-in client for the same account. */
async function secondSession(email: string): Promise<TestClient> {
  const client = new TestClient(baseUrl);
  await client.ensureCsrf();
  const loggedIn = await client.request("POST", "/api/auth/login", {
    json: { email, password },
  });
  assert.equal(loggedIn.status, 200);
  return client;
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
// Forgot password
// ---------------------------------------------------------------------------

describe("forgot password", () => {
  it("emails a reset code and answers generically", async (t) => {
    if (skipWithoutDb(t)) return;

    const { email } = await verifiedAccount("forgot");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();

    const response = await client.request("POST", "/api/auth/forgot-password", {
      json: { email },
    });

    assert.equal(response.status, 202);
    assert.match(response.body.message, /reset code is on its way/);

    const code = lastPasswordResetCode(email);
    assert.ok(code, "a reset email should have been sent");
    assert.match(code, /^\d{6}$/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const record = await prisma.passwordReset.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.notEqual(record.codeHash, code, "the raw code must not be stored");
    assert.match(record.codeHash, /^[0-9a-f]{64}$/);
    assert.equal(record.attempts, 0);
  });

  it("never reveals whether an address has an account", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const unknown = uniqueEmail("ghost", runId);

    const response = await client.request("POST", "/api/auth/forgot-password", {
      json: { email: unknown },
    });

    assert.equal(response.status, 202);
    assert.equal(passwordResetEmailCount(unknown), 0);
  });

  it("sends nothing for an address that has not been verified", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("unverified-forgot");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await client.request("POST", "/api/auth/register", {
      json: { name: "Grace Hopper", email, password },
    });

    const response = await client.request("POST", "/api/auth/forgot-password", {
      json: { email },
    });

    assert.equal(response.status, 202);
    assert.equal(passwordResetEmailCount(email), 0);
  });

  it("does not clobber a pending signup code", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("pending-signup");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await client.request("POST", "/api/auth/register", {
      json: { name: "Grace Hopper", email, password },
    });

    const signupCode = lastVerificationCode(email);
    assert.ok(signupCode);

    await client.request("POST", "/api/auth/forgot-password", { json: { email } });

    const verified = await client.request("POST", "/api/auth/verify-email", {
      json: { email, code: signupCode },
    });
    assert.equal(verified.status, 200, "the signup code should still work");
  });

  it("suppresses a second email inside the resend cooldown", async (t) => {
    if (skipWithoutDb(t)) return;

    const { email } = await verifiedAccount("cooldown");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();

    await client.request("POST", "/api/auth/forgot-password", { json: { email } });
    const first = lastPasswordResetCode(email);
    assert.ok(first);

    const second = await client.request("POST", "/api/auth/forgot-password", {
      json: { email },
    });

    assert.equal(second.status, 202);
    assert.equal(passwordResetEmailCount(email), 1, "no second email within 60s");
    assert.equal(lastPasswordResetCode(email), first, "the code did not rotate");
  });
});

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

describe("reset password", () => {
  it("rejects a wrong code and burns it after five attempts", async (t) => {
    if (skipWithoutDb(t)) return;

    const { email } = await verifiedAccount("wrong-code");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await client.request("POST", "/api/auth/forgot-password", { json: { email } });

    const code = lastPasswordResetCode(email);
    assert.ok(code);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await client.request("POST", "/api/auth/reset-password", {
        json: { email, code: wrong, password: newPassword },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "INVALID_CODE");
    }

    const exhausted = await client.request("POST", "/api/auth/reset-password", {
      json: { email, code, password: newPassword },
    });
    assert.equal(exhausted.status, 400);
    assert.equal(exhausted.body.error.code, "TOO_MANY_ATTEMPTS");

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const record = await prisma.passwordReset.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(record.attempts, 5, "the code should be burned");

    // The old password still works: the reset never completed.
    const login = await client.request("POST", "/api/auth/login", {
      json: { email, password },
    });
    assert.equal(login.status, 200);
  });

  it("rejects an expired code", async (t) => {
    if (skipWithoutDb(t)) return;

    const { email } = await verifiedAccount("expired");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await client.request("POST", "/api/auth/forgot-password", { json: { email } });
    const code = lastPasswordResetCode(email);
    assert.ok(code);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.passwordReset.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await client.request("POST", "/api/auth/reset-password", {
      json: { email, code, password: newPassword },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "EXPIRED_CODE");
  });

  it("sets the password, signs the user in and revokes every other session", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client: original, email } = await verifiedAccount("reset-ok");
    const other = await secondSession(email);

    const anonymous = new TestClient(baseUrl);
    await anonymous.ensureCsrf();
    await anonymous.request("POST", "/api/auth/forgot-password", { json: { email } });
    const code = lastPasswordResetCode(email);
    assert.ok(code);

    const reset = await anonymous.request("POST", "/api/auth/reset-password", {
      json: { email, code, password: newPassword },
    });

    assert.equal(reset.status, 200);
    assert.equal(reset.body.user.email, email);
    assert.equal(reset.body.user.hasPassword, true);
    assert.ok(!("passwordHash" in reset.body.user));
    assert.ok(anonymous.sessionCookie, "the resetting client should be signed in");

    // Every pre-existing session is gone, including the original one.
    assert.equal((await original.request("GET", "/api/auth/me")).status, 401);
    assert.equal((await other.request("GET", "/api/auth/me")).status, 401);
    assert.equal((await anonymous.request("GET", "/api/auth/me")).status, 200);

    // The code is single-use.
    const replayClient = new TestClient(baseUrl);
    await replayClient.ensureCsrf();
    const replay = await replayClient.request("POST", "/api/auth/reset-password", {
      json: { email, code, password: "yet-another-password" },
    });
    assert.equal(replay.status, 400);

    // Old password is dead, new password works.
    const stale = new TestClient(baseUrl);
    await stale.ensureCsrf();
    assert.equal(
      (await stale.request("POST", "/api/auth/login", {
        json: { email, password },
      })).status,
      401,
    );
    assert.equal(
      (await stale.request("POST", "/api/auth/login", {
        json: { email, password: newPassword },
      })).status,
      200,
    );
  });

  it("refuses to set the same password again", async (t) => {
    if (skipWithoutDb(t)) return;

    const { email } = await verifiedAccount("reuse");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await client.request("POST", "/api/auth/forgot-password", { json: { email } });
    const code = lastPasswordResetCode(email);
    assert.ok(code);

    const response = await client.request("POST", "/api/auth/reset-password", {
      json: { email, code, password },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "PASSWORD_REUSED");
    assert.equal(response.body.error.fields[0].field, "password");
  });

  it("rejects a code that was never issued", async (t) => {
    if (skipWithoutDb(t)) return;

    const { email } = await verifiedAccount("no-code");
    const client = new TestClient(baseUrl);
    await client.ensureCsrf();

    const response = await client.request("POST", "/api/auth/reset-password", {
      json: { email, code: "123456", password: newPassword },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_CODE");
  });
});

// ---------------------------------------------------------------------------
// Change password (signed in)
// ---------------------------------------------------------------------------

describe("change password", () => {
  it("requires a session", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    const response = await client.request("POST", "/api/auth/change-password", {
      json: { currentPassword: password, newPassword },
    });

    assert.equal(response.status, 401);
  });

  it("rejects a wrong current password without changing anything", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client, email } = await verifiedAccount("wrong-current");

    const response = await client.request("POST", "/api/auth/change-password", {
      json: { currentPassword: "not-my-password", newPassword },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_CURRENT_PASSWORD");
    assert.equal(response.body.error.fields[0].field, "currentPassword");

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.ok(user.passwordHash);
    const login = await new TestClient(baseUrl);
    await login.ensureCsrf();
    assert.equal(
      (await login.request("POST", "/api/auth/login", {
        json: { email, password },
      })).status,
      200,
    );
  });

  it("requires the current password when the account has one", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client } = await verifiedAccount("missing-current");

    const response = await client.request("POST", "/api/auth/change-password", {
      json: { newPassword },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "CURRENT_PASSWORD_REQUIRED");
  });

  it("changes the password, keeps this session and signs out the others", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client, email } = await verifiedAccount("change-ok");
    const other = await secondSession(email);

    const response = await client.request("POST", "/api/auth/change-password", {
      json: { currentPassword: password, newPassword },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.hasPassword, true);

    assert.equal((await client.request("GET", "/api/auth/me")).status, 200);
    assert.equal((await other.request("GET", "/api/auth/me")).status, 401);

    const stale = new TestClient(baseUrl);
    await stale.ensureCsrf();
    assert.equal(
      (await stale.request("POST", "/api/auth/login", {
        json: { email, password },
      })).status,
      401,
    );
    assert.equal(
      (await stale.request("POST", "/api/auth/login", {
        json: { email, password: newPassword },
      })).status,
      200,
    );
  });

  it("lets a Google-only account add a password without a current one", async (t) => {
    if (skipWithoutDb(t)) return;

    const email = freshEmail("google-only");
    const user = await prisma.user.create({
      data: {
        name: "Ada Lovelace",
        email,
        googleId: `google-${runId}-${Math.random().toString(36).slice(2)}`,
        emailVerifiedAt: new Date(),
      },
    });

    // Seed a session the way the Google callback would have.
    const client = new TestClient(baseUrl);
    const token = generateToken();
    const csrfToken = "test-csrf-token-value";
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        csrfHash: hashToken(csrfToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    client.setCookie("hd_session", token);
    client.setCookie("hd_csrf", csrfToken);

    const me = await client.request("GET", "/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.hasPassword, false);

    const response = await client.request("POST", "/api/auth/change-password", {
      json: { newPassword },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.user.hasPassword, true);

    const login = new TestClient(baseUrl);
    await login.ensureCsrf();
    assert.equal(
      (await login.request("POST", "/api/auth/login", {
        json: { email, password: newPassword },
      })).status,
      200,
    );
  });

  it("reports hasPassword on /me", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client } = await verifiedAccount("has-password");
    const me = await client.request("GET", "/api/auth/me");

    assert.equal(me.status, 200);
    assert.equal(me.body.user.hasPassword, true);
    assert.ok(!("passwordHash" in me.body.user));
  });
});
