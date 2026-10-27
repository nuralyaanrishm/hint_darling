<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import { isApiError, type FieldError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

const router = useRouter();
const { register } = useAuth();

const form = reactive({ name: "", email: "", password: "", confirm: "" });
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

  if (!form.name.trim() || !form.email.trim() || !form.password) {
    formError.value = "Please complete every field.";
    return;
  }

  if (form.password.length < 8) {
    fieldErrors.value = {
      password: "Password must be at least 8 characters",
    };
    return;
  }

  if (form.password !== form.confirm) {
    fieldErrors.value = { confirm: "Passwords do not match" };
    return;
  }

  submitting.value = true;

  try {
    const result = await register({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    await router.push({
      name: "verify-email",
      query: { email: result.email, sent: "1" },
    });
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
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-md">
      <BaseCard elevated class="px-8 py-10">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Join us</p>
        <h1 class="mt-3 font-display text-4xl text-ink">Create your account</h1>

        <div class="my-6">
          <BowDivider />
        </div>

        <p
          v-if="formError"
          role="alert"
          class="mb-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
        >
          {{ formError }}
        </p>

        <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
          <BaseInput
            id="register-name"
            v-model="form.name"
            label="Name"
            autocomplete="name"
            placeholder="Your name"
            required
            :error="fieldErrors.name"
          />
          <BaseInput
            id="register-email"
            v-model="form.email"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
            :error="fieldErrors.email"
          />
          <BaseInput
            id="register-password"
            v-model="form.password"
            label="Password"
            type="password"
            autocomplete="new-password"
            placeholder="At least 8 characters"
            required
            :error="fieldErrors.password"
          />
          <BaseInput
            id="register-confirm"
            v-model="form.confirm"
            label="Confirm password"
            type="password"
            autocomplete="new-password"
            placeholder="Repeat your password"
            required
            :error="fieldErrors.confirm"
          />

          <BaseButton type="submit" block :disabled="submitting" class="mt-2">
            {{ submitting ? "Creating account…" : "Create account" }}
          </BaseButton>
        </form>

        <GoogleAuthButton class="mt-4" />

        <p class="mt-6 text-center text-sm text-ink/70">
          Already have an account?
          <RouterLink
            to="/login"
            class="font-medium text-rose transition-colors hover:text-rose-deep"
          >
            Log in
          </RouterLink>
        </p>
      </BaseCard>
    </div>
  </section>
</template>
