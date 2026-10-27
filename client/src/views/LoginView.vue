<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import {
  EMAIL_NOT_VERIFIED_CODE,
  isApiError,
  type FieldError,
} from "@/lib/api";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { login } = useAuth();

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_denied: "Google sign-in was cancelled.",
  google_not_configured: "Google sign-in isn't available right now.",
  google_email_unverified:
    "Google hasn't verified that email address, so we can't sign you in.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
};

const oauthError = computed(() => {
  const code = typeof route.query.error === "string" ? route.query.error : "";
  return OAUTH_ERROR_MESSAGES[code] ?? null;
});

const form = reactive({ email: "", password: "" });
const fieldErrors = ref<Record<string, string>>({});
const formError = ref<string | null>(null);
const submitting = ref(false);

function applyFieldErrors(fields: FieldError[]) {
  fieldErrors.value = Object.fromEntries(
    fields.map((field) => [field.field, field.message]),
  );
}

async function onSubmit() {
  formError.value = null;
  fieldErrors.value = {};

  if (!form.email.trim() || !form.password) {
    formError.value = "Please enter your email and password.";
    return;
  }

  submitting.value = true;

  try {
    await login({ email: form.email.trim(), password: form.password });
    const redirect =
      typeof route.query.redirect === "string"
        ? route.query.redirect
        : "/dashboard";
    await router.push(redirect);
  } catch (error) {
    if (isApiError(error) && error.code === EMAIL_NOT_VERIFIED_CODE) {
      await router.push({
        name: "verify-email",
        query: { email: form.email.trim() },
      });
      return;
    }

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
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-md">
      <BaseCard elevated class="px-8 py-10">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Welcome back</p>
        <h1 class="mt-3 font-display text-4xl text-ink">Log in</h1>

        <div class="my-6">
          <BowDivider />
        </div>

        

        <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
          <BaseInput
            id="login-email"
            v-model="form.email"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
            :error="fieldErrors.email"
          />
          <BaseInput
            id="login-password"
            v-model="form.password"
            label="Password"
            type="password"
            autocomplete="current-password"
            placeholder="Your password"
            required
            :error="fieldErrors.password"
          />

          <BaseButton type="submit" block :disabled="submitting" class="mt-2">
            {{ submitting ? "Logging in…" : "Log in" }}
          </BaseButton>
            <p
          v-if="oauthError"
          role="alert"
          class="mb-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
        >
          {{ oauthError }}
        </p>

        <p
          v-if="formError"
          role="alert"
          class="mb-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
        >
          {{ formError }}
        </p>

        <GoogleAuthButton />

        </form>

        <p class="mt-6 text-center text-sm text-ink/70">
          New to Hint, Darling?
          <RouterLink
            to="/register"
            class="font-medium text-rose transition-colors hover:text-rose-deep"
          >
            Create an account
          </RouterLink>
        </p>
      </BaseCard>
    </div>
  </section>
</template>
