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
  const email = uniqueEmail(`events-${label}`, runId);
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

/** Registers a fresh user and returns their authenticated client. */
async function registerUser(label: string): Promise<TestClient> {
  const client = new TestClient(baseUrl);
  await client.ensureCsrf();
  const response = await client.request("POST", "/api/auth/register", {
    json: { name: label, email: freshEmail(label), password },
  });
  assert.equal(response.status, 201);
  return client;
}

async function createEvent(
  client: TestClient,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await client.request("POST", "/api/events", {
    json: {
      name: "Emma & James",
      type: "WEDDING",
      eventDate: "2026-06-14",
      description: "Our big day",
      location: "Somerset",
      ...overrides,
    },
  });
  assert.equal(response.status, 201);
  return response.body.event.id as string;
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

describe("event management", () => {
  it("creates, lists and views an event for its owner", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("owner");
    const created = await owner.request("POST", "/api/events", {
      json: {
        name: "Emma & James",
        type: "WEDDING",
        eventDate: "2026-06-14",
        description: "Our big day",
        location: "Somerset",
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.event.name, "Emma & James");
    assert.equal(created.body.event.type, "WEDDING");
    assert.equal(created.body.event.location, "Somerset");
    assert.ok(created.body.event.eventDate.startsWith("2026-06-14"));
    assert.equal(created.body.event.wishlist, null);

    const id = created.body.event.id as string;

    const list = await owner.request("GET", "/api/events");
    assert.equal(list.status, 200);
    const summary = list.body.events.find(
      (event: { id: string }) => event.id === id,
    );
    assert.ok(summary, "created event appears in the list");
    assert.equal(summary.wishlist, null);

    const detail = await owner.request("GET", `/api/events/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.event.id, id);
  });

  it("supports every required event type", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("types");
    const types = [
      "WEDDING",
      "BIRTHDAY",
      "ENGAGEMENT",
      "GRADUATION",
      "BABY_SHOWER",
      "HOUSEWARMING",
      "FESTIVE",
      "OTHER",
    ];

    for (const type of types) {
      const response = await owner.request("POST", "/api/events", {
        json: { name: `An ${type}`, type },
      });
      assert.equal(response.status, 201, `type ${type} should be accepted`);
      assert.equal(response.body.event.type, type);
    }
  });

  it("rejects invalid event input with field errors", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("invalid");
    const invalid = await owner.request("POST", "/api/events", {
      json: { name: "", type: "NOT_A_TYPE" },
    });

    assert.equal(invalid.status, 400);
    const fields = invalid.body.error.fields.map(
      (field: { field: string }) => field.field,
    );
    assert.ok(fields.includes("name"));
    assert.ok(fields.includes("type"));
  });

  it("accepts explicit null optional fields when creating an event", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("nulls");
    const created = await owner.request("POST", "/api/events", {
      json: {
        name: "No extras",
        type: "OTHER",
        eventDate: null,
        description: null,
        location: null,
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.event.eventDate, null);
    assert.equal(created.body.event.description, null);
    assert.equal(created.body.event.location, null);
  });

  it("updates an event it owns", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("update");
    const id = await createEvent(owner);

    const updated = await owner.request("PATCH", `/api/events/${id}`, {
      json: { name: "Renamed celebration", location: "" },
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.event.name, "Renamed celebration");
    assert.equal(updated.body.event.location, null);
  });

  it("prevents another user from viewing, editing or deleting an event", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("victim");
    const intruder = await registerUser("intruder");
    const id = await createEvent(owner);

    const view = await intruder.request("GET", `/api/events/${id}`);
    assert.equal(view.status, 404);

    const edit = await intruder.request("PATCH", `/api/events/${id}`, {
      json: { name: "Hijacked" },
    });
    assert.equal(edit.status, 404);

    const remove = await intruder.request("DELETE", `/api/events/${id}`);
    assert.equal(remove.status, 404);

    const intact = await owner.request("GET", `/api/events/${id}`);
    assert.equal(intact.status, 200);
    assert.equal(intact.body.event.name, "Emma & James");
  });

  it("deletes an event it owns", async (t) => {
    if (skipWithoutDb(t)) return;

    const owner = await registerUser("delete");
    const id = await createEvent(owner);

    const deleted = await owner.request("DELETE", `/api/events/${id}`);
    assert.equal(deleted.status, 204);

    const gone = await owner.request("GET", `/api/events/${id}`);
    assert.equal(gone.status, 404);
  });

  it("requires authentication for every event route", async (t) => {
    if (skipWithoutDb(t)) return;

    const anon = new TestClient(baseUrl);
    await anon.ensureCsrf();

    const list = await anon.request("GET", "/api/events");
    assert.equal(list.status, 401);

    const create = await anon.request("POST", "/api/events", {
      json: { name: "Sneaky", type: "OTHER" },
    });
    assert.equal(create.status, 401);
  });
});
