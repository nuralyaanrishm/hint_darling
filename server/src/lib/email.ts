import nodemailer from "nodemailer";

const DEFAULT_BREVO_BASE_URL = "https://api.brevo.com";
const GMAIL_SMTP_HOST = "smtp.gmail.com";
const GMAIL_SMTP_PORT = 465;
const CONNECTION_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Raised when the email provider is not configured or rejects a send. */
export class EmailDeliveryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

export interface OtpEmail {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
}

/** A signup verification email. */
export type VerificationEmail = OtpEmail;
/** A password-reset email; identical shape, different copy. */
export type PasswordResetEmail = OtpEmail;

export type EmailKind = "verification" | "passwordReset";

/** What the sender receives: the email plus which template produced it. */
export type SentOtpEmail = OtpEmail & { kind: EmailKind };

type EmailSender = (email: SentOtpEmail) => Promise<void>;

interface GmailConfig {
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  port: number;
  secure: boolean;
}

interface OutgoingEmail {
  from: { name: string; address: string };
  to: { name: string; address: string };
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  sendMail(message: OutgoingEmail): Promise<unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Strips CR/LF so user-controlled names cannot inject extra mail headers. */
function sanitizeHeaderValue(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").trim();
}

function brevoBaseUrl(): string {
  const configured = process.env.BREVO_BASE_URL?.trim();
  return (configured || DEFAULT_BREVO_BASE_URL).replace(/\/+$/, "");
}

/**
 * Reads the Gmail SMTP settings. Returns `null` when Gmail is not configured at
 * all, and throws when only part of the configuration is present so a typo is
 * not silently ignored in favour of Brevo.
 */
function gmailConfig(): GmailConfig | null {
  const user = process.env.GMAIL_USER?.trim();
  // Google displays app passwords in four groups; spaces are ignored by Gmail.
  const pass = process.env.GMAIL_APP_PASSWORD?.trim().replaceAll(/\s+/g, "");

  if (!user && !pass) {
    return null;
  }

  if (!user || !pass) {
    throw new EmailDeliveryError(
      "Gmail SMTP requires both GMAIL_USER and GMAIL_APP_PASSWORD",
    );
  }

  const configuredPort = Number(process.env.GMAIL_SMTP_PORT ?? GMAIL_SMTP_PORT);
  const port =
    Number.isInteger(configuredPort) &&
    configuredPort > 0 &&
    configuredPort <= 65_535
      ? configuredPort
      : GMAIL_SMTP_PORT;

  return {
    user,
    pass,
    fromEmail: process.env.GMAIL_FROM_EMAIL?.trim() || user,
    fromName: sanitizeHeaderValue(
      process.env.GMAIL_FROM_NAME ?? "Hint, Darling",
    ),
    port,
    secure: port === GMAIL_SMTP_PORT,
  };
}

interface OtpCopy {
  subject: string;
  eyebrow: string;
  heading: string;
  intro: string;
  footnote: string;
  closing: string;
}

const OTP_COPY: Record<EmailKind, OtpCopy> = {
  verification: {
    subject: "Your Hint, Darling verification code",
    eyebrow: "Verify your email",
    heading: "Finish creating your account",
    intro: "use the code below to verify your email address.",
    footnote: "If you didn't create an account, you can safely ignore this email.",
    closing: "Enter it to finish creating your account.",
  },
  passwordReset: {
    subject: "Reset your Hint, Darling password",
    eyebrow: "Reset your password",
    heading: "Choose a new password",
    intro: "use the code below to reset the password for your account.",
    footnote:
      "If you didn't ask to reset your password, you can safely ignore this email — your password hasn't changed.",
    closing: "Enter it to choose a new password.",
  },
};

function otpEmailContent(email: SentOtpEmail): {
  subject: string;
  htmlContent: string;
  textContent: string;
} {
  const name = email.name.trim() || "there";
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(email.code);
  const copy = OTP_COPY[email.kind];

  return {
    subject: copy.subject,
    textContent: [
      `Hi ${name},`,
      "",
      `Your code is: ${email.code}`,
      "",
      `${copy.closing} The code expires in ${email.expiresInMinutes} minutes.`,
      "",
      copy.footnote,
      "",
      "— Hint, Darling",
    ].join("\n"),
    htmlContent: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#fdf7f4;font-family:Arial,Helvetica,sans-serif;color:#2f2a2a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:24px;padding:40px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#b76e79;">${copy.eyebrow}</p>
                <h1 style="margin:0 0 16px;font-size:28px;font-weight:600;color:#2f2a2a;">${copy.heading}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5c5353;">Hi ${safeName}, ${copy.intro}</p>
                <div style="margin:0 0 24px;padding:20px;border-radius:16px;background:#fdf7f4;text-align:center;">
                  <span style="font-size:34px;font-weight:700;letter-spacing:0.32em;color:#b76e79;">${safeCode}</span>
                </div>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#5c5353;">This code expires in ${email.expiresInMinutes} minutes.</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#5c5353;">${copy.footnote}</p>
                <p style="margin:32px 0 0;font-size:14px;color:#2f2a2a;">— Hint, Darling</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

let cachedGmailTransport: EmailTransport | null = null;
let cachedGmailTransportKey = "";
let gmailTransportOverride: EmailTransport | null = null;

function getGmailTransport(config: GmailConfig): EmailTransport {
  if (gmailTransportOverride) {
    return gmailTransportOverride;
  }

  const key = [
    config.user,
    config.pass,
    config.port,
    config.secure ? "secure" : "starttls",
  ].join("\u0000");

  if (!cachedGmailTransport || cachedGmailTransportKey !== key) {
    cachedGmailTransport = nodemailer.createTransport({
      host: GMAIL_SMTP_HOST,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: CONNECTION_TIMEOUT_MS * 2,
    });
    cachedGmailTransportKey = key;
  }

  return cachedGmailTransport;
}

/** Replaces the Gmail transport in tests; passing `null` restores the real one. */
export function setGmailTransportForTests(next: EmailTransport | null): void {
  gmailTransportOverride = next;
}

async function sendViaGmail(
  email: SentOtpEmail,
  config: GmailConfig,
): Promise<void> {
  const content = otpEmailContent(email);

  try {
    await getGmailTransport(config).sendMail({
      from: { name: config.fromName, address: config.fromEmail },
      to: { name: sanitizeHeaderValue(email.name), address: email.to },
      subject: content.subject,
      text: content.textContent,
      html: content.htmlContent,
    });
  } catch (error) {
    throw new EmailDeliveryError("Gmail SMTP rejected the email", {
      cause: error,
    });
  }
}

async function sendViaBrevo(email: SentOtpEmail): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const senderName = sanitizeHeaderValue(
    process.env.BREVO_FROM_NAME ?? "Hint, Darling",
  );

  if (!apiKey || !senderEmail) {
    throw new EmailDeliveryError("Brevo is not configured");
  }

  const content = otpEmailContent(email);

  const body = JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: [{ name: sanitizeHeaderValue(email.name), email: email.to }],
    subject: content.subject,
    htmlContent: content.htmlContent,
    textContent: content.textContent,
  });

  let response: Response;
  try {
    response = await fetch(`${brevoBaseUrl()}/v3/smtp/email`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new EmailDeliveryError("Could not reach Brevo", { cause: error });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmailDeliveryError(
      `Brevo rejected the email (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
}

/** Uses Gmail SMTP when configured, otherwise falls back to Brevo. */
async function sendViaConfiguredProvider(email: SentOtpEmail): Promise<void> {
  const config = gmailConfig();

  if (config) {
    await sendViaGmail(email, config);
    return;
  }

  await sendViaBrevo(email);
}

let sender: EmailSender = sendViaConfiguredProvider;

/**
 * Replaces the email transport. Tests use this to capture the generated code
 * instead of contacting a provider; passing `null` restores the real sender.
 */
export function setEmailSenderForTests(next: EmailSender | null): void {
  sender = next ?? sendViaConfiguredProvider;
}

export async function sendVerificationEmail(
  email: VerificationEmail,
): Promise<void> {
  await sender({ ...email, kind: "verification" });
}

export async function sendPasswordResetEmail(
  email: PasswordResetEmail,
): Promise<void> {
  await sender({ ...email, kind: "passwordReset" });
}
