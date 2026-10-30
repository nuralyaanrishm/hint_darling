import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

// A small ToyyibPay client for the one-time Pro unlock.
//
// ToyyibPay is bill-based: we create a bill server-side, send the payer to its
// hosted checkout, and receive a server-to-server callback on payment. The
// public API has no recurring/subscription endpoint, which is why the unlock is
// a single one-off purchase.

const DEFAULT_BASE_URL = "https://dev.toyyibpay.com";
const REQUEST_TIMEOUT_MS = 15_000;

export interface ToyyibPayConfig {
  baseUrl: string;
  secretKey: string;
  categoryCode: string;
  callbackUrl: string;
  returnUrl: string;
  paymentChannel: string;
  chargeToCustomer: string;
}

/** Reads and validates the ToyyibPay configuration from the environment. */
export function toyyibpayConfig(): ToyyibPayConfig {
  const secretKey = process.env.TOYYIBPAY_SECRET_KEY?.trim();
  const categoryCode = process.env.TOYYIBPAY_CATEGORY_CODE?.trim();
  const callbackUrl = process.env.TOYYIBPAY_CALLBACK_URL?.trim();
  const returnUrl = process.env.TOYYIBPAY_RETURN_URL?.trim();

  if (!secretKey || !categoryCode || !callbackUrl || !returnUrl) {
    throw new HttpError(
      500,
      "Payments are not configured yet. Please try again later.",
    );
  }

  return {
    baseUrl: (process.env.TOYYIBPAY_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    ),
    secretKey,
    categoryCode,
    callbackUrl,
    returnUrl,
    // 1 = FPX, 2 = FPX + card. A card-only flow can be selected via env.
    paymentChannel: process.env.TOYYIBPAY_PAYMENT_CHANNEL?.trim() || "2",
    // Blank means ToyyibPay charges the bill owner. "0" charges FPX to the payer.
    chargeToCustomer: process.env.TOYYIBPAY_CHARGE_TO_CUSTOMER?.trim() ?? "",
  };
}

export interface CreateBillInput {
  name: string;
  description: string;
  amountSen: number;
  externalReference: string;
  payerName?: string | null;
  payerEmail?: string | null;
}

export interface CreatedBill {
  billCode: string;
  paymentUrl: string;
}

/** The hosted checkout URL for a bill code. */
export function billPaymentUrl(billCode: string): string {
  return `${toyyibpayConfig().baseUrl}/${billCode}`;
}

async function postForm(
  path: string,
  fields: Record<string, string>,
): Promise<string> {
  const { baseUrl } = toyyibpayConfig();
  const body = new URLSearchParams(fields);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("ToyyibPay request failed:", error);
    throw new HttpError(
      502,
      "We couldn't reach the payment provider. Please try again.",
    );
  }

  return response.text();
}

/**
 * Creates a fixed-price bill and returns its bill code.
 *
 * ToyyibPay returns HTTP 200 for both success and failure, so the body must be
 * inspected. A successful createBill response is `[{"BillCode":"..."}]`;
 * failures are a JSON error object or a plain-text error code.
 */
export async function createToyyibPayBill(
  input: CreateBillInput,
): Promise<CreatedBill> {
  const config = toyyibpayConfig();

  const fields: Record<string, string> = {
    userSecretKey: config.secretKey,
    categoryCode: config.categoryCode,
    billName: input.name,
    billDescription: input.description,
    billPriceSetting: "1",
    billPayorInfo: "0",
    billAmount: String(input.amountSen),
    billReturnUrl: config.returnUrl,
    billCallbackUrl: config.callbackUrl,
    billExternalReferenceNo: input.externalReference,
    billSplitPayment: "0",
    billSplitPaymentArgs: "",
    billPaymentChannel: config.paymentChannel,
    billExpiryDays: "1",
  };

  if (config.chargeToCustomer !== "") {
    fields.billChargeToCustomer = config.chargeToCustomer;
  }
  if (input.payerName) {
    fields.billTo = input.payerName;
  }
  if (input.payerEmail) {
    fields.billEmail = input.payerEmail;
  }

  const text = await postForm("/index.php/api/createBill", fields);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("ToyyibPay createBill returned non-JSON:", text.slice(0, 300));
    throw new HttpError(
      502,
      "We couldn't start the payment. Please try again.",
    );
  }

  if (
    Array.isArray(data) &&
    data[0] &&
    typeof data[0] === "object" &&
    typeof (data[0] as { BillCode?: unknown }).BillCode === "string"
  ) {
    const billCode = (data[0] as { BillCode: string }).BillCode;
    return { billCode, paymentUrl: `${config.baseUrl}/${billCode}` };
  }

  console.error("ToyyibPay createBill failed:", data);
  throw new HttpError(502, "We couldn't start the payment. Please try again.");
}

export interface ToyyibPayTransaction {
  billpaymentStatus?: string;
  billpaymentAmount?: string;
  billpaymentChannel?: string;
  billpaymentInvoiceNo?: string;
  billExternalReferenceNo?: string;
}

/** Returns the transactions for a bill, newest first. */
export async function fetchBillTransactions(
  billCode: string,
): Promise<ToyyibPayTransaction[]> {
  const config = toyyibpayConfig();
  const text = await postForm("/index.php/api/getBillTransactions", {
    billCode,
    userSecretKey: config.secretKey,
  });

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(
      502,
      "We couldn't verify the payment with the provider.",
    );
  }

  if (!Array.isArray(data)) {
    throw new HttpError(
      502,
      "We couldn't verify the payment with the provider.",
    );
  }

  return data as ToyyibPayTransaction[];
}

/**
 * ToyyibPay's callback checksum:
 *   md5(userSecretKey + status + order_id + refno + "ok")
 * compared in constant time.
 */
export function callbackHash(
  secretKey: string,
  status: string,
  orderId: string,
  refno: string,
): string {
  return createHash("md5")
    .update(`${secretKey}${status}${orderId}${refno}ok`)
    .digest("hex");
}

export function verifyCallbackHash(input: {
  status: string;
  orderId: string;
  refno: string;
  hash: string;
}): boolean {
  const expected = callbackHash(
    toyyibpayConfig().secretKey,
    input.status,
    input.orderId,
    input.refno,
  );
  const a = Buffer.from(expected.toLowerCase(), "utf8");
  const b = Buffer.from(input.hash.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Converts an RM amount such as "9.00" into sen, or null when invalid. */
export function amountToSen(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
}

/**
 * Converts the callback `amount` field.
 *
 * ToyyibPay sends callback amounts in sen (e.g. "100" for RM1.00), while the
 * `getBillTransactions` API returns RM strings (e.g. "9.00"). Accept both
 * shapes so a real callback and the reconciliation fallback agree: an integer
 * of 100 or more is treated as sen, anything else as RM.
 */
export function callbackAmountToSen(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (Number.isInteger(amount) && amount >= 100) {
    return amount;
  }
  return Math.round(amount * 100);
}
