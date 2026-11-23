<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PasswordCard from "@/components/account/PasswordCard.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseModal from "@/components/ui/BaseModal.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import {
  isApiError,
  listReceipts,
  logoutOtherDevices,
  receiptDownloadUrl,
  type ReceiptSummary,
} from "@/lib/api";
import { PLAN_CATALOG } from "@/lib/plans";
import { useAuth } from "@/stores/auth";

const { user, currentPlan } = useAuth();

const planLabel = computed(() => PLAN_CATALOG[currentPlan.value].label);

const memberSince = computed(() => {
  const created = user.value?.createdAt;
  if (!created) return null;

  return new Date(created).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
});

const receipts = ref<ReceiptSummary[]>([]);
const receiptsOpen = ref(false);
const receiptsError = ref<string | null>(null);

const singleReceipt = computed(() =>
  receipts.value.length === 1 ? (receipts.value[0] ?? null) : null,
);

function formatReceiptDate(receipt: ReceiptSummary): string {
  const date = receipt.paidAt ?? null;
  if (!date) return "";

  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatReceiptAmount(amountSen: number): string {
  return `RM ${(amountSen / 100).toFixed(2)}`;
}

async function loadReceipts() {
  try {
    receipts.value = await listReceipts();
  } catch (error) {
    receiptsError.value = isApiError(error)
      ? error.message
      : "We couldn't load your receipts right now.";
  }
}

onMounted(() => {
  void loadReceipts();
});

const signingOut = ref(false);
const signOutError = ref<string | null>(null);
const signOutDone = ref(false);

async function onSignOutOtherDevices() {
  if (signingOut.value) return;

  signingOut.value = true;
  signOutError.value = null;
  signOutDone.value = false;

  try {
    await logoutOtherDevices();
    signOutDone.value = true;
  } catch (error) {
    signOutError.value = isApiError(error)
      ? error.message
      : "Something went wrong. Please try again.";
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-3xl px-5 py-12 sm:px-8">
    <p class="text-xs uppercase tracking-[0.3em] text-rose">Your space</p>
    <h1 class="mt-3 font-display text-4xl text-ink">Account</h1>
    <p class="mt-2 text-sm text-ink/70">Manage how you sign in.</p>

    <div class="my-8">
      <BowDivider />
    </div>

    <div class="flex flex-col gap-6">
      <section
        class="rounded-[1.6rem] border border-blush/80 bg-white/70 p-6 sm:p-8"
        aria-labelledby="identity-heading"
      >
        <h2 id="identity-heading" class="font-display text-2xl text-ink">
          Profile
        </h2>

        <dl class="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt class="text-[10px] uppercase tracking-[0.2em] text-ink/45">
              Name
            </dt>
            <dd class="mt-1 text-sm text-ink">{{ user?.name }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-[0.2em] text-ink/45">
              Email
            </dt>
            <dd class="mt-1 truncate text-sm text-ink">{{ user?.email }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-[0.2em] text-ink/45">
              Plan
            </dt>
            <dd class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                class="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-rose-deep"
              >
                {{ planLabel }}
              </span>
              <a
                v-if="singleReceipt"
                :href="receiptDownloadUrl(singleReceipt.id)"
                download
                class="text-xs font-medium text-rose transition-colors hover:text-rose-deep"
              >
                (download receipt)
              </a>
              <button
                v-else-if="receipts.length > 1"
                type="button"
                class="text-xs font-medium text-rose transition-colors hover:text-rose-deep"
                @click="receiptsOpen = true"
              >
                (download receipt)
              </button>
            </dd>
            <p
              v-if="receiptsError"
              class="mt-1 text-[11px] text-rose-deep"
            >
              {{ receiptsError }}
            </p>
          </div>
          <div v-if="memberSince">
            <dt class="text-[10px] uppercase tracking-[0.2em] text-ink/45">
              Member since
            </dt>
            <dd class="mt-1 text-sm text-ink">{{ memberSince }}</dd>
          </div>
        </dl>

        <p class="mt-5 text-xs text-ink/55">
          Need a different name or email?
          <RouterLink
            to="/contact"
            class="font-medium text-rose transition-colors hover:text-rose-deep"
          >
            Get in touch
          </RouterLink>
          and we'll sort it out.
        </p>
      </section>

      <PasswordCard />

      <section
        class="rounded-[1.6rem] border border-blush/80 bg-white/70 p-6 sm:p-8"
        aria-labelledby="sessions-heading"
      >
        <h2 id="sessions-heading" class="font-display text-2xl text-ink">
          Sessions
        </h2>
        <p class="mt-2 text-sm leading-relaxed text-ink/70">
          If you signed in somewhere you don't recognise, sign out every other
          device. This device stays signed in.
        </p>

        <p
          v-if="signOutError"
          role="alert"
          class="mt-5 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
        >
          {{ signOutError }}
        </p>

        <p
          v-if="signOutDone"
          role="status"
          class="mt-5 rounded-2xl border border-rose/30 bg-white/70 px-4 py-3 text-sm text-ink/80"
        >
          Every other device has been signed out.
        </p>

        <BaseButton
          variant="secondary"
          class="mt-5"
          :disabled="signingOut"
          @click="onSignOutOtherDevices"
        >
          {{ signingOut ? "Signing out…" : "Sign out other devices" }}
        </BaseButton>
      </section>
    </div>

    <BaseModal v-model="receiptsOpen" title="Your receipts" size="sm">
      <p class="text-sm leading-relaxed text-ink/70">
        Download a receipt for each payment on your account.
      </p>

      <ul class="mt-4 divide-y divide-blush/70">
        <li
          v-for="receipt in receipts"
          :key="receipt.id"
          class="flex items-start justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="text-sm leading-snug text-ink">
              {{ receipt.description }}
            </p>
            <p class="mt-1 text-xs text-ink/55">
              {{ formatReceiptDate(receipt) }}
            </p>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-sm text-ink">
              {{ formatReceiptAmount(receipt.amountSen) }}
            </p>
            <a
              :href="receiptDownloadUrl(receipt.id)"
              download
              class="text-xs font-medium text-rose transition-colors hover:text-rose-deep"
            >
              Download PDF
            </a>
          </div>
        </li>
      </ul>
    </BaseModal>
  </section>
</template>
