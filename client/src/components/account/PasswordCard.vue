<script setup lang="ts">
import { computed, ref } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import PasswordInput from "@/components/ui/PasswordInput.vue";
import { isApiError, type FieldError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

const { user, changePassword } = useAuth();

const hasPassword = computed(() => user.value?.hasPassword === true);

const currentPassword = ref("");
const newPassword = ref("");
const confirm = ref("");

const currentError = ref<string | undefined>();
const newError = ref<string | undefined>();
const confirmError = ref<string | undefined>();
const formError = ref<string | null>(null);
const success = ref(false);
const submitting = ref(false);

function resetErrors() {
  currentError.value = undefined;
  newError.value = undefined;
  confirmError.value = undefined;
  formError.value = null;
}

function applyFieldErrors(fields: FieldError[]) {
  for (const field of fields) {
    if (field.field === "currentPassword") currentError.value = field.message;
    if (field.field === "newPassword") newError.value = field.message;
  }
}

function validate(): boolean {
  resetErrors();
  let valid = true;

  if (hasPassword.value && !currentPassword.value) {
    currentError.value = "Enter your current password";
    valid = false;
  }

  if (newPassword.value.length < 8) {
    newError.value = "Use at least 8 characters";
    valid = false;
  }

  if (confirm.value !== newPassword.value) {
    confirmError.value = "Both passwords need to match";
    valid = false;
  }

  return valid;
}

async function onSubmit() {
  success.value = false;

  if (!validate()) return;

  submitting.value = true;

  try {
    await changePassword({
      ...(hasPassword.value
        ? { currentPassword: currentPassword.value }
        : {}),
      newPassword: newPassword.value,
    });

    currentPassword.value = "";
    newPassword.value = "";
    confirm.value = "";
    success.value = true;
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
  <section
    class="rounded-[1.6rem] border border-blush/80 bg-white/70 p-6 sm:p-8"
    aria-labelledby="password-heading"
  >
    <h2 id="password-heading" class="font-display text-2xl text-ink">
      {{ hasPassword ? "Change password" : "Add a password" }}
    </h2>
    <p class="mt-2 text-sm leading-relaxed text-ink/70">
      <template v-if="hasPassword">
        Choose a new password. We'll sign out your other devices, but keep you
        signed in here.
      </template>
      <template v-else>
        You signed up with Google, so this account has no password yet. Add one
        to sign in with email as well.
      </template>
    </p>

    <p
      v-if="formError"
      role="alert"
      class="mt-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
    >
      {{ formError }}
    </p>

    <p
      v-if="success"
      role="status"
      class="mt-5 rounded-2xl border border-rose/30 bg-white/70 px-4 py-3 text-sm text-ink/80"
    >
      {{
        hasPassword
          ? "Password updated just now. Your other devices have been signed out."
          : "Password added. You can now sign in with your email too."
      }}
    </p>

    <form
      class="mt-6 flex flex-col gap-4"
      novalidate
      :aria-busy="submitting"
      @submit.prevent="onSubmit"
    >
      <PasswordInput
        v-if="hasPassword"
        id="account-current-password"
        v-model="currentPassword"
        label="Current password"
        autocomplete="current-password"
        required
        :error="currentError"
      />

      <PasswordInput
        id="account-new-password"
        v-model="newPassword"
        :label="hasPassword ? 'New password' : 'Password'"
        hint="At least 8 characters."
        required
        :error="newError"
      />

      <PasswordInput
        id="account-confirm-password"
        v-model="confirm"
        :label="hasPassword ? 'Confirm new password' : 'Confirm password'"
        required
        :error="confirmError"
      />

      <div class="mt-1 flex justify-end">
        <BaseButton type="submit" :disabled="submitting">
          {{
            submitting
              ? "Updating…"
              : hasPassword
                ? "Update password"
                : "Add password"
          }}
        </BaseButton>
      </div>
    </form>
  </section>
</template>
