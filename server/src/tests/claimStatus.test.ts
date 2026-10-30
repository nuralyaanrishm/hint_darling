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
//
// This suite answers one question for every relevant endpoint: what does each
// role (owner, the rightful gift-giver, an unrelated guest, an unauthenticated
// visitor) legitimately get to see? Privacy is asserted on the *response JSON*,
// not just on the UI: claimant identity is never selected from the database for
// owner/public views, so it cannot leak.

const runId = makeRunId();
const password = "correct-horse-battery";
const createdEmails = new Set<string>();

let harness: TestHarness;
let baseUrl = "";
let dbReady = false;

function freshEmail(label: string): string {
  const email = uniqueEmail(`claimStatus-${label}`, runId);
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
  giver: TestClient;
  otherGuest: TestClient;
  eventId: string;
  wishlistId: string;
  shareToken: string;
  itemA: string;
  itemB: string;
  ownerEmail: string;
  giverName: string;
}

async function makeFixture(label: string): Promise<Fixture> {
  const owner = new TestClient(baseUrl);
  await owner.ensureCsrf();
  const ownerEmail = freshEmail(label);
  const registered = await registerVerified(owner, {
    name: "Owner",
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

  const itemA = await owner.request("POST", `/api/wishlists/${wishlistId}/items`, {
    json: { name: "Ninja Air Fryer", price: 179.99, currency: "GBP" },
  });
  const itemB = await owner.request("POST", `/api/wishlists/${wishlistId}/items`, {
    json: { name: "Toaster", price: 39.99, currency: "GBP" },
  });
  assert.equal(itemA.status, 201);
  assert.equal(itemB.status, 201);

  // A registered gift-giver who will claim item A.
  const giver = new TestClient(baseUrl);
  await giver.ensureCsrf();
  const giverName = "Secret Account Giver";
  const giverRegistered = await registerVerified(giver, {
    name: giverName,
    email: freshEmail(`giver-${label}`),
    password,
  });
  assert.equal(giverRegistered.status, 200);

  return {
    owner,
    giver,
    otherGuest: new TestClient(baseUrl),
    eventId,
    wishlistId,
    shareToken,
    itemA: itemA.body.item.id as string,
    itemB: itemB.body.item.id as string,
    ownerEmail,
    giverName,
  };
}

/** The giver claims item A through the public API (as a signed-in user). */
async function claimAsGiver(
  giver: TestClient,
  shareToken: string,
  itemId: string,
  key: string,
) {
  await giver.ensureCsrf();
  return giver.request(
    "POST",
    `/api/public/wishlists/${shareToken}/items/${itemId}/claims`,
    { json: { claimantName: "Auntie Rose", idempotencyKey: `${runId}-${key}` } },
  );
}

/** Upgrades a fixture's owner in the database so claim insights are unlocked. */
async function makePro(ownerEmail: string): Promise<void> {
  await prisma.user.update({
    where: { email: ownerEmail.toLowerCase() },
    data: { proUnlockedAt: new Date() },
  });
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
// Owner dashboard
// ---------------------------------------------------------------------------

describe("owner claim-status dashboard", () => {
  it("locks claim insights for a free owner but never leaks identity", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, giver, eventId, wishlistId, shareToken, itemA, itemB, giverName } =
      await makeFixture("owner");

    const claimed = await claimAsGiver(giver, shareToken, itemA, "owner-key");
    assert.equal(claimed.status, 201);

    // Before claiming, item B is available in the owner's own view.
    const event = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(event.status, 200);
    const before = event.body.event.wishlist.items as any[];
    const toaster = before.find((item: any) => item.id === itemB);
    assert.equal(toaster.isClaimed, false);
    assert.equal(toaster.claimedCount, 0);
    assert.equal(toaster.claimsLocked, true);

    const detail = await owner.request("GET", `/api/events/${eventId}`);
    const items = detail.body.event.wishlist.items as any[];
    const airFryer = items.find((item: any) => item.id === itemA);
    assert.equal(
      airFryer.isClaimed,
      false,
      "free owners do not see claim status",
    );
    assert.equal(airFryer.claimedCount, 0);
    assert.equal(airFryer.claimsLocked, true);

    const serialised = JSON.stringify(detail.body);
    assert.equal(serialised.includes("Auntie Rose"), false, "claimant name leaked");
    assert.equal(serialised.includes(giverName), false, "giver account name leaked");
    assert.equal(serialised.includes("claimantName"), false);
    assert.equal(serialised.includes("claimantUserId"), false);
    assert.equal(serialised.includes("claimTokenHash"), false);

    // The wishlist detail endpoint must be just as private.
    const wishlist = await owner.request("GET", `/api/wishlists/${wishlistId}`);
    assert.equal(wishlist.status, 200);
    const wishlistItem = (wishlist.body.wishlist.items as any[]).find(
      (item: any) => item.id === itemA,
    );
    assert.equal(wishlistItem.isClaimed, false);
    assert.equal(wishlistItem.claimsLocked, true);
    assert.equal(wishlist.body.wishlist.privacyMode, "LINK_ONLY");
    assert.equal(JSON.stringify(wishlist.body).includes("Auntie Rose"), false);

    // The dashboard events list withholds the claimed count too.
    const events = await owner.request("GET", "/api/events");
    const summary = (events.body.events as any[]).find(
      (entry: any) => entry.id === eventId,
    );
    assert.equal(summary.wishlist.itemCount, 2);
    assert.equal(summary.wishlist.claimedCount, 0);
    assert.equal(summary.wishlist.claimsLocked, true);
    assert.equal(JSON.stringify(events.body).includes("Auntie Rose"), false);
  });

  it("shows claim counts to a Pro owner without leaking identity", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, giver, eventId, wishlistId, shareToken, itemA, itemB, ownerEmail } =
      await makeFixture("pro-owner");

    const claimed = await claimAsGiver(giver, shareToken, itemA, "pro-key");
    assert.equal(claimed.status, 201);
    await makePro(ownerEmail);

    const event = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(event.status, 200);
    const items = event.body.event.wishlist.items as any[];
    const airFryer = items.find((item: any) => item.id === itemA);
    const toaster = items.find((item: any) => item.id === itemB);
    assert.equal(event.body.event.wishlist.claimsLocked, false);
    assert.equal(airFryer.isClaimed, true);
    assert.equal(airFryer.claimedCount, 1);
    assert.equal(airFryer.claimsLocked, false);
    assert.equal(toaster.isClaimed, false);
    assert.equal(toaster.claimedCount, 0);

    const wishlist = await owner.request("GET", `/api/wishlists/${wishlistId}`);
    assert.equal(wishlist.status, 200);
    assert.equal(wishlist.body.wishlist.claimsLocked, false);
    const wishlistItem = (wishlist.body.wishlist.items as any[]).find(
      (item: any) => item.id === itemA,
    );
    assert.equal(wishlistItem.isClaimed, true);
    assert.equal(wishlistItem.claimedCount, 1);

    const events = await owner.request("GET", "/api/events");
    const summary = (events.body.events as any[]).find(
      (entry: any) => entry.id === eventId,
    );
    assert.equal(summary.wishlist.claimedCount, 1);
    assert.equal(summary.wishlist.claimsLocked, false);

    const serialised = JSON.stringify({ event: event.body, events: events.body });
    assert.equal(serialised.includes("Auntie Rose"), false, "claimant name leaked");
    assert.equal(serialised.includes("claimantName"), false);
  });

  it("marks a newly created item as available", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, wishlistId } = await makeFixture("fresh-item");
    const item = await owner.request("POST", `/api/wishlists/${wishlistId}/items`, {
      json: { name: "Fresh Kettle", price: 25, currency: "GBP" },
    });
    assert.equal(item.status, 201);
    assert.equal(item.body.item.isClaimed, false);
    assert.equal(item.body.item.claimedCount, 0);
    assert.equal(item.body.item.claimsLocked, true);
  });
});

