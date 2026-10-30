// Free and Pro plan rules. The price and limit live here so the API, the
// billing endpoint and the item-creation guard can never disagree.

/** How many gifts a free account may add to each wishlist. */
export const FREE_ITEM_LIMIT = 5;

/** RM1.00 expressed in sen, which is what ToyyibPay expects. */
export const UNLOCK_PRICE_SEN = 100;

export const UNLOCK_CURRENCY = "MYR";

/** True once the account has bought the one-time unlock. */
export function isProUser(
  user: { proUnlockedAt: Date | null } | null | undefined,
): boolean {
  return Boolean(user?.proUnlockedAt);
}
