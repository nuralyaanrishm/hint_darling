<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import PlanCheckoutDialog from "@/components/billing/PlanCheckoutDialog.vue";
import { useAuth } from "@/stores/auth";
import {
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_ORDER,
  PRICING_COLUMNS,
  PRICING_PRODUCTS,
  PRO_IS_LAUNCH_PRICE,
  formatPlanPrice,
  planRank,
  type BillingProduct,
  type PlanFeatureKey,
  type PlanTier,
  type PricingColumn,
  type PricingProduct,
} from "@/lib/plans";

const router = useRouter();
const { isAuthenticated, currentPlan } = useAuth();

type PricingRow =
  | {
      kind: "limit";
      key: "activeEventLimit" | "itemLimit";
      label: string;
    }
  | { kind: "feature"; key: PlanFeatureKey; label: string };

const columns: PricingColumn[] = PRICING_PRODUCTS.map(
  (product) => PRICING_COLUMNS[product],
);

const rows: PricingRow[] = [
  { kind: "limit", key: "activeEventLimit", label: "Active events" },
  { kind: "limit", key: "itemLimit", label: "Gifts per list" },
  ...PLAN_FEATURE_ORDER.map((key) => ({
    kind: "feature" as const,
    key,
    label: PLAN_FEATURE_LABELS[key],
  })),
];

const headerClass: Record<PricingProduct, string> = {
  FREE: "bg-plan-free",
  EVENT_PASS: "bg-plan-plus",
  PRO: "bg-plan-pro",
};

const selectedProduct = ref<BillingProduct | null>(null);
const checkoutOpen = ref(false);

function isPlanTier(key: PricingProduct): key is PlanTier {
  return key !== "EVENT_PASS";
}

function isCurrent(column: PricingColumn): boolean {
  return (
    isPlanTier(column.key) &&
    isAuthenticated.value &&
    column.key === currentPlan.value
  );
}

function isIncluded(column: PricingColumn): boolean {
  // Pro includes everything an Event Pass includes.
  return (
    column.key === "EVENT_PASS" &&
    isAuthenticated.value &&
    currentPlan.value === "PRO"
  );
}

function ctaLabel(column: PricingColumn): string {
  if (isCurrent(column)) return "Your plan";
  if (isIncluded(column)) return "Included in Pro";
  if (column.key === "FREE") return "Start free";
  if (column.key === "EVENT_PASS") return "Choose Event Pass";
  return `Choose ${column.shortLabel}`;
}

function ctaDisabled(column: PricingColumn): boolean {
  return isCurrent(column) || isIncluded(column);
}

function ctaVariant(column: PricingColumn): "primary" | "secondary" {
  if (!isAuthenticated.value) {
    return column.key === "FREE" ? "secondary" : "primary";
  }
  if (isPlanTier(column.key)) {
    return planRank(column.key) > planRank(currentPlan.value)
      ? "primary"
      : "secondary";
  }
  return currentPlan.value === "PRO" ? "secondary" : "primary";
}

function choose(column: PricingColumn) {
  if (ctaDisabled(column)) return;

  if (column.key === "FREE") {
    void router.push(isAuthenticated.value ? "/dashboard" : "/register");
    return;
  }

  if (column.key === "EVENT_PASS") {
    // A pass belongs to one event, so it is bought from that event's page.
    void router.push(isAuthenticated.value ? "/dashboard" : "/register");
    return;
  }

  if (!isAuthenticated.value) {
    void router.push("/register");
    return;
  }

  if (planRank(column.key) <= planRank(currentPlan.value)) return;

  selectedProduct.value = "PRO";
  checkoutOpen.value = true;
}

function limitLabel(column: PricingColumn, key: PricingRow["key"]) {
  if (key !== "activeEventLimit" && key !== "itemLimit") return "";
  const value = column[key];
  if (value === null) return "Unlimited";
  return String(value);
}

function hasFeature(column: PricingColumn, key: PlanFeatureKey): boolean {
  return column.features[key];
}

