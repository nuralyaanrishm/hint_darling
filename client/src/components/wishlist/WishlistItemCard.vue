<script setup lang="ts">
import { computed } from "vue";
import GiftIcon from "@/components/decor/GiftIcon.vue";
import type { WishlistItemDto } from "@/lib/api";

const props = defineProps<{
  item: WishlistItemDto;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  remove: [];
  moveUp: [];
  moveDown: [];
}>();

const priceLabel = computed(() => {
  if (props.item.price === null) return null;
  const value = Number(props.item.price);
  if (Number.isNaN(value)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: props.item.currency,
    }).format(value);
  } catch {
    return `${props.item.currency} ${value.toFixed(2)}`;
  }
});

const details = computed(() =>
  [
    props.item.preferredColour,
    props.item.preferredSize,
    props.item.preferredVariation,
  ].filter((value): value is string => Boolean(value)),
);
</script>

<template>
  <article
    class="flex h-full flex-col overflow-hidden rounded-3xl border border-blush bg-white/80 shadow-soft"
  >
    <div class="relative aspect-[4/3] w-full overflow-hidden bg-blush/40">
      <img
        v-if="item.imageUrl"
        :src="item.imageUrl"
        :alt="item.name"
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
          width="34"
          height="34"
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
        v-if="item.quantity > 1"
        class="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink shadow-soft"
      >
        × {{ item.quantity }}
      </span>

      <div class="absolute right-2 top-2 flex gap-1">
        
      </div>
    </div>

    <div class="flex flex-1 flex-col p-5 text-left">
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-display text-xl leading-snug text-ink">{{ item.name }}</h3>
        <span v-if="priceLabel" class="shrink-0 text-sm font-medium text-ink">
          {{ priceLabel }}
        </span>
      </div>

      <p v-if="item.description" class="mt-2 text-sm leading-relaxed text-ink/65">
        {{ item.description }}
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

      <div
        class="mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm"
        :class="
          item.isClaimed
            ? 'bg-blush/50 text-rose-deep'
            : 'bg-sage/30 text-sage-deep'
        "
      >
        <GiftIcon
          :size="16"
          class="mt-0.5 shrink-0"
          :class="item.isClaimed ? 'text-rose-deep' : 'text-sage-deep'"
        />
        <p class="leading-snug">
          <span v-if="item.isClaimed">
            Claimed — someone's getting you this gift! 🎁
          </span>
          <span v-else>Available — still waiting to be chosen. 💝</span>
        </p>
      </div>

      <p
        v-if="item.notes"
        class="mt-3 rounded-2xl bg-sage/40 px-3 py-2 text-xs leading-relaxed text-sage-deep"
      >
        {{ item.notes }}
      </p>

      <div class="mt-auto flex items-center gap-2 pt-5">
        <a
          v-if="item.productUrl"
          :href="item.productUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs font-medium text-rose underline-offset-2 transition-colors hover:text-rose-deep hover:underline"
        >
          View product
        </a>
        <button
          type="button"
          class="ml-auto text-xs text-ink/60 transition-colors hover:text-rose"
          @click="emit('edit')"
        >
          Edit
        </button>
        <button
          type="button"
          class="text-xs text-ink/60 transition-colors hover:text-rose-deep"
          @click="emit('remove')"
        >
          Remove
        </button>
      </div>
    </div>
  </article>
</template>
