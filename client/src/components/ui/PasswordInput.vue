<script setup lang="ts">
import { computed, ref } from "vue";
import BaseInput from "@/components/ui/BaseInput.vue";

withDefaults(
  defineProps<{
    id: string;
    label: string;
    autocomplete?: string;
    placeholder?: string;
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
  }>(),
  {
    autocomplete: "new-password",
    placeholder: undefined,
    hint: undefined,
    error: undefined,
    required: false,
    disabled: false,
  },
);

const model = defineModel<string>({ required: true });

const visible = ref(false);
const type = computed(() => (visible.value ? "text" : "password"));
</script>

<template>
  <BaseInput
    :id="id"
    v-model="model"
    :label="label"
    :type="type"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    :hint="hint"
    :error="error"
    :required="required"
    :disabled="disabled"
  >
    <template #trailing>
      <button
        type="button"
        class="rounded-lg px-2 py-1 text-xs font-medium text-rose-deep transition-colors hover:bg-blush/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        :aria-pressed="visible"
        :disabled="disabled"
        @click="visible = !visible"
      >
        {{ visible ? "Hide" : "Show" }}
      </button>
    </template>
  </BaseInput>
</template>
