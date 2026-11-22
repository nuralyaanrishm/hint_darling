<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    label: string;
    type?: string;
    autocomplete?: string;
    placeholder?: string;
    inputmode?: "text" | "numeric" | "decimal" | "email" | "tel" | "url" | "search";
    maxlength?: number;
    pattern?: string;
    required?: boolean;
    error?: string;
    /** Helper text shown under the field when there is no error. */
    hint?: string;
    disabled?: boolean;
  }>(),
  {
    type: "text",
    placeholder: undefined,
    autocomplete: undefined,
    inputmode: undefined,
    maxlength: undefined,
    pattern: undefined,
    required: false,
    error: undefined,
    hint: undefined,
    disabled: false,
  },
);

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-baseline justify-between gap-3">
      <label :for="id" class="text-sm font-medium text-ink/80">{{ label }}</label>
      <slot name="labelAction" />
    </div>
    <div class="relative">
      <input
        :id="id"
        v-model="model"
        :type="type"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :maxlength="maxlength"
        :pattern="pattern"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
        class="w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-ink/35 transition focus:outline-none focus:ring-2 focus:ring-rose disabled:cursor-not-allowed disabled:opacity-60"
        :class="[
          error ? 'border-rose-deep' : 'border-blush focus:border-rose',
          $slots.trailing ? 'pr-12' : '',
        ]"
      />
      <div
        v-if="$slots.trailing"
        class="absolute inset-y-0 right-0 flex items-center pr-2"
      >
        <slot name="trailing" />
      </div>
    </div>
    <p v-if="error" :id="`${id}-error`" class="text-xs text-rose-deep">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="`${id}-hint`" class="text-xs text-ink/55">
      {{ hint }}
    </p>
  </div>
</template>
