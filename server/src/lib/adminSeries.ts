/**
 * Day buckets for the admin dashboard's activity series.
 *
 * Kept free of Prisma so the bucketing rules can be unit-tested without a
 * database. Every point is one UTC day; days without activity stay in the
 * array with zeroes so the chart keeps a constant width.
 */

export const SERIES_DAYS = 30;

export interface SeriesPoint {
  date: string;
  signups: number;
  claims: number;
  revenueSen: number;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** `YYYY-MM-DD` in UTC, matching the day buckets the series uses. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildSeries(
  windowStart: Date,
  signups: { createdAt: Date }[],
  claims: { claimedAt: Date }[],
  purchases: { paidAt: Date | null; amountSen: number }[],
): SeriesPoint[] {
  const points: SeriesPoint[] = Array.from(
    { length: SERIES_DAYS },
    (_, index) => {
      const day = new Date(windowStart);
      day.setUTCDate(day.getUTCDate() + index);
      return { date: utcDayKey(day), signups: 0, claims: 0, revenueSen: 0 };
    },
  );
  const byDate = new Map(points.map((point) => [point.date, point]));

  for (const user of signups) {
    const point = byDate.get(utcDayKey(user.createdAt));
    if (point) {
      point.signups += 1;
    }
  }

  for (const claim of claims) {
    const point = byDate.get(utcDayKey(claim.claimedAt));
    if (point) {
      point.claims += 1;
    }
  }

  for (const purchase of purchases) {
    if (!purchase.paidAt) {
      continue;
    }

    const point = byDate.get(utcDayKey(purchase.paidAt));
    if (point) {
      point.revenueSen += purchase.amountSen;
    }
  }

  return points;
}
