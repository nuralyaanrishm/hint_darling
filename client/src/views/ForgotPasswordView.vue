<script setup lang="ts">
import { ref } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import { forgotPassword, isApiError, type FieldError } from "@/lib/api";

const email = ref("");
const emailError = ref<string | undefined>();
const formError = ref<string | null>(null);
const submitting = ref(false);
const sentTo = ref<string | null>(null);
const resendIn = ref(0);

let timer: number | undefined;

function startCountdown() {
  resendIn.value = 60;
  window.clearInterval(timer);
  timer = window.setInterval(() => {
    if (resendIn.value <= 1) {
      resendIn.value = 0;
      window.clearInterval(timer);
      return;
    }
    resendIn.value -= 1;
  }, 1000);
}

function applyFieldErrors(fields: FieldError[]) {
  emailError.value = fields.find((field) => field.field === "email")?.message;
}

async function onSubmit() {
  formError.value = null;
  emailError.value = undefined;

  const address = email.value.trim();

  if (!address) {
    emailError.value = "Enter the email you signed up with";
    return;
  }

  submitting.value = true;

  try {
    await forgotPassword(address);
    sentTo.value = address;
    startCountdown();
  } catch (error) {
    if (isApiError(error)) {
      formError.value = error.message;
      applyFieldErrors(error.fields);
    } else {
      formError.value = "Something went wrong. Please try again.";
    }
  } finally {
    submitting.value = false;
  }
}

async function onResend() {
  if (resendIn.value > 0 || !sentTo.value) return;

  formError.value = null;
  submitting.value = true;

  try {
    await forgotPassword(sentTo.value);
    startCountdown();
  } catch (error) {
    formError.value = isApiError(error)
      ? error.message
      : "Something went wrong. Please try again.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-md">
      <BaseCard elevated class="px-8 py-10">
        <template v-if="!sentTo">
          <p class="text-xs uppercase tracking-[0.3em] text-rose">No worries</p>
          <h1 class="mt-3 font-display text-4xl text-ink">Reset your password</h1>

          <div class="my-6">
            <BowDivider />
          </div>

          <p class="text-sm leading-relaxed text-ink/70">
            Enter the email you signed up with and we'll send a 6-digit code to
            choose a new password.
          </p>

          <p
            v-if="formError"
            role="alert"
            class="mt-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
          >
            {{ formError }}
          </p>

          <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
            <BaseInput
              id="forgot-email"
              v-model="email"
              label="Email"
              type="email"
              autocomplete="email"
              placeholder="you@email.com"
              required
              :error="emailError"
            />

            <BaseButton type="submit" block :disabled="submitting" class="mt-2">
              {{ submitting ? "Sending…" : "Send reset code" }}
            </BaseButton>
          </form>

          <p class="mt-6 text-center text-sm text-ink/70">
            Remembered it?
            <RouterLink
              to="/login"
              class="font-medium text-rose transition-colors hover:text-rose-deep"
            >
              Log in
            </RouterLink>
          </p>
        </template>

        <template v-else>
          <p class="text-xs uppercase tracking-[0.3em] text-rose">Check your inbox</p>
          <h1
            tabindex="-1"
            class="mt-3 font-display text-4xl text-ink focus:outline-none"
          >
            Code on its way
          </h1>

          <div class="my-6">
            <BowDivider />
          </div>

          <p role="status" class="text-sm leading-relaxed text-ink/70">
            If an account exists for
            <span class="font-medium text-ink">{{ sentTo }}</span
            >, a reset code is on its way. It expires in 10 minutes.
          </p>

          <p
            v-if="formError"
            role="alert"
            class="mt-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
          >
            {{ formError }}
          </p>

          <BaseButton
            block
            class="mt-6"
            :to="`/reset-password?email=${encodeURIComponent(sentTo)}`"
          >
            Enter the code
          </BaseButton>

          <div class="mt-6 flex flex-col items-center gap-3 text-sm text-ink/70">
            <p>Didn't get the email? Check your spam folder.</p>
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="submitting || resendIn > 0"
              @click="onResend"
            >
              {{
                resendIn > 0
                  ? `Send again in ${resendIn}s`
                  : submitting
                    ? "Sending…"
                    : "Send again"
              }}
            </BaseButton>
            <button
              type="button"
              class="text-sm font-medium text-rose transition-colors hover:text-rose-deep"
              @click="sentTo = null"
            >
              Use a different email
            </button>
          </div>
        </template>
      </BaseCard>
    </div>
  </section>
</template>
