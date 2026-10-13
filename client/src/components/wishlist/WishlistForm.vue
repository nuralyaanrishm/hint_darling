<script setup lang="ts">
import { reactive, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import BaseTextarea from "@/components/ui/BaseTextarea.vue";
import type { PrivacyMode, WishlistInput } from "@/lib/api";

const open = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    mode: "create" | "edit";
    initial?: {
      title: string;
      description: string | null;
      privacyMode: PrivacyMode;
    } | null;
    submitting?: boolean;
    formError?: string | null;
    fieldErrors?: Record<string, string>;
  }>(),
  {
    initial: null,
    submitting: false,
    formError: null,
    fieldErrors: () => ({}),
  },
);

const emit = defineEmits<{ submit: [payload: WishlistInput] }>();

const PRIVACY_OPTIONS = [
  {
    value: "LINK_ONLY",
    label: "Anyone with the link",
  },
  {
    value: "PUBLIC",
    label: "Public — anyone can view",
  },
  {
    value: "PRIVATE",
    label: "Private — only you",
  },
];

const privacyHelp: Record<PrivacyMode, string> = {
  LINK_ONLY: "Friends and family with your link can view and claim gifts.",
  PUBLIC: "Anyone on the internet can view the wishlist and claim gifts.",
  PRIVATE: "Guests can't see the list at all until you switch it back.",
};

const form = reactive<{
  title: string;
  description: string;
  privacyMode: PrivacyMode;
}>({
  title: "",
  description: "",
  privacyMode: "LINK_ONLY",
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  form.title = props.initial?.title ?? "";
  form.description = props.initial?.description ?? "";
  form.privacyMode = props.initial?.privacyMode ?? "LINK_ONLY";
});

function onSubmit() {
  emit("submit", {
    title: form.title.trim(),
    description: form.description.trim() || null,
    privacyMode: form.privacyMode,
  });
}
</script>

<template>
  <BaseModal
    v-model="open"
    :title="mode === 'create' ? 'Create your wishlist' : 'Edit wishlist'"
    size="md"
  >
    <p
      v-if="formError"
      role="alert"
      class="mb-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
    >
      {{ formError }}
    </p>

    <form
      id="wishlist-form"
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="onSubmit"
    >
      <BaseInput
        id="wishlist-title"
        v-model="form.title"
        label="Title"
        placeholder="Emma & James's wishlist"
        required
        :error="fieldErrors.title"
      />
      <BaseTextarea
        id="wishlist-description"
        v-model="form.description"
        label="Description (optional)"
        placeholder="A few words for your guests"
        :rows="3"
        :error="fieldErrors.description"
      />
      <BaseSelect
        id="wishlist-privacy"
        v-model="form.privacyMode"
        label="Who can see this wishlist?"
        :options="PRIVACY_OPTIONS"
        :error="fieldErrors.privacyMode"
      />
      <p
        class="-mt-1 text-xs leading-relaxed text-ink/55"
        role="note"
        :aria-describedby="privacyHelp[form.privacyMode] ? 'wishlist-privacy-help' : undefined"
      >
        <span id="wishlist-privacy-help">{{ privacyHelp[form.privacyMode] }}</span>
      </p>
    </form>

    <template #footer>
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          variant="secondary"
          :disabled="submitting"
          @click="open = false"
        >
          Cancel
        </BaseButton>
        <BaseButton type="submit" form="wishlist-form" :disabled="submitting">
          {{
            submitting
              ? "Saving…"
              : mode === "create"
                ? "Create wishlist"
                : "Save changes"
          }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
