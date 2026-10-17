import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    // packages/core/scripts/generate-json-schema.ts の生成物
    ignorePatterns: ["packages/core/loopcraft.schema.json"],
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "typescript/consistent-type-imports": "error",
    },
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
      // .vue を測らないのは、Vize が開発時に足す CSS の差し込みや HMR のコードまで <style> の行に対応づけて数え、
      // 書いたコードと関係なく割合が上下するため。画面はブラウザでのテストで確かめる
      include: ["packages/core/src/**/*.ts", "apps/cli/src/**/*.ts", "apps/web/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/testing/**", "apps/cli/src/cli.ts", "apps/web/src/main.ts"],
      reporter: ["text", "json", "json-summary"],
      // 全体だけでなく、パッケージごとにも下回らないようにする
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        "packages/core/src/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "apps/cli/src/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "apps/web/src/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
