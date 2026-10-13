import type { EventType } from "@/lib/api";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Event types shown in the event form, in a friendly order. */
export const EVENT_TYPE_OPTIONS: SelectOption<EventType>[] = [
  { value: "WEDDING", label: "Wedding" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "GRADUATION", label: "Graduation" },
  { value: "BABY_SHOWER", label: "Baby shower" },
  { value: "HOUSEWARMING", label: "Housewarming" },
  { value: "FESTIVE", label: "Festive celebration" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "CHRISTMAS", label: "Christmas" },
  { value: "OTHER", label: "Other" },
];

const EVENT_TYPE_LABELS: Record<EventType, string> = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<EventType, string>;

export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPE_LABELS[type] ?? "Other";
}

export const CURRENCY_OPTIONS: SelectOption<string>[] = [
  { value: "GBP", label: "GBP — Pound sterling" },
  { value: "USD", label: "USD — US dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "AUD", label: "AUD — Australian dollar" },
  { value: "CAD", label: "CAD — Canadian dollar" },
  { value: "NZD", label: "NZD — New Zealand dollar" },
  { value: "JPY", label: "JPY — Japanese yen" },
  { value: "INR", label: "INR — Indian rupee" },
  { value: "SGD", label: "SGD — Singapore dollar" },
  { value: "ZAR", label: "ZAR — South African rand" },
];
