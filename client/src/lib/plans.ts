// Client-side mirror of the server plan catalog. Prices shown here must match
// `server/src/lib/plans.ts`; the server remains the source of truth for amounts
// charged and limits enforced.

export type PlanTier = "FREE" | "PLUS" | "PRO";

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
  tier: PlanTier;
  label: string;
  shortLabel: string;
  priceSen: number;
  activeWishlistLimit: number | null;
  itemLimit: number | null;
  features: PlanFeatures;
  comingSoon: PlanFeatureKey[];
}

export const PLAN_ORDER: readonly PlanTier[] = ["FREE", "PLUS", "PRO"];

export const PLAN_CATALOG: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    label: "Darling Free",
    shortLabel: "Free",
    priceSen: 0,
    activeWishlistLimit: 1,
    itemLimit: 5,
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
      shareableLink: true,
      eventDetails: true,
      claimTracking: true,
      prioritySupport: true,
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
    features: {
      shareableLink: true,
      eventDetails: true,
      claimTracking: true,
      prioritySupport: true,
      guestMediaNotes: true,
    },
    comingSoon: ["guestMediaNotes"],
  },
};

export const PLAN_FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  shareableLink: "Shareable link",
  eventDetails: "Event details",
  claimTracking: "Gift reservation tracking",
  prioritySupport: "Priority support",
  guestMediaNotes: "Video/Image note from guests",
};

export const PLAN_FEATURE_ORDER: readonly PlanFeatureKey[] = [
  "shareableLink",
  "eventDetails",
  "claimTracking",
  "prioritySupport",
  "guestMediaNotes",
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

export function nextPlan(plan: PlanTier): PlanTier | null {
  const index = PLAN_ORDER.indexOf(plan);
  return PLAN_ORDER[index + 1] ?? null;
}
