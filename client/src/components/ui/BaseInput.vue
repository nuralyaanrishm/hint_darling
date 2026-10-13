<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    label: string;
    type?: string;
    autocomplete?: string;
    placeholder?: string;
    required?: boolean;
    error?: string;
    disabled?: boolean;
  }>(),
  {
    type: "text",
    placeholder: undefined,
    autocomplete: undefined,
    required: false,
    error: undefined,
    disabled: false,
  },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-ink/80">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? `${id}-error` : undefined"
      class="w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-ink/35 transition focus:outline-none focus:ring-2 focus:ring-rose disabled:cursor-not-allowed disabled:opacity-60"
      :class="error ? 'border-rose-deep' : 'border-blush focus:border-rose'"
    />
    <p v-if="error" :id="`${id}-error`" class="text-xs text-rose-deep">
      {{ error }}
    </p>
  </div>
</template>
