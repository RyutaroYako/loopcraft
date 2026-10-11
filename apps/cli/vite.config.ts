import { cp } from "node:fs/promises";
import { defineConfig } from "vite-plus";

const webDist = new URL("../web/dist/", import.meta.url);
const bundledWeb = new URL("./dist/web/", import.meta.url);

export default defineConfig({
  pack: {
    entry: ["src/cli.ts"],
    format: "esm",
    target: "node22",
    platform: "node",
    banner: { js: "#!/usr/bin/env node" },
    clean: true,
    hooks: {
      // serve で配るため、ビルド済みのエディタをパッケージに同梱する
      "build:done": async () => {
        await cp(webDist, bundledWeb, { recursive: true });
      },
    },
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: ["@loopcraft/web#build"],
      },
    },
  },
  test: {
    name: "cli",
    environment: "node",
  },
});
