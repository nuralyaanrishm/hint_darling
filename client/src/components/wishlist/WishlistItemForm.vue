<script setup lang="ts">
import { reactive, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import BaseTextarea from "@/components/ui/BaseTextarea.vue";
import { CURRENCY_OPTIONS } from "@/lib/eventOptions";
import type { WishlistItemDto, WishlistItemInput } from "@/lib/api";

const open = defineModel<boolean>({ required: true });

const props = withDefaults(
  defineProps<{
    mode: "create" | "edit";
    initial?: WishlistItemDto | null;
    submitting?: boolean;
    formError?: string | null;
    fieldErrors?: Record<string, string>;
  }>(),
  {
    initial: null,
    submitting: false,
    formError: null,
    fieldErrors: () => ({}),
  },
);

const emit = defineEmits<{ submit: [payload: WishlistItemInput] }>();

const form = reactive({
  name: "",
  productUrl: "",
  imageUrl: "",
  price: "",
  currency: "GBP",
  description: "",
  preferredColour: "",
  preferredSize: "",
  preferredVariation: "",
  quantity: "1",
  notes: "",
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  const item = props.initial;
  form.name = item?.name ?? "";
  form.productUrl = item?.productUrl ?? "";
  form.imageUrl = item?.imageUrl ?? "";
  form.price = item?.price ?? "";
  form.currency = item?.currency ?? "GBP";
  form.description = item?.description ?? "";
  form.preferredColour = item?.preferredColour ?? "";
  form.preferredSize = item?.preferredSize ?? "";
  form.preferredVariation = item?.preferredVariation ?? "";
  form.quantity = item ? String(item.quantity) : "1";
  form.notes = item?.notes ?? "";
});

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function onSubmit() {
  emit("submit", {
    name: form.name.trim(),
    productUrl: form.productUrl.trim() || null,
    imageUrl: form.imageUrl.trim() || null,
    price: toNumberOrNull(form.price),
    currency: form.currency,
    description: form.description.trim() || null,
    preferredColour: form.preferredColour.trim() || null,
    preferredSize: form.preferredSize.trim() || null,
    preferredVariation: form.preferredVariation.trim() || null,
    quantity: toNumberOrNull(form.quantity),
    notes: form.notes.trim() || null,
  });
}
</script>

<template>
  <BaseModal
    v-model="open"
    :title="mode === 'create' ? 'Add a gift' : 'Edit gift'"
    size="lg"
  >
    <p
      v-if="formError"
      role="alert"
      class="mb-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
    >
      {{ formError }}
    </p>

    <form
      id="wishlist-item-form"
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="onSubmit"
    >
      <BaseInput
        id="item-name"
        v-model="form.name"
        label="Gift name"
        placeholder="Linen duvet set"
        required
        :error="fieldErrors.name"
      />

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseInput
          id="item-product-url"
          v-model="form.productUrl"
          label="Product URL (optional)"
          type="url"
          placeholder="https://…"
          :error="fieldErrors.productUrl"
        />
        <BaseInput
          id="item-image-url"
          v-model="form.imageUrl"
          label="Image URL (optional)"
          type="url"
          placeholder="https://…"
          :error="fieldErrors.imageUrl"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <BaseInput
          id="item-price"
          v-model="form.price"
          label="Price (optional)"
          type="number"
          placeholder="0.00"
          :error="fieldErrors.price"
        />
        <BaseSelect
          id="item-currency"
          v-model="form.currency"
          label="Currency"
          :options="CURRENCY_OPTIONS"
          :error="fieldErrors.currency"
        />
        <BaseInput
          id="item-quantity"
          v-model="form.quantity"
          label="Quantity"
          type="number"
          :error="fieldErrors.quantity"
        />
      </div>

      <BaseTextarea
        id="item-description"
        v-model="form.description"
        label="Description (optional)"
        :rows="2"
        :error="fieldErrors.description"
      />

      <div class="grid gap-4 sm:grid-cols-3">
        <BaseInput
          id="item-colour"
          v-model="form.preferredColour"
          label="Preferred colour"
          placeholder="Stone"
          :error="fieldErrors.preferredColour"
        />
        <BaseInput
          id="item-size"
          v-model="form.preferredSize"
          label="Preferred size"
          placeholder="Queen"
          :error="fieldErrors.preferredSize"
        />
        <BaseInput
          id="item-variation"
          v-model="form.preferredVariation"
          label="Model / variation"
          placeholder="Cream"
          :error="fieldErrors.preferredVariation"
        />
      </div>

      <BaseTextarea
        id="item-notes"
        v-model="form.notes"
        label="Additional notes (optional)"
        :rows="2"
        :error="fieldErrors.notes"
      />
    </form>

    <template #footer>
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BaseButton
          variant="secondary"
          :disabled="submitting"
          @click="open = false"
        >
          Cancel
        </BaseButton>
        <BaseButton type="submit" form="wishlist-item-form" :disabled="submitting">
          {{
            submitting
              ? "Saving…"
              : mode === "create"
                ? "Add gift"
                : "Save changes"
          }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
