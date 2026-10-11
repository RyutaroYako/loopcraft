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
    projects: [
      "packages/*",
      "apps/cli",
      "apps/web/vite.config.ts",
      "apps/web/vite.browser.config.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts", "apps/cli/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/testing/**", "apps/cli/src/cli.ts"],
      reporter: ["text", "json", "json-summary"],
      // 画面の描画（apps/web/src の editor 以外）はブラウザのテストで守り、しきい値の対象にはしない
      thresholds: {
        "packages/core/src/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "apps/cli/src/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "apps/web/src/editor/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
