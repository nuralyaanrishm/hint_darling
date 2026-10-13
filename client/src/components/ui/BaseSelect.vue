<script setup lang="ts">
interface SelectOption {
  value: string;
  label: string;
}

withDefaults(
  defineProps<{
    id: string;
    label: string;
    options: SelectOption[];
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
  }>(),
  {
    placeholder: undefined,
    required: false,
    disabled: false,
    error: undefined,
  },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-ink/80">{{ label }}</label>
    <div class="relative">
      <select
        :id="id"
        v-model="model"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${id}-error` : undefined"
        class="w-full appearance-none rounded-2xl border bg-white/80 px-4 py-3 pr-10 text-sm text-ink transition focus:outline-none focus:ring-2 focus:ring-rose disabled:cursor-not-allowed disabled:opacity-60"
        :class="error ? 'border-rose-deep' : 'border-blush focus:border-rose'"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <svg
        class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink/45"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
    <p v-if="error" :id="`${id}-error`" class="text-xs text-rose-deep">
      {{ error }}
    </p>
  </div>
</template>