// ---------------------------------------------------------------------------
// The rightful gift-giver
// ---------------------------------------------------------------------------

describe("signed-in gift-giver", () => {
  it("sees and manages only their own claims", async (t) => {
    if (skipWithoutDb(t)) return;

    const { giver, otherGuest, shareToken, itemA, itemB } =
      await makeFixture("giver");

    // Claim item A as the giver; item B remains free for now.
    const claimed = await claimAsGiver(giver, shareToken, itemA, "giver-key");
    assert.equal(claimed.status, 201);

    const mine = await giver.request("GET", "/api/claims");
    assert.equal(mine.status, 200);
    assert.equal(mine.body.claims.length, 1);
    const mineClaim = mine.body.claims[0];
    assert.equal(mineClaim.gift.name, "Ninja Air Fryer");
    assert.equal(mineClaim.status, "CLAIMED");
    assert.equal(mineClaim.claimantName, "Auntie Rose");
    assert.ok(mineClaim.event.name);
    assert.equal(mineClaim.event.name, "Emma & James");

    // The giver's own response must not surface internals or other identities.
    const serialised = JSON.stringify(mine.body);
    assert.equal(serialised.includes("manageToken"), false);
    assert.equal(serialised.includes("claimTokenHash"), false);
    assert.equal(serialised.includes("claimantUserId"), false);

    // An unrelated signed-in guest sees only an empty list of *their* claims.
    const outsider = new TestClient(baseUrl);
    await outsider.ensureCsrf();
    const outsiderRegistered = await registerVerified(outsider, {
      name: "Outsider",
      email: freshEmail("outsider"),
      password,
    });
    assert.equal(outsiderRegistered.status, 200);
    const theirs = await outsider.request("GET", "/api/claims");
    assert.equal(theirs.status, 200);
    assert.deepEqual(theirs.body.claims, [], "outsider sees no one else's claims");
    assert.equal(JSON.stringify(theirs.body).includes("Auntie Rose"), false);

    // The outsider cannot cancel the giver's claim (404, not 403/200).
    const outsiderCancel = await outsider.request(
      "POST",
      `/api/claims/${mineClaim.id}/cancel`,
      {},
    );
    assert.equal(outsiderCancel.status, 404);

    // A different guest can still claim item B; the giver still sees only A.
    await otherGuest.ensureCsrf();
    const otherClaim = await otherGuest.request(
      "POST",
      `/api/public/wishlists/${shareToken}/items/${itemB}/claims`,
      { json: { claimantName: "Bob", idempotencyKey: `${runId}-other-guest` } },
    );
    assert.equal(otherClaim.status, 201);
    const after = await giver.request("GET", "/api/claims");
    assert.equal(after.body.claims.length, 1);
    assert.equal(after.body.claims[0].gift.name, "Ninja Air Fryer");
    assert.equal(JSON.stringify(after.body).includes("Bob"), false);
  });

  it("can release their own reservation, which frees the gift", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, giver, shareToken, itemA, ownerEmail } =
      await makeFixture("release");
    await makePro(ownerEmail);

    const claimed = await claimAsGiver(giver, shareToken, itemA, "release-key");
    assert.equal(claimed.status, 201);
    const mine = await giver.request("GET", "/api/claims");
    const claimId = mine.body.claims[0].id as string;

    const beforeRelease = await owner.request("GET", "/api/events");
    assert.equal(beforeRelease.body.events[0].wishlist.claimedCount, 1);

    const cancelled = await giver.request(
      "POST",
      `/api/claims/${claimId}/cancel`,
      {},
    );
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.claim.status, "CANCELLED");

    // Public availability flips back immediately.
    const visible = await giver.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(visible.body.wishlist.items[0].isClaimed, false);

    // Owner's dashboard reflects the release.
    const freshEvents = await owner.request("GET", "/api/events");
    assert.equal(freshEvents.body.events[0].wishlist.claimedCount, 0);

    // Releasing again is harmless and still returns CANCELLED.
    const again = await giver.request(
      "POST",
      `/api/claims/${claimId}/cancel`,
      {},
    );
    assert.equal(again.status, 200);
    assert.equal(again.body.claim.status, "CANCELLED");
  });
});

