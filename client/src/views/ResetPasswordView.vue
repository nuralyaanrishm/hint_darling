<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import {
  forgotPassword,
  isApiError,
  type FieldError,
} from "@/lib/api";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { resetPassword } = useAuth();

const email = computed(() =>
  typeof route.query.email === "string" ? route.query.email.trim() : "",
);

const code = ref("");
const password = ref("");
const confirm = ref("");
const codeError = ref<string | undefined>();
const passwordError = ref<string | undefined>();
const confirmError = ref<string | undefined>();
const formError = ref<string | null>(null);
const submitting = ref(false);
const resending = ref(false);
const resendIn = ref(0);
const done = ref(false);

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
  for (const field of fields) {
    if (field.field === "code") codeError.value = field.message;
    if (field.field === "password") passwordError.value = field.message;
  }
}

function validate(): boolean {
  codeError.value = undefined;
  passwordError.value = undefined;
  confirmError.value = undefined;

  let valid = true;

  if (!/^\d{6}$/.test(code.value.trim())) {
    codeError.value = "Enter the 6-digit code from your email";
    valid = false;
  }

  if (password.value.length < 8) {
    passwordError.value = "Use at least 8 characters";
    valid = false;
  }

  if (confirm.value !== password.value) {
    confirmError.value = "Both passwords need to match";
    valid = false;
  }

  return valid;
}

async function onSubmit() {
  formError.value = null;

  if (!validate()) return;

  submitting.value = true;

  try {
    await resetPassword({
      email: email.value,
      code: code.value.trim(),
      password: password.value,
    });
    done.value = true;
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
  if (resendIn.value > 0 || !email.value) return;

  formError.value = null;
  resending.value = true;

  try {
    await forgotPassword(email.value);
    startCountdown();
  } catch (error) {
    formError.value = isApiError(error)
      ? error.message
      : "Something went wrong. Please try again.";
  } finally {
    resending.value = false;
  }
}

onUnmounted(() => window.clearInterval(timer));
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-md">
      <BaseCard elevated class="px-8 py-10">
        <template v-if="done">
          <p class="text-xs uppercase tracking-[0.3em] text-rose">All set</p>
          <h1
            tabindex="-1"
            class="mt-3 font-display text-4xl text-ink focus:outline-none"
          >
            Password updated
          </h1>

          <div class="my-6">
            <BowDivider />
          </div>

          <p role="status" class="text-sm leading-relaxed text-ink/70">
            You're signed in with your new password. For your security, we also
            signed out your other devices.
          </p>

          <BaseButton block class="mt-6" @click="router.push('/dashboard')">
            Go to dashboard
          </BaseButton>
        </template>

        <template v-else-if="email">
          <p class="text-xs uppercase tracking-[0.3em] text-rose">Almost there</p>
          <h1 class="mt-3 font-display text-4xl text-ink">Choose a new password</h1>

          <div class="my-6">
            <BowDivider />
          </div>

          <p class="text-sm leading-relaxed text-ink/70">
            Resetting the password for
            <span class="font-medium text-ink">{{ email }}</span
            >.
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
              id="reset-code"
              v-model="code"
              label="Reset code"
              autocomplete="one-time-code"
              inputmode="numeric"
              pattern="[0-9]*"
              :maxlength="6"
              placeholder="000000"
              required
              :error="codeError"
              class="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.45em]"
            />

            <PasswordInput
              id="reset-password"
              v-model="password"
              label="New password"
              hint="At least 8 characters."
              required
              :error="passwordError"
            />

            <PasswordInput
              id="reset-confirm"
              v-model="confirm"
              label="Confirm new password"
              required
              :error="confirmError"
            />

            <BaseButton type="submit" block :disabled="submitting" class="mt-2">
              {{ submitting ? "Updating…" : "Update password" }}
            </BaseButton>
          </form>

          <div class="mt-6 flex flex-col items-center gap-3 text-sm text-ink/70">
            <p>Didn't get a code? Check your spam folder.</p>
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="resending || resendIn > 0"
              @click="onResend"
            >
              {{
                resendIn > 0
                  ? `Resend code in ${resendIn}s`
                  : resending
                    ? "Sending…"
                    : "Resend code"
              }}
            </BaseButton>
            <RouterLink
              to="/forgot-password"
              class="font-medium text-rose transition-colors hover:text-rose-deep"
            >
              Use a different email
            </RouterLink>
          </div>
        </template>

        <template v-else>
          <p class="text-xs uppercase tracking-[0.3em] text-rose">Almost there</p>
          <h1 class="mt-3 font-display text-4xl text-ink">Let's start again</h1>

          <div class="my-6">
            <BowDivider />
          </div>

          <p class="text-sm leading-relaxed text-ink/70">
            We couldn't tell which account you're resetting. Request a code again
            and we'll take it from there.
          </p>

          <BaseButton to="/forgot-password" block class="mt-6">
            Request a reset code
          </BaseButton>
        </template>
      </BaseCard>
    </div>
  </section>
</template>
