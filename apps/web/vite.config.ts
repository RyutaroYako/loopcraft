import vize from "@vizejs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  // ルートからの絶対パスにしないのは、GitHub Pages では /loopcraft/ の下で配信され、CLI の serve ではルートで配信されるため
  base: "./",
  plugins: lazyPlugins(() => [vize()]),
  css: { transformer: "lightningcss" },
  test: {
    name: "web",
    environment: "jsdom",
    // CSS をすべて処理しないのは、ロジックのテストは見た目を確かめず、処理を待つ分だけ遅くなるため
    css: { include: [/tokens\.css/] },
    exclude: ["**/node_modules/**", "**/*.browser.test.ts"],
  },
});
