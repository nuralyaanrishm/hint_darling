// Gifting window rules.
//
// Gifts can be claimed until the event starts. At the start moment the public
// wishlist becomes read-only; the owner can still edit everything, and a
// gift-giver can still release their own reservation. An event with no start
// time never closes, so events without a date behave as they always have.

/** Machine-readable code returned when the gifting window has closed. */
export const GIFTS_CLOSED_CODE = "EVENT_STARTED";

/**
 * True when the event has started and gift claiming is therefore closed.
 * `now` is injectable so tests never have to sleep.
 */
export function isGiftingClosed(
  startsAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return startsAt != null && now.getTime() >= startsAt.getTime();
}

/** The 409 message shown to a guest who tried to claim too late. */
export function giftsClosedMessage(eventName: string): string {
  return `Gifting has closed — ${eventName} has already started.`;
}
