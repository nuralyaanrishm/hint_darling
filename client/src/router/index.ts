import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import PlaceholderView from "@/views/PlaceholderView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import LoginView from "@/views/LoginView.vue";
import RegisterView from "@/views/RegisterView.vue";
import VerifyEmailView from "@/views/VerifyEmailView.vue";
import DashboardView from "@/views/DashboardView.vue";
import EventFormView from "@/views/EventFormView.vue";
import EventDetailView from "@/views/EventDetailView.vue";
import BillingReturnView from "@/views/BillingReturnView.vue";
import PublicWishlistView from "@/views/PublicWishlistView.vue";
import ClaimManageView from "@/views/ClaimManageView.vue";
import MyClaimsView from "@/views/MyClaimsView.vue";
import { useAuth } from "@/stores/auth";

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    description?: string;
    requiresAuth?: boolean;
    guestOnly?: boolean;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/create",
      name: "create",
      redirect: { name: "event-new" },
    },
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: {
        title: "Log in",
        guestOnly: true,
      },
    },
    {
      path: "/register",
      name: "register",
      component: RegisterView,
      meta: {
        title: "Create your account",
        guestOnly: true,
      },
    },
    {
      path: "/verify-email",
      name: "verify-email",
      component: VerifyEmailView,
      meta: {
        title: "Verify your email",
        guestOnly: true,
      },
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: DashboardView,
      meta: {
        title: "Dashboard",
        requiresAuth: true,
      },
    },
    {
      path: "/events/new",
      name: "event-new",
      component: EventFormView,
      meta: {
        title: "Create an event",
        requiresAuth: true,
      },
    },
    {
      path: "/events/:id",
      name: "event-detail",
      component: EventDetailView,
      meta: {
        title: "Event",
        requiresAuth: true,
      },
    },
    {
      path: "/events/:id/edit",
      name: "event-edit",
      component: EventFormView,
      meta: {
        title: "Edit event",
        requiresAuth: true,
      },
    },
    {
      path: "/w/:shareToken",
      name: "public-wishlist",
      component: PublicWishlistView,
      meta: {
        title: "Wishlist",
        description: "You're invited to view a wishlist.",
      },
    },
    {
      path: "/claim/:token",
      name: "claim-manage",
      component: ClaimManageView,
      meta: {
        title: "Manage your gift",
        description: "View or release a gift you claimed.",
      },
    },
    {
      path: "/billing/return",
      name: "billing-return",
      component: BillingReturnView,
      meta: {
        title: "Payment",
        requiresAuth: true,
      },
    },
    {
      path: "/claims",
      name: "my-claims",
      component: MyClaimsView,
      meta: {
        title: "Your gifts",
        description: "View and manage the gifts you've claimed.",
        requiresAuth: true,
      },
    },
    {
      path: "/about",
      name: "about",
      component: PlaceholderView,
      meta: {
        title: "About",
        description: "Solving the gift-giving puzzle.",
      },
    },
    {
      path: "/contact",
      name: "contact",
      component: PlaceholderView,
      meta: {
        title: "Contact",
        description: "Send us a message at alyaanoris@outlook.com",
      },
    },
    {
      path: "/privacy",
      name: "privacy",
      component: PlaceholderView,
      meta: {
        title: "Privacy Policy",
        description: "Our full privacy policy is being prepared.",
      },
    },
    {
      path: "/terms",
      name: "terms",
      component: PlaceholderView,
      meta: {
        title: "Terms",
        description: "Our terms of service are being prepared.",
      },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: NotFoundView,
    },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }

    if (to.hash) {
      return { el: to.hash, behavior: "smooth" };
    }

    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const { initAuth, isAuthenticated } = useAuth();

  // Resolve the session once before guarding so a refresh keeps the user in.
  await initAuth();

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  if (to.meta.guestOnly && isAuthenticated.value) {
    return { name: "dashboard" };
  }

  return true;
});

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? null;
  document.title = title
    ? `${title} · Hint, Darling`
    : "Hint, Darling — The art of giving, without the guesswork";
});

export default router;
