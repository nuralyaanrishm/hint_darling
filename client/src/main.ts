import "./assets/main.css";

import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { useAuth } from "@/stores/auth";

// Resolve any existing session before the first render so the navbar and
// route guards see the correct state immediately.
const { initAuth } = useAuth();

initAuth().finally(() => {
  createApp(App).use(router).mount("#app");
});
