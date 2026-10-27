<script setup lang="ts">
import L from "leaflet";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  addOpenStreetMapLayer,
  locationPinIcon,
  openStreetMapUrl,
} from "@/lib/map";

const props = withDefaults(
  defineProps<{
    latitude: number;
    longitude: number;
    label?: string | null;
  }>(),
  {
    label: null,
  },
);

const mapEl = ref<HTMLDivElement | null>(null);

let map: L.Map | null = null;
let marker: L.Marker | null = null;
let resizeObserver: ResizeObserver | null = null;

function syncView() {
  if (!map) return;

  const center: L.LatLngExpression = [props.latitude, props.longitude];
  map.setView(center, 15);

  if (marker) {
    marker.setLatLng(center);
  } else {
    marker = L.marker(center, {
      icon: locationPinIcon,
      keyboard: false,
      title: props.label ?? "Event location",
    }).addTo(map);
  }
}

watch(() => [props.latitude, props.longitude], syncView);

onMounted(() => {
  if (!mapEl.value) return;

  map = L.map(mapEl.value, {
    center: [props.latitude, props.longitude],
    zoom: 15,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomControl: false,
  });

  addOpenStreetMapLayer(map);
  syncView();

  resizeObserver = new ResizeObserver(() => map?.invalidateSize());
  resizeObserver.observe(mapEl.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  marker?.remove();
  marker = null;
  map?.remove();
  map = null;
});
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl border border-blush bg-sage/30">
    <div
      ref="mapEl"
      class="hd-map h-56 w-full sm:h-64"
      role="img"
      :aria-label="label ? `Map showing ${label}` : 'Map showing the event location'"
    ></div>
    <a
      :href="openStreetMapUrl(latitude, longitude)"
      target="_blank"
      rel="noopener noreferrer"
      class="absolute right-3 top-3 z-10 rounded-full border border-rose/30 bg-white/90 px-3 py-1.5 text-xs font-medium text-rose shadow-soft backdrop-blur-sm transition hover:border-rose hover:bg-white"
    >
      Open in OpenStreetMap
    </a>
  </div>
</template>
