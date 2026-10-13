<script setup lang="ts">
import BaseCard from "@/components/ui/BaseCard.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";

interface PreviewGift {
  name: string;
  detail: string;
  price: string;
  status: "available" | "claimed";
}

// Static, illustrative content for the design preview — not live data.
const gifts: PreviewGift[] = [
  { name: "Linen duvet set", detail: "Queen · stone", price: "$180", status: "available" },
  { name: "Stand mixer", detail: "Cream", price: "$349", status: "claimed" },
  { name: "Honeymoon fund", detail: "Any contribution", price: "$100", status: "available" },
  { name: "Crystal bud vase", detail: "Set of two", price: "$75", status: "claimed" },
];

const claimed = gifts.filter((gift) => gift.status === "claimed").length;
const total = gifts.length;
const progress = Math.round((claimed / total) * 100);
</script>

<template>
  <section id="wishlist-preview" class="relative">
    <div class="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div class="mx-auto max-w-2xl space-y-4 text-center">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">The preview</p>
        <h2 class="text-balance font-display text-4xl text-ink sm:text-5xl">
          A wishlist your guests will adore
        </h2>
        <p class="text-ink/70">
          Every gift is laid out beautifully with its price and status, so your
          loved ones can choose what they'll give, and see what's already taken.
        </p>
      </div>

      <BaseCard elevated class="mx-auto mt-12 max-w-3xl overflow-hidden" flush>
        <!-- Wishlist header -->
        <div class="border-b border-blush/70 bg-blush/30 px-7 py-7 sm:px-9">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-1 text-left">
              <p class="text-xs uppercase tracking-[0.3em] text-rose">
                Wedding · 14 June
              </p>
              <h3 class="font-display text-3xl text-ink">Emma &amp; James</h3>
              <p class="text-sm text-ink/60">A home full of love, and a few lovely things.</p>
            </div>
            <HeartIcon :size="26" class="text-soft-pink" />
          </div>

          <div class="mt-6">
            <div class="flex items-center justify-between text-xs text-ink/60">
              <span>{{ claimed }} of {{ total }} gifts claimed</span>
              <span>{{ progress }}%</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-white">
              <div
                class="h-full rounded-full bg-gradient-to-r from-soft-pink to-rose transition-[width] duration-500"
                :style="{ width: `${progress}%` }"
                role="progressbar"
                :aria-valuenow="progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Gifts claimed"
              />
            </div>
          </div>
        </div>

        <!-- Gift list -->
        <ul class="divide-y divide-blush/60">
          <li
            v-for="gift in gifts"
            :key="gift.name"
            class="flex items-center gap-4 px-7 py-5 transition-colors duration-300 hover:bg-cream/70 sm:px-9"
          >
            <span
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blush bg-white text-rose"
              aria-hidden="true"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 12v8H4v-8" />
                <path d="M2 8h20v4H2z" />
                <path d="M12 8v12" />
                <path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5h4Z" />
                <path d="M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5h-4Z" />
              </svg>
            </span>

            <div class="min-w-0 flex-1 text-left">
              <p class="truncate font-medium text-ink">{{ gift.name }}</p>
              <p class="truncate text-sm text-ink/55">{{ gift.detail }}</p>
            </div>

            <div class="flex shrink-0 items-center gap-3 sm:gap-5">
              <span class="text-sm font-medium text-ink">{{ gift.price }}</span>

              <span
                class="hidden rounded-full px-3 py-1 text-xs sm:inline-flex"
                :class="
                  gift.status === 'claimed'
                    ? 'bg-sage text-sage-deep'
                    : 'bg-blush text-rose'
                "
              >
                {{ gift.status === "claimed" ? "Claimed" : "Available" }}
              </span>

              <button
                type="button"
                disabled
                class="rounded-full border border-rose/30 px-4 py-1.5 text-xs text-rose/50"
                :title="
                  gift.status === 'claimed'
                    ? 'Already claimed'
                    : 'Guests claim gifts in the live app'
                "
              >
                {{ gift.status === "claimed" ? "Taken" : "I'll get this!" }}
              </button>
            </div>
          </li>
        </ul>

        <p class="border-t border-blush/70 bg-cream/60 px-7 py-4 text-center text-xs text-ink/50 sm:px-9">
          Guests can claim gifts with a private management link.
        </p>
      </BaseCard>
    </div>
  </section>
</template>
