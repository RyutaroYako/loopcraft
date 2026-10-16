import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  // ルートからの絶対パスにしないのは、GitHub Pages では /loopcraft/ の下で配信され、CLI の serve ではルートで配信されるため
  base: "./",
  plugins: lazyPlugins(() => [solid()]),
  test: {
    name: "web",
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/*.browser.test.tsx"],
  },
});
