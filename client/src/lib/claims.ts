// Local claim memory.
//
// When a guest (or any visitor) claims a gift, the API returns a one-time
// management token. We keep that token on this device so the gift-giver can
// get back to their claim (view/cancel) without an account. The token is
// secret, so it never leaves the browser via any public request — it is only
// sent back to the management endpoints, which require it.

/** Key under which remembered claims are stored (one entry per gift). */
const STORAGE_KEY = "hd_claims";

export interface StoredClaim {
  itemId: string;
  itemName: string;
  /** Raw claim-management token returned at claim time. */
  token: string;
  claimantName: string | null;
  claimedAt: string;
}

interface ClaimsMap {
  [itemId: string]: StoredClaim;
}

function readAll(): ClaimsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as ClaimsMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: ClaimsMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage may be unavailable (private mode, quota). The claim still works;
    // the guest simply can't be reminded of their management link later.
  }
}

/** Remembers a freshly issued claim token for this device. */
export function rememberClaim(claim: StoredClaim) {
  writeAll({ ...readAll(), [claim.itemId]: claim });
}

/** Returns this device's stored claim for a gift, if any. */
export function getClaimForItem(itemId: string): StoredClaim | null {
  return readAll()[itemId] ?? null;
}

/** Returns every stored claim mapping (item id → claim). */
export function listClaims(): StoredClaim[] {
  return Object.values(readAll());
}

/** Forgets a stored claim (e.g. after the gift was released or re-claimed). */
export function forgetClaim(itemId: string) {
  const map = readAll();
  if (!(itemId in map)) return;
  const { [itemId]: _removed, ...rest } = map;
  writeAll(rest);
}

/** The route of a gift-giver's private claim-management page. */
export function claimManagePath(token: string): string {
  return `/claim/${encodeURIComponent(token)}`;
}

/** Absolute URL of a gift-giver's private claim-management page. */
export function claimManageUrl(token: string): string {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${claimManagePath(token)}`;
}