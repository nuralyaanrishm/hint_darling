import { computed, readonly, ref } from "vue";
import {
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
  type LoginPayload,
  type RegisterPayload,
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

async function login(payload: LoginPayload): Promise<AuthUser> {
  const authenticated = await apiLogin(payload);
  user.value = authenticated;
  initialized.value = true;
  return authenticated;
}

async function register(payload: RegisterPayload): Promise<AuthUser> {
  const created = await apiRegister(payload);
  user.value = created;
  initialized.value = true;
  return created;
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
    login,
    register,
    logout,
  };
}
