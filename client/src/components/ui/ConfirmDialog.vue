<script setup lang="ts">
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseModal from "@/components/ui/BaseModal.vue";

const open = defineModel<boolean>({ required: true });

withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    loading?: boolean;
    error?: string | null;
  }>(),
  {
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    loading: false,
    error: null,
  },
);

const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <BaseModal v-model="open" :title="title" size="sm">
    <p class="text-sm leading-relaxed text-ink/75">{{ message }}</p>

    <p
      v-if="error"
      role="alert"
      class="mt-4 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
    >
      {{ error }}
    </p>

    <template #footer>
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          variant="secondary"
          :disabled="loading"
          @click="open = false"
        >
          {{ cancelLabel }}
        </BaseButton>
        <BaseButton :disabled="loading" @click="emit('confirm')">
          {{ loading ? "Working…" : confirmLabel }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
