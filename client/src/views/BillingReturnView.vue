<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { isApiError, reconcilePurchase } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { usePageMeta } from "@/lib/usePageMeta";

const { refreshUser } = useAuth();

type State = "checking" | "success" | "pending" | "error";

const state = ref<State>("checking");
const message = ref<string | null>(null);

usePageMeta(() => ({
  title: "Payment · Hint, Darling",
  description: "Confirming your one-time Pro unlock.",
}));

async function check() {
  state.value = "checking";
  message.value = null;

  try {
    const result = await reconcilePurchase();

    if (result.billing.plan === "PRO") {
      await refreshUser();
      state.value = "success";
      return;
    }

    state.value = "pending";
    message.value =
      "We haven't received the payment confirmation yet. If you've just paid, give it a moment and check again.";
  } catch (error) {
    state.value = "error";
    message.value = isApiError(error)
      ? error.message
      : "We couldn't confirm the payment right now.";
  }
}

onMounted(() => {
  void check();
});
</script>

<template>
  <section class="mx-auto max-w-xl px-5 py-20 sm:px-8">
    <BaseCard elevated class="text-center">
      <template v-if="state === 'checking'">
        <LoadingState label="Checking your payment…" :rows="2" />
      </template>

      <template v-else-if="state === 'success'">
        <div
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage text-sage-deep"
          aria-hidden="true"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 class="mt-5 font-display text-3xl text-ink">You're all unlocked!</h1>
        <p class="mt-3 text-sm leading-relaxed text-ink/70">
          Your account now has unlimited gifts on every wishlist and claim
          insights so you can see how many gifts have been reserved. Thank you
          for supporting Hint, Darling.
        </p>
        <BaseButton to="/dashboard" class="mt-6">Back to my wishlists</BaseButton>
      </template>

      <template v-else-if="state === 'pending'">
        <h1 class="font-display text-3xl text-ink">Payment not confirmed yet</h1>
        <p class="mt-3 text-sm leading-relaxed text-ink/70">{{ message }}</p>
        <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <BaseButton variant="secondary" to="/dashboard">
            Back to dashboard
          </BaseButton>
          <BaseButton @click="check">Check again</BaseButton>
        </div>
      </template>

      <template v-else>
        <h1 class="font-display text-3xl text-ink">We couldn't verify that</h1>
        <p class="mt-3 text-sm leading-relaxed text-ink/70">{{ message }}</p>
        <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <BaseButton variant="secondary" to="/dashboard">
            Back to dashboard
          </BaseButton>
          <BaseButton @click="check">Try again</BaseButton>
        </div>
      </template>

      <p v-if="state !== 'checking'" class="mt-6 text-xs text-ink/50">
        Need help?
        <RouterLink to="/contact" class="text-rose underline underline-offset-2">
          Contact us
        </RouterLink>
      </p>
    </BaseCard>
  </section>
</template>
