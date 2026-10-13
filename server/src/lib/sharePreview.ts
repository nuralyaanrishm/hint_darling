// Server-rendered link-preview metadata.
//
// The app is a single-page application, so a crawler opening /w/:token would
// only ever see the generic index.html. When the built client is served by this
// API (production / preview builds), we swap the title, description and Open
// Graph / Twitter tags for the wishlist's own details so WhatsApp and other
// link unfurlers show a meaningful preview.

export interface SharePreviewData {
  title: string;
  description: string;
  url: string;
  image: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rewrites a built index.html in place with per-wishlist metadata. Existing
 * static tags are replaced rather than duplicated, and any tags already present
 * are stripped first so repeated injection stays idempotent.
 */
export function injectShareMeta(
  html: string,
  data: SharePreviewData,
): string {
  const title = escapeHtml(data.title);
  const description = escapeHtml(data.description);
  const url = escapeHtml(data.url);

  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Hint, Darling" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="${data.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];

  if (data.image) {
    const image = escapeHtml(data.image);
    tags.push(`<meta property="og:image" content="${image}" />`);
    tags.push(`<meta name="twitter:image" content="${image}" />`);
  }

  // Drop any previously injected preview tags so this function is safe to run
  // on an already-processed document.
  let output = html
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, "");

  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  output = output.replace(
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${description}" />`,
  );
  output = output.replace(/<\/head>/i, `    ${tags.join("\n    ")}\n  </head>`);

  return output;
}
