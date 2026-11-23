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

const runId = makeRunId();
const password = "correct-horse-battery";
const createdEmails: string[] = [];

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

async function createOwner(
  label: string,
): Promise<{ client: TestClient; userId: string; email: string }> {
  const client = new TestClient(baseUrl);
  const email = uniqueEmail(`receipt-${label}`, runId);
  createdEmails.push(email);

  const response = await registerVerified(client, {
    name: label,
    email,
    password,
  });
  assert.equal(response.status, 200);

  return { client, userId: response.body.user.id as string, email };
}

async function createEvent(owner: TestClient, name: string): Promise<string> {
  const event = await owner.request("POST", "/api/events", {
    json: { name, type: "WEDDING" },
  });
  assert.equal(event.status, 201);
  return event.body.event.id as string;
}

async function createPaidPurchase(input: {
  userId: string;
  product: "EVENT_PASS" | "PRO";
  amountSen: number;
  eventId?: string;
}): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const purchase = await prisma.purchase.create({
    data: {
      userId: input.userId,
      product: input.product,
      status: "PAID",
      eventId: input.eventId ?? null,
      amountSen: input.amountSen,
      currency: "MYR",
      externalReference: `receipt-test-${suffix}`,
      refno: `ref-receipt-test-${suffix}`,
      paidAt: new Date(),
    },
    select: { id: true },
  });

  return purchase.id;
}

before(async () => {
  harness = await startTestServer();
  baseUrl = harness.baseUrl;
  dbReady = harness.dbReady;
});

after(async () => {
  if (dbReady && createdEmails.length > 0) {
    await prisma.user
      .deleteMany({ where: { email: { in: createdEmails } } })
      .catch(() => undefined);
  }

  await harness?.close();
  await prisma.$disconnect();
});

describe("downloadable receipts", () => {
  it("lists one receipt per event purchase and protects each PDF", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client, userId } = await createOwner("list");
    const firstEventId = await createEvent(client, "Aisha & Danial");
    const secondEventId = await createEvent(client, "Mum's 60th");

    const proId = await createPaidPurchase({
      userId,
      product: "PRO",
      amountSen: 9900,
    });
    const firstPassId = await createPaidPurchase({
      userId,
      product: "EVENT_PASS",
      amountSen: 990,
      eventId: firstEventId,
    });
    const secondPassId = await createPaidPurchase({
      userId,
      product: "EVENT_PASS",
      amountSen: 990,
      eventId: secondEventId,
    });

    const listed = await client.request("GET", "/api/billing/receipts");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.receipts.length, 3);

    const descriptions = listed.body.receipts
      .map((receipt: { description: string }) => receipt.description)
      .join("\n");
    assert.match(descriptions, /Darling Pro/);
    assert.match(descriptions, /Aisha & Danial/);
    assert.match(descriptions, /Mum's 60th/);

    const ids = new Set(
      listed.body.receipts.map((receipt: { id: string }) => receipt.id),
    );
    assert.deepEqual(
      ids,
      new Set([proId, firstPassId, secondPassId]),
    );

    const pdf = await client.request(
      "GET",
      `/api/billing/receipts/${firstPassId}`,
    );
    assert.equal(pdf.status, 200);
    assert.match(String(pdf.body), /^%PDF-/);

    const other = await createOwner("other");
    const forbidden = await other.client.request(
      "GET",
      `/api/billing/receipts/${firstPassId}`,
    );
    assert.equal(forbidden.status, 404);
  });

  it("does not issue receipts for pending or failed purchases", async (t) => {
    if (skipWithoutDb(t)) return;

    const { client, userId } = await createOwner("pending");
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    await prisma.purchase.create({
      data: {
        userId,
        product: "PRO",
        status: "PENDING",
        amountSen: 9900,
        currency: "MYR",
        externalReference: `receipt-pending-${suffix}`,
      },
    });

    const listed = await client.request("GET", "/api/billing/receipts");
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.receipts, []);
  });
});
