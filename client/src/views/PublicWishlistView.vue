<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import FloralSprig from "@/components/decor/FloralSprig.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import EventLocationMap from "@/components/map/EventLocationMap.vue";
import ClaimDialog from "@/components/wishlist/ClaimDialog.vue";
import PublicGiftCard from "@/components/wishlist/PublicGiftCard.vue";
import { eventTypeLabel } from "@/lib/eventOptions";
import {
  getPublicWishlist,
  isApiError,
  type ClaimResult,
  type PublicGift,
  type PublicWishlist,
} from "@/lib/api";
import {
  claimManageUrl,
  getClaimForItem,
  rememberClaim,
} from "@/lib/claims";
import { publicWishlistUrl } from "@/lib/share";
import { usePageMeta } from "@/lib/usePageMeta";

const route = useRoute();

const shareToken = computed(() =>
  typeof route.params.shareToken === "string"
    ? route.params.shareToken
    : "",
);

const wishlist = ref<PublicWishlist | null>(null);
const loading = ref(true);
const notFound = ref(false);
const loadError = ref<string | null>(null);

const dateLabel = computed(() => {
  const value = wishlist.value?.event.eventDate;
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const giftCount = computed(() => wishlist.value?.items.length ?? 0);

const locationCoordinates = computed(() => {
  const current = wishlist.value;
  if (
    !current ||
    current.event.latitude === null ||
    current.event.longitude === null
  ) {
    return null;
  }
  return { lat: current.event.latitude, lng: current.event.longitude };
});

async function load() {
  loading.value = true;
  notFound.value = false;
  loadError.value = null;
  wishlist.value = null;

  try {
    wishlist.value = await getPublicWishlist(shareToken.value);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = isApiError(error)
        ? error.message
        : "We couldn't load this wishlist.";
    }
  } finally {
    loading.value = false;
  }
}

// --- Claiming ---------------------------------------------------------------

const claimOpen = ref(false);
const selectedGift = ref<PublicGift | null>(null);
const busyItemId = ref<string | null>(null);

function askClaim(gift: PublicGift) {
  selectedGift.value = gift;
  claimOpen.value = true;
}

/** True when this device holds the active claim for a gift. */
function claimedByYou(gift: PublicGift): boolean {
  return gift.isClaimed && getClaimForItem(gift.id) !== null;
}

/** The gift-giver's private management link, when this device claimed it. */
function manageUrlFor(gift: PublicGift): string | null {
  const stored = getClaimForItem(gift.id);
  return stored && gift.isClaimed ? claimManageUrl(stored.token) : null;
}

/** Fires a brief, non-blocking notification. */
const toastMessage = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string) {
  toastMessage.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMessage.value = null), 4500);
}

function onClaimed(result: ClaimResult) {
  const gift = selectedGift.value;
  if (!gift) return;

  rememberClaim({
    itemId: gift.id,
    itemName: gift.name,
    token: result.manageToken,
    claimantName: result.claimantName,
    claimedAt: result.claimedAt,
  });

  busyItemId.value = null;
  showToast(
    `You’ve claimed “${gift.name}” — nobody else can grab it now. 🎁`,
  );
  void load();
}

function onClaimConflict() {
  busyItemId.value = null;
  // Another guest claimed it while this page was open; refresh so everyone
  // immediately sees the item is taken.
  void load();
}

// Keep availability fresh while the page is open, so guests see claims as
// they happen instead of needing a manual refresh.
let pollTimer: ReturnType<typeof setInterval> | undefined;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (claimOpen.value || loading.value) return;
    void load();
  }, 15_000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function onWindowFocus() {
  if (!claimOpen.value && !loading.value) void load();
}

// --- Metadata ---------------------------------------------------------------

usePageMeta(() => {
  const list = wishlist.value;
  if (!list) return null;

  return {
    title: `${list.event.name} · ${list.title} · Hint, Darling`,
    description:
      list.description ??
      `A wishlist with ${list.items.length} ${
        list.items.length === 1 ? "gift" : "gifts"
      } for ${list.event.name}.`,
    url: publicWishlistUrl(shareToken.value),
    image: list.items.find((item) => item.imageUrl)?.imageUrl ?? null,
  };
});

onMounted(() => {
  void load();
  startPolling();
  window.addEventListener("focus", onWindowFocus);
});

onBeforeUnmount(() => {
  stopPolling();
  window.removeEventListener("focus", onWindowFocus);
  clearTimeout(toastTimer);
});

