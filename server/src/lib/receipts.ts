import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { HttpError } from "./errors.js";
import type { BillingProduct } from "./plans.js";
import { prisma } from "./prisma.js";

// Downloadable payment receipts.
//
// A receipt is derived from a PAID purchase row rather than stored separately,
// so the amount, product and event always match the audit trail. Each purchase
// gets its own receipt: a Pro account has one lifetime receipt, while every
// Event Pass produces a receipt named after the event it unlocked.

const BUSINESS_NAME = "Build With Aly Services";
const BUSINESS_SSM = "SSM No: 202603304335 (LA0095301-M)";
const BUSINESS_ADDRESS = [
  "19, Jalan Impian Putra 4/3, Taman Impian Putra",
  "43000, Kajang",
  "Selangor, Malaysia",
];
const BUSINESS_PHONE = "019-6277653";
const BUSINESS_EMAIL = "buildwithaly@outlook.com";
const FOOTNOTE = "** Hint, Darling is a product of Build With Aly Services **";


const CREAM = "#FDF6E9";
const PINK = "#F5B6D0";
const INK = "#231A1D";
const LINE = "#3A2E32";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;

export interface ReceiptSummary {
  id: string;
  receiptNumber: string;
  product: BillingProduct;
  description: string;
  eventId: string | null;
  eventName: string | null;
  amountSen: number;
  currency: string;
  paidAt: string | null;
}

interface ReceiptRecord {
  id: string;
  product: BillingProduct;
  amountSen: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
  event: { name: string } | null;
  user: { name: string; email: string };
}

interface PurchaseForReceipt {
  id: string;
  product: BillingProduct;
  amountSen: number;
  currency: string;
  paidAt: Date | null;
  createdAt: Date;
  eventId: string | null;
  event: { name: string } | null;
}

function purchaseDate(purchase: { paidAt: Date | null; createdAt: Date }): Date {
  return purchase.paidAt ?? purchase.createdAt;
}

/**
 * Assigns sequential, per-year receipt numbers (`HD-YYYY-NN`) across all paid
 * purchases. A receipt's number is its chronological position within its year,
 * so numbers stay stable and unique for the business.
 */
