<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import PlanCheckoutDialog from "@/components/billing/PlanCheckoutDialog.vue";
import { useAuth } from "@/stores/auth";
import {
  PLAN_CATALOG,
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_ORDER,
  PLAN_ORDER,
  formatPlanPrice,
  planRank,
  type PlanFeatureKey,
  type PlanTier,
} from "@/lib/plans";

const router = useRouter();
const { isAuthenticated, currentPlan } = useAuth();

type PaidPlan = Exclude<PlanTier, "FREE">;

type PricingRow =
  | {
      kind: "limit";
      key: "activeWishlistLimit" | "itemLimit";
      label: string;
    }
  | { kind: "feature"; key: PlanFeatureKey; label: string };

const plans = PLAN_ORDER.map((tier) => PLAN_CATALOG[tier]);

const rows: PricingRow[] = [
  { kind: "limit", key: "activeWishlistLimit", label: "Active Event" },
  { kind: "limit", key: "itemLimit", label: "Gift items" },
  ...PLAN_FEATURE_ORDER.map((key) => ({
    kind: "feature" as const,
    key,
    label: PLAN_FEATURE_LABELS[key],
  })),
];

const headerClass: Record<PlanTier, string> = {
  FREE: "bg-plan-free",
  PLUS: "bg-plan-plus",
  PRO: "bg-plan-pro",
};

const selectedPlan = ref<PaidPlan | null>(null);
const checkoutOpen = ref(false);

const checkoutPlan = computed<PaidPlan>(() => selectedPlan.value ?? "PLUS");

function isCurrent(plan: PlanTier): boolean {
  return isAuthenticated.value && plan === currentPlan.value;
}

function isLower(plan: PlanTier): boolean {
  return isAuthenticated.value && planRank(plan) < planRank(currentPlan.value);
}

function ctaLabel(plan: PlanTier): string {
  if (isCurrent(plan)) return "Your plan";
  if (isLower(plan)) return "Included";
  if (plan === "FREE") return "Start free";
  return `Choose ${PLAN_CATALOG[plan].shortLabel}`;
}

function ctaDisabled(plan: PlanTier): boolean {
  return isCurrent(plan) || isLower(plan);
}

function ctaVariant(plan: PlanTier): "primary" | "secondary" {
  if (!isAuthenticated.value) return plan === "FREE" ? "secondary" : "primary";
  return planRank(plan) > planRank(currentPlan.value) ? "primary" : "secondary";
}

function choosePlan(plan: PlanTier) {
  if (ctaDisabled(plan)) return;

  if (plan === "FREE") {
    void router.push(isAuthenticated.value ? "/dashboard" : "/register");
    return;
  }

  if (!isAuthenticated.value) {
    void router.push("/register");
    return;
  }

  if (planRank(plan) <= planRank(currentPlan.value)) return;

  selectedPlan.value = plan;
  checkoutOpen.value = true;
}

function limitLabel(plan: PlanTier, key: "activeWishlistLimit" | "itemLimit") {
  const value = PLAN_CATALOG[plan][key];
  return value === null ? "Unlimited" : String(value);
}

function hasFeature(plan: PlanTier, key: PlanFeatureKey): boolean {
  return PLAN_CATALOG[plan].features[key];
}

function isSoon(plan: PlanTier, key: PlanFeatureKey): boolean {
  return PLAN_CATALOG[plan].comingSoon.includes(key);
}

function rowBackground(index: number): string {
  return index % 2 === 1 ? "bg-plan-row/80" : "bg-white";
}
</script>

