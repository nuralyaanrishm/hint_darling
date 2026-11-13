import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSeries,
  SERIES_DAYS,
  startOfUtcDay,
  utcDayKey,
} from "../lib/adminSeries.js";

// Pure day-bucketing rules for the admin dashboard. No database involved, so
// these run everywhere the rest of the suite would skip.

describe("admin activity series", () => {
  it("fills every day in the window, oldest first", () => {
    const windowStart = new Date("2026-10-15T00:00:00.000Z");
    const points = buildSeries(windowStart, [], [], []);

    assert.equal(points.length, SERIES_DAYS);
    assert.equal(points[0]?.date, "2026-10-15");
    assert.equal(points[points.length - 1]?.date, "2026-11-13");
    assert.deepEqual(points[0], {
      date: "2026-10-15",
      signups: 0,
      claims: 0,
      revenueSen: 0,
    });
  });

  it("buckets signups, claims and paid revenue by UTC day", () => {
    const windowStart = new Date("2026-11-01T00:00:00.000Z");
    const points = buildSeries(
      windowStart,
      [
        { createdAt: new Date("2026-11-01T00:00:00.000Z") },
        { createdAt: new Date("2026-11-01T23:59:59.999Z") },
        { createdAt: new Date("2026-11-02T10:00:00.000Z") },
      ],
      [{ claimedAt: new Date("2026-11-02T05:00:00.000Z") }],
      [
        { paidAt: new Date("2026-11-01T12:00:00.000Z"), amountSen: 990 },
        { paidAt: null, amountSen: 9900 },
      ],
    );

    const byDate = new Map(points.map((point) => [point.date, point]));

    assert.equal(byDate.get("2026-11-01")?.signups, 2);
    assert.equal(byDate.get("2026-11-01")?.revenueSen, 990);
    assert.equal(byDate.get("2026-11-02")?.signups, 1);
    assert.equal(byDate.get("2026-11-02")?.claims, 1);
    // An unpaid row never carries a paidAt into the series.
    assert.equal(byDate.get("2026-11-02")?.revenueSen, 0);
  });

  it("ignores activity outside the window", () => {
    const windowStart = new Date("2026-11-01T00:00:00.000Z");
    const points = buildSeries(
      windowStart,
      [{ createdAt: new Date("2026-10-31T23:59:59.999Z") }],
      [{ claimedAt: new Date("2026-12-01T00:00:00.000Z") }],
      [{ paidAt: new Date("2026-10-31T12:00:00.000Z"), amountSen: 990 }],
    );

    assert.equal(
      points.reduce((sum, point) => sum + point.signups, 0),
      0,
    );
    assert.equal(
      points.reduce((sum, point) => sum + point.claims, 0),
      0,
    );
    assert.equal(
      points.reduce((sum, point) => sum + point.revenueSen, 0),
      0,
    );
  });

  it("anchors day keys and windows to UTC", () => {
    const date = new Date("2026-11-13T22:30:00.000Z");

    assert.equal(utcDayKey(date), "2026-11-13");
    assert.equal(
      startOfUtcDay(date).toISOString(),
      "2026-11-13T00:00:00.000Z",
    );
  });
});
