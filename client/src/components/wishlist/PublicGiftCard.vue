<script setup lang="ts">
import { computed } from "vue";
import type { PublicGift } from "@/lib/api";

const props = withDefaults(
  defineProps<{
    gift: PublicGift;
    /** True when this device holds the active claim for the gift. */
    claimedByYou?: boolean;
    /** Private management link, provided only when the claim is this device's. */
    manageUrl?: string | null;
    /** True while a claim request is in flight for this gift. */
    busy?: boolean;
  }>(),
  {
    claimedByYou: false,
    manageUrl: null,
    busy: false,
  },
);

const emit = defineEmits<{ claim: [] }>();

const priceLabel = computed(() => {
  if (props.gift.price === null) return null;
  const value = Number(props.gift.price);
  if (Number.isNaN(value)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: props.gift.currency,
    }).format(value);
  } catch {
    return `${props.gift.currency} ${value.toFixed(2)}`;
  }
});

const details = computed(() =>
  [
    props.gift.preferredColour,
    props.gift.preferredSize,
    props.gift.preferredVariation,
  ].filter((value): value is string => Boolean(value)),
);

const claimed = computed(() => props.gift.isClaimed);
const fullyClaimed = computed(() => props.gift.isFullyClaimed);
const showCount = computed(
  () => props.gift.quantity > 1 && props.gift.claimedCount > 0,
);
</script>

<template>
  <article
    class="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-blush bg-white/90 shadow-soft transition duration-300"
    :class="fullyClaimed ? 'opacity-80' : ''"
  >
    <div class="relative aspect-[4/3] w-full overflow-hidden bg-blush/40">
      <img
        v-if="gift.imageUrl"
        :src="gift.imageUrl"
        :alt="gift.name"
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
          width="38"
          height="38"
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
        v-if="gift.quantity > 1"
        class="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink shadow-soft"
      >
        × {{ gift.quantity }}
      </span>

      <span
        v-if="fullyClaimed"
        class="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/80 px-3 py-1 text-xs font-medium text-white shadow-soft"
      >
        <svg
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
        {{ claimedByYou ? "Yours to give" : "Claimed" }}
      </span>
      <span
        v-else-if="claimed"
        class="absolute right-3 top-3 rounded-full bg-sage px-3 py-1 text-xs font-medium text-sage-deep shadow-soft"
      >
        {{ gift.remaining }} left
      </span>
    </div>

    <div class="flex flex-1 flex-col p-5 text-left">
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-display text-xl leading-snug text-ink">
          {{ gift.name }}
        </h3>
        <span v-if="priceLabel" class="shrink-0 text-sm font-medium text-ink">
          {{ priceLabel }}
        </span>
      </div>

      <p
        v-if="gift.description"
        class="mt-2 text-sm leading-relaxed text-ink/65"
      >
        {{ gift.description }}
      </p>

      <ul v-if="details.length" class="mt-3 flex flex-wrap gap-2">
        <li
          v-for="detail in details"
          :key="detail"
          class="rounded-full border border-blush bg-cream px-3 py-1 text-xs text-ink/65"
        >
          {{ detail }}
        </li>
      </ul>

      <p v-if="showCount" class="mt-3 text-xs text-ink/50">
        {{ gift.claimedCount }} of {{ gift.quantity }} claimed
      </p>

      <div class="mt-auto flex flex-col gap-2 pt-5">
        <a
          v-if="gift.productUrl"
          :href="gift.productUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-rose underline-offset-2 transition-colors hover:text-rose-deep hover:underline"
        >
          View product
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>

        <template v-if="claimedByYou">
          <a
            v-if="manageUrl"
            :href="manageUrl"
            class="inline-flex w-full items-center justify-center gap-2 rounded-full border border-blush bg-cream px-5 py-2.5 text-sm font-medium text-rose transition duration-300 ease-out hover:bg-white hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Manage your claim
          </a>
        </template>
        <template v-else-if="!fullyClaimed">
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rose px-5 py-2.5 text-sm font-medium text-white shadow-soft transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-rose-deep motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            :disabled="busy"
            @click="emit('claim')"
          >
            {{ busy ? "Reserving…" : "I’ll get this!" }}
          </button>
        </template>
        <p
          v-else
          class="rounded-full bg-ink/5 px-5 py-2.5 text-center text-sm text-ink/55"
        >
          Thanks — this one is covered
        </p>
      </div>
    </div>
  </article>
</template>
