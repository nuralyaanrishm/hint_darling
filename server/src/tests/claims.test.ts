import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it, type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../lib/tokens.js";
import {
  makeRunId,
  registerVerified,
  startTestServer,
  TestClient,
  type TestHarness,
  uniqueEmail,
} from "./testClient.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const runId = makeRunId();
const password = "correct-horse-battery";
const createdEmails = new Set<string>();

let harness: TestHarness;
let baseUrl = "";
let dbReady = false;

function freshEmail(label: string): string {
  const email = uniqueEmail(`claims-${label}`, runId);
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

interface Fixture {
  owner: TestClient;
  guestA: TestClient;
  guestB: TestClient;
  eventId: string;
  wishlistId: string;
  shareToken: string;
  itemId: string;
}

const body = (claimantName?: string, idempotencyKey?: string) => ({
  ...(claimantName === undefined ? {} : { claimantName }),
  ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
});

/**
 * Builds an owner with a public (link-only) wishlist and one gift item,
 * plus two fresh guest clients.
 */
async function makeFixture(label: string): Promise<Fixture> {
  const owner = new TestClient(baseUrl);
  await owner.ensureCsrf();
  const ownerEmail = freshEmail(label);
  const registered = await registerVerified(owner, {
    name: label,
    email: ownerEmail,
    password,
  });
  assert.equal(registered.status, 200);

  const event = await owner.request("POST", "/api/events", {
    json: { name: "Emma & James", type: "WEDDING" },
  });
  assert.equal(event.status, 201);
  const eventId = event.body.event.id as string;

  const wishlist = await owner.request("POST", `/api/events/${eventId}/wishlist`, {
    json: { title: "Our Wedding Wishlist", description: "We'd treasure anything." },
  });
  assert.equal(wishlist.status, 201);
  const wishlistId = wishlist.body.wishlist.id as string;
  const shareToken = wishlist.body.wishlist.shareToken as string;

  const item = await owner.request("POST", `/api/wishlists/${wishlistId}/items`, {
    json: {
      name: "Ninja Air Fryer Max",
      productUrl: "https://example.com/ninja-air-fryer",
      imageUrl: "https://example.com/air-fryer.jpg",
      price: 179.99,
      currency: "GBP",
      quantity: 1,
    },
  });
  assert.equal(item.status, 201);

  return {
    owner,
    guestA: new TestClient(baseUrl),
    guestB: new TestClient(baseUrl),
    eventId,
    wishlistId,
    shareToken,
    itemId: item.body.item.id as string,
  };
}

/** Claims via the public API using a specific guest client. */
async function claim(
  guest: TestClient,
  shareToken: string,
  itemId: string,
  value: { claimantName?: string; idempotencyKey?: string } = {},
) {
  await guest.ensureCsrf();
  return guest.request(
    "POST",
    `/api/public/wishlists/${shareToken}/items/${itemId}/claims`,
    { json: body(value.claimantName, value.idempotencyKey) },
  );
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
// Claiming
// ---------------------------------------------------------------------------

describe("gift claiming", () => {
  it("lets a guest claim an available gift and the public list updates", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, shareToken, itemId } = await makeFixture("happy");

    const before = await guestA.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(before.body.wishlist.items[0].isClaimed, false);

    const response = await claim(guestA, shareToken, itemId, {
      claimantName: "Auntie Rose",
      idempotencyKey: "key-happy-path",
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.claim.status, "CLAIMED");
    assert.ok(response.body.claim.claimedAt);
    assert.equal(response.body.claim.claimantName, "Auntie Rose");
    assert.match(
      response.body.claim.manageToken,
      /^[A-Za-z0-9_-]{40,}$/,
      "issues an unguessable management token",
    );

    const afterClaim = await guestA.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(afterClaim.status, 200);
    const gift = afterClaim.body.wishlist.items[0];
    assert.equal(gift.claimedCount, 1);
    assert.equal(gift.isClaimed, true);
    assert.equal(gift.remaining, 0);
    assert.equal(gift.isFullyClaimed, true);

    const serialised = JSON.stringify(afterClaim.body);
    assert.equal(serialised.includes("Auntie Rose"), false, "claimant name leaked");
    assert.equal(serialised.includes("manageToken"), false, "manage token leaked");
  });

  it("rejects a duplicate submission as idempotent (no second claim)", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, shareToken, itemId } = await makeFixture("idempotent");

    const first = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-double-click",
    });
    assert.equal(first.status, 201);

    const counts = await prisma.giftClaim.count({
      where: { wishlistItemId: itemId, status: "CLAIMED" },
    });
    assert.equal(counts, 1);

    const retry = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-double-click",
    });
    assert.equal(retry.status, 200, "idempotent retry succeeds");
    assert.equal(retry.body.claim.id, first.body.claim.id, "same claim returned");
    assert.notEqual(
      retry.body.claim.manageToken,
      first.body.claim.manageToken,
      "a fresh management token is issued",
    );

    const after = await prisma.giftClaim.count({
      where: { wishlistItemId: itemId, status: "CLAIMED" },
    });
    assert.equal(after, 1, "no second claim is created");
  });

  it("rejects a second, different gift-giver with a friendly conflict", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, guestB, shareToken, itemId } = await makeFixture("conflict");

    const first = await claim(guestA, shareToken, itemId, {
      claimantName: "Alice",
      idempotencyKey: "key-alice",
    });
    assert.equal(first.status, 201);

    const second = await claim(guestB, shareToken, itemId, {
      claimantName: "Bob",
      idempotencyKey: "key-bob",
    });
    assert.equal(second.status, 409);
    assert.equal(
      second.body.error.message,
      "Oops, someone's got this for them! 🎁",
    );
    assert.equal(second.body.error.code, "ALREADY_CLAIMED");
  });

  it("allows only one active claim even when a gift has quantity > 1", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, guestA, guestB, wishlistId, shareToken } =
      await makeFixture("quantity");

    const fund = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      {
        json: { name: "Honeymoon Fund", price: 50, currency: "GBP", quantity: 10 },
      },
    );
    assert.equal(fund.status, 201);
    const fundId = fund.body.item.id as string;

    const first = await claim(guestA, shareToken, fundId, {
      idempotencyKey: "key-fund-a",
    });
    assert.equal(first.status, 201);

    const second = await claim(guestB, shareToken, fundId, {
      idempotencyKey: "key-fund-b",
    });
    assert.equal(second.status, 409, "quantity does not allow a second claim in v1");

    const visible = await guestA.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    const gift = visible.body.wishlist.items.find(
      (item: any) => item.name === "Honeymoon Fund",
    );
    assert.equal(gift.claimedCount, 1);
    assert.equal(gift.isClaimed, true);
    assert.equal(gift.remaining, 0);
  });

  it("handles simultaneous claims atomically: one wins, one loses", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, guestB, shareToken, itemId } = await makeFixture("concurrent");

    const [first, second] = await Promise.all([
      claim(guestA, shareToken, itemId, { idempotencyKey: "key-race-a" }),
      claim(guestB, shareToken, itemId, { idempotencyKey: "key-race-b" }),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);

    const activeClaims = await prisma.giftClaim.count({
      where: { wishlistItemId: itemId, status: "CLAIMED" },
    });
    assert.equal(activeClaims, 1, "exactly one active claim survives a race");
  });

  it("stores only a hash of the management token, never the raw token", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, shareToken, itemId } = await makeFixture("token-hash");

    const response = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-token-hash",
    });
    assert.equal(response.status, 201);
    const rawToken = response.body.claim.manageToken as string;

    const claimRow = await prisma.giftClaim.findFirstOrThrow({
      where: { wishlistItemId: itemId, status: "CLAIMED" },
    });

    assert.notEqual(claimRow.claimTokenHash, rawToken, "raw token is not stored");
    assert.equal(claimRow.claimTokenHash, hashToken(rawToken));
    assert.match(claimRow.claimTokenHash!, /^[0-9a-f]{64}$/);
  });

  it("records the signed-in user yet keeps their identity private from the owner", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, guestA, eventId, wishlistId, shareToken, itemId } =
      await makeFixture("registered");

    // Register a second account to claim as.
    const giver = new TestClient(baseUrl);
    await giver.ensureCsrf();
    const giverRegistered = await registerVerified(giver, {
      name: "Secret Account Giver",
      email: freshEmail("registered-giver"),
      password,
    });
    assert.equal(giverRegistered.status, 200);

    const response = await claim(giver, shareToken, itemId, {
      idempotencyKey: "key-registered",
    });
    assert.equal(response.status, 201);

    const claimRow = await prisma.giftClaim.findFirstOrThrow({
      where: { wishlistItemId: itemId, status: "CLAIMED" },
    });
    assert.ok(claimRow.claimantUserId, "registered claimant is recorded");

    // The owner's own event detail must not expose the gift-giver.
    const ownerEvent = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(ownerEvent.status, 200);
    const serialised = JSON.stringify(ownerEvent.body);
    assert.equal(serialised.includes("Secret Account Giver"), false);
    assert.equal(serialised.includes("claimant"), false);

    const publicView = await guestA.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(
      JSON.stringify(publicView.body).includes("Secret Account Giver"),
      false,
      "public response leaks the giver",
    );
    assert.equal(publicView.body.wishlist.items[0].isClaimed, true);
  });

  it("rejects claims on unknown, inactive, or private wishlists as 404", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, wishlistId, shareToken, itemId } = await makeFixture("hidden");

    const unknown = await claim(guestA, "z".repeat(43), itemId, {
      idempotencyKey: "key-unknown",
    });
    assert.equal(unknown.status, 404);

    await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { isActive: false },
    });
    const inactive = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-inactive",
    });
    assert.equal(inactive.status, 404);

    await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { isActive: true, privacyMode: "PRIVATE" },
    });
    const privateList = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-private",
    });
    assert.equal(privateList.status, 404);
  });

  it("requires a valid CSRF token for a claim", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, shareToken, itemId } = await makeFixture("csrf");
    const response = await guestA.request(
      "POST",
      `/api/public/wishlists/${shareToken}/items/${itemId}/claims`,
      { json: { idempotencyKey: "key-csrf" }, csrf: false },
    );
    assert.equal(response.status, 403);
  });
});

