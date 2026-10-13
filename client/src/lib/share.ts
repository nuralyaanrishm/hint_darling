// Sharing helpers for the public wishlist.
//
// Everything here is deliberately dependency-free so the share panel works in
// any browser: the Web Share API is used when it exists, the clipboard falls
// back to a hidden textarea, and WhatsApp is just a deep link.

/** Route prefix for public wishlists. */
export const PUBLIC_WISHLIST_PREFIX = "/w/";

/** Path (no origin) for a wishlist's public page. */
export function publicWishlistPath(shareToken: string): string {
  return `${PUBLIC_WISHLIST_PREFIX}${shareToken}`;
}

/** Absolute URL a guest can open, based on the current origin. */
export function publicWishlistUrl(shareToken: string): string {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${publicWishlistPath(shareToken)}`;
}

/** The prefilled message used for native and WhatsApp sharing. */
export function buildShareMessage(url: string): string {
  return `Here's our wishlist for our special day! 💗 If you'd like to get us a gift, you can find our wishlist here: ${url}`;
}

/** A WhatsApp deep link that opens the share sheet with our message. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** True when the browser supports the native share sheet (mostly mobile). */
export function canNativeShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

/** Opens the native share sheet, returning false if it is unavailable/closed. */
export async function nativeShare(data: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  if (!canNativeShare()) return false;

  try {
    await navigator.share(data);
    return true;
  } catch {
    // The guest dismissed the sheet; nothing to do.
    return false;
  }
}

/** Copies text, falling back to a hidden textarea on insecure origins. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}