function isSoon(column: PricingColumn, key: PlanFeatureKey): boolean {
  return column.comingSoon.includes(key);
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
          Start free. Unlock one event for RM9.90, or go Pro once and cover
          every celebration — no subscriptions.
        </p>
      </div>

      <!-- Desktop comparison table -->
      <div class="mt-14 hidden md:block">
        <div class="grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] gap-3">
          <div></div>
          <div
            v-for="column in columns"
            :key="column.key"
            class="relative flex min-h-[9.5rem] flex-col items-center justify-center rounded-[1.4rem] border border-ink/15 px-4 py-6 text-center"
            :class="headerClass[column.key]"
          >
            <span
              v-if="column.key === 'EVENT_PASS'"
              class="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-plan-popular px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm"
            >
              Most Popular
            </span>
            <p class="text-lg font-semibold text-ink">{{ column.label }}</p>
            <p class="mt-2 font-display text-4xl text-ink">
              {{ formatPlanPrice(column.priceSen) }}
            </p>
            <p class="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink/55">
              {{ column.priceNote === "per event" ? "Per event" : "One-time" }}
            </p>
            <span
              v-if="column.key === 'PRO' && PRO_IS_LAUNCH_PRICE"
              class="mt-2 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/60"
            >
              Launch price
            </span>
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
                v-for="column in columns"
                :key="`${row.label}-${column.key}`"
                class="flex items-center justify-center border-l border-ink/15 px-4 py-4 text-center text-sm text-ink/85"
                :class="[
                  rowBackground(index),
                  index === 0 ? '' : 'border-t border-ink/15',
                ]"
              >
                <template v-if="row.kind === 'limit'">
                  {{ limitLabel(column, row.key) }}
                </template>
                <template v-else>
                  <span class="flex items-center justify-center">
                    <span
                      v-if="isSoon(column, row.key)"
                      class="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/55"
                    >
                      Soon
                    </span>
                    <span
                      v-else
                      class="flex h-6 w-6 items-center justify-center rounded-full text-white"
                      :class="
                        hasFeature(column, row.key)
                          ? 'bg-plan-free'
                          : 'bg-soft-pink'
                      "
                    >
                      <svg
                        v-if="hasFeature(column, row.key)"
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
                          hasFeature(column, row.key)
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
          <div
            v-for="column in columns"
            :key="`cta-${column.key}`"
            class="px-1"
          >
            <BaseButton
              block
              size="sm"
              :variant="ctaVariant(column)"
              :disabled="ctaDisabled(column)"
              @click="choose(column)"
            >
              {{ ctaLabel(column) }}
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Mobile plan cards -->
      <div class="mt-12 space-y-6 md:hidden">
        <div
          v-for="column in columns"
          :key="`mobile-${column.key}`"
          class="overflow-hidden rounded-[1.6rem] border border-blush/80 bg-white/70"
        >
          <div
            class="relative px-5 py-6 text-center"
            :class="[
              headerClass[column.key],
              column.key === 'EVENT_PASS' ? 'pt-9' : '',
            ]"
          >
            <span
              v-if="column.key === 'EVENT_PASS'"
              class="absolute top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-plan-popular px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
            >
              Most Popular
            </span>
            <p class="text-lg font-semibold text-ink">{{ column.label }}</p>
            <p class="mt-1 font-display text-4xl text-ink">
              {{ formatPlanPrice(column.priceSen) }}
            </p>
            <p class="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink/55">
              {{ column.priceNote === "per event" ? "Per event" : "One-time" }}
            </p>
            <span
              v-if="column.key === 'PRO' && PRO_IS_LAUNCH_PRICE"
              class="mt-2 inline-flex rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/60"
            >
              Launch price
            </span>
          </div>

          <dl class="divide-y divide-ink/10">
            <div
              v-for="row in rows"
              :key="`mobile-${column.key}-${row.label}`"
              class="flex items-center justify-between gap-4 px-5 py-3 text-sm text-ink/85"
            >
              <dt>{{ row.label }}</dt>
              <dd class="shrink-0">
                <template v-if="row.kind === 'limit'">
                  {{ limitLabel(column, row.key) }}
                </template>
                <span v-else class="flex items-center justify-end gap-2">
                  <span
                    v-if="!isSoon(column, row.key)"
                    class="order-last flex h-6 w-6 items-center justify-center rounded-full text-white"
                    :class="
                      hasFeature(column, row.key)
                        ? 'bg-plan-free'
                        : 'bg-soft-pink'
                    "
                  >
                    <svg
                      v-if="hasFeature(column, row.key)"
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
                        hasFeature(column, row.key)
                          ? "Included"
                          : "Not included"
                      }}
                    </span>
                  </span>
                  <span
                    v-if="isSoon(column, row.key)"
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
              :variant="ctaVariant(column)"
              :disabled="ctaDisabled(column)"
              @click="choose(column)"
            >
              {{ ctaLabel(column) }}
            </BaseButton>
          </div>
        </div>
      </div>

      <p class="mt-8 text-center text-xs text-ink/55">
        An Event Pass is bought from the event you want to unlock — open it from
        your dashboard. Pro covers every event you run.
      </p>
    </div>
  </section>

  <PlanCheckoutDialog
    v-if="selectedProduct"
    v-model="checkoutOpen"
    :product="selectedProduct"
  />
</template>
