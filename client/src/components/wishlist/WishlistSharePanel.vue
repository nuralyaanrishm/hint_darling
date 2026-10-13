<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import QRCode from "qrcode";
import BaseButton from "@/components/ui/BaseButton.vue";
import {
  buildShareMessage,
  canNativeShare,
  copyToClipboard,
  nativeShare,
  publicWishlistUrl,
  whatsappShareUrl,
} from "@/lib/share";

const props = withDefaults(
  defineProps<{
    shareToken: string;
    /** Shown in the native share title, e.g. "Emma & James · Our wishlist". */
    shareTitle?: string;
  }>(),
  { shareTitle: "Our wishlist" },
);

const shareUrl = computed(() => publicWishlistUrl(props.shareToken));
const message = computed(() => buildShareMessage(shareUrl.value));
const whatsappHref = computed(() => whatsappShareUrl(message.value));
const nativeAvailable = canNativeShare();

const copied = ref(false);
const copying = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const qrDataUrl = ref<string | null>(null);
const qrError = ref(false);

async function copyLink() {
  copying.value = true;
  const succeeded = await copyToClipboard(shareUrl.value);
  copying.value = false;

  if (!succeeded) return;

  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 2200);
}

async function shareNative() {
  await nativeShare({
    title: props.shareTitle,
    text: message.value,
    url: shareUrl.value,
  });
}

onMounted(async () => {
  try {
    qrDataUrl.value = await QRCode.toDataURL(shareUrl.value, {
      margin: 1,
      width: 320,
      color: { dark: "#59454b", light: "#ffffff" },
    });
  } catch {
    qrError.value = true;
  }
});
</script>

<template>
  <div class="rounded-3xl border border-blush bg-white/80 p-6 shadow-soft sm:p-7">
    <div class="flex items-start gap-3">
      <span
        class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush/60 text-rose"
        aria-hidden="true"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v14" />
        </svg>
      </span>
      <div>
        <h2 class="font-display text-2xl text-ink">Share this wishlist</h2>
        <p class="mt-1 text-sm leading-relaxed text-ink/65">
          Send the link to your guests — no account needed to view it.
        </p>
      </div>
    </div>

    <div
      class="mt-5 flex flex-col gap-2 rounded-2xl border border-blush bg-cream/70 p-2 sm:flex-row sm:items-center"
    >
      <label for="wishlist-share-url" class="sr-only">Wishlist link</label>
      <input
        id="wishlist-share-url"
        :value="shareUrl"
        readonly
        class="w-full flex-1 truncate rounded-xl bg-transparent px-3 py-2 text-sm text-ink/80 focus:outline-none"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <BaseButton size="sm" class="shrink-0" @click="copyLink">
        {{ copied ? "Copied!" : copying ? "Copying…" : "Copy link" }}
      </BaseButton>
    </div>

    <p aria-live="polite" class="sr-only">
      {{ copied ? "Link copied to clipboard" : "" }}
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <BaseButton
        v-if="nativeAvailable"
        variant="secondary"
        size="sm"
        @click="shareNative"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        Share
      </BaseButton>

      <a
        :href="whatsappHref"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center gap-2 rounded-full border border-rose/40 bg-white/70 px-4 py-2 text-sm font-medium text-rose transition duration-300 ease-out hover:-translate-y-0.5 hover:border-rose hover:bg-white motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"
          />
        </svg>
        WhatsApp
      </a>
    </div>

    <div class="mt-6 flex flex-col items-center gap-3 border-t border-blush/70 pt-6">
      <p class="text-xs uppercase tracking-[0.25em] text-rose/80">
        Scan to open
      </p>
      <div
        class="flex h-40 w-40 items-center justify-center rounded-2xl border border-blush bg-white p-3"
      >
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          :alt="`QR code linking to the wishlist`"
          class="h-full w-full"
        />
        <span v-else-if="qrError" class="px-2 text-center text-xs text-ink/50">
          QR code unavailable offline
        </span>
        <span v-else class="text-xs text-ink/40">Preparing…</span>
      </div>
      <a
        v-if="qrDataUrl"
        :href="qrDataUrl"
        download="wishlist-qr.png"
        class="text-xs font-medium text-rose underline-offset-2 hover:text-rose-deep hover:underline"
      >
        Download QR code
      </a>
    </div>
  </div>
</template>
