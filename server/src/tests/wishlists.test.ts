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
  const email = uniqueEmail(`wishlists-${label}`, runId);
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

async function registerUser(label: string): Promise<TestClient> {
  const client = new TestClient(baseUrl);
  await client.ensureCsrf();
  const response = await client.request("POST", "/api/auth/register", {
    json: { name: label, email: freshEmail(label), password },
  });
  assert.equal(response.status, 201);
  return client;
}

async function createEvent(client: TestClient): Promise<string> {
  const response = await client.request("POST", "/api/events", {
    json: { name: "Emma & James", type: "WEDDING" },
  });
  assert.equal(response.status, 201);
  return response.body.event.id as string;
}

async function createWishlist(
  client: TestClient,
  eventId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await client.request(
    "POST",
    `/api/events/${eventId}/wishlist`,
    { json: { title: "Our wishlist", ...overrides } },
  );
  assert.equal(response.status, 201);
  return response.body.wishlist.id as string;
}

async function addItem(
  client: TestClient,
  wishlistId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await client.request(
    "POST",
    `/api/wishlists/${wishlistId}/items`,
    {
      json: {
        name: "Linen duvet set",
        productUrl: "https://example.com/duvet",
        price: 180,
        currency: "GBP",
        quantity: 1,
        ...overrides,
      },
    },
  );
  assert.equal(response.status, 201);
  return response.body.item.id as string;
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

describe("wishlist management", () => {
  it("creates one wishlist per event and rejects a second", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("create");
    const eventId = await createEvent(owner);

    const created = await owner.request(
      "POST",
      `/api/events/${eventId}/wishlist`,
      { json: { title: "Our wishlist" } },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.wishlist.title, "Our wishlist");
    assert.deepEqual(created.body.wishlist.items, []);

    const duplicate = await owner.request(
      "POST",
      `/api/events/${eventId}/wishlist`,
      { json: { title: "Another" } },
    );
    assert.equal(duplicate.status, 409);
  });

  it("updates the wishlist title and description", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("update");
    const eventId = await createEvent(owner);
    const wishlistId = await createWishlist(owner, eventId);

    const updated = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}`,
      {
        json: {
          title: "Renamed list",
          description: "A few lovely things",
        },
      },
    );

    assert.equal(updated.status, 200);
    assert.equal(updated.body.wishlist.title, "Renamed list");
    assert.equal(updated.body.wishlist.description, "A few lovely things");
  });

  it("accepts explicit null optional fields when creating a wishlist and item", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("nulls");
    const eventId = await createEvent(owner);

    const wishlist = await owner.request(
      "POST",
      `/api/events/${eventId}/wishlist`,
      { json: { title: "Bare list", description: null } },
    );
    assert.equal(wishlist.status, 201);
    assert.equal(wishlist.body.wishlist.description, null);
    const wishlistId = wishlist.body.wishlist.id as string;

    const item = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      {
        json: {
          name: "Air fryer",
          productUrl: null,
          imageUrl: null,
          price: null,
          currency: "GBP",
          description: null,
          preferredColour: null,
          preferredSize: null,
          preferredVariation: null,
          quantity: 1,
          notes: null,
        },
      },
    );

    assert.equal(item.status, 201);
    assert.equal(item.body.item.name, "Air fryer");
    assert.equal(item.body.item.productUrl, null);
    assert.equal(item.body.item.notes, null);
  });

  it("adds, edits and removes gift items", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("items");
    const eventId = await createEvent(owner);
    const wishlistId = await createWishlist(owner, eventId);

    const itemId = await addItem(owner, wishlistId, {
      name: "Stand mixer",
      imageUrl: "https://example.com/mixer.jpg",
      description: "Cream, 5L",
      preferredColour: "Cream",
      preferredSize: "5L",
      preferredVariation: "Artisan",
      quantity: 2,
      notes: "Dishwasher safe please",
    });

    const detail = await owner.request("GET", `/api/wishlists/${wishlistId}`);
    assert.equal(detail.status, 200);
    const item = detail.body.wishlist.items.find(
      (entry: { id: string }) => entry.id === itemId,
    );
    assert.ok(item);
    assert.equal(item.preferredColour, "Cream");
    assert.equal(item.quantity, 2);
    assert.equal(item.price, "180");

    const edited = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}/items/${itemId}`,
      { json: { name: "Stand mixer (red)", price: 349.5, notes: "" } },
    );
    assert.equal(edited.status, 200);
    assert.equal(edited.body.item.name, "Stand mixer (red)");
    assert.equal(edited.body.item.price, "349.5");
    assert.equal(edited.body.item.notes, null);

    const removed = await owner.request(
      "DELETE",
      `/api/wishlists/${wishlistId}/items/${itemId}`,
    );
    assert.equal(removed.status, 204);

    const after = await owner.request("GET", `/api/wishlists/${wishlistId}`);
    assert.equal(after.body.wishlist.items.length, 0);
  });

  it("rejects unsafe product URLs and invalid item values", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("unsafe");
    const eventId = await createEvent(owner);
    const wishlistId = await createWishlist(owner, eventId);

    const unsafe = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Bad link", productUrl: "javascript:alert(1)" } },
    );
    assert.equal(unsafe.status, 400);
    assert.ok(
      unsafe.body.error.fields.some(
        (field: { field: string }) => field.field === "productUrl",
      ),
    );

    const dataUrl = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Data link", imageUrl: "data:text/html;base64,AAAA" } },
    );
    assert.equal(dataUrl.status, 400);

    const badPrice = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Price", price: -5 } },
    );
    assert.equal(badPrice.status, 400);

    const badQuantity = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Qty", quantity: 0 } },
    );
    assert.equal(badQuantity.status, 400);

    const badCurrency = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Currency", currency: "Pounds" } },
    );
    assert.equal(badCurrency.status, 400);

    // A safe https link is accepted.
    const safe = await owner.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Good link", productUrl: "https://example.com/gift" } },
    );
    assert.equal(safe.status, 201);
  });

  it("reorders gift items and persists the new order", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("reorder");
    const eventId = await createEvent(owner);
    const wishlistId = await createWishlist(owner, eventId);

    const first = await addItem(owner, wishlistId, { name: "First" });
    const second = await addItem(owner, wishlistId, { name: "Second" });
    const third = await addItem(owner, wishlistId, { name: "Third" });

    const reordered = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}/items/reorder`,
      { json: { itemIds: [third, first, second] } },
    );
    assert.equal(reordered.status, 200);
    assert.deepEqual(
      reordered.body.wishlist.items.map((item: { id: string }) => item.id),
      [third, first, second],
    );

    const detail = await owner.request("GET", `/api/wishlists/${wishlistId}`);
    assert.deepEqual(
      detail.body.wishlist.items.map((item: { id: string }) => item.id),
      [third, first, second],
    );

    const incomplete = await owner.request(
      "PATCH",
      `/api/wishlists/${wishlistId}/items/reorder`,
      { json: { itemIds: [third, first] } },
    );
    assert.equal(incomplete.status, 400);
  });

  it("prevents another user from managing a wishlist or its items", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("victim");
    const intruder = await registerUser("intruder");
    const eventId = await createEvent(owner);
    const wishlistId = await createWishlist(owner, eventId);
    const itemId = await addItem(owner, wishlistId);

    const view = await intruder.request("GET", `/api/wishlists/${wishlistId}`);
    assert.equal(view.status, 404);

    const editList = await intruder.request(
      "PATCH",
      `/api/wishlists/${wishlistId}`,
      { json: { title: "Hijacked" } },
    );
    assert.equal(editList.status, 404);

    const add = await intruder.request(
      "POST",
      `/api/wishlists/${wishlistId}/items`,
      { json: { name: "Trespasser" } },
    );
    assert.equal(add.status, 404);

    const editItem = await intruder.request(
      "PATCH",
      `/api/wishlists/${wishlistId}/items/${itemId}`,
      { json: { name: "Hijacked gift" } },
    );
    assert.equal(editItem.status, 404);

    const removeItem = await intruder.request(
      "DELETE",
      `/api/wishlists/${wishlistId}/items/${itemId}`,
    );
    assert.equal(removeItem.status, 404);

    const reorder = await intruder.request(
      "PATCH",
      `/api/wishlists/${wishlistId}/items/reorder`,
      { json: { itemIds: [itemId] } },
    );
    assert.equal(reorder.status, 404);

    // The owner's data is untouched.
    const intact = await owner.request("GET", `/api/wishlists/${wishlistId}`);
    assert.equal(intact.status, 200);
    assert.equal(intact.body.wishlist.title, "Our wishlist");
    assert.equal(intact.body.wishlist.items[0].name, "Linen duvet set");
  });

  it("prevents creating a wishlist on another user's event", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("eventowner");
    const intruder = await registerUser("eventintruder");
    const eventId = await createEvent(owner);

    const response = await intruder.request(
      "POST",
      `/api/events/${eventId}/wishlist`,
      { json: { title: "Not mine" } },
    );
    assert.equal(response.status, 404);
  });
});
