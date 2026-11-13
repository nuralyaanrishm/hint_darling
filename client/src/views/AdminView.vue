<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AdminFunnel from "@/components/admin/AdminFunnel.vue";
import AdminSparkline from "@/components/admin/AdminSparkline.vue";
import AdminStatCard from "@/components/admin/AdminStatCard.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import {
  getAdminOverview,
  isApiError,
  type AdminOverview,
  type AdminSeriesPoint,
} from "@/lib/api";
import type { BillingProduct } from "@/lib/plans";

const route = useRoute();
const router = useRouter();

const overview = ref<AdminOverview | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const errorMessage = ref<string | null>(null);
const refreshError = ref<string | null>(null);
const updatedAt = ref<Date | null>(null);

type StatAccent = "rose" | "sage" | "gold";
type SeriesTone = "rose" | "sage" | "deep";

interface StatCard {
  label: string;
  value: string | number;
  hint: string;
  accent: StatAccent;
}

interface SeriesCard {
  label: string;
  value: string | number;
  points: number[];
  tone: SeriesTone;
}

const statCards = computed<StatCard[]>(() => {
  const data = overview.value;
  if (!data) {
    return [];
  }

  return [
    {
      label: "Accounts",
      value: data.counts.users,
      hint: `${data.counts.verifiedUsers} verified`,
      accent: "rose",
    },
    {
      label: "Paying accounts",
      value: data.counts.payingUsers,
      hint: `${data.counts.paidUsers} on the Pro plan`,
      accent: "gold",
    },
    {
      label: "Revenue",
      value: formatAmount(
        data.revenue.total.grossSen,
        data.revenue.currency,
      ),
      hint: `${data.revenue.total.purchases} paid checkouts`,
      accent: "gold",
    },
    {
      label: "Events",
      value: data.counts.events,
      hint: `${data.counts.wishlists} wishlists`,
      accent: "sage",
    },
    {
      label: "Gifts listed",
      value: data.counts.items,
      hint: "across all wishlists",
      accent: "sage",
    },
    {
      label: "Gifts reserved",
      value: data.counts.activeClaims,
      hint: `${data.counts.cancelledClaims} released`,
      accent: "rose",
    },
  ];
});

const seriesCards = computed<SeriesCard[]>(() => {
  const data = overview.value;
  if (!data) {
    return [];
  }

  const sum = (pick: (point: AdminSeriesPoint) => number) =>
    data.series.reduce((total, point) => total + pick(point), 0);

  return [
    {
      label: "New accounts",
      value: sum((point) => point.signups),
      points: data.series.map((point) => point.signups),
      tone: "rose",
    },
    {
      label: "Reservations made",
      value: sum((point) => point.claims),
      points: data.series.map((point) => point.claims),
      tone: "sage",
    },
    {
      label: "Revenue",
      value: formatAmount(
        sum((point) => point.revenueSen),
        data.revenue.currency,
      ),
      points: data.series.map((point) => point.revenueSen),
      tone: "deep",
    },
  ];
});

const revenueRows = computed(() => {
  const data = overview.value;
  if (!data) {
    return [];
  }

  const total = data.revenue.total.grossSen;

  return [
    {
      label: "Pro plan",
      ...data.revenue.pro,
      share: total > 0 ? (data.revenue.pro.grossSen / total) * 100 : 0,
    },
    {
      label: "Event Pass",
      ...data.revenue.eventPass,
      share: total > 0 ? (data.revenue.eventPass.grossSen / total) * 100 : 0,
    },
  ];
});

const funnelSteps = computed(() => {
  const data = overview.value;
  if (!data) {
    return [];
  }

  return [
    { label: "Accounts", value: data.counts.users },
    { label: "Verified email", value: data.counts.verifiedUsers },
    { label: "Created an event", value: data.counts.usersWithEvents },
    { label: "Added a gift", value: data.counts.usersWithItems },
  ];
});

const freeGifts = computed(() => {
  const data = overview.value;
  if (!data) {
    return 0;
  }

  return Math.max(0, data.counts.items - data.counts.activeClaims);
});

