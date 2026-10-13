import { onBeforeUnmount, watch } from "vue";

// Lightweight document-head manager for the SPA.
//
// The public wishlist is opened directly from a WhatsApp link, so it needs a
// meaningful tab title and social preview tags. This composable sets the title,
// description and Open Graph / Twitter tags while a view is mounted, then
// restores the site defaults when it unmounts.

const DEFAULT_TITLE = "Hint, Darling — The art of giving, without the guesswork";
const DEFAULT_DESCRIPTION =
  "Hint, Darling is a beautiful wishlist and gift coordination platform for weddings, birthdays, engagements and more.";

interface ManagedTag {
  attr: "name" | "property";
  key: string;
}

const MANAGED_TAGS: ManagedTag[] = [
  { attr: "name", key: "description" },
  { attr: "property", key: "og:title" },
  { attr: "property", key: "og:description" },
  { attr: "property", key: "og:url" },
  { attr: "property", key: "og:image" },
  { attr: "property", key: "og:type" },
  { attr: "name", key: "twitter:card" },
  { attr: "name", key: "twitter:title" },
  { attr: "name", key: "twitter:description" },
  { attr: "name", key: "twitter:image" },
];

export interface PageMeta {
  title: string;
  description?: string;
  url?: string;
  image?: string | null;
  type?: string;
}

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    element.dataset.hdMeta = "true";
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function removeMetaTag(attr: "name" | "property", key: string) {
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    ?.remove();
}

function applyMeta(meta: PageMeta | null) {
  const title = meta?.title ?? DEFAULT_TITLE;
  const description = meta?.description ?? DEFAULT_DESCRIPTION;

  document.title = title;

  const values: Record<string, string | null> = {
    description,
    "og:title": title,
    "og:description": description,
    "og:url": meta?.url ?? null,
    "og:image": meta?.image ?? null,
    "og:type": meta?.type ?? "website",
    "twitter:card": meta?.image ? "summary_large_image" : "summary",
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": meta?.image ?? null,
  };

  for (const tag of MANAGED_TAGS) {
    const value = values[tag.key];
    if (value === null || value === undefined) {
      removeMetaTag(tag.attr, tag.key);
    } else {
      setMetaTag(tag.attr, tag.key, value);
    }
  }
}

/**
 * Reactively manages the document head from a getter. The getter is tracked,
 * so updating the underlying data (e.g. once the wishlist loads) re-applies the
 * metadata. Defaults are restored when the component unmounts.
 */
export function usePageMeta(getMeta: () => PageMeta | null): void {
  watch(getMeta, applyMeta, { immediate: true });

  onBeforeUnmount(() => applyMeta(null));
}
