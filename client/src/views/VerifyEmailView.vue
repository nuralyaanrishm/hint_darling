<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import {
  isApiError,
  resendVerification,
  type FieldError,
} from "@/lib/api";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { verifyEmail } = useAuth();

const email = computed(() =>
  typeof route.query.email === "string" ? route.query.email.trim() : "",
);

const code = ref("");
const codeError = ref<string | undefined>();
const formError = ref<string | null>(null);
const info = ref<string | null>(null);
const submitting = ref(false);
const resending = ref(false);
const resendIn = ref(0);

let timer: number | undefined;

function stopCountdown() {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

function startCountdown() {
  resendIn.value = 60;
  stopCountdown();
  timer = window.setInterval(() => {
    if (resendIn.value <= 1) {
      resendIn.value = 0;
      stopCountdown();
      return;
    }
    resendIn.value -= 1;
  }, 1000);
}

function applyFieldErrors(fields: FieldError[]) {
  const match = fields.find((field) => field.field === "code");
  codeError.value = match?.message;
}

async function onSubmit() {
  formError.value = null;
  info.value = null;
  codeError.value = undefined;

  if (!/^\d{6}$/.test(code.value.trim())) {
    codeError.value = "Enter the 6-digit code from your email";
    return;
  }

  submitting.value = true;

  try {
    await verifyEmail({ email: email.value, code: code.value.trim() });
    await router.push("/dashboard");
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
  if (resendIn.value > 0 || !email.value) {
    return;
  }

  formError.value = null;
  info.value = null;
  resending.value = true;

  try {
    await resendVerification(email.value);
    info.value = "If that email needs verification, a new code is on its way.";
    startCountdown();
  } catch (error) {
    formError.value = isApiError(error)
      ? error.message
      : "Something went wrong. Please try again.";
  } finally {
    resending.value = false;
  }
}

onMounted(() => {
  if (route.query.sent === "1") {
    startCountdown();
  }
});

onUnmounted(stopCountdown);
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-md">
      <BaseCard elevated class="px-8 py-10">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">One more step</p>
        <h1 class="mt-3 font-display text-4xl text-ink">Verify your email</h1>

        <div class="my-6">
          <BowDivider />
        </div>

        <template v-if="email">
          <p class="text-sm leading-relaxed text-ink/70">
            We sent a 6-digit code to
            <span class="font-medium text-ink">{{ email }}</span
            >. Enter it below to finish creating your account.
          </p>

          <p
            v-if="formError"
            role="alert"
            class="mt-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
          >
            {{ formError }}
          </p>

          <p
            v-if="info"
            role="status"
            class="mt-5 rounded-2xl border border-rose/30 bg-white/70 px-4 py-3 text-sm text-ink/80"
          >
            {{ info }}
          </p>

          <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
            <BaseInput
              id="verify-code"
              v-model="code"
              label="Verification code"
              autocomplete="one-time-code"
              inputmode="numeric"
              pattern="[0-9]*"
              :maxlength="6"
              placeholder="000000"
              required
              :error="codeError"
              class="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.45em]"
            />

            <BaseButton type="submit" block :disabled="submitting" class="mt-2">
              {{ submitting ? "Verifying…" : "Verify email" }}
            </BaseButton>
          </form>

          <div class="mt-6 flex flex-col items-center gap-3 text-sm text-ink/70">
            <p>Didn't get the email? Check your spam folder.</p>
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
          </div>

          <p class="mt-6 text-center text-sm text-ink/70">
            Wrong email?
            <RouterLink
              to="/register"
              class="font-medium text-rose transition-colors hover:text-rose-deep"
            >
              Start again
            </RouterLink>
          </p>
        </template>

        <template v-else>
          <p class="text-sm leading-relaxed text-ink/70">
            We couldn't find an email address to verify. Please create your
            account again.
          </p>
          <BaseButton to="/register" block class="mt-6">
            Create an account
          </BaseButton>
        </template>
      </BaseCard>
    </div>
  </section>
</template>
