<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import FloralSprig from "@/components/decor/FloralSprig.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import {
  cancelClaimByToken,
  getClaimByToken,
  isApiError,
  type PublicClaimInfo,
} from "@/lib/api";
import { usePageMeta } from "@/lib/usePageMeta";

const route = useRoute();

const token = computed(() =>
  typeof route.params.token === "string" ? route.params.token : "",
);

const claim = ref<PublicClaimInfo | null>(null);
const loading = ref(true);
const notFound = ref(false);
const loadError = ref<string | null>(null);

const cancelOpen = ref(false);
const cancelling = ref(false);
const cancelError = ref<string | null>(null);
const cancelledAt = ref<string | null>(null);

const status = computed(() => (cancelledAt.value ? "CANCELLED" : claim.value?.status));

const priceLabel = computed(() => {
  const value = claim.value?.gift.price;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: claim.value!.gift.currency,
    }).format(parsed);
  } catch {
    return `${claim.value!.gift.currency} ${parsed.toFixed(2)}`;
  }
});

const cancelledLabel = computed(() => {
  if (!cancelledAt.value) return null;
  return new Date(cancelledAt.value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
});

usePageMeta(() => ({
  title: "Manage your gift · Hint, Darling",
  description: "View or release a gift you claimed on a Hint, Darling wishlist.",
}));

async function load() {
  loading.value = true;
  notFound.value = false;
  loadError.value = null;
  claim.value = null;

  try {
    claim.value = await getClaimByToken(token.value);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = isApiError(error)
        ? error.message
        : "We couldn't load your claim.";
    }
  } finally {
    loading.value = false;
  }
}

async function confirmCancel() {
  if (!token.value || cancelling.value) return;

  cancelling.value = true;
  cancelError.value = null;

  try {
    const result = await cancelClaimByToken(token.value);
    cancelledAt.value = result.cancelledAt;
    cancelOpen.value = false;
  } catch (error) {
    cancelError.value = isApiError(error)
      ? error.message
      : "We couldn't release it just now. Please try again.";
  } finally {
    cancelling.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-blush/60 via-cream to-cream">
    <section class="mx-auto max-w-2xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <div v-if="loading">
        <LoadingState label="Finding your claim…" :rows="2" />
      </div>

      <div
        v-else-if="notFound || loadError"
        class="text-center"
      >
        <FloralSprig :size="64" class="mx-auto text-soft-pink" />
        <h1 class="mt-6 font-display text-4xl text-ink">
          We can’t find that link
        </h1>
        <div class="my-8">
          <BowDivider />
        </div>
        <p class="mx-auto max-w-md text-sm leading-relaxed text-ink/70">
          {{
            loadError ??
            "This management link may have already been used, or the gift it belongs to no longer exists."
          }}
        </p>
        <BaseButton to="/" variant="secondary" class="mt-8">
          Visit Hint, Darling
        </BaseButton>
      </div>

      <template v-else-if="claim">
        <header class="text-center">
          <span
            class="inline-flex items-center rounded-full border border-blush bg-blush/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-rose"
          >
            Your gift
          </span>
          <h1 class="mt-5 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {{ claim.gift.name }}
          </h1>
          <p class="mt-3 text-sm text-ink/70">
            For <span class="font-medium text-ink">{{ claim.event.name }}</span>
          </p>
          <div class="mx-auto my-8 max-w-xs">
            <BowDivider />
          </div>
        </header>

        <div
          class="overflow-hidden rounded-[2rem] border border-blush bg-white/80 shadow-soft"
        >
          <div class="relative aspect-[16/9] w-full bg-blush/40">
            <img
              v-if="claim.gift.imageUrl"
              :src="claim.gift.imageUrl"
              :alt="claim.gift.name"
              class="h-full w-full object-cover"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center text-rose/70"
              aria-hidden="true"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 12v8H4v-8" />
                <path d="M2 8h20v4H2z" />
                <path d="M12 8v12" />
                <path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5h4Z" />
                <path d="M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5h-4Z" />
              </svg>
            </div>

            <span
              class="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white shadow-soft"
              :class="
                status === 'CANCELLED' ? 'bg-ink/70' : 'bg-rose'
              "
            >
              <svg
                v-if="status === 'CANCELLED'"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
              <svg
                v-else
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {{ status === "CANCELLED" ? "Released" : "Claimed" }}
            </span>
          </div>

          <div class="space-y-5 p-6 sm:p-8">
            <div class="flex items-start justify-between gap-4">
              <h2 class="font-display text-2xl text-ink">
                {{ claim.gift.name }}
              </h2>
              <span v-if="priceLabel" class="shrink-0 text-sm font-medium text-ink">
                {{ priceLabel }}
              </span>
            </div>

            <div class="space-y-3 text-sm text-ink/70">
              <p v-if="claim.claimantName" class="flex items-center gap-2">
                <span class="text-ink/45">Your name</span>
                <span class="font-medium text-ink">{{ claim.claimantName }}</span>
              </p>
              <p class="flex items-center gap-2">
                <span class="text-ink/45">Claimed</span>
                <span class="font-medium text-ink">
                  {{ new Date(claim.claimedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) }}
                </span>
              </p>
              <p v-if="cancelledLabel" class="flex items-center gap-2">
                <span class="text-ink/45">Released</span>
                <span class="font-medium text-ink">{{ cancelledLabel }}</span>
              </p>
            </div>

            <template v-if="status === 'CLAIMED'">
              <p
                v-if="cancelError"
                role="alert"
                class="rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
              >
                {{ cancelError }}
              </p>

              <div
                class="rounded-2xl border border-blush bg-cream/70 px-5 py-4 text-sm leading-relaxed text-ink/70"
              >
                This gift is reserved for you to give. If you change your mind,
                you can release it here so another guest can claim it.
              </div>

              <div class="flex flex-col gap-3 pt-1 sm:flex-row sm:justify-end">
                <BaseButton variant="secondary" to="/">
                  Back to wishlists
                </BaseButton>
                <BaseButton @click="cancelOpen = true">
                  Release this gift
                </BaseButton>
              </div>
            </template>

            <template v-else>
              <div
                class="rounded-2xl border border-sage bg-sage/20 px-5 py-4 text-sm leading-relaxed text-sage-deep"
              >
                You’ve released this gift, so it’s available for another guest to
                claim. Thank you for letting the hosts know! 💗
              </div>
              <div class="flex justify-end pt-1">
                <BaseButton variant="secondary" to="/">
                  Visit Hint, Darling
                </BaseButton>
              </div>
            </template>
          </div>
        </div>

        <p class="mt-8 text-center text-xs text-ink/45">
          Manage your gift privately — nobody else can see who claimed it.
        </p>
      </template>
    </section>

    <ConfirmDialog
      v-model="cancelOpen"
      title="Release this gift?"
      message="“{{ claim?.gift.name }}” will become available for another guest to claim. You can’t undo this on this page."
      confirm-label="Yes, release it"
      cancel-label="Keep it"
      :loading="cancelling"
      @confirm="confirmCancel"
    />
  </div>
</template>