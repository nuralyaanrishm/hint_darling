<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getHealth, type HealthResponse } from "@/lib/api";

const health = ref<HealthResponse | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

async function check() {
  loading.value = true;
  error.value = null;

  try {
    health.value = await getHealth();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unknown error";
  } finally {
    loading.value = false;
  }
}

onMounted(check);
</script>

<template>
  <section class="rounded-2xl border border-blush-200 bg-white/70 p-6 shadow-sm">
    <h2 class="font-display text-xl text-ink">Connection status</h2>

    <p v-if="loading" class="mt-3 text-sm text-ink/60">Checking the backend…</p>

    <p v-else-if="error" class="mt-3 text-sm text-blush-600">
      Could not reach the backend: {{ error }}
    </p>

    <dl v-else-if="health" class="mt-3 space-y-2 text-sm text-ink">
      <div class="flex items-center gap-2">
        <dt class="font-medium">Backend</dt>
        <dd class="rounded-full bg-blush-100 px-2 py-0.5 text-blush-600">
          {{ health.status }}
        </dd>
      </div>
      <div class="flex items-center gap-2">
        <dt class="font-medium">Database</dt>
        <dd
          class="rounded-full px-2 py-0.5"
          :class="
            health.database === 'connected'
              ? 'bg-green-100 text-green-700'
              : 'bg-blush-100 text-blush-600'
          "
        >
          {{ health.database }}
        </dd>
      </div>
    </dl>

    <button
      class="mt-4 rounded-full border border-blush-300 px-4 py-1.5 text-sm text-blush-600 transition hover:bg-blush-100"
      type="button"
      @click="check"
    >
      Check again
    </button>
  </section>
</template>
