import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    // packages/core/scripts/generate-json-schema.ts の生成物
    ignorePatterns: ["packages/core/loopcraft.schema.json"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    projects: ["apps/*", "packages/*"],
  },
});
