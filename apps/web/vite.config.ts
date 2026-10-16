import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  // ルートからの絶対パスにしないのは、GitHub Pages では /loopcraft/ の下で配信され、CLI の serve ではルートで配信されるため
  base: "./",
  plugins: lazyPlugins(() => [solid(), tailwindcss()]),
  test: {
    name: "web",
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/*.browser.test.tsx"],
  },
});
