import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  oauthStateMatches,
  safeReturnPath,
} from "../lib/googleOAuth.js";

describe("Google OAuth helpers", () => {
  it("only allows same-site return paths", () => {
    assert.equal(safeReturnPath("/dashboard"), "/dashboard");
    assert.equal(
      safeReturnPath("/events/abc?tab=items"),
      "/events/abc?tab=items",
    );

    assert.equal(safeReturnPath("//evil.example"), null);
    assert.equal(safeReturnPath("https://evil.example"), null);
    assert.equal(safeReturnPath("/\\evil.example"), null);
    assert.equal(safeReturnPath("/bad\npath"), null);
    assert.equal(safeReturnPath(""), null);
    assert.equal(safeReturnPath(42), null);
  });

  it("requires the returned state to match the stored state exactly", () => {
    assert.equal(oauthStateMatches("abc123", "abc123"), true);
    assert.equal(oauthStateMatches("abc123", "abc124"), false);
    assert.equal(oauthStateMatches("abc123", undefined), false);
    assert.equal(oauthStateMatches(null, "abc123"), false);
    assert.equal(oauthStateMatches("", ""), false);
  });
});
