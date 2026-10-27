const DEFAULT_BREVO_BASE_URL = "https://api.brevo.com";
const REQUEST_TIMEOUT_MS = 10_000;

/** Raised when Brevo is not configured or rejects a send. */
export class EmailDeliveryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

export interface VerificationEmail {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
}

type EmailSender = (email: VerificationEmail) => Promise<void>;

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

function verificationEmailContent(email: VerificationEmail): {
  subject: string;
  htmlContent: string;
  textContent: string;
} {
  const name = email.name.trim() || "there";
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(email.code);

  return {
    subject: "Your Hint, Darling verification code",
    textContent: [
      `Hi ${name},`,
      "",
      `Your verification code is: ${email.code}`,
      "",
      `Enter it to finish creating your account. The code expires in ${email.expiresInMinutes} minutes.`,
      "",
      "If you didn't create an account, you can safely ignore this email.",
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
                <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#b76e79;">Verify your email</p>
                <h1 style="margin:0 0 16px;font-size:28px;font-weight:600;color:#2f2a2a;">Finish creating your account</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5c5353;">Hi ${safeName}, use the code below to verify your email address.</p>
                <div style="margin:0 0 24px;padding:20px;border-radius:16px;background:#fdf7f4;text-align:center;">
                  <span style="font-size:34px;font-weight:700;letter-spacing:0.32em;color:#b76e79;">${safeCode}</span>
                </div>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#5c5353;">This code expires in ${email.expiresInMinutes} minutes.</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#5c5353;">If you didn't create an account, you can safely ignore this email.</p>
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

async function sendViaBrevo(email: VerificationEmail): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_FROM_EMAIL?.trim();
  const senderName = sanitizeHeaderValue(
    process.env.BREVO_FROM_NAME ?? "Hint, Darling",
  );

  if (!apiKey || !senderEmail) {
    throw new EmailDeliveryError("Brevo is not configured");
  }

  const content = verificationEmailContent(email);

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

let sender: EmailSender = sendViaBrevo;

/**
 * Replaces the email transport. Tests use this to capture the generated code
 * instead of contacting Brevo; passing `null` restores the real sender.
 */
export function setEmailSenderForTests(next: EmailSender | null): void {
  sender = next ?? sendViaBrevo;
}

export async function sendVerificationEmail(email: VerificationEmail): Promise<void> {
  await sender(email);
}
