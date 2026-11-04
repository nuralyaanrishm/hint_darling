<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { getAdminOverview, isApiError, type AdminOverview } from "@/lib/api";

const route = useRoute();
const router = useRouter();

const overview = ref<AdminOverview | null>(null);
const loading = ref(true);
const errorMessage = ref<string | null>(null);

const statCards = computed(() => {
  const data = overview.value;
  if (!data) {
    return [];
  }

  return [
    {
      label: "Accounts",
      value: data.counts.users,
      hint: `${data.counts.verifiedUsers} verified`,
    },
    {
      label: "Pro members",
      value: data.counts.proUsers,
      hint: `${data.revenue.paidPurchases} paid unlocks`,
    },
    {
      label: "Events",
      value: data.counts.events,
      hint: `${data.counts.wishlists} wishlists`,
    },
    {
      label: "Gifts",
      value: data.counts.items,
      hint: "across all wishlists",
    },
    {
      label: "Active reservations",
      value: data.counts.activeClaims,
      hint: "claimant identity hidden",
    },
    {
      label: "Pro revenue",
      value: formatAmount(data.revenue.grossSen, data.revenue.currency),
      hint: "lifetime, paid only",
    },
  ];
});

function formatAmount(sen: number, currency: string): string {
  return `${currency} ${(sen / 100).toFixed(2)}`;
}

function formatDate(value: string | null): string {
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

async function loadOverview() {
  loading.value = true;
  errorMessage.value = null;

  try {
    overview.value = await getAdminOverview();
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      void router.push({ name: "login", query: { redirect: route.fullPath } });
      return;
    }

    if (isApiError(error) && error.status === 403) {
      void router.push({ name: "dashboard" });
      return;
    }

    errorMessage.value = isApiError(error)
      ? error.message
      : "We couldn't load the admin overview.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
    <header>
      <p class="text-xs uppercase tracking-[0.3em] text-rose">Admin</p>
      <h1 class="mt-3 font-display text-4xl text-ink sm:text-5xl">
        The whole picture
      </h1>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
        Read-only overview of accounts, gift activity and Pro unlocks.
        Reservations stay anonymous here: you see that a gift was claimed, never
        by whom.
      </p>
    </header>

    <div class="my-10">
      <BowDivider />
    </div>

    <LoadingState v-if="loading" label="Loading the admin overview…" :rows="2" />

    <EmptyState
      v-else-if="errorMessage"
      title="We couldn't load the overview"
      :message="errorMessage"
    >
      <template #action>
        <BaseButton size="sm" @click="loadOverview">Try again</BaseButton>
      </template>
    </EmptyState>

    <template v-else-if="overview">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BaseCard v-for="card in statCards" :key="card.label">
          <p class="text-xs uppercase tracking-[0.2em] text-ink/50">
            {{ card.label }}
          </p>
          <p class="mt-3 font-display text-4xl text-ink">{{ card.value }}</p>
          <p class="mt-1 text-xs text-ink/55">{{ card.hint }}</p>
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

          <ul v-if="overview.recentSignups.length" class="divide-y divide-blush/60">
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
                    signup.plan === 'PRO'
                      ? 'bg-rose/10 text-rose-deep'
                      : 'bg-blush/70 text-ink/70'
                  "
                >
                  {{ signup.plan }}
                </span>
                <span>{{ signup.eventCount }} events</span>
                <time :datetime="signup.createdAt">{{
                  formatDate(signup.createdAt)
                }}</time>
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

          <ul v-if="overview.recentClaims.length" class="divide-y divide-blush/60">
            <li
              v-for="claim in overview.recentClaims"
              :key="`${claim.itemName}-${claim.claimedAt}`"
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
              <time class="text-xs text-ink/60" :datetime="claim.claimedAt">{{
                formatDate(claim.claimedAt)
              }}</time>
            </li>
          </ul>

          <p v-else class="px-6 py-8 text-sm text-ink/60">
            No gifts have been claimed yet.
          </p>
        </BaseCard>

        <BaseCard flush class="overflow-hidden lg:col-span-2">
          <div class="border-b border-blush/70 px-6 py-5">
            <h2 class="font-display text-2xl text-ink">Recent Pro unlocks</h2>
            <p class="mt-1 text-xs text-ink/55">
              {{ overview.revenue.paidPurchases }} paid ·
              {{ formatAmount(overview.revenue.grossSen, overview.revenue.currency) }}
              collected
            </p>
          </div>

          <ul v-if="overview.recentPurchases.length" class="divide-y divide-blush/60">
            <li
              v-for="purchase in overview.recentPurchases"
              :key="`${purchase.email}-${purchase.paidAt}`"
              class="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
            >
              <p class="truncate text-sm text-ink">{{ purchase.email }}</p>
              <div class="flex items-center gap-4 text-xs text-ink/60">
                <span class="font-medium text-ink/80">
                  {{ formatAmount(purchase.amountSen, purchase.currency) }}
                </span>
                <time :datetime="purchase.paidAt ?? undefined">{{
                  formatDate(purchase.paidAt)
                }}</time>
              </div>
            </li>
          </ul>

          <p v-else class="px-6 py-8 text-sm text-ink/60">
            No Pro purchases yet.
          </p>
        </BaseCard>
      </div>
    </template>
  </section>
</template>
