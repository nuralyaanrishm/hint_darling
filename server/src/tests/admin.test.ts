import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it, type TestContext } from "node:test";
import { prisma } from "../lib/prisma.js";
import {
  makeRunId,
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
const createdEmails = new Set<string>();

/** The address that is on the allowlist for most of this file. */
const adminEmail = uniqueEmail("admin", runId);
const plainEmail = uniqueEmail("plain", runId);

let harness: TestHarness;
let baseUrl = "";
let dbReady = false;

function skipWithoutDb(t: TestContext): boolean {
  if (!dbReady) {
    t.skip("PostgreSQL is not reachable; skipping database-backed test");
    return true;
  }
  return false;
}

before(async () => {
  // Admin access is decided per request from this allowlist, so tests can set
  // it before booting the app.
  process.env.ADMIN_EMAILS = adminEmail;

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

  await harness?.close();
  await prisma.$disconnect();
});

async function createUser(client: TestClient, email: string): Promise<void> {
  createdEmails.add(email);
  const response = await registerVerified(client, {
    name: "Ada Lovelace",
    email,
    password,
  });
  assert.equal(response.status, 200);
}

let adminClient: TestClient | null = null;

/** Registers the allowlisted account once and reuses its session. */
async function adminSession(): Promise<TestClient> {
  if (adminClient) {
    return adminClient;
  }

  const client = new TestClient(baseUrl);
  await client.ensureCsrf();
  await createUser(client, adminEmail);
  adminClient = client;

  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin overview access", () => {
  it("rejects anonymous callers with 401", async (t) => {
    if (skipWithoutDb(t)) return;

    const visitor = new TestClient(baseUrl);
    const response = await visitor.request("GET", "/api/admin/overview", {
      csrf: false,
    });

    assert.equal(response.status, 401);
  });

  it("rejects signed-in non-admins with 403 and keeps isAdmin false", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = new TestClient(baseUrl);
    await client.ensureCsrf();
    await createUser(client, plainEmail);

    const me = await client.request("GET", "/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.isAdmin, false);

    const response = await client.request("GET", "/api/admin/overview");
    assert.equal(response.status, 403);
    assert.match(response.body.error.message, /administrator access/i);
  });
});

describe("admin overview payload", () => {
  it("serves an allowlisted account without leaking secrets", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = await adminSession();

    const me = await client.request("GET", "/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.isAdmin, true);

    const response = await client.request("GET", "/api/admin/overview");
    assert.equal(response.status, 200);

    const body = response.body;
    for (const key of [
      "users",
      "verifiedUsers",
      "paidUsers",
      "payingUsers",
      "usersWithEvents",
      "usersWithItems",
      "events",
      "wishlists",
      "items",
      "activeClaims",
      "cancelledClaims",
    ]) {
      assert.equal(typeof body.counts[key], "number", `counts.${key}`);
    }
    assert.ok(body.counts.users >= 1);
    assert.equal(typeof body.revenue.total.grossSen, "number");
    assert.equal(typeof body.revenue.pro.grossSen, "number");
    assert.equal(typeof body.revenue.eventPass.grossSen, "number");
    assert.equal(typeof body.revenue.currency, "string");
    assert.equal(typeof body.checkout.pending, "number");
    assert.equal(typeof body.checkout.paid, "number");
    assert.equal(typeof body.checkout.failed, "number");

    // The 30-day series is dense: one point per UTC day, oldest first.
    assert.ok(Array.isArray(body.series));
    assert.equal(body.series.length, 30);
    for (const point of body.series) {
      assert.match(point.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof point.signups, "number");
      assert.equal(typeof point.claims, "number");
      assert.equal(typeof point.revenueSen, "number");
    }

    // Recent activity respects the same privacy rules as the owner views.
    assert.ok(Array.isArray(body.recentSignups));
    assert.ok(body.recentSignups.length <= 10);
    assert.ok(Array.isArray(body.recentPurchases));
    assert.ok(Array.isArray(body.recentClaims));

    if (body.recentClaims.length > 0) {
      const claim = body.recentClaims[0];
      assert.deepEqual(Object.keys(claim).sort(), [
        "claimedAt",
        "itemName",
        "wishlistTitle",
      ]);
    }

    const serialised = JSON.stringify(body);
    for (const forbidden of [
      "passwordHash",
      "claimTokenHash",
      "claimantName",
      "claimantUserId",
      "googleId",
      "tokenHash",
    ]) {
      assert.equal(
        serialised.includes(forbidden),
        false,
        `overview must not expose ${forbidden}`,
      );
    }
  });

  it("counts Event Pass buyers as paying even while their plan stays free", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = await adminSession();

    const buyerEmail = uniqueEmail("pass-buyer", runId);
    const buyer = new TestClient(baseUrl);
    await buyer.ensureCsrf();
    await createUser(buyer, buyerEmail);

    const account = await prisma.user.findUniqueOrThrow({
      where: { email: buyerEmail },
    });

    await prisma.purchase.create({
      data: {
        userId: account.id,
        status: "PAID",
        product: "EVENT_PASS",
        amountSen: 990,
        currency: "MYR",
        externalReference: `hd-test-pass-${runId}`,
        paidAt: new Date(),
      },
    });

    const response = await client.request("GET", "/api/admin/overview");
    assert.equal(response.status, 200);

    const body = response.body;

    // The purchase unlocks one event, not the account's plan.
    const after = await prisma.user.findUniqueOrThrow({
      where: { email: buyerEmail },
    });
    assert.equal(after.plan, "FREE");

    assert.ok(body.revenue.eventPass.purchases >= 1);
    assert.ok(body.revenue.eventPass.grossSen >= 990);
    assert.ok(body.revenue.total.grossSen >= body.revenue.eventPass.grossSen);
    assert.ok(body.counts.payingUsers >= 1);

    // Today's bucket picked up both the signup and the payment.
    const today = body.series[body.series.length - 1];
    assert.ok(today.signups >= 1);
    assert.ok(today.revenueSen >= 990);
  });

  it("matches allowlisted emails case-insensitively", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = await adminSession();

    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = `  ${adminEmail.toUpperCase()} , someone-else@example.com `;

    try {
      const response = await client.request("GET", "/api/admin/overview");
      assert.equal(response.status, 200);
    } finally {
      process.env.ADMIN_EMAILS = previous;
    }
  });

  it("fails closed when the allowlist is empty", async (t) => {
    if (skipWithoutDb(t)) return;

    const client = await adminSession();

    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "";

    try {
      const response = await client.request("GET", "/api/admin/overview");
      assert.equal(response.status, 403);
    } finally {
      process.env.ADMIN_EMAILS = previous;
    }
  });
});
