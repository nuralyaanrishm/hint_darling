<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import GiftIcon from "@/components/decor/GiftIcon.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import {
  cancelMyClaim,
  isApiError,
  listMyClaims,
  type MyClaim,
} from "@/lib/api";
import { getClaimForItem, claimManagePath } from "@/lib/claims";
import { usePageMeta } from "@/lib/usePageMeta";

const route = useRoute();
const router = useRouter();

const claims = ref<MyClaim[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const activeCount = computed(
  () => claims.value.filter((claim) => claim.status === "CLAIMED").length,
);

const claimToRelease = ref<MyClaim | null>(null);
const releaseOpen = ref(false);
const releasing = ref(false);
const releaseError = ref<string | null>(null);

usePageMeta(() => ({
  title: "Your gifts · Hint, Darling",
  description:
    "A private look at the gifts you've promised to give and manage your reservations.",
}));

function redirectToLogin() {
  void router.push({ name: "login", query: { redirect: route.fullPath } });
}

async function load() {
  loading.value = true;
  loadError.value = null;

  try {
    claims.value = await listMyClaims();
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    loadError.value = isApiError(error)
      ? error.message
      : "We couldn't load your gifts.";
  } finally {
    loading.value = false;
  }
}

function askRelease(claim: MyClaim) {
  claimToRelease.value = claim;
  releaseError.value = null;
  releaseOpen.value = true;
}

async function confirmRelease() {
  const claim = claimToRelease.value;
  if (!claim || releasing.value) return;

  releasing.value = true;
  releaseError.value = null;

  try {
    const result = await cancelMyClaim(claim.id);
    const index = claims.value.findIndex((entry) => entry.id === claim.id);
    const entry = index === -1 ? undefined : claims.value[index];
    if (index !== -1 && entry) {
      claims.value[index] = {
        id: entry.id,
        status: result.status,
        claimedAt: entry.claimedAt,
        cancelledAt: result.cancelledAt,
        claimantName: entry.claimantName,
        gift: entry.gift,
        event: entry.event,
      };
    }
    releaseOpen.value = false;
    claimToRelease.value = null;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    releaseError.value = isApiError(error)
      ? error.message
      : "We couldn't release it just now. Please try again.";
  } finally {
    releasing.value = false;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function managePathFor(claim: MyClaim): string | undefined {
  const stored = getClaimForItem(claim.gift.id);
  // Only show the device's own management token; we never learn others'.
  return stored ? claimManagePath(stored.token) : undefined;
}

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-blush/60 via-cream to-cream">
    <section class="mx-auto max-w-3xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <header class="text-center">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-blush bg-blush/40 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-rose"
        >
          <GiftIcon :size="13" />
          Gift-giver
        </span>
        <h1 class="mt-5 font-display text-4xl leading-tight text-ink sm:text-5xl">
          Your gifts
        </h1>
        <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink/70 sm:text-base">
          A private look at the gifts you've promised to give — and a way to
          release one if you change your mind.
        </p>
        <div class="mx-auto my-8 max-w-xs">
          <BowDivider />
        </div>
      </header>

      <div v-if="loading">
        <LoadingState label="Finding your gifts…" :rows="2" />
      </div>

      <p
        v-else-if="loadError"
        role="alert"
        class="rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
      >
        {{ loadError }}
      </p>

      <EmptyState
        v-else-if="claims.length === 0"
        title="Nothing claimed just yet"
        message="When you claim a gift from a wishlist, it will show up here so you can keep track of it."
      >
        <template #action>
          <BaseButton to="/" variant="secondary">Visit Hint, Darling</BaseButton>
        </template>
      </EmptyState>

      <div v-else class="space-y-5">
        <p class="text-center text-sm text-ink/65">
          You're currently giving
          <span class="font-medium text-rose">{{ activeCount }}</span>
          {{ activeCount === 1 ? "gift" : "gifts" }}.
        </p>

        <article
          v-for="claim in claims"
          :key="claim.id"
          class="overflow-hidden rounded-[2rem] border border-blush bg-white/80 shadow-soft"
        >
          <div class="flex items-center gap-4 p-5 sm:p-6">
            <div
              class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
              :class="
                claim.status === 'CLAIMED'
                  ? 'bg-blush/50 text-rose-deep'
                  : 'bg-sage/40 text-sage-deep'
              "
            >
              <img
                v-if="claim.gift.imageUrl"
                :src="claim.gift.imageUrl"
                :alt="claim.gift.name"
                class="h-full w-full object-cover"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
              <GiftIcon v-else :size="26" aria-hidden="true" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-display text-xl leading-snug text-ink">
                  {{ claim.gift.name }}
                </h2>
                <span
                  class="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                  :class="
                    claim.status === 'CLAIMED'
                      ? 'bg-rose/15 text-rose-deep'
                      : 'bg-sage/40 text-sage-deep'
                  "
                >
                  <GiftIcon :size="11" aria-hidden="true" />
                  {{ claim.status === "CLAIMED" ? "Claimed" : "Released" }}
                </span>
              </div>
              <p class="mt-1 text-sm text-ink/65">
                For <span class="font-medium text-ink">{{ claim.event.name }}</span>
                · claimed {{ formatDate(claim.claimedAt) }}
              </p>
              <p v-if="claim.claimantName" class="mt-0.5 text-xs text-ink/50">
                Your name on it: {{ claim.claimantName }}
              </p>
            </div>
          </div>

          <div
            v-if="claim.status === 'CLAIMED'"
            class="flex flex-wrap items-center gap-3 border-t border-blush/70 bg-cream/60 px-5 py-4 sm:px-6"
          >
            <p
              class="min-w-0 flex-1 text-xs leading-relaxed text-ink/60"
            >
              This one is reserved for you to give. Release it and another
              guest can claim it instead.
            </p>
            <BaseButton
              v-if="managePathFor(claim)"
              :to="managePathFor(claim)"
              variant="secondary"
              size="sm"
            >
              Manage this claim
            </BaseButton>
            <BaseButton size="sm" @click="askRelease(claim)">
              Release this gift
            </BaseButton>
          </div>
          <div
            v-else
            class="border-t border-blush/70 bg-sage/20 px-5 py-4 text-sm text-sage-deep sm:px-6"
          >
            You've released this gift — thank you for letting the hosts know! 💗
          </div>
        </article>

        <p class="pt-2 text-center text-xs text-ink/45">
          These are your reservations only — nobody else can see them, and you
          never see other gift-givers' names.
        </p>
      </div>
    </section>

    <ConfirmDialog
      v-model="releaseOpen"
      title="Release this gift?"
      :message="`“${claimToRelease?.gift.name ?? 'This gift'}” will become available for another guest to claim.`"
      confirm-label="Yes, release it"
      cancel-label="Keep it"
      :loading="releasing"
      :error="releaseError"
      @confirm="confirmRelease"
    />
  </div>
</template>