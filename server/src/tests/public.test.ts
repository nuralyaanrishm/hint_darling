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
// Harness
// ---------------------------------------------------------------------------

const runId = makeRunId();
const password = "correct-horse-battery";
const createdEmails = new Set<string>();

let harness: TestHarness;
let baseUrl = "";
let dbReady = false;

function freshEmail(label: string): string {
  const email = uniqueEmail(`public-${label}`, runId);
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
  guest: TestClient;
  eventId: string;
  wishlistId: string;
  shareToken: string;
  itemId: string;
  ownerEmail: string;
}

/** Builds an owner with a public (link-only) wishlist and one gift item. */
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
    json: {
      name: "Emma & James",
      type: "WEDDING",
      eventDate: "2026-09-12T00:00:00.000Z",
      description: "We can't wait to celebrate with you.",
      location: "The Old Barn, Somerset",
      latitude: 51.1279,
      longitude: -3.0026,
    },
  });
  assert.equal(event.status, 201);
  const eventId = event.body.event.id as string;

  const wishlist = await owner.request(
    "POST",
    `/api/events/${eventId}/wishlist`,
    {
      json: {
        title: "Our Wedding Wishlist",
        description: "A few things we'd treasure.",
      },
    },
  );
  assert.equal(wishlist.status, 201);
  const wishlistId = wishlist.body.wishlist.id as string;
  const shareToken = wishlist.body.wishlist.shareToken as string;
  assert.ok(shareToken, "wishlist creation returns a share token to the owner");

  const item = await owner.request(
    "POST",
    `/api/wishlists/${wishlistId}/items`,
    {
      json: {
        name: "Ninja Air Fryer Max",
        productUrl: "https://example.com/ninja-air-fryer",
        imageUrl: "https://example.com/air-fryer.jpg",
        price: 179.99,
        currency: "GBP",
        description: "For cosy nights in.",
        preferredColour: "Sage green",
        preferredSize: "5.5L",
        quantity: 1,
        notes: "Private owner note that must never be public",
      },
    },
  );
  assert.equal(item.status, 201);

  return {
    owner,
    guest: new TestClient(baseUrl),
    eventId,
    wishlistId,
    shareToken,
    itemId: item.body.item.id as string,
    ownerEmail,
  };
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
// Public viewing
// ---------------------------------------------------------------------------

describe("public wishlist viewing", () => {
  it("lets a guest read a shared wishlist without signing in", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guest, shareToken } = await makeFixture("read");
    const response = await guest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );

    assert.equal(response.status, 200);
    const { wishlist } = response.body;

    assert.equal(wishlist.title, "Our Wedding Wishlist");
    assert.equal(wishlist.description, "A few things we'd treasure.");
    assert.equal(wishlist.event.name, "Emma & James");
    assert.equal(wishlist.event.type, "WEDDING");
    assert.ok(wishlist.event.eventDate);
    assert.equal(wishlist.event.location, "The Old Barn, Somerset");
    assert.equal(wishlist.event.latitude, 51.1279);
    assert.equal(wishlist.event.longitude, -3.0026);
    assert.equal(wishlist.items.length, 1);

    const gift = wishlist.items[0];
    assert.equal(gift.name, "Ninja Air Fryer Max");
    assert.equal(gift.price, "179.99");
    assert.equal(gift.currency, "GBP");
    assert.equal(gift.imageUrl, "https://example.com/air-fryer.jpg");
    assert.equal(gift.productUrl, "https://example.com/ninja-air-fryer");
    assert.equal(gift.preferredColour, "Sage green");
    assert.equal(gift.remaining, 1);
    assert.equal(gift.claimedCount, 0);
    assert.equal(gift.isFullyClaimed, false);
  });

  it("never exposes account data, internal ids, notes or gift-givers", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guest, shareToken, ownerEmail } = await makeFixture("privacy");
    const response = await guest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(response.status, 200);

    const serialised = JSON.stringify(response.body);
    assert.equal(serialised.includes(ownerEmail), false, "owner email leaked");
    assert.equal(serialised.includes("passwordHash"), false);
    assert.equal(serialised.includes("shareToken"), false);
    assert.equal(serialised.includes("Private owner note"), false);

    const { wishlist } = response.body;
    assert.equal(wishlist.id, undefined);
    assert.equal(wishlist.eventId, undefined);
    assert.equal(wishlist.isActive, undefined);
    assert.equal(wishlist.event.id, undefined);
    assert.equal(wishlist.event.ownerId, undefined);
    assert.equal(wishlist.items[0].notes, undefined);
    assert.equal(wishlist.items[0].wishlistId, undefined);
  });

  it("reports availability when a gift has been claimed", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guest, shareToken, itemId } = await makeFixture("claim");

    await prisma.giftClaim.create({
      data: {
        wishlistItemId: itemId,
        claimantName: "Secret Giver",
        status: "CLAIMED",
      },
    });

    const response = await guest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(response.status, 200);

    const gift = response.body.wishlist.items[0];
    assert.equal(gift.claimedCount, 1);
    assert.equal(gift.remaining, 0);
    assert.equal(gift.isFullyClaimed, true);

    // The claimant's identity must never appear.
    const serialised = JSON.stringify(response.body);
    assert.equal(serialised.includes("Secret Giver"), false);
  });
});

