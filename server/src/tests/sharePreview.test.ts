import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { injectShareMeta } from "../lib/sharePreview.js";

// Pure-function tests for the server-rendered link-preview metadata. These do
// not need a database.

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <title>Hint, Darling — default</title>
    <meta name="description" content="Default description" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Default title" />
    <meta name="twitter:card" content="summary" />
  </head>
  <body><div id="app"></div></body>
</html>`;

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("link preview metadata", () => {
  it("replaces the title and injects wishlist Open Graph tags", () => {
    const html = injectShareMeta(TEMPLATE, {
      title: "Emma & James · Our Wedding Wishlist",
      description: "A few things we'd treasure.",
      url: "https://example.com/w/abc123",
      image: "https://example.com/air-fryer.jpg",
    });

    assert.match(html, /<title>Emma &amp; James · Our Wedding Wishlist<\/title>/);
    assert.match(
      html,
      /property="og:title" content="Emma &amp; James · Our Wedding Wishlist"/,
    );
    assert.match(
      html,
      /property="og:description" content="A few things we&#39;d treasure\."/,
    );
    assert.match(
      html,
      /property="og:url" content="https:\/\/example\.com\/w\/abc123"/,
    );
    assert.match(
      html,
      /property="og:image" content="https:\/\/example\.com\/air-fryer\.jpg"/,
    );
    assert.match(
      html,
      /name="description" content="A few things we&#39;d treasure\."/,
    );
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  });

  it("does not duplicate tags when the same page is processed twice", () => {
    const data = {
      title: "Emma & James",
      description: "Our wishlist",
      url: "https://example.com/w/abc123",
      image: "https://example.com/gift.jpg",
    };

    const once = injectShareMeta(TEMPLATE, data);
    const twice = injectShareMeta(once, data);

    assert.equal(count(twice, 'property="og:title"'), 1);
    assert.equal(count(twice, 'property="og:description"'), 1);
    assert.equal(count(twice, 'name="twitter:card"'), 1);
  });

  it("escapes untrusted content and omits the image when there is none", () => {
    const html = injectShareMeta(TEMPLATE, {
      title: 'A "gift" <script>alert(1)</script>',
      description: "Tom & Jerry's",
      url: "https://example.com/w/abc123",
      image: null,
    });

    assert.equal(html.includes("<script>alert(1)</script>"), false);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(html.includes('property="og:image"'), false);
    assert.equal(html.includes('name="twitter:image"'), false);
    assert.match(html, /name="twitter:card" content="summary"/);
  });
});
