<script setup lang="ts">
import { ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import { createUnlockCheckout, isApiError } from "@/lib/api";

const open = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    priceSen?: number;
  }>(),
  {
    priceSen: 100,
  },
);

const submitting = ref(false);
const errorMessage = ref<string | null>(null);

const priceLabel = () => {
  const amount = props.priceSen / 100;
  return `RM${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
};

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
    const { paymentUrl } = await createUnlockCheckout();
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
  <BaseModal v-model="open" title="Unlock Pro" size="sm">
    <p class="text-sm leading-relaxed text-ink/75">
      Free wishlists hold up to five gifts and don't include claim insights.
      Unlock your account once to add as many gifts as you like and see how many
      have been claimed.
    </p>

    <ul class="mt-5 space-y-3 text-sm text-ink/75">
      <li class="flex items-start gap-3">
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
          aria-hidden="true"
        >
          ✓
        </span>
        Unlimited gifts on every wishlist
      </li>
      <li class="flex items-start gap-3">
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
          aria-hidden="true"
        >
          ✓
        </span>
        See how many gifts have been claimed
      </li>
      <li class="flex items-start gap-3">
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
          aria-hidden="true"
        >
          ✓
        </span>
        One payment, yours forever
      </li>
      <li class="flex items-start gap-3">
        <span
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
          aria-hidden="true"
        >
          ✓
        </span>
        Secure FPX or card payment via ToyyibPay
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
          {{ submitting ? "Redirecting…" : `Unlock for ${priceLabel()}` }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
