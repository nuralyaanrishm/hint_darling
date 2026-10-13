<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    label: string;
    rows?: number;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    maxlength?: number;
    error?: string;
  }>(),
  {
    rows: 3,
    placeholder: undefined,
    required: false,
    disabled: false,
    maxlength: undefined,
    error: undefined,
  },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-ink/80">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :maxlength="maxlength"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? `${id}-error` : undefined"
      class="w-full resize-y rounded-2xl border bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-ink/35 transition focus:outline-none focus:ring-2 focus:ring-rose disabled:cursor-not-allowed disabled:opacity-60"
      :class="error ? 'border-rose-deep' : 'border-blush focus:border-rose'"
    />
    <p v-if="error" :id="`${id}-error`" class="text-xs text-rose-deep">
      {{ error }}
    </p>
  </div>
</template>
