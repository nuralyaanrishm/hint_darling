import { z } from "zod";
import { HttpError } from "./errors.js";

export const registerSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .max(254, "Email must be 254 characters or fewer")
    .email("Enter a valid email address"),
  password: z
    .string({ error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password must be 200 characters or fewer"),
});

export const loginSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required")
    .max(200, "Password must be 200 characters or fewer"),
});

const emailField = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email must be 254 characters or fewer")
  .email("Enter a valid email address");

export const verifyEmailSchema = z.object({
  email: emailField,
  code: z.preprocess(
    (value) => (typeof value === "number" ? String(value) : value),
    z
      .string({ error: "Verification code is required" })
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
  ),
});

export const resendVerificationSchema = z.object({
  email: emailField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// ---------------------------------------------------------------------------
// Events and wishlists
// ---------------------------------------------------------------------------

/** Every occasion the UI can offer (mirrors the Prisma `EventType` enum). */
export const eventTypeSchema = z.enum([
  "WEDDING",
  "ENGAGEMENT",
  "BIRTHDAY",
  "ANNIVERSARY",
  "GRADUATION",
  "BABY_SHOWER",
  "HOUSEWARMING",
  "FESTIVE",
  "CHRISTMAS",
  "OTHER",
]);

const MAX_URL_LENGTH = 2048;

/** Allows only web links; rejects `javascript:`, `data:`, `file:` and friends. */
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function blankToNull(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const nullableText = (max: number, label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .max(max, `${label} must be ${max} characters or fewer`)
      .nullable()
      .optional(),
  );

const urlField = z
  .string()
  .max(MAX_URL_LENGTH, "URL must be 2048 characters or fewer")
  .url("Enter a valid URL")
  .refine(isSafeHttpUrl, "Only http and https links are allowed");

const nullableUrl = z.preprocess(blankToNull, urlField.nullable().optional());

/** Accepts an ISO date string, or `""`/null to clear. */
const nullableDate = z.preprocess((value) => {
  if (value === null) return null;
  if (typeof value !== "string") return value;
  if (value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}, z.date({ error: "Enter a valid date" }).nullable().optional());

const optionalPrice = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? Number(value) : value;
}, z
  .number({ error: "Enter a valid price" })
  .min(0, "Price cannot be negative")
  .max(9_999_999.99, "Price is too large")
  .optional());

const nullablePrice = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" ? Number(value) : value;
}, z
  .number({ error: "Enter a valid price" })
  .min(0, "Price cannot be negative")
  .max(9_999_999.99, "Price is too large")
  .nullable()
  .optional());

const optionalQuantity = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? undefined : value),
  z
    .coerce.number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(999, "Quantity must be 999 or fewer")
    .optional(),
);

/** Optional map latitude, clearing with `""`/null. */
const nullableLatitude = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .number({ error: "Enter a valid latitude" })
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90")
    .nullable()
    .optional(),
);

/** Optional map longitude, clearing with `""`/null. */
const nullableLongitude = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .number({ error: "Enter a valid longitude" })
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180")
    .nullable()
    .optional(),
);

const optionalCurrency = z.preprocess(
  (value) => (value === undefined || value === null || value === "" ? undefined : value),
  z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code")
    .optional(),
);

const itemName = z
  .string({ error: "Name is required" })
  .trim()
  .min(1, "Name is required")
  .max(160, "Name must be 160 characters or fewer");

function requireCoordinatePair(
  data: { latitude?: number | null; longitude?: number | null },
  ctx: z.RefinementCtx,
) {
  const hasLatitude = typeof data.latitude === "number";
  const hasLongitude = typeof data.longitude === "number";

  if (hasLatitude !== hasLongitude) {
    ctx.addIssue({
      code: "custom",
      path: [hasLatitude ? "longitude" : "latitude"],
      message: "Choose both a latitude and longitude, or neither.",
    });
  }
}

export const createEventSchema = z
  .object({
    name: z
      .string({ error: "Name is required" })
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer"),
    type: eventTypeSchema,
    eventDate: nullableDate,
    description: nullableText(2000, "Description"),
    location: nullableText(200, "Location"),
    latitude: nullableLatitude,
    longitude: nullableLongitude,
  })
  .superRefine(requireCoordinatePair);

export const updateEventSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer")
      .optional(),
    type: eventTypeSchema.optional(),
    eventDate: nullableDate,
    description: nullableText(2000, "Description"),
    location: nullableText(200, "Location"),
    latitude: nullableLatitude,
    longitude: nullableLongitude,
  })
  .superRefine(requireCoordinatePair);

/** How discoverable a wishlist is to guests (mirrors the Prisma enum). */
export const privacyModeSchema = z.enum(["PUBLIC", "LINK_ONLY", "PRIVATE"]);

export const createWishlistSchema = z.object({
  title: z
    .string({ error: "Title is required" })
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or fewer"),
  description: nullableText(2000, "Description"),
  privacyMode: privacyModeSchema.optional(),
});

export const updateWishlistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or fewer")
    .optional(),
  description: nullableText(2000, "Description"),
  privacyMode: privacyModeSchema.optional(),
});

export const createWishlistItemSchema = z.object({
  name: itemName,
  productUrl: nullableUrl,
  imageUrl: nullableUrl,
  price: optionalPrice,
  currency: optionalCurrency,
  description: nullableText(2000, "Description"),
  preferredColour: nullableText(80, "Preferred colour"),
  preferredSize: nullableText(80, "Preferred size"),
  preferredVariation: nullableText(120, "Preferred variation"),
  quantity: optionalQuantity,
  notes: nullableText(2000, "Notes"),
});

export const updateWishlistItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(160, "Name must be 160 characters or fewer")
    .optional(),
  productUrl: nullableUrl,
  imageUrl: nullableUrl,
  price: nullablePrice,
  currency: optionalCurrency,
  description: nullableText(2000, "Description"),
  preferredColour: nullableText(80, "Preferred colour"),
  preferredSize: nullableText(80, "Preferred size"),
  preferredVariation: nullableText(120, "Preferred variation"),
  quantity: optionalQuantity,
  notes: nullableText(2000, "Notes"),
});

export const reorderItemsSchema = z.object({
  itemIds: z
    .array(z.string().trim().min(1))
    .min(1, "Provide at least one item")
    .max(500, "Too many items to reorder")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Item order must not contain duplicates",
    ),
});

export const createClaimSchema = z.object({
  /** Optional gift-giver display name. Kept private from every public view. */
  claimantName: nullableText(120, "Name"),
  /** Client-generated key that makes an accidental double-submit idempotent. */
  idempotencyKey: z
    .string()
    .trim()
    .min(1, "Provide an idempotency key")
    .max(100, "Idempotency key is too long")
    .optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateWishlistInput = z.infer<typeof createWishlistSchema>;
export type UpdateWishlistInput = z.infer<typeof updateWishlistSchema>;
export type CreateWishlistItemInput = z.infer<typeof createWishlistItemSchema>;
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemSchema>;
export type ReorderItemsInput = z.infer<typeof reorderItemsSchema>;
export type CreateClaimInput = z.infer<typeof createClaimSchema>;

/** Shape of a single field error returned to the client. */
export interface FieldError {
  field: string;
  message: string;
}

/** Converts a ZodError into the flat field-error list the frontend expects. */
export function formatZodError(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "_root",
    message: issue.message,
  }));
}

/**
 * Validates `body` against `schema`, throwing a 400 `HttpError` with per-field
 * messages when it fails. Keeps route handlers free of repeated parse checks.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "Please check the form and try again.",
      formatZodError(parsed.error),
    );
  }

  return parsed.data;
}
