import { computed, readonly, ref } from "vue";
import {
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  type AuthUser,
  type LoginPayload,
  type RegisterPayload,
  type RegisterResult,
  type VerifyEmailPayload,
} from "@/lib/api";

// Module-level singletons so every component and the router share one state.
const user = ref<AuthUser | null>(null);
const initialized = ref(false);
let initPromise: Promise<void> | null = null;

const isAuthenticated = computed(() => user.value !== null);

/**
 * Resolves the current session once. Safe to call from multiple places; the
 * underlying request only runs a single time.
 */
function initAuth(): Promise<void> {
  if (initialized.value) {
    return Promise.resolve();
  }

  initPromise ??= (async () => {
    try {
      user.value = await getCurrentUser();
    } catch {
      user.value = null;
    } finally {
      initialized.value = true;
    }
  })();

  return initPromise;
}

/** Re-reads the signed-in user, e.g. after a successful Pro purchase. */
async function refreshUser(): Promise<AuthUser | null> {
  try {
    user.value = await getCurrentUser();
  } catch {
    user.value = null;
  } finally {
    initialized.value = true;
  }

  return user.value;
}

async function login(payload: LoginPayload): Promise<AuthUser> {
  const authenticated = await apiLogin(payload);
  user.value = authenticated;
  initialized.value = true;
  return authenticated;
}

async function register(payload: RegisterPayload): Promise<RegisterResult> {
  return apiRegister(payload);
}

async function verifyEmail(payload: VerifyEmailPayload): Promise<AuthUser> {
  const verified = await apiVerifyEmail(payload);
  user.value = verified;
  initialized.value = true;
  return verified;
}

async function logout(): Promise<void> {
  try {
    await apiLogout();
  } finally {
    user.value = null;
  }
}

export function useAuth() {
  return {
    user: readonly(user),
    initialized: readonly(initialized),
    isAuthenticated,
    initAuth,
    refreshUser,
    login,
    register,
    verifyEmail,
    logout,
  };
}