<template>
  <section id="pro" class="scroll-mt-24 bg-white/50">
    <div class="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div class="mx-auto max-w-2xl space-y-4 text-center">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Pricing</p>
        <h2 class="text-balance font-display text-4xl text-ink sm:text-5xl">
          Plans &amp; Pricing
        </h2>
        <p class="text-ink/70">
          One-time payments. Choose the plan that fits your celebration — it's
          yours forever.
        </p>
      </div>

      <!-- Desktop comparison table -->
      <div class="mt-14 hidden md:block">
        <div
          class="grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] gap-3"
        >
          <div></div>
          <div
            v-for="plan in plans"
            :key="plan.tier"
            class="relative flex min-h-[9.5rem] flex-col items-center justify-center rounded-[1.4rem] border border-ink/15 px-4 py-6 text-center"
            :class="headerClass[plan.tier]"
          >
            <span
              v-if="plan.tier === 'PRO'"
              class="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-plan-popular px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm"
            >
              Most popular
            </span>
            <p class="text-lg font-semibold text-ink">{{ plan.label }}</p>
            <p class="mt-2 font-display text-4xl text-ink">
              {{ formatPlanPrice(plan.priceSen) }}
            </p>
            <p class="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink/55">
              One-time
            </p>
          </div>
        </div>

        <div class="mt-4 overflow-hidden rounded-[1.6rem] border border-ink/25">
          <div class="grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))]">
            <template v-for="(row, index) in rows" :key="row.label">
              <div
                class="flex items-center px-5 py-4 text-sm text-ink/85"
                :class="[
                  rowBackground(index),
                  index === 0 ? '' : 'border-t border-ink/15',
                ]"
              >
                {{ row.label }}
              </div>
              <div
                v-for="plan in plans"
                :key="`${row.label}-${plan.tier}`"
                class="flex items-center justify-center border-l border-ink/15 px-4 py-4 text-sm text-ink/85"
                :class="[
                  rowBackground(index),
                  index === 0 ? '' : 'border-t border-ink/15',
                ]"
              >
                <template v-if="row.kind === 'limit'">
                  {{ limitLabel(plan.tier, row.key) }}
                </template>
                <template v-else>
                  <span class="flex items-center justify-center">
                    <span
                      v-if="isSoon(plan.tier, row.key)"
                      class="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/55"
                    >
                      Soon
                    </span>
                    <span
                      v-else
                      class="flex h-6 w-6 items-center justify-center rounded-full text-white"
                      :class="
                        hasFeature(plan.tier, row.key)
                          ? 'bg-plan-free'
                          : 'bg-soft-pink'
                      "
                    >
                      <svg
                        v-if="hasFeature(plan.tier, row.key)"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      <svg
                        v-else
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                      <span class="sr-only">
                        {{
                          hasFeature(plan.tier, row.key)
                            ? "Included"
                            : "Not included"
                        }}
                      </span>
                    </span>
                  </span>
                </template>
              </div>
            </template>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] gap-2">
          <div></div>
          <div v-for="plan in plans" :key="`cta-${plan.tier}`" class="px-1">
            <BaseButton
              block
              size="sm"
              :variant="ctaVariant(plan.tier)"
              :disabled="ctaDisabled(plan.tier)"
              @click="choosePlan(plan.tier)"
            >
              {{ ctaLabel(plan.tier) }}
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Mobile plan cards -->
      <div class="mt-12 space-y-6 md:hidden">
        <div
          v-for="plan in plans"
          :key="`mobile-${plan.tier}`"
          class="overflow-hidden rounded-[1.6rem] border border-blush/80 bg-white/70"
        >
          <div
            class="relative px-5 py-6 text-center"
            :class="[headerClass[plan.tier], plan.tier === 'PRO' ? 'pt-9' : '']"
          >
            <span
              v-if="plan.tier === 'PRO'"
              class="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-plan-popular px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
            >
              Most popular
            </span>
            <p class="text-lg font-semibold text-ink">{{ plan.label }}</p>
            <p class="mt-1 font-display text-4xl text-ink">
              {{ formatPlanPrice(plan.priceSen) }}
            </p>
            <p class="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink/55">
              One-time
            </p>
          </div>

          <dl class="divide-y divide-ink/10">
            <div
              v-for="row in rows"
              :key="`mobile-${plan.tier}-${row.label}`"
              class="flex items-center justify-between gap-4 px-5 py-3 text-sm text-ink/85"
            >
              <dt>{{ row.label }}</dt>
              <dd class="shrink-0">
                <template v-if="row.kind === 'limit'">
                  {{ limitLabel(plan.tier, row.key) }}
                </template>
                <span v-else class="flex items-center justify-end gap-2">
                  <span
                    v-if="!isSoon(plan.tier, row.key)"
                    class="order-last flex h-6 w-6 items-center justify-center rounded-full text-white"
                    :class="
                      hasFeature(plan.tier, row.key)
                        ? 'bg-plan-free'
                        : 'bg-soft-pink'
                    "
                  >
                    <svg
                      v-if="hasFeature(plan.tier, row.key)"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <svg
                      v-else
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                    <span class="sr-only">
                      {{
                        hasFeature(plan.tier, row.key)
                          ? "Included"
                          : "Not included"
                      }}
                    </span>
                  </span>
                  <span
                    v-if="isSoon(plan.tier, row.key)"
                    class="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/55"
                  >
                    Soon
                  </span>
                </span>
              </dd>
            </div>
          </dl>

          <div class="px-5 pb-5">
            <BaseButton
              block
              size="sm"
              :variant="ctaVariant(plan.tier)"
              :disabled="ctaDisabled(plan.tier)"
              @click="choosePlan(plan.tier)"
            >
              {{ ctaLabel(plan.tier) }}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </section>

  <PlanCheckoutDialog
    v-if="selectedPlan"
    v-model="checkoutOpen"
    :plan="checkoutPlan"
  />
</template>