// ---------------------------------------------------------------------------
// Invalid, inactive and removed lists
// ---------------------------------------------------------------------------

describe("public wishlist access control", () => {
  it("returns an indistinguishable 404 for unknown or malformed tokens", async (t) => {
    if (skipWithoutDb(t)) return;

    const guest = new TestClient(baseUrl);

    const unknown = await guest.request(
      "GET",
      `/api/public/wishlists/${"z".repeat(43)}`,
    );
    assert.equal(unknown.status, 404);

    const malformed = await guest.request(
      "GET",
      "/api/public/wishlists/not-a-real-token",
    );
    assert.equal(malformed.status, 404);

    const emptyish = await guest.request("GET", "/api/public/wishlists/short");
    assert.equal(emptyish.status, 404);
  });

  it("hides an inactive wishlist", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guest, wishlistId, shareToken } = await makeFixture("inactive");

    const visible = await guest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(visible.status, 200);

    await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { isActive: false },
    });

    const hidden = await guest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(hidden.status, 404);
  });

  it("hides a private wishlist", async (t) => {
    if (skipWithoutDb(t)) return;

    const { guest, wishlistId, shareToken } = await makeFixture("private");

    await prisma.wishlist.update({
      where: { id: wishlistId },
      data: { privacyMode: "PRIVATE" },
    });

    const hidden = await guest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(hidden.status, 404);
  });

  it("stops serving a deleted wishlist or event", async (t) => {
    if (skipWithoutDb(t)) return;

    const wishlistFixture = await makeFixture("delete-wishlist");
    await prisma.wishlist.delete({ where: { id: wishlistFixture.wishlistId } });
    const afterWishlist = await wishlistFixture.guest.request(
      "GET",
      `/api/public/wishlists/${wishlistFixture.shareToken}`,
    );
    assert.equal(afterWishlist.status, 404);

    const eventFixture = await makeFixture("delete-event");
    await prisma.event.delete({ where: { id: eventFixture.eventId } });
    const afterEvent = await eventFixture.guest.request(
      "GET",
      `/api/public/wishlists/${eventFixture.shareToken}`,
    );
    assert.equal(afterEvent.status, 404);
  });

  it("issues a distinct, unguessable token per wishlist", async (t) => {
    if (skipWithoutDb(t)) return;

    const first = await makeFixture("token-a");
    const second = await makeFixture("token-b");

    assert.notEqual(first.shareToken, second.shareToken);
    for (const token of [first.shareToken, second.shareToken]) {
      assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Guests are read-only
// ---------------------------------------------------------------------------

describe("public wishlist is read-only", () => {
  it("does not accept writes from a guest", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, guest, shareToken, wishlistId, itemId, eventId } =
      await makeFixture("readonly");
    await guest.ensureCsrf();

    const attempts = [
      await guest.request("POST", `/api/public/wishlists/${shareToken}`, {
        json: { title: "Hijacked" },
      }),
      await guest.request("PATCH", `/api/public/wishlists/${shareToken}`, {
        json: { title: "Hijacked" },
      }),
      await guest.request("DELETE", `/api/public/wishlists/${shareToken}`),
      await guest.request("PATCH", `/api/wishlists/${wishlistId}`, {
        json: { title: "Hijacked" },
      }),
      await guest.request("POST", `/api/wishlists/${wishlistId}/items`, {
        json: { name: "Trespasser" },
      }),
      await guest.request(
        "PATCH",
        `/api/wishlists/${wishlistId}/items/${itemId}`,
        { json: { name: "Hijacked gift" } },
      ),
      await guest.request("DELETE", `/api/wishlists/${wishlistId}/items/${itemId}`),
      await guest.request("PATCH", `/api/events/${eventId}`, {
        json: { name: "Hijacked event" },
      }),
      await guest.request("DELETE", `/api/events/${eventId}`),
    ];

    for (const attempt of attempts) {
      assert.ok(
        attempt.status === 401 || attempt.status === 403 || attempt.status === 404,
        `expected guest write to be rejected, got ${attempt.status}`,
      );
    }

    // Nothing changed.
    const detail = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.event.name, "Emma & James");
    assert.equal(detail.body.event.wishlist.title, "Our Wedding Wishlist");
    assert.equal(detail.body.event.wishlist.items.length, 1);
    assert.equal(
      detail.body.event.wishlist.items[0].name,
      "Ninja Air Fryer Max",
    );
  });
});
