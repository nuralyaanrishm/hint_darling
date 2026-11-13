<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import { createPlanCheckout, isApiError } from "@/lib/api";
import {
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_ORDER,
  PRICING_COLUMNS,
  PRO_IS_LAUNCH_PRICE,
  formatPlanPrice,
  type BillingProduct,
  type PlanFeatureKey,
} from "@/lib/plans";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{
  product: BillingProduct;
  /** Required for an Event Pass; ignored for Pro. */
  eventId?: string;
  eventName?: string;
}>();

const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const column = computed(() => PRICING_COLUMNS[props.product]);

const isEventPass = computed(() => props.product === "EVENT_PASS");

const title = computed(() =>
  isEventPass.value
    ? `Unlock ${props.eventName ?? "this event"}`
    : `Upgrade to ${column.value.label}`,
);

const benefits = computed(() =>
  PLAN_FEATURE_ORDER.filter((key) => column.value.features[key]).map(
    (key) => ({
      key,
      label: PLAN_FEATURE_LABELS[key],
      comingSoon: column.value.comingSoon.includes(key as PlanFeatureKey),
    }),
  ),
);

const priceLabel = computed(() => formatPlanPrice(column.value.priceSen));

watch(open, (isOpen) => {
  if (isOpen) {
    submitting.value = false;
    errorMessage.value = null;
  }
});

async function pay() {
  if (submitting.value) return;

  if (isEventPass.value && !props.eventId) {
    errorMessage.value = "Choose an event to unlock first.";
    return;
  }

  submitting.value = true;
  errorMessage.value = null;

  try {
    const { paymentUrl } = await createPlanCheckout(
      props.product,
      isEventPass.value ? props.eventId : undefined,
    );
    window.location.assign(paymentUrl);
  } catch (error) {
    if (isApiError(error)) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value =
        "We couldn't start the payment right now. Please try again.";
    }
    submitting.value = false;
  }
}
</script>

<template>
  <BaseModal v-model="open" :title="title" size="sm">
    <p class="text-sm leading-relaxed text-ink/75">
      <template v-if="isEventPass">
        One payment of {{ priceLabel }} unlocks this event — no subscription and
        no renewal.
      </template>
      <template v-else>
        One payment of {{ priceLabel }}, yours forever. No subscription and no
        renewal.
      </template>
    </p>

    <p
      v-if="!isEventPass && PRO_IS_LAUNCH_PRICE"
      class="mt-2 inline-flex rounded-full bg-rose/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-rose-deep"
    >
      Launch price
    </p>

    <ul class="mt-5 space-y-3 text-sm text-ink/75">
      <li
        v-for="benefit in benefits"
        :key="benefit.key"
        class="flex items-start gap-3"
      >
        <span
          v-if="!benefit.comingSoon"
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
          aria-hidden="true"
        >
          ✓
        </span>
        <span>
          {{ benefit.label }}
          <span
            v-if="benefit.comingSoon"
            class="ml-1 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/60"
          >
            Soon
          </span>
        </span>
      </li>
    </ul>

    <p
      v-if="!isEventPass"
      class="mt-4 text-xs leading-relaxed text-ink/55"
    >
      One event pass covers a single celebration and stays with that event
      forever. Pro covers every event you run.
    </p>

    <p
      v-if="errorMessage"
      role="alert"
      class="mt-4 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
    >
      {{ errorMessage }}
    </p>

    <template #footer>
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          variant="secondary"
          :disabled="submitting"
          @click="open = false"
        >
          Not now
        </BaseButton>
        <BaseButton :disabled="submitting" @click="pay">
          {{ submitting ? "Redirecting…" : `Continue for ${priceLabel}` }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