watch(shareToken, () => {
  void load();
  startPolling();
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-blush/60 via-cream to-cream">
    <section class="mx-auto max-w-5xl px-5 pb-24 pt-8 sm:px-8 sm:pt-14">
      <div v-if="loading">
        <LoadingState label="Opening the wishlist…" :rows="3" />
      </div>

      <div v-else-if="notFound" class="mx-auto max-w-xl py-16 text-center">
        <FloralSprig :size="64" class="mx-auto text-soft-pink" />
        <h1 class="mt-6 font-display text-4xl text-ink sm:text-5xl">
          This wishlist isn't available
        </h1>
        <div class="my-8">
          <BowDivider />
        </div>
        <p class="text-sm leading-relaxed text-ink/70">
          The link may have been mistyped, or the hosts may have closed their
          wishlist. If you were sent a link, do check it with whoever shared it.
        </p>
        <BaseButton to="/" variant="secondary" class="mt-8">
          Visit Hint, Darling
        </BaseButton>
      </div>

      <div v-else-if="loadError" class="mx-auto max-w-xl py-16 text-center">
        <h1 class="font-display text-4xl text-ink">Something went wrong</h1>
        <p class="mt-4 text-sm text-ink/70">{{ loadError }}</p>
        <BaseButton class="mt-8" @click="load">Try again</BaseButton>
      </div>

      <template v-else-if="wishlist">
        <!-- Hero -->
        <header class="relative overflow-hidden rounded-[2.5rem] border border-blush bg-white/70 px-6 py-12 text-center shadow-soft sm:px-12 sm:py-16">
          <FloralSprig
            :size="70"
            class="pointer-events-none absolute -left-3 -top-3 text-sage-deep/40"
          />
          <FloralSprig
            :size="70"
            flip
            class="pointer-events-none absolute -bottom-4 -right-3 text-sage-deep/40"
          />

          <span
            class="inline-flex items-center gap-2 rounded-full border border-blush bg-blush/40 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-rose"
          >
            <HeartIcon :size="13" />
            {{ eventTypeLabel(wishlist.event.type) }}
          </span>

          <h1 class="mt-5 font-display text-4xl leading-tight text-ink sm:text-6xl">
            {{ wishlist.event.name }}
          </h1>

          <p
            v-if="dateLabel || wishlist.event.location"
            class="mt-4 text-sm text-ink/70 sm:text-base"
          >
            <span v-if="dateLabel">{{ dateLabel }}</span>
            <span v-if="dateLabel && wishlist.event.location"> · </span>
            <span v-if="wishlist.event.location">
              {{ wishlist.event.location }}
            </span>
          </p>

          <div class="mx-auto my-8 max-w-xs">
            <BowDivider />
          </div>

          <h2 class="font-display text-2xl text-ink sm:text-3xl">
            {{ wishlist.title }}
          </h2>
          <p
            v-if="wishlist.description"
            class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink/70 sm:text-base"
          >
            {{ wishlist.description }}
          </p>
          <p class="mt-4 text-xs uppercase tracking-[0.25em] text-rose/80">
            {{ giftCount }} {{ giftCount === 1 ? "gift" : "gifts" }}
          </p>
        </header>

        <div v-if="locationCoordinates" class="mt-8">
          <EventLocationMap
            :latitude="locationCoordinates.lat"
            :longitude="locationCoordinates.lng"
            :label="wishlist.event.location ?? wishlist.event.name"
          />
        </div>

        <!-- Gifts -->
        <div class="mt-14">
          <div class="flex items-end justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-rose">
                With love
              </p>
              <h2 class="mt-2 font-display text-3xl text-ink sm:text-4xl">
                Choose a gift
              </h2>
            </div>
          </div>

          <EmptyState
            v-if="giftCount === 0"
            class="mt-8"
            title="Nothing here just yet"
            message="The hosts haven't added any gifts yet. Do check back soon."
          />

          <ul
            v-else
            class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6"
            aria-label="Wishlist gifts"
          >
            <li v-for="gift in wishlist.items" :key="gift.id">
              <PublicGiftCard
                :gift="gift"
                :claimed-by-you="claimedByYou(gift)"
                :manage-url="manageUrlFor(gift)"
                :busy="busyItemId === gift.id"
                @claim="askClaim(gift)"
              />
            </li>
          </ul>
        </div>

        <p class="mt-14 text-center text-xs text-ink/45">
          Shared with you via
          <RouterLink to="/" class="text-rose underline-offset-2 hover:underline">
            Hint, Darling
          </RouterLink>
        </p>
      </template>
    </section>

    <ClaimDialog
      v-model="claimOpen"
      :gift="selectedGift"
      :share-token="shareToken"
      @claimed="onClaimed"
      @conflict="onClaimConflict"
    />

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-3 opacity-0"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="translate-y-3 opacity-0"
    >
      <div
        v-if="toastMessage"
        role="status"
        aria-live="polite"
        class="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4"
      >
        <div
          class="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border border-blush bg-white/95 px-5 py-4 text-sm text-ink shadow-card"
        >
          <span
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
            aria-hidden="true"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span class="leading-relaxed">{{ toastMessage }}</span>
          <button
            type="button"
            class="shrink-0 text-ink/45 transition-colors hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
            aria-label="Dismiss notification"
            @click="toastMessage = null"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