const reservedShare = computed(() => {
  const data = overview.value;
  if (!data || data.counts.items === 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((data.counts.activeClaims / data.counts.items) * 100),
  );
});

const checkoutRows = computed(() => {
  const data = overview.value;
  if (!data) {
    return [];
  }

  return [
    { label: "Paid", value: data.checkout.paid, tone: "text-sage-deep" },
    { label: "Pending", value: data.checkout.pending, tone: "text-ink/70" },
    { label: "Failed", value: data.checkout.failed, tone: "text-rose-deep" },
  ];
});

function formatAmount(sen: number, currency: string): string {
  return `${currency} ${(sen / 100).toFixed(2)}`;
}

function formatAbsolute(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(value: string | null): string {
  if (!value) {
    return "—";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs)) {
    return formatAbsolute(value);
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return formatAbsolute(value);
}

function formatClock(value: Date): string {
  return value.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function productLabel(product: BillingProduct): string {
  return product === "PRO" ? "Pro plan" : "Event Pass";
}

async function loadOverview(options: { silent?: boolean } = {}) {
  const silent = options.silent ?? false;
  if (silent) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }
  errorMessage.value = null;
  refreshError.value = null;

  try {
    overview.value = await getAdminOverview();
    updatedAt.value = new Date();
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      void router.push({ name: "login", query: { redirect: route.fullPath } });
      return;
    }

    if (isApiError(error) && error.status === 403) {
      void router.push({ name: "dashboard" });
      return;
    }

    const message = isApiError(error)
      ? error.message
      : "We couldn't load the admin overview.";

    if (silent && overview.value) {
      refreshError.value = message;
    } else {
      errorMessage.value = message;
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function refresh() {
  void loadOverview({ silent: true });
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
    <header class="flex flex-wrap items-end justify-between gap-6">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Admin</p>
        <h1 class="mt-3 font-display text-4xl text-ink sm:text-5xl">
          The whole picture
        </h1>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
          Read-only overview of accounts, gift activity and plan purchases.
          Reservations stay anonymous here: you see that a gift was claimed,
          never by whom.
        </p>
      </div>

      <div class="flex flex-col items-start gap-2 sm:items-end">
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="loading || refreshing"
          @click="refresh"
        >
          {{ refreshing ? "Refreshing…" : "Refresh" }}
        </BaseButton>
        <p v-if="updatedAt" class="text-xs text-ink/50">
          Updated {{ formatClock(updatedAt) }}
        </p>
      </div>
    </header>

    <div class="my-10">
      <BowDivider />
    </div>

    <LoadingState
      v-if="loading && !overview"
      label="Loading the admin overview…"
      :rows="2"
    />

    <EmptyState
      v-else-if="errorMessage && !overview"
      title="We couldn't load the overview"
      :message="errorMessage"
    >
      <template #action>
        <BaseButton size="sm" @click="loadOverview()">Try again</BaseButton>
      </template>
    </EmptyState>

    <template v-else-if="overview">
      <p
        v-if="refreshError"
        class="mb-6 rounded-2xl border border-rose/30 bg-white/70 px-4 py-3 text-sm text-rose-deep"
      >
        {{ refreshError }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminStatCard
          v-for="card in statCards"
          :key="card.label"
          :label="card.label"
          :value="card.value"
          :hint="card.hint"
          :accent="card.accent"
        />
      </div>

      <section class="mt-12">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 class="font-display text-2xl text-ink">Last 30 days</h2>
          <p class="text-xs text-ink/50">UTC days · one point per day</p>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-3">
          <BaseCard v-for="card in seriesCards" :key="card.label">
            <p class="text-xs uppercase tracking-[0.2em] text-ink/50">
              {{ card.label }}
            </p>
            <p class="mt-2 font-display text-3xl text-ink">{{ card.value }}</p>
            <AdminSparkline
              class="mt-4"
              :points="card.points"
              :label="card.label"
              :summary-value="String(card.value)"
              :tone="card.tone"
            />
          </BaseCard>
        </div>
      </section>

      <div class="mt-8 grid gap-6 lg:grid-cols-3">
        <BaseCard flush class="overflow-hidden lg:col-span-2">
          <div class="border-b border-blush/70 px-6 py-5">
            <h2 class="font-display text-2xl text-ink">Revenue</h2>
            <p class="mt-1 text-xs text-ink/55">
              Paid checkouts only, split by product
            </p>
          </div>

          <div class="px-6 py-6">
            <p class="font-display text-4xl text-ink">
              {{
                formatAmount(
                  overview.revenue.total.grossSen,
                  overview.revenue.currency,
                )
              }}
            </p>
            <p class="mt-1 text-xs text-ink/55">
              lifetime gross · {{ overview.revenue.total.purchases }} paid
              checkouts
            </p>

            <div class="mt-6 space-y-4">
              <div v-for="row in revenueRows" :key="row.label">
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <p class="font-medium text-ink">{{ row.label }}</p>
                  <p class="text-xs text-ink/60">
                    <span class="font-medium text-ink/80">
                      {{ formatAmount(row.grossSen, overview.revenue.currency) }}
                    </span>
                    <span class="ml-2">{{ row.purchases }} sold</span>
                  </p>
                </div>
                <div
                  class="mt-2 h-2.5 overflow-hidden rounded-full bg-blush/50"
                  role="presentation"
                >
                  <div
                    class="h-full rounded-full bg-rose/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    :style="{ width: `${row.share}%` }"
                  />
                </div>
              </div>
            </div>
          </div>
        </BaseCard>

        <BaseCard flush class="overflow-hidden">
          <div class="border-b border-blush/70 px-6 py-5">
            <h2 class="font-display text-2xl text-ink">Checkout health</h2>
            <p class="mt-1 text-xs text-ink/55">
              Every ToyyibPay bill, by state
            </p>
          </div>

          <dl class="divide-y divide-blush/60">
            <div
              v-for="row in checkoutRows"
              :key="row.label"
              class="flex items-center justify-between px-6 py-4"
            >
              <dt class="text-sm text-ink/70">{{ row.label }}</dt>
              <dd class="font-display text-2xl" :class="row.tone">
                {{ row.value }}
              </dd>
            </div>
          </dl>

          <p class="px-6 pb-6 pt-4 text-xs leading-relaxed text-ink/55">
            Pending bills are checkouts that were opened but never paid.
          </p>
        </BaseCard>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <BaseCard>
          <h2 class="font-display text-2xl text-ink">Where accounts stop</h2>
          <p class="mt-1 text-xs text-ink/55">
            Each stage counts accounts, not gifts
          </p>
          <div class="mt-6">
            <AdminFunnel :steps="funnelSteps" />
          </div>
        </BaseCard>

        <BaseCard>
          <h2 class="font-display text-2xl text-ink">Gift activity</h2>
          <p class="mt-1 text-xs text-ink/55">
            Reserved gifts against the whole catalogue
          </p>

          <div class="mt-6">
            <div class="flex items-baseline justify-between gap-3">
              <p class="text-sm font-medium text-ink">
                {{ overview.counts.activeClaims }} reserved
              </p>
              <p class="text-xs text-ink/60">
                of {{ overview.counts.items }} listed
              </p>
            </div>
            <div
              class="mt-2 h-2.5 overflow-hidden rounded-full bg-blush/50"
              role="presentation"
            >
              <div
                class="h-full rounded-full bg-rose/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                :style="{ width: `${reservedShare}%` }"
              />
            </div>

            <dl class="mt-6 grid grid-cols-2 gap-4">
              <div>
                <dt class="text-xs uppercase tracking-[0.18em] text-ink/50">
                  Still free
                </dt>
                <dd class="mt-1 font-display text-2xl text-ink">
                  {{ freeGifts }}
                </dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-[0.18em] text-ink/50">
                  Released
                </dt>
                <dd class="mt-1 font-display text-2xl text-ink">
                  {{ overview.counts.cancelledClaims }}
                </dd>
              </div>
            </dl>
          </div>
        </BaseCard>
      </div>

      <div class="mt-10 grid gap-6 lg:grid-cols-2">
        <BaseCard flush class="overflow-hidden">
          <div class="border-b border-blush/70 px-6 py-5">
            <h2 class="font-display text-2xl text-ink">Newest accounts</h2>
            <p class="mt-1 text-xs text-ink/55">
              Last {{ overview.recentSignups.length }} signups
            </p>
          </div>

          <ul
            v-if="overview.recentSignups.length"
            class="divide-y divide-blush/60"
          >
            <li
              v-for="signup in overview.recentSignups"
              :key="signup.id"
              class="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-ink">
                  {{ signup.name }}
                </p>
                <p class="truncate text-xs text-ink/60">{{ signup.email }}</p>
              </div>
              <div class="flex items-center gap-3 text-xs text-ink/60">
                <span
                  class="rounded-full px-2.5 py-1 font-medium uppercase tracking-[0.14em]"
                  :class="
                    signup.plan !== 'FREE'
                      ? 'bg-rose/10 text-rose-deep'
                      : 'bg-blush/70 text-ink/70'
                  "
                >
                  {{ signup.plan }}
                </span>
                <span>{{ signup.eventCount }} events</span>
                <time
                  :datetime="signup.createdAt"
                  :title="formatAbsolute(signup.createdAt)"
                >
                  {{ formatRelative(signup.createdAt) }}
                </time>
              </div>
            </li>
          </ul>

          <p v-else class="px-6 py-8 text-sm text-ink/60">No accounts yet.</p>
        </BaseCard>

        <BaseCard flush class="overflow-hidden">
          <div class="border-b border-blush/70 px-6 py-5">
            <h2 class="font-display text-2xl text-ink">Recent reservations</h2>
            <p class="mt-1 text-xs text-ink/55">
              Anonymous by design — no claimant details
            </p>
          </div>

          <ul
            v-if="overview.recentClaims.length"
            class="divide-y divide-blush/60"
          >
            <li
              v-for="(claim, index) in overview.recentClaims"
              :key="`${claim.claimedAt}-${index}`"
              class="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-ink">
                  {{ claim.itemName }}
                </p>
                <p class="truncate text-xs text-ink/60">
                  {{ claim.wishlistTitle }}
                </p>
              </div>
              <time
                class="text-xs text-ink/60"
                :datetime="claim.claimedAt"
                :title="formatAbsolute(claim.claimedAt)"
              >
                {{ formatRelative(claim.claimedAt) }}
              </time>
            </li>
          </ul>

          <p v-else class="px-6 py-8 text-sm text-ink/60">
            No gifts have been claimed yet.
          </p>
        </BaseCard>

        <BaseCard flush class="overflow-hidden lg:col-span-2">
          <div class="border-b border-blush/70 px-6 py-5">
            <h2 class="font-display text-2xl text-ink">Recent purchases</h2>
            <p class="mt-1 text-xs text-ink/55">
              {{ overview.revenue.total.purchases }} paid ·
              {{
                formatAmount(
                  overview.revenue.total.grossSen,
                  overview.revenue.currency,
                )
              }}
              collected
            </p>
          </div>

          <ul
            v-if="overview.recentPurchases.length"
            class="divide-y divide-blush/60"
          >
            <li
              v-for="(purchase, index) in overview.recentPurchases"
              :key="`${purchase.paidAt}-${index}`"
              class="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <div class="min-w-0">
                <p class="truncate text-sm text-ink">{{ purchase.email }}</p>
                <p class="mt-1 text-xs text-ink/55">
                  {{ productLabel(purchase.product) }}
                </p>
              </div>
              <div class="flex items-center gap-4 text-xs text-ink/60">
                <span class="font-medium text-ink/80">
                  {{ formatAmount(purchase.amountSen, purchase.currency) }}
                </span>
                <time
                  :datetime="purchase.paidAt ?? undefined"
                  :title="formatAbsolute(purchase.paidAt)"
                >
                  {{ formatRelative(purchase.paidAt) }}
                </time>
              </div>
            </li>
          </ul>

          <p v-else class="px-6 py-8 text-sm text-ink/60">
            No purchases yet.
          </p>
        </BaseCard>
      </div>
    </template>
  </section>
</template>
