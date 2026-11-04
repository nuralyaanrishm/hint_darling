import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  EmailDeliveryError,
  sendVerificationEmail,
  setGmailTransportForTests,
  type EmailTransport,
  type VerificationEmail,
} from "../lib/email.js";

const ENV_KEYS = [
  "BREVO_API_KEY",
  "BREVO_FROM_EMAIL",
  "BREVO_FROM_NAME",
  "BREVO_BASE_URL",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "GMAIL_FROM_EMAIL",
  "GMAIL_FROM_NAME",
  "GMAIL_SMTP_PORT",
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
  setGmailTransportForTests(null);
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

function configureGmail(): void {
  process.env.GMAIL_USER = "sender@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "app-password";
  process.env.GMAIL_FROM_NAME = "Hint, Darling";
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

describe("Gmail SMTP transport", () => {
  interface SentMessage {
    from: { name: string; address: string };
    to: { name: string; address: string };
    subject: string;
    text: string;
    html: string;
  }

  let sent: SentMessage[];

  beforeEach(() => {
    sent = [];
    const transport: EmailTransport = {
      sendMail: async (message) => {
        sent.push(message);
        return { messageId: "test" };
      },
    };
    setGmailTransportForTests(transport);
  });

  it("sends through Gmail when configured", async () => {
    configureGmail();

    await sendVerificationEmail(email);

    assert.equal(sent.length, 1);
    const message = sent[0];
    assert.deepEqual(message.from, {
      name: "Hint, Darling",
      address: "sender@gmail.com",
    });
    assert.deepEqual(message.to, {
      name: "Ada, Lovelace",
      address: "gift@example.com",
    });
    assert.equal(message.subject, "Your Hint, Darling verification code");
    assert.match(message.text, /123456/);
    assert.match(message.html, /Ada, Lovelace/);
  });

  it("uses GMAIL_FROM_EMAIL when set", async () => {
    configureGmail();
    process.env.GMAIL_FROM_EMAIL = "no-reply@example.com";

    await sendVerificationEmail(email);

    assert.equal(sent[0].from.address, "no-reply@example.com");
  });

  it("prefers Gmail over Brevo when both are configured", async () => {
    configureGmail();
    configureBrevo();

    let brevoCalled = false;
    globalThis.fetch = (async () => {
      brevoCalled = true;
      return new Response("{}", { status: 201 });
    }) as typeof fetch;

    await sendVerificationEmail(email);

    assert.equal(brevoCalled, false);
    assert.equal(sent.length, 1);
  });

  it("rejects partial Gmail configuration instead of silently using Brevo", async () => {
    configureBrevo();
    process.env.GMAIL_USER = "sender@gmail.com";

    await assert.rejects(sendVerificationEmail(email), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.match(
        error.message,
        /requires both GMAIL_USER and GMAIL_APP_PASSWORD/,
      );
      return true;
    });
    assert.equal(sent.length, 0);
  });

  it("wraps SMTP failures in EmailDeliveryError", async () => {
    configureGmail();
    setGmailTransportForTests({
      sendMail: async () => {
        throw new Error("Invalid login: 535-5.7.8");
      },
    });

    await assert.rejects(sendVerificationEmail(email), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.match(error.message, /Gmail SMTP rejected the email/);
      assert.ok(error.cause instanceof Error);
      return true;
    });
  });
});
