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

async function createWishlist(owner: TestClient): Promise<string> {
  const event = await owner.request("POST", "/api/events", {
    json: { name: "Aisha & Danial", type: "WEDDING" },
  });
  assert.equal(event.status, 201);

  const wishlist = await owner.request(
    "POST",
    `/api/events/${event.body.event.id}/wishlist`,
    { json: { title: "Our wishlist" } },
  );
  assert.equal(wishlist.status, 201);
  return wishlist.body.wishlist.id as string;
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

async function startCheckout(
  owner: TestClient,
  plan: "PLUS" | "PRO" = "PRO",
): Promise<{ orderId: string; billcode: string }> {
  const response = await owner.request("POST", "/api/billing/checkout", {
    json: { plan },
  });
  assert.equal(response.status, 201);
  assert.match(response.body.paymentUrl, /\/tst\d+$/);

  const call = createBillCalls.at(-1);
  assert.ok(call);
  const billCode = response.body.paymentUrl.split("/").at(-1) as string;

  return {
    orderId: call.billExternalReferenceNo as string,
    billcode: billCode,
  };
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

describe("one-time plan purchases", () => {
  it("keeps Free at five gifts, then unlocks Plus after a valid callback", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("plus");
    const wishlistId = await createWishlist(owner);

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
    assert.equal(before.body.billing.activeWishlistLimit, 1);
    assert.equal(before.body.billing.prices.PLUS, 990);
    assert.equal(before.body.billing.features.claimTracking, false);

    const callsBefore = createBillCalls.length;
    const { orderId, billcode } = await startCheckout(owner, "PLUS");
    assert.equal(createBillCalls.length, callsBefore + 1);

    const call = createBillCalls.at(-1);
    assert.ok(call);
    assert.equal(call.billAmount, "990");
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

    const callback = await postCallback(
      callbackFields({
        status: "1",
        orderId,
        refno: "ref-plus",
        billcode,
        amount: "990",
      }),
    );
    assert.equal(callback.status, 200);
    assert.equal(callback.text, "OK");

    const after = await owner.request("GET", "/api/billing");
    assert.equal(after.body.billing.plan, "PLUS");
    assert.ok(after.body.billing.planUnlockedAt);
    assert.equal(after.body.billing.itemLimit, null);
    assert.equal(after.body.billing.activeWishlistLimit, 3);
    assert.equal(after.body.billing.features.claimTracking, true);

    const addedAfterUnlock = await addItem(owner, wishlistId, "Gift 6");
    assert.equal(addedAfterUnlock.status, 201);

    const already = await owner.request("POST", "/api/billing/checkout", {
      json: { plan: "PLUS" },
    });
    assert.equal(already.status, 409);
    assert.equal(already.body.error.code, "PLAN_NOT_UPGRADABLE");

    const duplicate = await postCallback(
      callbackFields({
        status: "1",
        orderId,
        refno: "ref-plus",
        billcode,
        amount: "990",
      }),
    );
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.text, "OK");
  });

  it("upgrades Plus to Pro at the full price and never downgrades", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("upgrade");
    await createWishlist(owner);

    const plus = await startCheckout(owner, "PLUS");
    await postCallback(
      callbackFields({
        status: "1",
        orderId: plus.orderId,
        refno: "ref-plus-upgrade",
        billcode: plus.billcode,
        amount: "990",
      }),
    );

    const plusBilling = await owner.request("GET", "/api/billing");
    assert.equal(plusBilling.body.billing.plan, "PLUS");

    const callsBefore = createBillCalls.length;
    const pro = await startCheckout(owner, "PRO");
    assert.equal(createBillCalls.length, callsBefore + 1);
    assert.notEqual(pro.orderId, plus.orderId);

    const proCall = createBillCalls.at(-1);
    assert.ok(proCall);
    assert.equal(proCall.billAmount, "1990");

    await postCallback(
      callbackFields({
        status: "1",
        orderId: pro.orderId,
        refno: "ref-pro-upgrade",
        billcode: pro.billcode,
        amount: "1990",
      }),
    );

    const proBilling = await owner.request("GET", "/api/billing");
    assert.equal(proBilling.body.billing.plan, "PRO");
    assert.equal(proBilling.body.billing.activeWishlistLimit, null);

    const downgrade = await owner.request("POST", "/api/billing/checkout", {
      json: { plan: "PLUS" },
    });
    assert.equal(downgrade.status, 409);
    assert.equal(downgrade.body.error.code, "PLAN_NOT_UPGRADABLE");
  });

  it("enforces the active wishlist limit per plan", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("wishlist-limit");

    async function createEvent(): Promise<string> {
      const event = await owner.request("POST", "/api/events", {
        json: { name: "Celebration", type: "WEDDING" },
      });
      assert.equal(event.status, 201);
      return event.body.event.id as string;
    }

    async function createList(eventId: string) {
      return owner.request("POST", `/api/events/${eventId}/wishlist`, {
        json: { title: "Our wishlist" },
      });
    }

    const event1 = await createEvent();
    const first = await createList(event1);
    assert.equal(first.status, 201);

    const event2 = await createEvent();
    const blocked = await createList(event2);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.error.code, "WISHLIST_LIMIT_REACHED");

    const plus = await startCheckout(owner, "PLUS");
    await postCallback(
      callbackFields({
        status: "1",
        orderId: plus.orderId,
        refno: "ref-plus-lists",
        billcode: plus.billcode,
        amount: "990",
      }),
    );

    const second = await createList(event2);
    assert.equal(second.status, 201);

    const event3 = await createEvent();
    const third = await createList(event3);
    assert.equal(third.status, 201);

    const event4 = await createEvent();
    const blockedAgain = await createList(event4);
    assert.equal(blockedAgain.status, 402);
    assert.equal(blockedAgain.body.error.code, "WISHLIST_LIMIT_REACHED");

    const pro = await startCheckout(owner, "PRO");
    await postCallback(
      callbackFields({
        status: "1",
        orderId: pro.orderId,
        refno: "ref-pro-lists",
        billcode: pro.billcode,
        amount: "1990",
      }),
    );

    const fourth = await createList(event4);
    assert.equal(fourth.status, 201);
  });

  it("reuses a recent pending checkout for the same plan only", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("reuse");
    await createWishlist(owner);

    const first = await startCheckout(owner, "PLUS");
    const callsAfterFirst = createBillCalls.length;

    const second = await startCheckout(owner, "PLUS");
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.billcode, first.billcode);
    assert.equal(createBillCalls.length, callsAfterFirst);

    const pro = await startCheckout(owner, "PRO");
    assert.notEqual(pro.orderId, first.orderId);
    assert.equal(createBillCalls.length, callsAfterFirst + 1);
  });

  it("rejects unknown plans and invalid signatures or amounts", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("invalid");
    await createWishlist(owner);

    const invalidPlan = await owner.request("POST", "/api/billing/checkout", {
      json: { plan: "FREE" },
    });
    assert.equal(invalidPlan.status, 400);
    assert.equal(invalidPlan.body.error.code, "INVALID_PLAN");

    const { orderId, billcode } = await startCheckout(owner, "PLUS");

    const badHash = await postCallback(
      callbackFields({
        status: "1",
        orderId,
        refno: "ref-bad",
        billcode,
        amount: "990",
        hash: "0".repeat(32),
      }),
    );
    assert.equal(badHash.status, 400);

    const wrongAmount = await postCallback(
      callbackFields({
        status: "1",
        orderId,
        refno: "ref-wrong",
        billcode,
        amount: "800",
      }),
    );
    assert.equal(wrongAmount.status, 400);

    const stillFree = await owner.request("GET", "/api/billing");
    assert.equal(stillFree.body.billing.plan, "FREE");

    const valid = await postCallback(
      callbackFields({
        status: "1",
        orderId,
        refno: "ref-good",
        billcode,
        amount: "990",
      }),
    );
    assert.equal(valid.status, 200);

    const upgraded = await owner.request("GET", "/api/billing");
    assert.equal(upgraded.body.billing.plan, "PLUS");
  });

  it("reconciles a payment when the callback was missed", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("reconcile");
    await createWishlist(owner);
    const { billcode } = await startCheckout(owner, "PLUS");

    const bill = bills.get(billcode);
    assert.ok(bill);
    bill.paid = true;

    const reconciled = await owner.request("POST", "/api/billing/reconcile");
    assert.equal(reconciled.status, 200);
    assert.equal(reconciled.body.reconciled, true);
    assert.equal(reconciled.body.billing.plan, "PLUS");
  });

  it("cannot exceed five items under concurrent adds", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await createOwner("race");
    const wishlistId = await createWishlist(owner);

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
