import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  EmailDeliveryError,
  sendVerificationEmail,
  type VerificationEmail,
} from "../lib/email.js";

const ENV_KEYS = [
  "BREVO_API_KEY",
  "BREVO_FROM_EMAIL",
  "BREVO_FROM_NAME",
  "BREVO_BASE_URL",
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

function configureBrevo(): void {
  process.env.BREVO_API_KEY = "xkeysib-test";
  process.env.BREVO_FROM_EMAIL = "sender@example.com";
  process.env.BREVO_FROM_NAME = "Hint, Darling";
}

describe("Brevo email transport", () => {
  it("throws when Brevo is not configured", async () => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    await assert.rejects(sendVerificationEmail(email), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.match(error.message, /Brevo is not configured/);
      return true;
    });
  });

  it("posts a JSON message to the configured endpoint", async () => {
    configureBrevo();
    process.env.BREVO_BASE_URL = "https://api.example.test/";

    const requests: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} });
      return new Response("{}", { status: 201 });
    }) as typeof fetch;

    await sendVerificationEmail(email);

    const request = requests[0];
    assert.ok(request);
    assert.equal(request.url, "https://api.example.test/v3/smtp/email");

    const headers = new Headers(request.init.headers);
    assert.equal(headers.get("api-key"), "xkeysib-test");
    assert.equal(headers.get("content-type"), "application/json");

    const body = JSON.parse(String(request.init.body)) as {
      sender: { name: string; email: string };
      to: Array<{ name: string; email: string }>;
      subject: string;
      htmlContent: string;
      textContent: string;
    };
    assert.deepEqual(body.sender, {
      name: "Hint, Darling",
      email: "sender@example.com",
    });
    assert.deepEqual(body.to, [{ name: "Ada, Lovelace", email: "gift@example.com" }]);
    assert.equal(body.subject, "Your Hint, Darling verification code");
    assert.match(body.htmlContent, /Ada, Lovelace/);
    assert.match(body.textContent, /123456/);
  });

  it("includes Brevo's rejection detail", async () => {
    configureBrevo();
    globalThis.fetch = (async () =>
      new Response('{"code":"unauthorized","message":"Key not found"}', {
        status: 401,
      })) as typeof fetch;

    await assert.rejects(sendVerificationEmail(email), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.match(
        error.message,
        /Brevo rejected the email \(401\): .*Key not found/,
      );
      return true;
    });
  });
});
