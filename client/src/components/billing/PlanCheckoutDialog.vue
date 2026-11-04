<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import { createPlanCheckout, isApiError } from "@/lib/api";
import {
  PLAN_CATALOG,
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_ORDER,
  formatPlanPrice,
  type PlanFeatureKey,
  type PlanTier,
} from "@/lib/plans";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{
  plan: Exclude<PlanTier, "FREE">;
}>();

const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const definition = computed(() => PLAN_CATALOG[props.plan]);

const benefits = computed(() =>
  PLAN_FEATURE_ORDER.filter((key) => definition.value.features[key]).map(
    (key) => ({
      key,
      label: PLAN_FEATURE_LABELS[key],
      comingSoon: definition.value.comingSoon.includes(key as PlanFeatureKey),
    }),
  ),
);

const priceLabel = computed(() => formatPlanPrice(definition.value.priceSen));

watch(open, (isOpen) => {
  if (isOpen) {
    submitting.value = false;
    errorMessage.value = null;
  }
});

async function pay() {
  if (submitting.value) return;

  submitting.value = true;
  errorMessage.value = null;

  try {
    const { paymentUrl } = await createPlanCheckout(props.plan);
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
  <BaseModal
    v-model="open"
    :title="`Upgrade to ${definition.label}`"
    size="sm"
  >
    <p class="text-sm leading-relaxed text-ink/75">
      One payment of {{ priceLabel }}, yours forever. No subscription and no
      renewal.
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
