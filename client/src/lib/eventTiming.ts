// Client-side helpers for an event's gifting window.
//
// The event form collects a calendar date plus an optional time. The start
// instant is composed in the owner's local timezone and sent as an absolute ISO
// timestamp, so the countdown and the server-side cutoff always agree.

/** Builds the absolute start instant from the form's date + optional time. */
export function composeStartsAt(date: string, time: string): string | null {
  if (!date) return null;
  const value = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

/** Splits a stored instant back into local date/time values for editing. */
export function splitStartsAt(iso: string | null): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "", time: "" };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: "", time: "" };

  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Splits remaining milliseconds into whole days/hours/minutes/seconds. */
export function countdownParts(remainingMs: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Short label for chips: "12d 4h", "4h 12m", "3m 9s". Seconds only appear in
 * the last minutes, where they actually convey urgency.
 */
export function compactCountdown(remainingMs: number): string {
  const { days, hours, minutes, seconds } = countdownParts(remainingMs);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/** "Saturday, 12 September 2026 at 6:00 PM" in the viewer's locale. */
export function formatStartsAt(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