// ---------------------------------------------------------------------------
// Unrelated guest & unauthenticated visitor
// ---------------------------------------------------------------------------

describe("other roles stay private", () => {
  it("lets an unrelated guest see availability but never identity", async (t) => {
    if (skipWithoutDb(t)) return;

    const { otherGuest, shareToken, itemA } = await makeFixture("guest");

    await claimAsGiver(otherGuest, shareToken, itemA, "guest-key");

    const view = await otherGuest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(view.status, 200);
    assert.equal(view.body.wishlist.items[0].isClaimed, true);
    assert.equal(view.body.wishlist.items[0].claimedCount, 1);

    const serialised = JSON.stringify(view.body);
    assert.equal(serialised.includes("Auntie Rose"), false);
    assert.equal(serialised.includes("claimantName"), false);
    assert.equal(serialised.includes("claimantUserId"), false);

    // Guests cannot read owner-only endpoints.
    const denied = await otherGuest.request("GET", "/api/claims");
    assert.equal(denied.status, 401);
  });

  it("rejects an unauthenticated visitor everywhere private", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, giver, eventId, wishlistId, shareToken, itemA } =
      await makeFixture("anon");

    const claimed = await claimAsGiver(giver, shareToken, itemA, "anon-key");
    assert.equal(claimed.status, 201);
    const mine = await giver.request("GET", "/api/claims");
    const claimId = mine.body.claims[0].id as string;

    const stranger = new TestClient(baseUrl);

    const ownerDetail = await stranger.request("GET", `/api/events/${eventId}`);
    assert.equal(ownerDetail.status, 401);
    const ownerWishlist = await stranger.request(
      "GET",
      `/api/wishlists/${wishlistId}`,
    );
    assert.equal(ownerWishlist.status, 401);
    const ownerEvents = await stranger.request("GET", "/api/events");
    assert.equal(ownerEvents.status, 401);
    const myClaims = await stranger.request("GET", "/api/claims");
    assert.equal(myClaims.status, 401);
    const anonCancel = await stranger.request(
      "POST",
      `/api/claims/${claimId}/cancel`,
      {},
    );
    assert.equal(anonCancel.status, 401);

    // The public view still works for an unauthenticated visitor, and stays
    // identity-free.
    const publicView = await stranger.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(publicView.status, 200);
    assert.equal(publicView.body.wishlist.items[0].isClaimed, true);
    assert.equal(JSON.stringify(publicView.body).includes("Auntie Rose"), false);
  });
});

