// One-time plan tiers (Darling Free, Plus and Pro). Prices, limits and feature
// flags live here so the API, billing endpoint and guards cannot disagree.

export type PlanTierName = "FREE" | "PLUS" | "PRO";

export type PlanFeatureKey =
  | "shareableLink"
  | "eventDetails"
  | "claimTracking"
  | "prioritySupport"
  | "guestMediaNotes";

export interface PlanFeatures {
  shareableLink: boolean;
  eventDetails: boolean;
  claimTracking: boolean;
  prioritySupport: boolean;
  guestMediaNotes: boolean;
}

export interface PlanDefinition {
  tier: PlanTierName;
  /** Marketing name shown in the pricing table. */
  label: string;
  shortLabel: string;
  /** One-time price in sen, which is what ToyyibPay expects. */
  priceSen: number;
  /** Null means unlimited. */
  activeWishlistLimit: number | null;
  /** Gifts per wishlist. Null means unlimited. */
  itemLimit: number | null;
  features: PlanFeatures;
  /** Included features whose UI/flow is still a placeholder. */
  comingSoon: PlanFeatureKey[];
}

/** Tiers in ascending order. Free cannot be purchased. */
export const PLAN_ORDER: readonly PlanTierName[] = ["FREE", "PLUS", "PRO"];

/** Tiers that can be bought with a one-time ToyyibPay checkout. */
export const PAID_PLANS: readonly Exclude<PlanTierName, "FREE">[] = [
  "PLUS",
  "PRO",
];

export const FREE_ITEM_LIMIT = 5;

export const UNLOCK_CURRENCY = "MYR";

const EVERYTHING: PlanFeatures = {
  shareableLink: true,
  eventDetails: true,
  claimTracking: true,
  prioritySupport: true,
  guestMediaNotes: true,
};

export const PLAN_CONFIG: Record<PlanTierName, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    label: "Darling Free",
    shortLabel: "Free",
    priceSen: 0,
    activeWishlistLimit: 1,
    itemLimit: FREE_ITEM_LIMIT,
    features: {
      shareableLink: true,
      eventDetails: true,
      claimTracking: false,
      prioritySupport: false,
      guestMediaNotes: false,
    },
    comingSoon: [],
  },
  PLUS: {
    tier: "PLUS",
    label: "Darling Plus",
    shortLabel: "Plus",
    priceSen: 990,
    activeWishlistLimit: 3,
    itemLimit: null,
    features: {
      ...EVERYTHING,
      guestMediaNotes: false,
    },
    comingSoon: [],
  },
  PRO: {
    tier: "PRO",
    label: "Darling Pro",
    shortLabel: "Pro",
    priceSen: 1990,
    activeWishlistLimit: null,
    itemLimit: null,
    features: EVERYTHING,
    comingSoon: ["guestMediaNotes"],
  },
};

export function isPlanTier(value: unknown): value is PlanTierName {
  return value === "FREE" || value === "PLUS" || value === "PRO";
}

export function planRank(plan: PlanTierName): number {
  return PLAN_ORDER.indexOf(plan);
}

export function isPaidPlan(plan: PlanTierName): boolean {
  return plan !== "FREE";
}

/** True when the plan includes gift reservation tracking. */
export function hasClaimTracking(plan: PlanTierName): boolean {
  return PLAN_CONFIG[plan].features.claimTracking;
}

/** Gift limit per wishlist, or null for unlimited. */
export function itemLimitFor(plan: PlanTierName): number | null {
  return PLAN_CONFIG[plan].itemLimit;
}

/** Active wishlist limit, or null for unlimited. */
export function activeWishlistLimitFor(plan: PlanTierName): number | null {
  return PLAN_CONFIG[plan].activeWishlistLimit;
}

export function planDefinition(plan: PlanTierName): PlanDefinition {
  return PLAN_CONFIG[plan];
}
