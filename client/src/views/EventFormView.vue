<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import BaseTextarea from "@/components/ui/BaseTextarea.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import LocationMapPicker from "@/components/map/LocationMapPicker.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { EVENT_TYPE_OPTIONS } from "@/lib/eventOptions";
import type { Coordinate } from "@/lib/map";
import {
  createEvent,
  getEvent,
  isApiError,
  updateEvent,
  type EventInput,
  type EventType,
  type FieldError,
} from "@/lib/api";

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => route.name === "event-edit");
const eventId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : "",
);

const form = reactive({
  name: "",
  type: "" as EventType | "",
  eventDate: "",
  description: "",
  location: "",
  latitude: null as number | null,
  longitude: null as number | null,
});

const coordinates = computed<Coordinate | null>({
  get: () =>
    form.latitude !== null && form.longitude !== null
      ? { lat: form.latitude, lng: form.longitude }
      : null,
  set: (value) => {
    form.latitude = value?.lat ?? null;
    form.longitude = value?.lng ?? null;
  },
});

const fieldErrors = ref<Record<string, string>>({});
const formError = ref<string | null>(null);
const submitting = ref(false);
const loading = ref(false);
const loadError = ref<string | null>(null);

function applyFieldErrors(fields: FieldError[]) {
  fieldErrors.value = Object.fromEntries(
    fields.map((field) => [field.field, field.message]),
  );
}

function redirectToLogin() {
  void router.push({ name: "login", query: { redirect: route.fullPath } });
}

function resetForm() {
  form.name = "";
  form.type = "";
  form.eventDate = "";
  form.description = "";
  form.location = "";
  form.latitude = null;
  form.longitude = null;
  fieldErrors.value = {};
  formError.value = null;
  loadError.value = null;
}

async function load() {
  fieldErrors.value = {};
  formError.value = null;

  if (!isEdit.value) {
    resetForm();
    return;
  }

  loading.value = true;
  loadError.value = null;

  try {
    const event = await getEvent(eventId.value);
    form.name = event.name;
    form.type = event.type;
    form.eventDate = event.eventDate ? event.eventDate.slice(0, 10) : "";
    form.description = event.description ?? "";
    form.location = event.location ?? "";
    form.latitude = event.latitude;
    form.longitude = event.longitude;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    loadError.value = isApiError(error)
      ? error.message
      : "We couldn't load this event.";
  } finally {
    loading.value = false;
  }
}

async function onSubmit() {
  formError.value = null;
  fieldErrors.value = {};

  const eventType = form.type;
  if (!eventType) {
    fieldErrors.value = { type: "Choose an occasion" };
    formError.value = "Please choose an event type.";
    return;
  }

  if (!form.name.trim()) {
    fieldErrors.value = { name: "Name is required" };
    formError.value = "Please give your event a name.";
    return;
  }

  submitting.value = true;

  try {
    const payload: EventInput = {
      name: form.name.trim(),
      type: eventType,
      eventDate: form.eventDate || null,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      latitude: form.latitude,
      longitude: form.longitude,
    };

    const saved = isEdit.value
      ? await updateEvent(eventId.value, payload)
      : await createEvent(payload);

    await router.push(`/events/${saved.id}`);
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      formError.value = error.message;
      applyFieldErrors(error.fields);
    } else {
      formError.value = "Something went wrong. Please try again.";
    }
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
watch(() => route.fullPath, load);
</script>

<template>
  <section class="mx-auto max-w-2xl px-5 py-16 sm:px-8">
    <RouterLink
      to="/dashboard"
      class="text-sm text-ink/60 transition-colors hover:text-rose"
    >
      ← Back to dashboard
    </RouterLink>

    <header class="mt-6">
      <p class="text-xs uppercase tracking-[0.3em] text-rose">
        {{ isEdit ? "Edit event" : "New event" }}
      </p>
      <h1 class="mt-3 font-display text-4xl text-ink sm:text-5xl">
        {{ isEdit ? "Edit your event" : "Create an event" }}
      </h1>
      <p class="mt-2 text-sm text-ink/70">
        Set the occasion, then gather your gifts into a wishlist.
      </p>
    </header>

    <div class="my-8">
      <BowDivider />
    </div>

    <div v-if="loading">
      <LoadingState label="Loading your event…" :rows="3" />
    </div>

    <BaseCard v-else-if="loadError" elevated class="text-center">
      <p class="text-sm text-ink/75">{{ loadError }}</p>
      <BaseButton to="/dashboard" variant="secondary" class="mt-5">
        Back to Me
      </BaseButton>
    </BaseCard>

    <BaseCard v-else elevated class="px-8 py-8">
      <p
        v-if="formError"
        role="alert"
        class="mb-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
      >
        {{ formError }}
      </p>

      <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <BaseInput
          id="event-name"
          v-model="form.name"
          label="Event name"
          placeholder="Emma & James"
          required
          :error="fieldErrors.name"
        />
        <BaseSelect
          id="event-type"
          v-model="form.type"
          label="Event type"
          :options="EVENT_TYPE_OPTIONS"
          placeholder="Choose an occasion"
          required
          :error="fieldErrors.type"
        />
        <BaseInput
          id="event-date"
          v-model="form.eventDate"
          label="Date (optional)"
          type="date"
          :error="fieldErrors.eventDate"
        />
        <LocationMapPicker
          v-model="coordinates"
          v-model:location="form.location"
          :location-error="fieldErrors.location"
          :error="fieldErrors.latitude ?? fieldErrors.longitude"
        />
        <BaseTextarea
          id="event-description"
          v-model="form.description"
          label="Description (optional)"
          placeholder="A few words about the occasion"
          :rows="3"
          :error="fieldErrors.description"
        />

        <div class="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <BaseButton to="/dashboard" variant="secondary">Cancel</BaseButton>
          <BaseButton type="submit" :disabled="submitting">
            {{ submitting ? "Saving…" : isEdit ? "Save changes" : "Create event" }}
          </BaseButton>
        </div>
      </form>
    </BaseCard>
  </section>
</template>
