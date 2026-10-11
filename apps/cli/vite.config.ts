import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/cli.ts"],
    format: "esm",
    target: "node22",
    platform: "node",
    banner: { js: "#!/usr/bin/env node" },
    clean: true,
    copy: [{ from: "../web/dist/**/*", to: "dist/web", flatten: false }],
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
