// Pricing catalog. Free is a plan, Pro is a lifetime plan, and the Event Pass is
// a one-time per-event unlock. Prices, limits and feature flags live here so the
// API, billing endpoints and guards cannot disagree.

export type PlanTierName = "FREE" | "PRO";

/** Products that can be bought with a one-time ToyyibPay checkout. */
export type BillingProduct = "EVENT_PASS" | "PRO";

export type PlanFeatureKey =
  | "shareableLink"
  | "eventDetails"
  | "claimStatus"
  | "claimNames"
  | "mediaNotes"
  | "prioritySupport";

export interface PlanFeatures {
  shareableLink: boolean;
  eventDetails: boolean;
  /** See how many gifts are reserved. Public information, free for everyone. */
  claimStatus: boolean;
  /** See the display name a guest left when reserving a gift. */
  claimNames: boolean;
  mediaNotes: boolean;
  prioritySupport: boolean;
}

export interface PlanDefinition {
  tier: PlanTierName;
  /** Marketing name shown in the pricing table. */
  label: string;
  shortLabel: string;
  /** One-time price in sen, which is what ToyyibPay expects. */
  priceSen: number;
  /** How the price reads in the pricing table. */
  priceNote: "one-time" | "per event";
  /** Concurrent events with an active wishlist. Null means unlimited. */
  activeEventLimit: number | null;
  /** Gifts per wishlist on an event without an Event Pass. */
  itemLimit: number | null;
  features: PlanFeatures;
  /** Included features whose UI/flow is still a placeholder. */
  comingSoon: PlanFeatureKey[];
}

export interface EventPassDefinition {
  product: "EVENT_PASS";
  label: string;
  shortLabel: string;
  priceSen: number;
  priceNote: "per event";
  features: PlanFeatures;
  comingSoon: PlanFeatureKey[];
}

/** Tiers in ascending order. Free cannot be purchased. */
export const PLAN_ORDER: readonly PlanTierName[] = ["FREE", "PRO"];

/** Paid products, in the order the checkout dialog offers them. */
export const BILLING_PRODUCTS: readonly BillingProduct[] = ["EVENT_PASS", "PRO"];

export const FREE_ITEM_LIMIT = 5;

export const FREE_ACTIVE_EVENT_LIMIT = 1;

export const PRO_ACTIVE_EVENT_LIMIT = 10;

export const EVENT_PASS_PRICE_SEN = 990;

export const PRO_PRICE_SEN = 9900;

/** Shown in the pricing table as a limited-time launch price. */
export const PRO_IS_LAUNCH_PRICE = true;

export const UNLOCK_CURRENCY = "MYR";

const FREE_FEATURES: PlanFeatures = {
  shareableLink: true,
  eventDetails: true,
  claimStatus: true,
  claimNames: false,
  mediaNotes: false,
  prioritySupport: false,
};

const PRO_FEATURES: PlanFeatures = {
  shareableLink: true,
  eventDetails: true,
  claimStatus: true,
  claimNames: true,
  mediaNotes: true,
  prioritySupport: true,
};

export const PLAN_CONFIG: Record<PlanTierName, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    label: "Darling Free",
    shortLabel: "Free",
    priceSen: 0,
    priceNote: "one-time",
    activeEventLimit: FREE_ACTIVE_EVENT_LIMIT,
    itemLimit: FREE_ITEM_LIMIT,
    features: FREE_FEATURES,
    comingSoon: [],
  },
  PRO: {
    tier: "PRO",
    label: "Darling Pro",
    shortLabel: "Pro",
    priceSen: PRO_PRICE_SEN,
    priceNote: "one-time",
    activeEventLimit: PRO_ACTIVE_EVENT_LIMIT,
    itemLimit: null,
    // Guest media notes are sold on Pro but are not built yet.
    features: PRO_FEATURES,
    comingSoon: ["mediaNotes"],
  },
};

export const EVENT_PASS: EventPassDefinition = {
  product: "EVENT_PASS",
  label: "Event Pass",
  shortLabel: "Event Pass",
  priceSen: EVENT_PASS_PRICE_SEN,
  priceNote: "per event",
  features: {
    ...PRO_FEATURES,
  },
  // A pass unlocks claim names, an unlimited list and priority support for one
  // event; media notes are still on the way.
  comingSoon: ["mediaNotes"],
};

export function isPlanTier(value: unknown): value is PlanTierName {
  return value === "FREE" || value === "PRO";
}

export function isBillingProduct(value: unknown): value is BillingProduct {
  return value === "EVENT_PASS" || value === "PRO";
}

export function planRank(plan: PlanTierName): number {
  return PLAN_ORDER.indexOf(plan);
}

export function isPaidPlan(plan: PlanTierName): boolean {
  return plan !== "FREE";
}

/**
 * Gift limit for one wishlist. An event unlocked with an Event Pass (or owned
 * by a Pro account) is unlimited; everything else falls back to the plan limit.
 */
export function itemLimitFor(
  plan: PlanTierName,
  eventUnlocked: boolean,
): number | null {
  if (eventUnlocked) {
    return null;
  }

  return PLAN_CONFIG[plan].itemLimit;
}

/** Concurrent active events included in the plan, or null for unlimited. */
export function activeEventLimitFor(plan: PlanTierName): number | null {
  return PLAN_CONFIG[plan].activeEventLimit;
}

/** True when the owner may see who reserved each gift on this event. */
export function canSeeClaimantNames(
  plan: PlanTierName,
  eventUnlocked: boolean,
): boolean {
  return eventUnlocked || PLAN_CONFIG[plan].features.claimNames;
}

export function planDefinition(plan: PlanTierName): PlanDefinition {
  return PLAN_CONFIG[plan];
}
