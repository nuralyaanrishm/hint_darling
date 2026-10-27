<script setup lang="ts">
import L from "leaflet";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import {
  addOpenStreetMapLayer,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  locationPinIcon,
  roundCoordinate,
  type Coordinate,
} from "@/lib/map";

const props = withDefaults(
  defineProps<{
    label?: string;
    locationError?: string;
    error?: string;
  }>(),
  {
    label: "Location (optional)",
    locationError: undefined,
    error: undefined,
  },
);

const model = defineModel<Coordinate | null>({ default: null });
const location = defineModel<string>("location", { default: "" });

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface NominatimReverseResult {
  display_name?: string;
  name?: string;
}

const mapEl = ref<HTMLDivElement | null>(null);
const searchError = ref<string | null>(null);
const searching = ref(false);
const reversePending = ref(false);

let map: L.Map | null = null;
let marker: L.Marker | null = null;
let resizeObserver: ResizeObserver | null = null;
let reverseTimer: ReturnType<typeof setTimeout> | undefined;
let reverseRequestId = 0;

function cancelReverseLookup() {
  clearTimeout(reverseTimer);
  reverseTimer = undefined;
  reverseRequestId += 1;
  reversePending.value = false;
}

/**
 * Turns the pinned coordinates into a human-readable address. Debounced so a
 * user clicking or dragging repeatedly only triggers one Nominatim request.
 */
function scheduleReverseLookup(lat: number, lng: number) {
  cancelReverseLookup();
  const requestId = reverseRequestId;
  reversePending.value = true;

  reverseTimer = setTimeout(() => {
    reverseTimer = undefined;
    void reverseLookup(lat, lng, requestId);
  }, 500);
}

async function reverseLookup(lat: number, lng: number, requestId: number) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": navigator.language || "en",
      },
    });

    if (!response.ok) {
      throw new Error("Reverse lookup failed");
    }

    const result = (await response.json()) as NominatimReverseResult;

    if (requestId !== reverseRequestId) return;

    const label = result.display_name?.trim() || result.name?.trim();
    if (label) {
      location.value = label.slice(0, 200);
    }
  } catch {
    // Keep the existing location text when the lookup is unavailable.
  } finally {
    if (requestId === reverseRequestId) {
      reversePending.value = false;
    }
  }
}

function setCoordinates(lat: number, lng: number) {
  const next = {
    lat: roundCoordinate(lat),
    lng: roundCoordinate(lng),
  };
  const current = model.value;

  if (
    current &&
    current.lat === next.lat &&
    current.lng === next.lng
  ) {
    return;
  }

  model.value = next;
}

function syncMarker() {
  if (!map) return;

  const value = model.value;

  if (!value) {
    marker?.remove();
    marker = null;
    return;
  }

  if (marker) {
    marker.setLatLng([value.lat, value.lng]);
    return;
  }

  marker = L.marker([value.lat, value.lng], {
    icon: locationPinIcon,
    draggable: true,
    keyboard: true,
    title: "Event location",
  }).addTo(map);

  marker.on("dragend", () => {
    const position = marker?.getLatLng();
    if (position) {
      setCoordinates(position.lat, position.lng);
      scheduleReverseLookup(position.lat, position.lng);
    }
  });
}

async function search() {
  const query = location.value.trim();
  if (!query || searching.value) return;

  searching.value = true;
  searchError.value = null;
  cancelReverseLookup();

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": navigator.language || "en",
      },
    });

    if (!response.ok) {
      throw new Error("Search failed");
    }

    const results = (await response.json()) as NominatimResult[];
    const result = results[0];

    if (!result) {
      searchError.value = "No matching place found. Try a more specific address.";
      return;
    }

    const lat = Number(result.lat);
    const lng = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Invalid coordinates");
    }

    setCoordinates(lat, lng);
    map?.setView([lat, lng], 15);
    location.value = result.display_name.slice(0, 200);
  } catch {
    searchError.value =
      "We couldn't look up that address. Check your connection and try again.";
  } finally {
    searching.value = false;
  }
}

function clearPin() {
  cancelReverseLookup();
  model.value = null;
  location.value = "";
  searchError.value = null;
}

watch(model, syncMarker);

onMounted(() => {
  if (!mapEl.value) return;

  const value = model.value;
  const center: L.LatLngExpression = value
    ? [value.lat, value.lng]
    : DEFAULT_MAP_CENTER;

  map = L.map(mapEl.value, {
    center,
    zoom: value ? 14 : DEFAULT_MAP_ZOOM,
    scrollWheelZoom: false,
  });

  addOpenStreetMapLayer(map);

  map.on("click", (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng;
    setCoordinates(lat, lng);
    scheduleReverseLookup(lat, lng);
  });

  syncMarker();

  resizeObserver = new ResizeObserver(() => map?.invalidateSize());
  resizeObserver.observe(mapEl.value);
});

onBeforeUnmount(() => {
  cancelReverseLookup();
  resizeObserver?.disconnect();
  resizeObserver = null;
  marker?.remove();
  marker = null;
  map?.remove();
  map = null;
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-col gap-1.5">
      <label for="event-location" class="text-sm font-medium text-ink/80">
        {{ props.label }}
      </label>
      <p class="text-xs text-ink/55">
        Search for a venue, or click the map and drag the pin to fine-tune.
      </p>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div class="flex-1">
          <input
            id="event-location"
            v-model="location"
            type="text"
            placeholder="Search a venue or address"
            autocomplete="off"
            class="w-full rounded-2xl border bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-ink/35 transition focus:outline-none focus:ring-2 focus:ring-rose"
            :class="
              props.locationError
                ? 'border-rose-deep'
                : 'border-blush focus:border-rose'
            "
            :aria-invalid="props.locationError ? 'true' : undefined"
            :aria-describedby="
              props.locationError ? 'event-location-error' : undefined
            "
            @keydown.enter.prevent="search"
          />
        </div>
        <BaseButton
          type="button"
          variant="secondary"
          size="sm"
          :disabled="searching || !location.trim()"
          @click="search"
        >
          {{ searching ? "Searching…" : "Search map" }}
        </BaseButton>
      </div>
      <p
        v-if="props.locationError"
        id="event-location-error"
        class="text-xs text-rose-deep"
      >
        {{ props.locationError }}
      </p>
    </div>

    <p v-if="searchError" role="alert" class="text-xs text-rose-deep">
      {{ searchError }}
    </p>

    <div
      ref="mapEl"
      class="hd-map h-72 w-full overflow-hidden rounded-2xl border border-blush bg-sage/30 sm:h-80"
      role="application"
      aria-label="Event location map. Click to place the pin, then drag it to fine-tune."
    ></div>

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/60">
      <span v-if="model">
        Pin set at {{ model.lat.toFixed(5) }}, {{ model.lng.toFixed(5) }}
        <span v-if="reversePending" class="text-ink/45">
          · Updating location…
        </span>
      </span>
      <span v-else>Click the map or search to drop a pin.</span>
      <button
        v-if="model"
        type="button"
        class="font-medium text-rose underline-offset-2 hover:underline"
        @click="clearPin"
      >
        Clear pin
      </button>
    </div>

    <p v-if="props.error" class="text-xs text-rose-deep">{{ props.error }}</p>
  </div>
</template>
