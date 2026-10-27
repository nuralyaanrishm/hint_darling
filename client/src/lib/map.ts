import L from "leaflet";

export interface Coordinate {
  lat: number;
  lng: number;
}

/** A sensible default view for events before a pin has been placed. */
export const DEFAULT_MAP_CENTER: L.LatLngExpression = [54.5, -3.5];
export const DEFAULT_MAP_ZOOM = 5;

export const locationPinIcon = L.divIcon({
  className: "hd-map-pin",
  html: `
    <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15 0C6.716 0 0 6.716 0 15c0 11 15 23 15 23s15-12 15-23C30 6.716 23.284 0 15 0Z" fill="#c97898"/>
      <circle cx="15" cy="15" r="6" fill="#fff9f5"/>
    </svg>
  `,
  iconSize: [30, 38],
  iconAnchor: [15, 38],
});

export function addOpenStreetMapLayer(map: L.Map): L.TileLayer {
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  }).addTo(map);
}

/** Rounds coordinates to a precision that is accurate to roughly 10 cm. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function openStreetMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
