<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const open = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    title?: string;
    size?: "sm" | "md" | "lg";
  }>(),
  {
    title: undefined,
    size: "md",
  },
);

const panel = ref<HTMLElement | null>(null);

const sizeClass = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
}[props.size];

function close() {
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    close();
  }
}

watch(open, (isOpen) => {
  if (typeof document === "undefined") return;
  document.body.style.overflow = isOpen ? "hidden" : "";
  if (isOpen) {
    requestAnimationFrame(() => panel.value?.focus());
  }
});

onMounted(() => document.addEventListener("keydown", onKeydown));

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6"
        @click.self="close"
      >
        <div
          ref="panel"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-blush bg-cream shadow-card focus:outline-none sm:rounded-[2rem]"
          :class="sizeClass"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-blush/70 px-6 py-5 sm:px-8"
          >
            <h2 class="font-display text-2xl text-ink">{{ title }}</h2>
            <button
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blush text-ink/60 transition-colors hover:bg-blush/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
              aria-label="Close dialog"
              @click="close"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div class="overflow-y-auto px-6 py-6 sm:px-8">
            <slot />
          </div>

          <footer
            v-if="$slots.footer"
            class="border-t border-blush/70 px-6 py-5 sm:px-8"
          >
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s var(--ease-gentle, ease);
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.25s var(--ease-gentle, ease);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: translateY(1rem);
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active > div,
  .modal-leave-active > div {
    transition: none;
  }
}
</style>
