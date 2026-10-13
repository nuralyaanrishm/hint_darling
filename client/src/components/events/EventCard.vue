<script setup lang="ts">
import { computed } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import GiftIcon from "@/components/decor/GiftIcon.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import { eventTypeLabel } from "@/lib/eventOptions";
import type { EventSummary } from "@/lib/api";

const props = defineProps<{ event: EventSummary }>();

const emit = defineEmits<{ delete: [] }>();

const dateLabel = computed(() => {
  if (!props.event.eventDate) return null;
  return new Date(props.event.eventDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const itemCount = computed(() => props.event.wishlist?.itemCount ?? 0);
const claimedCount = computed(() => props.event.wishlist?.claimedCount ?? 0);
const claimPercent = computed(() => {
  if (itemCount.value === 0) return 0;
  return Math.round((claimedCount.value / itemCount.value) * 100);
});
</script>

<template>
  <BaseCard
    elevated
    class="flex h-full flex-col text-left transition-transform duration-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0"
  >
    <div class="flex items-start justify-between gap-3">
      <span
        class="inline-flex rounded-full border border-blush bg-blush/40 px-3 py-1 text-xs text-rose"
      >
        {{ eventTypeLabel(event.type) }}
      </span>
      <HeartIcon :size="18" class="shrink-0 text-soft-pink" />
    </div>

    <h3 class="mt-4 font-display text-2xl text-ink">{{ event.name }}</h3>

    <dl class="mt-3 space-y-1 text-sm text-ink/70">
      <div v-if="dateLabel" class="flex items-center gap-2">
        <dt class="sr-only">Date</dt>
        <dd>{{ dateLabel }}</dd>
      </div>
      <div v-if="event.location" class="flex items-center gap-2">
        <dt class="sr-only">Location</dt>
        <dd>{{ event.location }}</dd>
      </div>
    </dl>

    <template v-if="event.wishlist && itemCount > 0">
      <div
        class="mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm"
        :class="
          claimedCount > 0
            ? 'bg-blush/50 text-rose-deep'
            : 'bg-sage/30 text-sage-deep'
        "
      >
        <GiftIcon
          :size="15"
          class="mt-0.5 shrink-0"
          :class="claimedCount > 0 ? 'text-rose-deep' : 'text-sage-deep'"
        />
        <p class="leading-snug">
          <template v-if="claimedCount > 0">
            {{ claimedCount }} of {{ itemCount }}
            {{ itemCount === 1 ? "gift" : "gifts" }} claimed 🎁
          </template>
          <template v-else>Nothing claimed yet 💝</template>
        </p>
      </div>
      <div
        class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-blush/60"
        role="progressbar"
        :aria-valuenow="claimPercent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${claimedCount} of ${itemCount} gifts claimed`"
      >
        <div
          class="h-full rounded-full bg-rose transition-all duration-500"
          :style="{ width: `${claimPercent}%` }"
        />
      </div>
    </template>
    <p v-else class="mt-4 text-sm text-ink/70">
      <template v-if="event.wishlist">
        {{ itemCount }} {{ itemCount === 1 ? "gift" : "gifts" }}
      </template>
      <template v-else>No wishlist yet</template>
    </p>

    <div class="mt-auto flex flex-wrap items-center gap-2 pt-6">
      <BaseButton :to="`/events/${event.id}`" size="sm">View</BaseButton>
      <BaseButton
        :to="`/events/${event.id}/edit`"
        size="sm"
        variant="secondary"
      >
        Edit
      </BaseButton>
      <BaseButton
        size="sm"
        variant="ghost"
        class="ml-auto"
        @click="emit('delete')"
      >
        Delete
      </BaseButton>
    </div>
  </BaseCard>
</template>
