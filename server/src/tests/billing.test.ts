import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
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
// Fake ToyyibPay server
// ---------------------------------------------------------------------------

const runId = makeRunId();
const password = "correct-horse-battery";
const secretKey = "test-toyyibpay-secret";
const createdEmails = new Set<string>();

interface BillRecord {
  billCode: string;
  amountSen: number;
  externalReference: string;
  paid: boolean;
}

const bills = new Map<string, BillRecord>();
const createBillCalls: Record<string, string>[] = [];
let billCounter = 0;

let fakeToyyibPay: Server;
let fakeBaseUrl = "";
let harness: TestHarness;
let baseUrl = "";
let dbReady = false;

function freshEmail(label: string): string {
  const email = uniqueEmail(`billing-${label}`, runId);
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

function startFakeToyyibPay(): Promise<void> {
  fakeToyyibPay = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const fields = Object.fromEntries(
        new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
      );

      if (req.url === "/index.php/api/createBill") {
        createBillCalls.push(fields);
        billCounter += 1;
        const billCode = `tst${billCounter}`;

        bills.set(billCode, {
          billCode,
          amountSen: Number(fields.billAmount),
          externalReference: fields.billExternalReferenceNo ?? "",
          paid: false,
        });

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify([{ BillCode: billCode }]));
        return;
      }

      if (req.url === "/index.php/api/getBillTransactions") {
        const bill = bills.get(fields.billCode ?? "");

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(
            bill?.paid
              ? [
                  {
                    billpaymentStatus: "1",
                    billpaymentAmount: (bill.amountSen / 100).toFixed(2),
                    billpaymentChannel: "FPX B2C",
                    billpaymentInvoiceNo: `invoice-${bill.billCode}`,
                    billExternalReferenceNo: bill.externalReference,
                  },
                ]
              : [],
          ),
        );
        return;
      }

      res.statusCode = 404;
      res.end();
    });
  });

  return new Promise((resolve, reject) => {
    fakeToyyibPay.once("error", reject);
    fakeToyyibPay.listen(0, "127.0.0.1", () => {
      const address = fakeToyyibPay.address() as AddressInfo;
      fakeBaseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

function callbackFields(input: {
  status: string;
  orderId: string;
  refno: string;
  billcode: string;
  amount: string;
  hash?: string;
}): Record<string, string> {
  const hash =
    input.hash ??
    createHash("md5")
      .update(
        `${secretKey}${input.status}${input.orderId}${input.refno}ok`,
      )
      .digest("hex");

  return {
    status: input.status,
    order_id: input.orderId,
    refno: input.refno,
    billcode: input.billcode,
    amount: input.amount,
    transaction_id: `tx-${input.refno}`,
    hash,
  };
}

async function postCallback(
  fields: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const response = await fetch(`${baseUrl}/api/public/toyyibpay/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });

  return { status: response.status, text: await response.text() };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function createOwner(label: string): Promise<TestClient> {
  const owner = new TestClient(baseUrl);
  await owner.ensureCsrf();
  const response = await registerVerified(owner, {
    name: label,
    email: freshEmail(label),
    password,
  });
  assert.equal(response.status, 200);
  return owner;
}

async function createEvent(
  owner: TestClient,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const event = await owner.request("POST", "/api/events", {
    json: { name: "Aisha & Danial", type: "WEDDING", ...overrides },
  });
  assert.equal(event.status, 201);
  return event.body.event.id as string;
}

async function createWishlistFor(
  owner: TestClient,
  eventId: string,
): Promise<string> {
  const wishlist = await owner.request("POST", `/api/events/${eventId}/wishlist`, {
    json: { title: "Our wishlist" },
  });
  assert.equal(wishlist.status, 201);
  return wishlist.body.wishlist.id as string;
}

async function createWishlist(
  owner: TestClient,
): Promise<{ eventId: string; wishlistId: string }> {
  const eventId = await createEvent(owner);
  const wishlistId = await createWishlistFor(owner, eventId);
  return { eventId, wishlistId };
}

async function addItem(
  owner: TestClient,
  wishlistId: string,
  name: string,
): Promise<{ status: number; body: any }> {
  return owner.request("POST", `/api/wishlists/${wishlistId}/items`, {
    json: { name },
  });
}

interface Checkout {
  orderId: string;
  billcode: string;
  amountSen: number;
}

async function startCheckout(
  owner: TestClient,
  product: "EVENT_PASS" | "PRO",
  eventId?: string,
): Promise<Checkout> {
  const response = await owner.request("POST", "/api/billing/checkout", {
    json: eventId ? { product, eventId } : { product },
  });
  assert.equal(response.status, 201);
  assert.match(response.body.paymentUrl, /\/tst\d+$/);

  const billCode = response.body.paymentUrl.split("/").at(-1) as string;
  const bill = bills.get(billCode);
  assert.ok(bill);

  return {
    orderId: bill.externalReference,
    billcode: billCode,
    amountSen: bill.amountSen,
  };
}

async function payBill(
  checkout: Checkout,
  refno: string,
): Promise<void> {
  const callback = await postCallback(
    callbackFields({
      status: "1",
      orderId: checkout.orderId,
      refno,
      billcode: checkout.billcode,
      amount: String(checkout.amountSen),
    }),
  );
  assert.equal(callback.status, 200);
  assert.equal(callback.text, "OK");
}

before(async () => {
  await startFakeToyyibPay();

  process.env.TOYYIBPAY_BASE_URL = fakeBaseUrl;
  process.env.TOYYIBPAY_SECRET_KEY = secretKey;
  process.env.TOYYIBPAY_CATEGORY_CODE = "cat_test";
  process.env.TOYYIBPAY_CALLBACK_URL =
    "https://example.test/api/public/toyyibpay/callback";
  process.env.TOYYIBPAY_RETURN_URL = "https://example.test/billing/return";

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
  await new Promise<void>((resolve) => fakeToyyibPay.close(() => resolve()));
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("one-time purchases", () => {
  it("keeps Free at five gifts, then unlocks one event with an Event Pass", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("pass");
    const { eventId, wishlistId } = await createWishlist(owner);

    for (let index = 1; index <= 5; index += 1) {
      const added = await addItem(owner, wishlistId, `Gift ${index}`);
      assert.equal(added.status, 201);
    }

    const blocked = await addItem(owner, wishlistId, "Gift 6");
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.error.code, "ITEM_LIMIT_REACHED");

    const before = await owner.request("GET", "/api/billing");
    assert.equal(before.status, 200);
    assert.equal(before.body.billing.plan, "FREE");
    assert.equal(before.body.billing.itemLimit, 5);
    assert.equal(before.body.billing.activeEventLimit, 1);
    assert.equal(before.body.billing.prices.EVENT_PASS, 990);
    assert.equal(before.body.billing.prices.PRO, 9900);
    // Claim status is free; only the guest's name is gated.
    assert.equal(before.body.billing.features.claimStatus, true);
    assert.equal(before.body.billing.features.claimNames, false);

    const checkout = await startCheckout(owner, "EVENT_PASS", eventId);
    assert.equal(checkout.amountSen, 990);

    const call = createBillCalls.at(-1);
    assert.ok(call);
    assert.equal(call.billPriceSetting, "1");
    assert.equal(call.billPayorInfo, "0");
    assert.equal(
      call.billCallbackUrl,
      "https://example.test/api/public/toyyibpay/callback",
    );
    assert.equal(
      call.billReturnUrl,
      "https://example.test/billing/return",
    );

    await payBill(checkout, "ref-pass");

    const after = await owner.request("GET", "/api/billing");
    // A pass is not an account plan; the account stays Free.
    assert.equal(after.body.billing.plan, "FREE");
    assert.equal(after.body.billing.recentPurchase.product, "EVENT_PASS");
    assert.equal(after.body.billing.recentPurchase.eventId, eventId);

    const event = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(event.body.event.wishlist.eventUnlocked, true);
    assert.equal(event.body.event.wishlist.claimantNamesLocked, false);

    const addedAfterUnlock = await addItem(owner, wishlistId, "Gift 6");
    assert.equal(addedAfterUnlock.status, 201);

    // The unlock is scoped to this event only.
    const otherEventId = await createEvent(owner, { name: "Birthday" });
    const otherWishlistId = await createWishlistFor(owner, otherEventId);
    const otherEvent = await owner.request("GET", `/api/events/${otherEventId}`);
    assert.equal(otherEvent.body.event.wishlist.eventUnlocked, false);

    for (let index = 1; index <= 5; index += 1) {
      const added = await addItem(owner, otherWishlistId, `Other ${index}`);
      assert.equal(added.status, 201);
    }
    const otherBlocked = await addItem(owner, otherWishlistId, "Other 6");
    assert.equal(otherBlocked.status, 402);
    assert.equal(otherBlocked.body.error.code, "ITEM_LIMIT_REACHED");

    const already = await owner.request("POST", "/api/billing/checkout", {
      json: { product: "EVENT_PASS", eventId },
    });
    assert.equal(already.status, 409);
    assert.equal(already.body.error.code, "EVENT_ALREADY_UNLOCKED");

    // A repeated valid callback is harmless.
    const duplicate = await postCallback(
      callbackFields({
        status: "1",
        orderId: checkout.orderId,
        refno: "ref-pass",
        billcode: checkout.billcode,
        amount: "990",
      }),
    );
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.text, "OK");
  });

  it("sells Pro as a lifetime plan that covers every event", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("pro");
    const { eventId, wishlistId } = await createWishlist(owner);

    const callsBefore = createBillCalls.length;
    const pro = await startCheckout(owner, "PRO");
    assert.equal(createBillCalls.length, callsBefore + 1);
    assert.equal(pro.amountSen, 9900);

    await payBill(pro, "ref-pro");

    const billing = await owner.request("GET", "/api/billing");
    assert.equal(billing.body.billing.plan, "PRO");
    assert.ok(billing.body.billing.planUnlockedAt);
    assert.equal(billing.body.billing.itemLimit, null);
    assert.equal(billing.body.billing.activeEventLimit, 10);
    assert.equal(billing.body.billing.features.claimNames, true);

    const event = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(event.body.event.wishlist.eventUnlocked, true);

    const added = await addItem(owner, wishlistId, "Anything");
    assert.equal(added.status, 201);

    const again = await owner.request("POST", "/api/billing/checkout", {
      json: { product: "PRO" },
    });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, "PLAN_NOT_UPGRADABLE");

    // Pro already includes every event; a pass would be redundant.
    const pass = await owner.request("POST", "/api/billing/checkout", {
      json: { product: "EVENT_PASS", eventId },
    });
    assert.equal(pass.status, 409);
    assert.equal(pass.body.error.code, "EVENT_PASS_NOT_NEEDED");
  });

  it("enforces the active event limit per plan, and ended events free the slot", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("event-limit");

    const first = await createEvent(owner);
    await createWishlistFor(owner, first);

    const second = await createEvent(owner, { name: "Second" });
    const blocked = await owner.request(
      "POST",
      `/api/events/${second}/wishlist`,
      { json: { title: "Our wishlist" } },
    );
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.error.code, "WISHLIST_LIMIT_REACHED");

    // A wishlist whose event has already started no longer occupies the slot.
    const ended = await createEvent(owner, {
      name: "Already started",
      startsAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const endedWishlist = await owner.request(
      "POST",
      `/api/events/${ended}/wishlist`,
      { json: { title: "Past celebration" } },
    );
    assert.equal(endedWishlist.status, 201);

    // Archiving the first event frees the slot for the second.
    const archived = await owner.request("POST", `/api/events/${first}/archive`);
    assert.equal(archived.status, 204);

    const afterArchive = await owner.request(
      "POST",
      `/api/events/${second}/wishlist`,
      { json: { title: "Our wishlist" } },
    );
    assert.equal(afterArchive.status, 201);

    // Restoring the archived event would exceed the Free limit again.
    const restored = await owner.request("POST", `/api/events/${first}/unarchive`);
    assert.equal(restored.status, 402);

    // Pro raises the cap to ten concurrent events.
    const pro = await startCheckout(owner, "PRO");
    await payBill(pro, "ref-pro-events");

    for (let index = 3; index <= 11; index += 1) {
      const eventId = await createEvent(owner, { name: `Event ${index}` });
      const created = await owner.request(
        "POST",
        `/api/events/${eventId}/wishlist`,
        { json: { title: "Our wishlist" } },
      );
      assert.equal(created.status, 201);
    }

    const twelfth = await createEvent(owner, { name: "Twelfth" });
    const capped = await owner.request(
      "POST",
      `/api/events/${twelfth}/wishlist`,
      { json: { title: "Our wishlist" } },
    );
    assert.equal(capped.status, 402);
    assert.equal(capped.body.error.code, "WISHLIST_LIMIT_REACHED");
  });

  it("reuses a recent pending checkout for the same product and event only", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("reuse");
    const { eventId } = await createWishlist(owner);

    const callsBefore = createBillCalls.length;
    const first = await startCheckout(owner, "EVENT_PASS", eventId);
    assert.equal(createBillCalls.length, callsBefore + 1);

    const second = await startCheckout(owner, "EVENT_PASS", eventId);
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.billcode, first.billcode);
    assert.equal(createBillCalls.length, callsBefore + 1);

    const pro = await startCheckout(owner, "PRO");
    assert.notEqual(pro.orderId, first.orderId);
    assert.equal(createBillCalls.length, callsBefore + 2);
  });

  it("rejects unknown products, foreign events, invalid signatures and amounts", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("invalid");
    const { eventId } = await createWishlist(owner);

    const unknown = await owner.request("POST", "/api/billing/checkout", {
      json: { product: "PLUS" },
    });
    assert.equal(unknown.status, 400);

    const missingEvent = await owner.request("POST", "/api/billing/checkout", {
      json: { product: "EVENT_PASS" },
    });
    assert.equal(missingEvent.status, 400);

    const stranger = await createOwner("invalid-stranger");
    const strangerEvent = await createEvent(stranger);
    const foreign = await owner.request("POST", "/api/billing/checkout", {
      json: { product: "EVENT_PASS", eventId: strangerEvent },
    });
    assert.equal(foreign.status, 404);

    const checkout = await startCheckout(owner, "EVENT_PASS", eventId);

    const badHash = await postCallback(
      callbackFields({
        status: "1",
        orderId: checkout.orderId,
        refno: "ref-bad",
        billcode: checkout.billcode,
        amount: "990",
        hash: "0".repeat(32),
      }),
    );
    assert.equal(badHash.status, 400);

    const wrongAmount = await postCallback(
      callbackFields({
        status: "1",
        orderId: checkout.orderId,
        refno: "ref-wrong",
        billcode: checkout.billcode,
        amount: "800",
      }),
    );
    assert.equal(wrongAmount.status, 400);

    const stillLocked = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(stillLocked.body.event.wishlist.eventUnlocked, false);

    await payBill(checkout, "ref-good");

    const unlocked = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(unlocked.body.event.wishlist.eventUnlocked, true);
  });

  it("reconciles a payment when the callback was missed", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("reconcile");
    const { eventId } = await createWishlist(owner);
    const checkout = await startCheckout(owner, "EVENT_PASS", eventId);

    const bill = bills.get(checkout.billcode);
    assert.ok(bill);
    bill.paid = true;

    const reconciled = await owner.request("POST", "/api/billing/reconcile");
    assert.equal(reconciled.status, 200);
    assert.equal(reconciled.body.reconciled, true);
    assert.equal(reconciled.body.activated[0].product, "EVENT_PASS");
    assert.equal(reconciled.body.activated[0].eventName, "Aisha & Danial");
    assert.equal(
      reconciled.body.billing.recentPurchase.product,
      "EVENT_PASS",
    );
  });

  it("cannot exceed five items under concurrent adds", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("race");
    const { wishlistId } = await createWishlist(owner);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        addItem(owner, wishlistId, `Concurrent ${index + 1}`),
      ),
    );

    const created = results.filter((result) => result.status === 201);
    const blocked = results.filter((result) => result.status === 402);

    assert.equal(created.length, 5);
    assert.equal(blocked.length, 1);

    const listing = await owner.request(
      "GET",
      `/api/wishlists/${wishlistId}`,
    );
    assert.equal(listing.body.wishlist.items.length, 5);
  });
});
