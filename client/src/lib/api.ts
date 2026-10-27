// Small typed wrapper around the backend API.
// Requests use a relative path so the Vite dev proxy forwards them to Express.
// Session cookies are HTTP-only, and unsafe requests echo the CSRF cookie back
// in the X-CSRF-Token header (the server enforces this on every mutation).

const CSRF_COOKIE = "hd_csrf";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface HealthResponse {
  status: string;
  database: "connected" | "disconnected";
  timestamp: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface FieldError {
  field: string;
  message: string;
}

/** An error response from the API, including per-field validation messages. */
export class ApiError extends Error {
  readonly status: number;
  readonly fields: FieldError[];
  /** Optional machine-readable code such as `ALREADY_CLAIMED`. */
  readonly code?: string;

  constructor(
    status: number,
    message: string,
    fields: FieldError[] = [],
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`),
  );

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const body = data as
      | {
          error?: { message?: string; fields?: FieldError[]; code?: string };
        }
      | null;
    throw new ApiError(
      response.status,
      body?.error?.message ?? `Request failed with status ${response.status}`,
      body?.error?.fields ?? [],
      body?.error?.code,
    );
  }

  return data as T;
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const data = await request<{ user: AuthUser }>("/auth/me");
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  message: string;
  email: string;
}

/** Creates an unverified account and emails a code; no session is started. */
export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  return request<RegisterResult>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface VerifyEmailPayload {
  email: string;
  code: string;
}

/** Confirms the signup code and returns the now signed-in user. */
export async function verifyEmail(payload: VerifyEmailPayload): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.user;
}

/** Requests a fresh signup code. Always succeeds generically. */
export async function resendVerification(email: string): Promise<void> {
  await request<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await request<void>("/auth/logout", { method: "POST" });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Returned by login when the account exists but the email is not verified yet. */
export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";

// ---------------------------------------------------------------------------
// Events and wishlists
// ---------------------------------------------------------------------------

export type EventType =
  | "WEDDING"
  | "ENGAGEMENT"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "GRADUATION"
  | "BABY_SHOWER"
  | "HOUSEWARMING"
  | "FESTIVE"
  | "CHRISTMAS"
  | "OTHER";

/** How discoverable a wishlist is to guests. */
export type PrivacyMode = "PUBLIC" | "LINK_ONLY" | "PRIVATE";

export interface WishlistItemDto {
  id: string;
  name: string;
  productUrl: string | null;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  description: string | null;
  preferredColour: string | null;
  preferredSize: string | null;
  preferredVariation: string | null;
  quantity: number;
  notes: string | null;
  position: number;
  /** True when a gift-giver has reserved this gift. Never reveals who. */
  isClaimed: boolean;
  /** Number of active claims on this gift. At most one in this version. */
  claimedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistDto {
  id: string;
  eventId: string;
  title: string;
  description: string | null;
  shareToken: string;
  privacyMode: PrivacyMode;
  isActive: boolean;
  items: WishlistItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistSummary {
  id: string;
  title: string;
  itemCount: number;
  /** How many gifts on the list are currently reserved. Never reveals who. */
  claimedCount: number;
}

export interface EventSummary {
  id: string;
  name: string;
  type: EventType;
  eventDate: string | null;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  wishlist: WishlistSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventDetail extends Omit<EventSummary, "wishlist"> {
  wishlist: WishlistDto | null;
}

export interface EventInput {
  name: string;
  type: EventType;
  eventDate?: string | null;
  description?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface WishlistInput {
  title: string;
  description?: string | null;
  privacyMode?: PrivacyMode;
}

export interface WishlistItemInput {
  name: string;
  productUrl?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  currency?: string | null;
  description?: string | null;
  preferredColour?: string | null;
  preferredSize?: string | null;
  preferredVariation?: string | null;
  quantity?: number | null;
  notes?: string | null;
}

export async function listEvents(): Promise<EventSummary[]> {
  const data = await request<{ events: EventSummary[] }>("/events");
  return data.events;
}

export async function getEvent(id: string): Promise<EventDetail> {
  const data = await request<{ event: EventDetail }>(`/events/${id}`);
  return data.event;
}

export async function createEvent(payload: EventInput): Promise<EventDetail> {
  const data = await request<{ event: EventDetail }>("/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.event;
}

export async function updateEvent(
  id: string,
  payload: Partial<EventInput>,
): Promise<EventDetail> {
  const data = await request<{ event: EventDetail }>(`/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.event;
}

export async function deleteEvent(id: string): Promise<void> {
  await request<void>(`/events/${id}`, { method: "DELETE" });
}

export async function createWishlist(
  eventId: string,
  payload: WishlistInput,
): Promise<WishlistDto> {
  const data = await request<{ wishlist: WishlistDto }>(
    `/events/${eventId}/wishlist`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return data.wishlist;
}

export async function updateWishlist(
  eventId: string,
  payload: Partial<WishlistInput>,
): Promise<WishlistDto> {
  const data = await request<{ wishlist: WishlistDto }>(
    `/events/${eventId}/wishlist`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  return data.wishlist;
}

export async function addWishlistItem(
  wishlistId: string,
  payload: WishlistItemInput,
): Promise<WishlistItemDto> {
  const data = await request<{ item: WishlistItemDto }>(
    `/wishlists/${wishlistId}/items`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return data.item;
}

export async function updateWishlistItem(
  wishlistId: string,
  itemId: string,
  payload: Partial<WishlistItemInput>,
): Promise<WishlistItemDto> {
  const data = await request<{ item: WishlistItemDto }>(
    `/wishlists/${wishlistId}/items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  return data.item;
}

export async function deleteWishlistItem(
  wishlistId: string,
  itemId: string,
): Promise<void> {
  await request<void>(`/wishlists/${wishlistId}/items/${itemId}`, {
    method: "DELETE",
  });
}

export async function reorderWishlistItems(
  wishlistId: string,
  itemIds: string[],
): Promise<WishlistDto> {
  const data = await request<{ wishlist: WishlistDto }>(
    `/wishlists/${wishlistId}/items/reorder`,
    { method: "PATCH", body: JSON.stringify({ itemIds }) },
  );
  return data.wishlist;
}

// ---------------------------------------------------------------------------
// Public (guest) wishlist
// ---------------------------------------------------------------------------

/**
 * A gift as it is shown to guests. Deliberately narrower than `WishlistItemDto`:
 * private owner notes and any gift-giver information are never included, and
 * `claimedCount`/`isClaimed` describe availability without revealing who
 * claimed what.
 */
export interface PublicGift {
  id: string;
  name: string;
  productUrl: string | null;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  description: string | null;
  preferredColour: string | null;
  preferredSize: string | null;
  preferredVariation: string | null;
  quantity: number;
  claimedCount: number;
  /** True when the gift has been reserved by a gift-giver. */
  isClaimed: boolean;
  remaining: number;
  isFullyClaimed: boolean;
}

export interface PublicWishlist {
  title: string;
  description: string | null;
  event: {
    name: string;
    type: EventType;
    eventDate: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    description: string | null;
  };
  items: PublicGift[];
  updatedAt: string;
}

/**
 * Fetches a shared wishlist by its opaque token. No session is required. An
 * unknown, inactive or private list surfaces as an `ApiError` with status 404.
 */
export async function getPublicWishlist(
  shareToken: string,
): Promise<PublicWishlist> {
  const data = await request<{ wishlist: PublicWishlist }>(
    `/public/wishlists/${encodeURIComponent(shareToken)}`,
  );
  return data.wishlist;
}

// ---------------------------------------------------------------------------
// Gift claiming
// ---------------------------------------------------------------------------

/** Machine-readable code returned when another gift-giver already claimed the item. */
export const ALREADY_CLAIMED_CODE: string = "ALREADY_CLAIMED";

export interface ClaimResult {
  id: string;
  status: "CLAIMED";
  claimedAt: string;
  claimantName: string | null;
  /**
   * Raw claim-management token, returned exactly once to the gift-giver. It is
   * never stored by the server and never appears in any public wishlist view.
   */
  manageToken: string;
}

export interface ClaimPayload {
  claimantName?: string;
  idempotencyKey?: string;
}

/**
 * Claims a gift on a public wishlist. The request is idempotent: retrying with
 * the same `idempotencyKey` returns the same claim instead of creating a second
 * reserve. A `409` with `code === "ALREADY_CLAIMED"` means someone else got the
 * gift first.
 */
export async function claimGift(
  shareToken: string,
  itemId: string,
  payload: ClaimPayload = {},
): Promise<ClaimResult> {
  const data = await request<{ claim: ClaimResult }>(
    `/public/wishlists/${encodeURIComponent(shareToken)}/items/${encodeURIComponent(itemId)}/claims`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return data.claim;
}

export interface PublicClaimInfo {
  status: "CLAIMED" | "CANCELLED";
  claimedAt: string;
  cancelledAt: string | null;
  claimantName: string | null;
  gift: {
    name: string;
    imageUrl: string | null;
    price: string | null;
    currency: string;
  };
  event: { name: string };
}

/** Reads a claim using its management token (only safe for the token holder). */
export async function getClaimByToken(
  token: string,
): Promise<PublicClaimInfo> {
  const data = await request<{ claim: PublicClaimInfo }>(
    `/public/claims/${encodeURIComponent(token)}`,
  );
  return data.claim;
}

export interface CancelResult {
  status: "CANCELLED";
  cancelledAt: string;
}

/** Cancels a claim using its management token; releases the gift again. */
export async function cancelClaimByToken(token: string): Promise<CancelResult> {
  const data = await request<{ claim: CancelResult }>(
    `/public/claims/${encodeURIComponent(token)}/cancel`,
    { method: "POST" },
  );
  return data.claim;
}

// ---------------------------------------------------------------------------
// Signed-in gift-giver claims
// ---------------------------------------------------------------------------

/** A claim belonging to the signed-in gift-giver (never anyone else's). */
export interface MyClaim {
  id: string;
  status: "CLAIMED" | "CANCELLED";
  claimedAt: string;
  cancelledAt: string | null;
  /** The signed-in gift-giver's own display name, when they added one. */
  claimantName: string | null;
  gift: {
    id: string;
    name: string;
    imageUrl: string | null;
    price: string | null;
    currency: string;
  };
  event: {
    id: string;
    name: string;
    eventDate: string | null;
  };
}

/**
 * Lists the signed-in user's own claims. The server only ever returns the
 * caller's reservations, so another gift-giver's identity never appears here.
 */
export async function listMyClaims(): Promise<MyClaim[]> {
  const data = await request<{ claims: MyClaim[] }>("/claims");
  return data.claims;
}

/** Releases one of the signed-in user's own claims. */
export async function cancelMyClaim(claimId: string): Promise<CancelResult> {
  const data = await request<{ claim: CancelResult }>(
    `/claims/${encodeURIComponent(claimId)}/cancel`,
    { method: "POST" },
  );
  return data.claim;
}
