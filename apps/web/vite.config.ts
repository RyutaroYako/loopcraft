import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: lazyPlugins(() => [solid()]),
  test: {
    name: "web",
    environment: "jsdom",
  },
});