// ---------------------------------------------------------------------------
// Claim management
// ---------------------------------------------------------------------------

describe("claim management via token", () => {
  it("lets the gift-giver view their claim through the secure link", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, shareToken, itemId } = await makeFixture("manage-view");

    const response = await claim(guestA, shareToken, itemId, {
      claimantName: "Margaret",
      idempotencyKey: "key-manage-view",
    });
    const token = response.body.claim.manageToken as string;

    const view = await guestA.request("GET", `/api/public/claims/${token}`);
    assert.equal(view.status, 200);
    assert.equal(view.body.claim.status, "CLAIMED");
    assert.equal(view.body.claim.claimantName, "Margaret");
    assert.equal(view.body.claim.gift.name, "Ninja Air Fryer Max");
    assert.equal(view.body.claim.event.name, "Emma & James");
    assert.equal(view.body.claim.gift.price, "179.99");

    const serialised = JSON.stringify(view.body);
    assert.equal(serialised.includes("manageToken"), false);
    assert.equal(serialised.includes("claimTokenHash"), false);
    assert.equal(serialised.includes("wishlistItemId"), false);
    assert.equal(serialised.includes("claimantUserId"), false);
  });

  it("lets the gift-giver cancel their own claim and frees the gift", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, guestB, shareToken, itemId } = await makeFixture("cancel");

    const claimed = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-cancel",
    });
    const token = claimed.body.claim.manageToken as string;

    const cancelled = await guestA.request(
      "POST",
      `/api/public/claims/${token}/cancel`,
      {},
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.claim.status, "CANCELLED");
    assert.ok(cancelled.body.claim.cancelledAt);

    // Cancelling is idempotent.
    const again = await guestA.request(
      "POST",
      `/api/public/claims/${token}/cancel`,
      {},
    );
    assert.equal(again.status, 200);

    const visible = await guestA.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(visible.body.wishlist.items[0].isClaimed, false);

    // Another guest can now claim the freed gift.
    const reClaimed = await claim(guestB, shareToken, itemId, {
      idempotencyKey: "key-cancel-again",
    });
    assert.equal(reClaimed.status, 201);
  });

  it("rejects management attempts without the secret token", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guestA, guestB, shareToken, itemId } = await makeFixture("wrong-token");

    const claimed = await claim(guestA, shareToken, itemId, {
      idempotencyKey: "key-wrong-token",
    });
    const token = claimed.body.claim.manageToken as string;

    const guess = "z".repeat(43);
    assert.notEqual(guess, token);
    const view = await guestB.request("GET", `/api/public/claims/${guess}`);
    assert.equal(view.status, 404);
    const cancel = await guestB.request(
      "POST",
      `/api/public/claims/${guess}/cancel`,
      {},
    );
    assert.equal(cancel.status, 404);

    const malformed = await guestB.request("GET", "/api/public/claims/short");
    assert.equal(malformed.status, 404);

    // The gift is still claimed by guest A.
    const still = await prisma.giftClaim.count({
      where: { wishlistItemId: itemId, status: "CLAIMED" },
    });
    assert.equal(still, 1);
  });
});

// ---------------------------------------------------------------------------
// Database-level guarantee
// ---------------------------------------------------------------------------

describe("database constraint (one active claim per item)", () => {
  it("rejects two concurrent active claims at the database level", async (t) => {
    if (skipWithoutDb(t)) return;

    const { itemId } = await makeFixture("db-constraint");

    await assert.rejects(
      () =>
        prisma.$transaction([
          prisma.giftClaim.create({
            data: { wishlistItemId: itemId, claimantName: "A", status: "CLAIMED" },
          }),
          prisma.giftClaim.create({
            data: { wishlistItemId: itemId, claimantName: "B", status: "CLAIMED" },
          }),
        ]),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002",
      "expected a unique-constraint violation",
    );

    const count = await prisma.giftClaim.count({
      where: { wishlistItemId: itemId },
    });
    assert.equal(count, 0, "the failed transaction rolled back");
  });
});