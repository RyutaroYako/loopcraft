import vize from "@vizejs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

/** jsdom で済ませないのは、描画と操作を実際の Chromium で確かめるため */
export default defineConfig({
  plugins: lazyPlugins(() => [vize()]),
  css: { transformer: "lightningcss" },
  test: {
    name: "web-browser",
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      viewport: { width: 1280, height: 800 },
    },
  },
});
