// Client-side mirror of the server pricing catalog. Amounts shown here must
// match `server/src/lib/plans.ts`; the server remains the source of truth for
// what is charged and enforced.

export type PlanTier = "FREE" | "PRO";

/** Products that can be bought with a one-time checkout. */
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
  claimStatus: boolean;
  claimNames: boolean;
  mediaNotes: boolean;
  prioritySupport: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  label: string;
  shortLabel: string;
  priceSen: number;
  priceNote: "one-time" | "per event";
  /** Concurrent events with an active wishlist; null means unlimited. */
  activeEventLimit: number | null;
  /** Gifts per wishlist without an Event Pass; null means unlimited. */
  itemLimit: number | null;
  features: PlanFeatures;
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

export const PLAN_ORDER: readonly PlanTier[] = ["FREE", "PRO"];

/** Pricing table columns, left to right. */
export type PricingProduct = PlanTier | "EVENT_PASS";

export const PRICING_PRODUCTS: readonly PricingProduct[] = [
  "FREE",
  "EVENT_PASS",
  "PRO",
];

export interface PricingColumn {
  key: PricingProduct;
  label: string;
  shortLabel: string;
  priceSen: number;
  priceNote: "one-time" | "per event";
  activeEventLimit: number | null;
  itemLimit: number | null;
  features: PlanFeatures;
  comingSoon: PlanFeatureKey[];
  /** Event Pass is not a plan tier, so it has no "you are here" state. */
  isPlan: boolean;
}

export const PLAN_CATALOG: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    label: "Darling Free",
    shortLabel: "Free",
    priceSen: 0,
    priceNote: "one-time",
    activeEventLimit: 1,
    itemLimit: 5,
    features: {
      shareableLink: true,
      eventDetails: true,
      claimStatus: true,
      claimNames: false,
      mediaNotes: false,
      prioritySupport: false,
    },
    comingSoon: [],
  },
  PRO: {
    tier: "PRO",
    label: "Darling Pro",
    shortLabel: "Pro",
    priceSen: 9900,
    priceNote: "one-time",
    activeEventLimit: 10,
    itemLimit: null,
    features: {
      shareableLink: true,
      eventDetails: true,
      claimStatus: true,
      claimNames: true,
      mediaNotes: true,
      prioritySupport: true,
    },
    comingSoon: ["mediaNotes"],
  },
};

export const EVENT_PASS: EventPassDefinition = {
  product: "EVENT_PASS",
  label: "Event Pass",
  shortLabel: "Event Pass",
  priceSen: 990,
  priceNote: "per event",
  features: {
    shareableLink: true,
    eventDetails: true,
    claimStatus: true,
    claimNames: true,
    mediaNotes: true,
    prioritySupport: true,
  },
  comingSoon: ["mediaNotes"],
};

export const PRICING_COLUMNS: Record<PricingProduct, PricingColumn> = {
  FREE: {
    key: "FREE",
    ...PLAN_CATALOG.FREE,
    isPlan: true,
  },
  EVENT_PASS: {
    key: "EVENT_PASS",
    ...EVENT_PASS,
    // A pass unlocks one event; it does not add plan slots.
    activeEventLimit: 1,
    itemLimit: null,
    isPlan: false,
  },
  PRO: {
    key: "PRO",
    ...PLAN_CATALOG.PRO,
    isPlan: true,
  },
};

/** True when the price is a limited-time launch offer. */
export const PRO_IS_LAUNCH_PRICE = true;

export const PLAN_FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  shareableLink: "Shareable link",
  eventDetails: "Event details",
  claimStatus: "See what's reserved",
  claimNames: "See who reserved it",
  mediaNotes: "Video/Image note from guests",
  prioritySupport: "Priority support",
};

export const PLAN_FEATURE_ORDER: readonly PlanFeatureKey[] = [
  "shareableLink",
  "eventDetails",
  "claimStatus",
  "claimNames",
  "mediaNotes",
  "prioritySupport",
];

export function planRank(plan: PlanTier): number {
  return PLAN_ORDER.indexOf(plan);
}

export function isPaidPlan(plan: PlanTier): boolean {
  return plan !== "FREE";
}

export function formatPlanPrice(priceSen: number): string {
  const amount = priceSen / 100;
  return `RM ${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
