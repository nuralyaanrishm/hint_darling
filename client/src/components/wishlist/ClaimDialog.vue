<script setup lang="ts">
import { ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import {
  ALREADY_CLAIMED_CODE,
  claimGift,
  isApiError,
  type ClaimResult,
  type PublicGift,
} from "@/lib/api";
import { claimManageUrl, claimManagePath } from "@/lib/claims";
import { copyToClipboard } from "@/lib/share";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{
  gift: PublicGift | null;
  shareToken: string;
}>();

const emit = defineEmits<{
  claimed: [result: ClaimResult];
  conflict: [];
}>();

const SUGGESTION =
  "Why not pick another gift instead? There are plenty more to make their day.";

type Step = "confirm" | "success" | "conflict";

const step = ref<Step>("confirm");
const claimantName = ref("");
const idempotencyKey = ref("");
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const success = ref<ClaimResult | null>(null);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function reset() {
  step.value = "confirm";
  submitting.value = false;
  errorMessage.value = null;
  success.value = null;
  copied.value = false;
  claimantName.value = "";
  idempotencyKey.value = newIdempotencyKey();
}

watch(open, (isOpen) => {
  if (isOpen) reset();
});

async function submit() {
  if (!props.gift || submitting.value) return;

  submitting.value = true;
  errorMessage.value = null;

  try {
    const result = await claimGift(props.shareToken, props.gift.id, {
      claimantName: claimantName.value.trim() || undefined,
      idempotencyKey: idempotencyKey.value,
    });
    success.value = result;
    step.value = "success";
    emit("claimed", result);
  } catch (error) {
    if (isApiError(error) && error.code === ALREADY_CLAIMED_CODE) {
      step.value = "conflict";
      emit("conflict");
    } else if (isApiError(error)) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = "We couldn't reserve that right now. Please try again.";
    }
  } finally {
    submitting.value = false;
  }
}

async function copyLink() {
  if (!success.value) return;
  const succeeded = await copyToClipboard(claimManageUrl(success.value.manageToken));
  if (!succeeded) return;
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 2200);
}
</script>

<template>
  <BaseModal
    v-model="open"
    :title="step === 'success' ? 'It’s yours to give!' : step === 'conflict' ? 'Oh no!' : 'Sweet — let’s claim it'"
    size="sm"
  >
    <!-- Confirmation -->
    <div v-if="step === 'confirm' && gift">
      <p class="text-sm leading-relaxed text-ink/75">
        Reserve
        <span class="font-medium text-ink">“{{ gift.name }}”</span>
        so nobody buys it twice. We’ll tuck away a private link so you can
        manage your claim later.
      </p>

      <div class="mt-5">
        <BaseInput
          id="claimant-name"
          v-model="claimantName"
          label="Your name (optional, kept private)"
          autocomplete="name"
          placeholder="e.g. Auntie Rose"
          :disabled="submitting"
        />
        <p class="mt-2 text-xs leading-relaxed text-ink/50">
          The hosts won’t see this — it’s just so we can show your claim back to
          you on this device.
        </p>
      </div>

      <p
        v-if="errorMessage"
        role="alert"
        class="mt-4 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
      >
        {{ errorMessage }}
      </p>
    </div>

    <!-- Success -->
    <div v-else-if="step === 'success' && success">
      <div
        class="flex h-14 w-14 items-center justify-center rounded-full bg-sage text-sage-deep"
        aria-hidden="true"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <p class="mt-4 text-sm leading-relaxed text-ink/75">
        Lovely — <span class="font-medium text-ink">{{ gift?.name }}</span> is
        reserved for you to give. 🎁
      </p>

      <div
        class="mt-5 flex flex-col gap-2 rounded-2xl border border-blush bg-white/70 p-2 sm:flex-row sm:items-center"
      >
        <input
          :value="claimManageUrl(success.manageToken)"
          readonly
          class="w-full flex-1 truncate rounded-xl bg-transparent px-3 py-2 text-sm text-ink/80 focus:outline-none"
          aria-label="Your claim management link"
          @click="($event.target as HTMLInputElement).select()"
        />
        <BaseButton size="sm" class="shrink-0" @click="copyLink">
          {{ copied ? "Copied!" : "Copy" }}
        </BaseButton>
      </div>

      <p class="mt-3 text-xs leading-relaxed text-ink/50">
        Keep this link safe — <a :href="claimManagePath(success.manageToken)" class="text-rose underline underline-offset-2">it’s
          how you’ll manage this claim</a>
        if you ever change your mind. It’s also saved on this device.
      </p>
    </div>

    <!-- Already claimed -->
    <div v-else-if="step === 'conflict'">
      <p class="text-sm text-ink/75">
        Oops, someone’s got this for them! 🎁
      </p>
      <p class="mt-3 text-sm leading-relaxed text-ink/75">
        {{ SUGGESTION }}
      </p>
      <p class="mt-3 text-sm leading-relaxed text-ink/55">
        We’re refreshing the list so you can see what’s still free.
      </p>
    </div>

    <template #footer>
      <div
        v-if="step === 'confirm'"
        class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
      >
        <BaseButton
          variant="secondary"
          :disabled="submitting"
          @click="open = false"
        >
          Maybe later
        </BaseButton>
        <BaseButton :disabled="submitting" @click="submit">
          {{ submitting ? "Reserving…" : "I’ll get this!" }}
        </BaseButton>
      </div>

      <div
        v-else-if="step === 'success'"
        class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
      >
        <BaseButton @click="open = false">Done</BaseButton>
      </div>

      <div
        v-else
        class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
      >
        <BaseButton @click="open = false">Choose another gift</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>