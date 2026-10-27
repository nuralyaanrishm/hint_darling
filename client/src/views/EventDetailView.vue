<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import GiftIcon from "@/components/decor/GiftIcon.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import WishlistForm from "@/components/wishlist/WishlistForm.vue";
import WishlistItemCard from "@/components/wishlist/WishlistItemCard.vue";
import WishlistItemForm from "@/components/wishlist/WishlistItemForm.vue";
import WishlistSharePanel from "@/components/wishlist/WishlistSharePanel.vue";
import { eventTypeLabel } from "@/lib/eventOptions";
import {
  addWishlistItem,
  createWishlist,
  deleteEvent,
  deleteWishlistItem,
  getEvent,
  isApiError,
  reorderWishlistItems,
  updateWishlist,
  updateWishlistItem,
  type EventDetail,
  type FieldError,
  type WishlistInput,
  type WishlistItemDto,
  type WishlistItemInput,
} from "@/lib/api";

const route = useRoute();
const router = useRouter();

const eventId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : "",
);

const event = ref<EventDetail | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const pageError = ref<string | null>(null);

const wishlist = computed(() => event.value?.wishlist ?? null);



const dateLabel = computed(() => {
  const value = event.value?.eventDate;
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const claimSummary = computed(() => {
  const items = wishlist.value?.items ?? [];
  const total = items.length;
  const claimed = items.filter((item) => item.isClaimed).length;
  return { total, claimed, available: total - claimed };
});

const claimPercent = computed(() => {
  const { total, claimed } = claimSummary.value;
  if (total === 0) return 0;
  return Math.round((claimed / total) * 100);
});

function toFieldErrors(fields: FieldError[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

function redirectToLogin() {
  void router.push({ name: "login", query: { redirect: route.fullPath } });
}

async function load() {
  if (!event.value) loading.value = true;
  loadError.value = null;

  try {
    event.value = await getEvent(eventId.value);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    if (!event.value) {
      loadError.value = isApiError(error)
        ? error.message
        : "We couldn't load this event.";
    } else {
      pageError.value = isApiError(error)
        ? error.message
        : "We couldn't refresh this event.";
    }
  } finally {
    loading.value = false;
  }
}

// --- Delete event -----------------------------------------------------------

const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

function askDeleteEvent() {
  deleteError.value = null;
  deleteOpen.value = true;
}

async function confirmDeleteEvent() {
  if (!event.value) return;
  deleting.value = true;
  deleteError.value = null;

  try {
    await deleteEvent(event.value.id);
    deleteOpen.value = false;
    await router.push("/dashboard");
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    deleteError.value = isApiError(error)
      ? error.message
      : "We couldn't delete this event.";
  } finally {
    deleting.value = false;
  }
}

// --- Wishlist ---------------------------------------------------------------

const wishlistModalOpen = ref(false);
const wishlistMode = ref<"create" | "edit">("create");
const wishlistSaving = ref(false);
const wishlistFormError = ref<string | null>(null);
const wishlistFieldErrors = ref<Record<string, string>>({});

const wishlistInitial = computed(() => {
  const list = wishlist.value;
  if (!list) return null;
  return {
    title: list.title,
    description: list.description,
    privacyMode: list.privacyMode,
  };
});

function openCreateWishlist() {
  wishlistMode.value = "create";
  wishlistFormError.value = null;
  wishlistFieldErrors.value = {};
  wishlistModalOpen.value = true;
}

function openEditWishlist() {
  wishlistMode.value = "edit";
  wishlistFormError.value = null;
  wishlistFieldErrors.value = {};
  wishlistModalOpen.value = true;
}

async function onSaveWishlist(payload: WishlistInput) {
  if (!event.value) return;
  wishlistSaving.value = true;
  wishlistFormError.value = null;
  wishlistFieldErrors.value = {};

  try {
    if (wishlistMode.value === "create") {
      await createWishlist(event.value.id, payload);
    } else {
      await updateWishlist(event.value.id, payload);
    }
    wishlistModalOpen.value = false;
    await load();
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      wishlistFormError.value = error.message;
      wishlistFieldErrors.value = toFieldErrors(error.fields);
    } else {
      wishlistFormError.value = "Something went wrong. Please try again.";
    }
  } finally {
    wishlistSaving.value = false;
  }
}

// --- Gift items -------------------------------------------------------------

const itemModalOpen = ref(false);
const itemMode = ref<"create" | "edit">("create");
const editingItem = ref<WishlistItemDto | null>(null);
const itemSaving = ref(false);
const itemFormError = ref<string | null>(null);
const itemFieldErrors = ref<Record<string, string>>({});

function openAddItem() {
  itemMode.value = "create";
  editingItem.value = null;
  itemFormError.value = null;
  itemFieldErrors.value = {};
  itemModalOpen.value = true;
}

function openEditItem(item: WishlistItemDto) {
  itemMode.value = "edit";
  editingItem.value = item;
  itemFormError.value = null;
  itemFieldErrors.value = {};
  itemModalOpen.value = true;
}

async function onSaveItem(payload: WishlistItemInput) {
  const list = wishlist.value;
  if (!list) return;
  itemSaving.value = true;
  itemFormError.value = null;
  itemFieldErrors.value = {};

  try {
    if (itemMode.value === "create") {
      await addWishlistItem(list.id, payload);
    } else if (editingItem.value) {
      await updateWishlistItem(list.id, editingItem.value.id, payload);
    }
    itemModalOpen.value = false;
    await load();
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) {
        redirectToLogin();
        return;
      }
      itemFormError.value = error.message;
      itemFieldErrors.value = toFieldErrors(error.fields);
    } else {
      itemFormError.value = "Something went wrong. Please try again.";
    }
  } finally {
    itemSaving.value = false;
  }
}

const itemToRemove = ref<WishlistItemDto | null>(null);
const removeOpen = ref(false);
const removing = ref(false);
const removeError = ref<string | null>(null);

function askRemoveItem(item: WishlistItemDto) {
  itemToRemove.value = item;
  removeError.value = null;
  removeOpen.value = true;
}

async function confirmRemoveItem() {
  const list = wishlist.value;
  const item = itemToRemove.value;
  if (!list || !item) return;

  removing.value = true;
  removeError.value = null;

  try {
    await deleteWishlistItem(list.id, item.id);
    removeOpen.value = false;
    itemToRemove.value = null;
    await load();
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    removeError.value = isApiError(error)
      ? error.message
      : "We couldn't remove this gift.";
  } finally {
    removing.value = false;
  }
}

const reordering = ref(false);

async function moveItem(index: number, direction: -1 | 1) {
  const current = event.value;
  const list = current?.wishlist;
  if (!current || !list || reordering.value) return;

  const target = index + direction;
  if (target < 0 || target >= list.items.length) return;

  const previous = list.items;
  const reordered = [...list.items];
  const [moved] = reordered.splice(index, 1);
  if (!moved) return;
  reordered.splice(target, 0, moved);

  list.items = reordered.map((item, position) => ({ ...item, position }));
  reordering.value = true;

  try {
    const updated = await reorderWishlistItems(list.id, reordered.map((i) => i.id));
    current.wishlist = updated;
  } catch (error) {
    list.items = previous;
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    pageError.value = isApiError(error)
      ? error.message
      : "We couldn't save the new order.";
  } finally {
    reordering.value = false;
  }
}

onMounted(load);
watch(
  () => route.params.id,
  () => {
    event.value = null;
    void load();
  },
);
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
    <RouterLink
      to="/dashboard"
      class="text-sm text-ink/60 transition-colors hover:text-rose"
    >
      ← Back to dashboard
    </RouterLink>

    <div v-if="loading" class="mt-8">
      <LoadingState label="Loading your event…" :rows="3" />
    </div>

    <BaseCard v-else-if="loadError" elevated class="mt-8 text-center">
      <p class="text-sm text-ink/75">{{ loadError }}</p>
      <BaseButton to="/dashboard" variant="secondary" class="mt-5">
        Back to Me
      </BaseButton>
    </BaseCard>

    <template v-else-if="event">
      <header class="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span
            class="inline-flex rounded-full border border-blush bg-blush/40 px-3 py-1 text-xs text-rose"
          >
            {{ eventTypeLabel(event.type) }}
          </span>
          <h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">
            {{ event.name }}
          </h1>
          <p class="mt-2 text-sm text-ink/70">
            <span v-if="dateLabel">{{ dateLabel }}</span>
            <span v-if="dateLabel && event.location"> · </span>
            <span v-if="event.location">{{ event.location }}</span>
          </p>
          <p
            v-if="event.description"
            class="mt-4 max-w-2xl text-sm leading-relaxed text-ink/70"
          >
            {{ event.description }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <BaseButton :to="`/events/${event.id}/edit`" variant="secondary" size="sm">
            Edit event
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            class="text-rose-deep"
            @click="askDeleteEvent"
          >
            Delete event
          </BaseButton>
        </div>
      </header>


      <p
        v-if="pageError"
        role="alert"
        class="mt-6 flex items-start justify-between gap-4 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
      >
        {{ pageError }}
        <button
          type="button"
          class="shrink-0 text-xs underline"
          @click="pageError = null"
        >
          Dismiss
        </button>
      </p>

      <div class="my-10">
        <BowDivider />
      </div>

      <!-- No wishlist yet -->
      <template v-if="!wishlist">
        <EmptyState
          title="No wishlist yet"
          message="Create a wishlist for this event, then start adding gifts."
        >
          <template #action>
            <BaseButton @click="openCreateWishlist">Create wishlist</BaseButton>
          </template>
        </EmptyState>
      </template>

      <template v-else>
        <BaseCard elevated class="overflow-hidden" flush>
          <div
            class="flex flex-col gap-4 border-b border-blush/70 bg-blush/30 px-7 py-7 sm:flex-row sm:items-start sm:justify-between sm:px-9"
          >
            <div>
              <h2 class="font-display text-3xl text-ink">
                {{ wishlist.title }}
              </h2>
              <p
                v-if="wishlist.description"
                class="mt-2 max-w-2xl text-sm text-ink/65"
              >
                {{ wishlist.description }}
              </p>
              <p class="mt-3 text-sm text-ink/60">
                {{ wishlist.items.length }}
                {{ wishlist.items.length === 1 ? "gift" : "gifts" }}
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <BaseButton
                variant="secondary"
                size="sm"
                @click="openEditWishlist"
              >
                Edit wishlist
              </BaseButton>
              <BaseButton size="sm" @click="openAddItem">Add gift</BaseButton>
            </div>
          </div>
        </BaseCard>

        <div
          v-if="wishlist.isActive && wishlist.privacyMode !== 'PRIVATE'"
          class="mt-8"
        >
          <WishlistSharePanel
            :share-token="wishlist.shareToken"
            :share-title="`${event.name} · ${wishlist.title}`"
          />
        </div>

        <div
          v-if="wishlist.isActive && wishlist.privacyMode === 'PRIVATE'"
          class="mt-8 rounded-2xl border border-blush bg-blush/30 px-5 py-4 text-sm text-ink/70"
        >
          This wishlist is private right now, so guests can't see it. To start
          sharing, switch its privacy mode to <span class="font-medium text-ink">Link only</span> or
          <span class="font-medium text-ink">Public</span>.
        </div>

        <!-- Claim status summary -->
        <div
          v-if="wishlist.items.length > 0"
          class="mt-8 overflow-hidden rounded-3xl border border-blush bg-white/80 shadow-soft"
        >
          <div class="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div class="flex items-start gap-3.5">
              <span
                class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                :class="
                  claimSummary.claimed > 0 ? 'bg-rose/15 text-rose-deep' : 'bg-sage/40 text-sage-deep'
                "
                aria-hidden="true"
              >
                <GiftIcon :size="20" />
              </span>
              <div>
                <p class="text-xs uppercase tracking-[0.25em] text-rose">
                  Gift status
                </p>
                <p class="mt-1 font-display text-2xl text-ink">
                  {{
                    claimSummary.claimed === 0
                      ? "Nothing claimed yet"
                      : claimSummary.total === claimSummary.claimed
                        ? "Every gift is spoken for! 🎉"
                        : `Someone's getting you ${claimSummary.claimed} of ${claimSummary.total}! 🎁`
                  }}
                </p>
                <p class="mt-1 text-sm text-ink/65">
                  {{
                    claimSummary.claimed === 0
                      ? "Your gifts are all still available — share your list to get them noticed."
                      : `You can see which gifts are reserved, but never who's getting them.`
                  }}
                </p>
              </div>
            </div>

            <div class="sm:text-right">
              <p class="text-sm font-medium text-ink">
                {{ claimSummary.claimed }} of {{ claimSummary.total }} claimed
              </p>
              <div
                class="mt-2 h-2 w-full overflow-hidden rounded-full bg-blush/60 sm:w-44"
                role="progressbar"
                :aria-valuenow="claimPercent"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Gifts claimed so far"
              >
                <div
                  class="h-full rounded-full bg-rose transition-all duration-500"
                  :style="{ width: `${claimPercent}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-8">
          <EmptyState
            v-if="wishlist.items.length === 0"
            title="Your wishlist is waiting"
            message="Add your first gift — a name is all you need, and you can add links, prices and preferences whenever you like."
          >
            <template #action>
              <BaseButton @click="openAddItem">Add your first gift</BaseButton>
            </template>
          </EmptyState>

          <ul
            v-else
            class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Wishlist gifts"
          >
            <li v-for="(item, index) in wishlist.items" :key="item.id">
              <WishlistItemCard
                :item="item"
                :is-first="index === 0"
                :is-last="index === wishlist.items.length - 1"
                @edit="openEditItem(item)"
                @remove="askRemoveItem(item)"
                @move-up="moveItem(index, -1)"
                @move-down="moveItem(index, 1)"
              />
            </li>
          </ul>
        </div>
      </template>
    </template>

    <WishlistForm
      v-model="wishlistModalOpen"
      :mode="wishlistMode"
      :initial="wishlistInitial"
      :submitting="wishlistSaving"
      :form-error="wishlistFormError"
      :field-errors="wishlistFieldErrors"
      @submit="onSaveWishlist"
    />

    <WishlistItemForm
      v-model="itemModalOpen"
      :mode="itemMode"
      :initial="editingItem"
      :submitting="itemSaving"
      :form-error="itemFormError"
      :field-errors="itemFieldErrors"
      @submit="onSaveItem"
    />

    <ConfirmDialog
      v-model="removeOpen"
      title="Remove this gift?"
      :message="`“${itemToRemove?.name ?? 'This gift'}” will be removed from your wishlist.`"
      confirm-label="Remove gift"
      :loading="removing"
      :error="removeError"
      @confirm="confirmRemoveItem"
    />

    <ConfirmDialog
      v-model="deleteOpen"
      title="Delete this event?"
      message="This will permanently delete the event, its wishlist and every gift on it. This cannot be undone."
      confirm-label="Delete event"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDeleteEvent"
    />
  </section>
</template>
