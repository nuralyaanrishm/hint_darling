import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  EmailDeliveryError,
  sendVerificationEmail,
  type VerificationEmail,
} from "../lib/email.js";

const ENV_KEYS = [
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
  "MAILGUN_FROM_EMAIL",
  "MAILGUN_FROM_NAME",
  "MAILGUN_BASE_URL",
] as const;

const email: VerificationEmail = {
  to: "gift@example.com",
  name: "Ada, Lovelace",
  code: "123456",
  expiresInMinutes: 10,
};

let savedEnv: Record<string, string | undefined>;
let originalFetch: typeof fetch;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  globalThis.fetch = originalFetch;
});

function configureMailgun(): void {
  process.env.MAILGUN_API_KEY = "key-test";
  process.env.MAILGUN_DOMAIN = "sandbox.example.com";
  process.env.MAILGUN_FROM_EMAIL = "postmaster@sandbox.example.com";
  process.env.MAILGUN_FROM_NAME = "Hint, Darling";
}

describe("Mailgun email transport", () => {
  it("throws when Mailgun is not configured", async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    await assert.rejects(sendVerificationEmail(email), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.match(error.message, /Mailgun is not configured/);
      return true;
    });
  });

  it("posts a formatted message to the configured endpoint", async () => {
    configureMailgun();
    process.env.MAILGUN_BASE_URL = "https://api.eu.mailgun.net/";

    const requests: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await sendVerificationEmail(email);

    const request = requests[0];
    assert.ok(request);
    assert.equal(
      request.url,
      "https://api.eu.mailgun.net/v3/sandbox.example.com/messages",
    );

    const headers = new Headers(request.init.headers);
    assert.equal(
      headers.get("authorization"),
      `Basic ${Buffer.from("api:key-test").toString("base64")}`,
    );

    const body = new URLSearchParams(String(request.init.body));
    assert.equal(
      body.get("from"),
      '"Hint, Darling" <postmaster@sandbox.example.com>',
    );
    assert.equal(body.get("to"), '"Ada, Lovelace" <gift@example.com>');
    assert.equal(body.get("subject"), "Your Hint, Darling verification code");
    assert.match(body.get("html") ?? "", /Ada, Lovelace/);
  });

  it("includes Mailgun's rejection detail", async () => {
    configureMailgun();
    globalThis.fetch = (async () =>
      new Response("Forbidden", { status: 403 })) as typeof fetch;

    await assert.rejects(sendVerificationEmail(email), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.match(
        error.message,
        /Mailgun rejected the email \(403\): Forbidden/,
      );
      return true;
    });
  });
});
