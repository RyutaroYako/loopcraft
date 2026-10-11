import solid from "@solidjs/vite-plugin";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  fmt: {
    // scripts/generate-json-schema.ts の生成物
    ignorePatterns: ["public/system-diagram.schema.json"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  plugins: lazyPlugins(() => [solid()]),
});