// ---------------------------------------------------------------------------
// Privacy modes change behaviour immediately
// ---------------------------------------------------------------------------

describe("privacy mode", () => {
  it("hides a list from guests immediately and restores it immediately", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, otherGuest, eventId, wishlistId, shareToken, itemA } =
      await makeFixture("privacy");

    // LINK_ONLY (default) → guests can read.
    const readable = await otherGuest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(readable.status, 200);

    // Owner sets PRIVATE → the public projection 404s at once.
    const privatised = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}`,
      { json: { privacyMode: "PRIVATE" } },
    );
    assert.equal(privatised.status, 200);
    assert.equal(privatised.body.wishlist.privacyMode, "PRIVATE");

    await otherGuest.ensureCsrf();
    const hidden = await otherGuest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(hidden.status, 404, "private list stops being readable at once");
    const cannotClaim = await otherGuest.request(
      "POST",
      `/api/public/wishlists/${shareToken}/items/${itemA}/claims`,
      { json: { idempotencyKey: `${runId}-privacy-claim` } },
    );
    assert.equal(cannotClaim.status, 404, "claims are refused on a private list");

    // The owner's own dashboard is unaffected by the privacy mode.
    const ownerDetail = await owner.request("GET", `/api/events/${eventId}`);
    assert.equal(ownerDetail.status, 200);
    assert.equal(ownerDetail.body.event.wishlist.privacyMode, "PRIVATE");
    assert.ok(ownerDetail.body.event.wishlist.items.length >= 1);

    // Switching back to LINK_ONLY restores guest access immediately.
    const restored = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}`,
      { json: { privacyMode: "LINK_ONLY" } },
    );
    assert.equal(restored.status, 200);
    const visibleAgain = await otherGuest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(visibleAgain.status, 200);

    // PUBLIC is also readable, exactly like LINK_ONLY for the token holder.
    const madePublic = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}`,
      { json: { privacyMode: "PUBLIC" } },
    );
    assert.equal(madePublic.status, 200);
    const publicRead = await otherGuest.request(
      "GET",
      `/api/public/wishlists/${shareToken}`,
    );
    assert.equal(publicRead.status, 200);
  });

  it("rejects an invalid privacy mode", async (t) => {
    if (skipWithoutDb(t)) return;

    const { owner, wishlistId } = await makeFixture("invalid-privacy");
    const bad = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}`,
      { json: { privacyMode: "SECRET" } },
    );
    assert.equal(bad.status, 400);
  });
});