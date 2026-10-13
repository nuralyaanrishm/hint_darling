<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    /** Internal route to navigate to (renders a RouterLink). */
    to?: string;
    /** External or same-page anchor (renders an <a>). */
    href?: string;
    type?: "button" | "submit";
    block?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    block: false,
    disabled: false,
  },
);

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-wide " +
  "transition duration-300 ease-out motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-cream " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

const variants: Record<Variant, string> = {
  primary:
    "bg-rose text-white shadow-soft hover:bg-rose-deep hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
  secondary:
    "border border-rose/40 bg-white/70 text-rose hover:border-rose hover:bg-white hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
  ghost: "text-ink hover:text-rose",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

const classes = computed(() => [
  base,
  variants[props.variant],
  sizes[props.size],
  props.block ? "w-full" : "",
]);
</script>

<template>
  <RouterLink v-if="to" :to="to" :class="classes">
    <slot />
  </RouterLink>
  <a v-else-if="href" :href="href" :class="classes">
    <slot />
  </a>
  <button v-else :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
