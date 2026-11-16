<script setup lang="ts">
import { RouterLink } from "vue-router";
import { HERO_GIFTS } from "@/lib/heroGifts";

/* The readable version of the card's inside, used wherever the 3D scene is not
   running: small screens, reduced motion, or no WebGL. Same data as the objects
   on the paper, so the two can never drift apart. */
</script>

<template>
  <div class="flex h-full flex-col px-6 py-6 text-left">
    <p class="text-[10px] uppercase tracking-[0.22em] text-rose">Inside</p>
    <p class="mt-1 font-display text-xl leading-tight text-ink">
      Amelia's birthday
    </p>

    <ul class="mt-3 space-y-1.5">
      <li
        v-for="gift in HERO_GIFTS"
        :key="gift.id"
        class="flex items-center gap-2 text-[12px] leading-5"
      >
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full"
          :class="gift.claimed ? 'bg-sage-deep/70' : 'border border-rose/50'"
          aria-hidden="true"
        />
        <span :class="gift.claimed ? 'text-ink/45' : 'text-ink'">
          {{ gift.label }}
        </span>
        <span
          v-if="gift.claimed"
          class="ml-auto text-[9px] uppercase tracking-[0.14em] text-sage-deep"
        >
          claimed
        </span>
      </li>
    </ul>

    <RouterLink
      to="/create"
      class="mt-auto inline-flex items-center gap-1 self-start text-[10px] uppercase tracking-[0.18em] text-rose transition-colors hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
    >
      Make your own
      <span aria-hidden="true">&rarr;</span>
    </RouterLink>
  </div>
</template>