async function assignReceiptNumbers(
  purchases: { id: string; paidAt: Date | null; createdAt: Date }[],
): Promise<Map<string, string>> {
  const numbers = new Map<string, string>();

  if (purchases.length === 0) {
    return numbers;
  }

  const years = new Set(
    purchases.map((purchase) => purchaseDate(purchase).getUTCFullYear()),
  );
  const yearWindows = [...years].flatMap((year) => {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return [
      { paidAt: { gte: start, lt: end } },
      { paidAt: null, createdAt: { gte: start, lt: end } },
    ];
  });

  const paidPurchases = await prisma.purchase.findMany({
    where: { status: "PAID", OR: yearWindows },
    select: { id: true, paidAt: true, createdAt: true },
  });

  paidPurchases.sort((a, b) => {
    const delta = purchaseDate(a).getTime() - purchaseDate(b).getTime();
    if (delta !== 0) {
      return delta;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const perYearCount = new Map<number, number>();
  for (const purchase of paidPurchases) {
    const year = purchaseDate(purchase).getUTCFullYear();
    const sequence = (perYearCount.get(year) ?? 0) + 1;
    perYearCount.set(year, sequence);
    numbers.set(purchase.id, `HD-${year}-${String(sequence).padStart(2, "0")}`);
  }

  return numbers;
}

function descriptionFor(
  product: BillingProduct,
  eventName: string | null,
): string {
  if (product === "PRO") {
    return "Hint, Darling Subscription Package - (Darling Pro)";
  }

  return eventName
    ? `Hint, Darling Subscription Package - (Event Pass - ${eventName})`
    : "Hint, Darling Subscription Package - (Event Pass)";
}

function toSummary(
  purchase: PurchaseForReceipt,
  receiptNumber: string,
): ReceiptSummary {
  return {
    id: purchase.id,
    receiptNumber,
    product: purchase.product,
    description: descriptionFor(purchase.product, purchase.event?.name ?? null),
    eventId: purchase.eventId,
    eventName: purchase.event?.name ?? null,
    amountSen: purchase.amountSen,
    currency: purchase.currency,
    paidAt: purchase.paidAt?.toISOString() ?? null,
  };
}

/** Every paid receipt belonging to this account, newest first. */
export async function listReceipts(userId: string): Promise<ReceiptSummary[]> {
  const purchases = await prisma.purchase.findMany({
    where: { userId, status: "PAID" },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      product: true,
      amountSen: true,
      currency: true,
      paidAt: true,
      createdAt: true,
      eventId: true,
      event: { select: { name: true } },
    },
  });

  const receiptNumbers = await assignReceiptNumbers(purchases);
  return purchases.map((purchase) =>
    toSummary(purchase, receiptNumbers.get(purchase.id) ?? ""),
  );
}

async function loadReceipt(
  userId: string,
  receiptId: string,
): Promise<ReceiptRecord> {
  const purchase = await prisma.purchase.findFirst({
    where: { id: receiptId, userId, status: "PAID" },
    select: {
      id: true,
      product: true,
      amountSen: true,
      currency: true,
      paidAt: true,
      createdAt: true,
      event: { select: { name: true } },
      user: { select: { name: true, email: true } },
    },
  });

  if (!purchase) {
    throw new HttpError(404, "Not found");
  }

  return purchase;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);
}

function formatAmount(amountSen: number): string {
  return `RM ${(amountSen / 100).toFixed(2)}`;
}

function logoPath(): string | null {
  const candidates = [
    fileURLToPath(new URL("../assets/receipt-logo.png", import.meta.url)),
    fileURLToPath(new URL("../../../client/public/logoHD.png", import.meta.url)),
    fileURLToPath(new URL("../../../client/dist/logoHD.png", import.meta.url)),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function horizontalRule(doc: PDFKit.PDFDocument, y: number): void {
  doc
    .moveTo(MARGIN, y)
    .lineTo(CONTENT_RIGHT, y)
    .lineWidth(0.8)
    .strokeColor(LINE)
    .stroke();
}

function drawWatermark(doc: PDFKit.PDFDocument): void {
  const label = "PAID";
  doc.save();
  doc
    .translate(PAGE_WIDTH / 2, PAGE_HEIGHT / 2 + 40)
    .rotate(-30, { origin: [0, 0] });
  doc
    .font("Helvetica-Bold")
    .fontSize(170)
    .fillColor(PINK)
    .fillOpacity(0.55);
  const width = doc.widthOfString(label);
  doc.text(label, -width / 2, -70);
  doc.fillOpacity(1);
  doc.restore();
}

/**
 * Renders a paid purchase as a one-page A4 PDF receipt. The layout follows the
 * Build With Aly Services receipt template: cream paper, pink brand header,
 * billed-to block, itemised description and a diagonal PAID watermark.
 */
export async function createReceiptPdf(
  userId: string,
  receiptId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const purchase = await loadReceipt(userId, receiptId);
  const date = purchase.paidAt ?? purchase.createdAt;
  const receiptNumbers = await assignReceiptNumbers([purchase]);
  const receiptNumber = receiptNumbers.get(purchase.id) ?? "";
  const logo = logoPath();

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: {
      Title: `Receipt ${receiptNumber}`,
      Author: BUSINESS_NAME,
      Subject: descriptionFor(purchase.product, purchase.event?.name ?? null),
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(CREAM);

  drawWatermark(doc);

  doc
    .font("Helvetica-Bold")
    .fontSize(21)
    .fillColor(PINK)
    .text(BUSINESS_NAME, MARGIN, 58);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(INK)
    .text(BUSINESS_SSM, MARGIN, 92);

  doc.font("Helvetica").fontSize(10.5).fillColor(INK);
  BUSINESS_ADDRESS.forEach((line, index) => {
    doc.text(line, MARGIN, 112 + index * 17);
  });

  if (logo) {
    try {
      doc.image(readFileSync(logo), CONTENT_RIGHT - 130, 42, { width: 130 });
    } catch (error) {
      console.error("Failed to draw receipt logo:", error);
    }
  }

  horizontalRule(doc, 180);

  doc
    .font("Helvetica-Bold")
    .fontSize(70)
    .fillColor(PINK)
    .text("Receipt", MARGIN, 214);

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(INK)
    .text(formatDate(date), CONTENT_RIGHT - 220, 250, {
      width: 220,
      align: "right",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(`Receipt No. ${receiptNumber}`, CONTENT_RIGHT - 220, 270, {
      width: 220,
      align: "right",
    });

  horizontalRule(doc, 300);

  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(INK)
    .text("Billed to person/business:", MARGIN, 316);

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(INK)
    .text(purchase.user.name, MARGIN, 342, { width: 360 });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(INK)
    .text(purchase.user.email, MARGIN, 360, { width: 360 });

  horizontalRule(doc, 410);

  const tableHeaderY = 426;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text("Description", MARGIN, tableHeaderY);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text("Amount", CONTENT_RIGHT - 140, tableHeaderY, {
      width: 140,
      align: "right",
    });

  horizontalRule(doc, 448);

  const rowY = 466;
  const description = descriptionFor(
    purchase.product,
    purchase.event?.name ?? null,
  );
  const descriptionHeight = doc
    .font("Helvetica")
    .fontSize(10.5)
    .heightOfString(description, { width: 350 });

  doc.fillColor(INK).text(description, MARGIN, rowY, { width: 350 });
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(INK)
    .text(formatAmount(purchase.amountSen), CONTENT_RIGHT - 140, rowY, {
      width: 140,
      align: "right",
    });

  const totalY = rowY + Math.max(descriptionHeight, 14) + 34;
  doc
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .fillColor(INK)
    .text("Total", CONTENT_RIGHT - 280, totalY, {
      width: 140,
      align: "right",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(11.5)
    .fillColor(INK)
    .text(formatAmount(purchase.amountSen), CONTENT_RIGHT - 140, totalY, {
      width: 140,
      align: "right",
    });

  const footerTop = PAGE_HEIGHT - 150;
  horizontalRule(doc, footerTop);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK)
    .text("Thank You For Choosing Us!", 0, footerTop + 20, {
      width: PAGE_WIDTH,
      align: "center",
    });
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(INK)
    .text(BUSINESS_PHONE, 0, footerTop + 44, {
      width: PAGE_WIDTH,
      align: "center",
    });
  doc.text(BUSINESS_EMAIL, 0, footerTop + 62, {
    width: PAGE_WIDTH,
    align: "center",
  });
  doc
    .text(FOOTNOTE, 0, footerTop + 80, {
      width: PAGE_WIDTH,
      align: "center",
      underline: true,
    });

  horizontalRule(doc, PAGE_HEIGHT - 42);

  doc.end();

  const buffer = await done;
  return {
    buffer,
    filename: `hint-darling-receipt-${receiptNumber}.pdf`,
  };
}
