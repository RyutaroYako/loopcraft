import { describe, expect, it } from "vite-plus/test";
import { createLogger, createMemoryLogger } from "./log.ts";

function streams(isTTY: boolean) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    streams: {
      stdout: { write: (chunk: string) => out.push(chunk) },
      stderr: { write: (chunk: string) => err.push(chunk), isTTY },
    },
  };
}

describe("createLogger", () => {
  it("人向けの出力は stderr、結果は stdout に出す", () => {
    const { out, err, streams: s } = streams(false);
    const log = createLogger(s, {}, "linux");
    log.info("情報");
    log.success("成功");
    log.warn("注意");
    log.error("失敗");
    log.note("補足");
    log.plain("そのまま");
    log.output("結果");
    expect(log.color).toBe(false);
    expect(err).toEqual(["ℹ 情報\n", "✓ 成功\n", "⚠ 注意\n", "✗ 失敗\n", "補足\n", "そのまま\n"]);
    expect(out).toEqual(["結果\n"]);
  });

  it("端末なら色を付け、NO_COLOR なら付けない", () => {
    const tty = streams(true);
    const colored = createLogger(tty.streams, {}, "linux");
    colored.success("ok");
    colored.note("note");
    expect(colored.color).toBe(true);
    expect(tty.err[0]).toContain("\u001B[32m");
    expect(tty.err[1]).toContain("\u001B[2m");
    expect(createLogger(streams(true).streams, { NO_COLOR: "" }, "linux").color).toBe(false);
    expect(createLogger(streams(false).streams, { FORCE_COLOR: "1" }, "linux").color).toBe(true);
  });

  it("記号を描けない Windows の端末では ASCII にする", () => {
    const plain = streams(false);
    createLogger(plain.streams, {}, "win32").success("ok");
    expect(plain.err).toEqual(["v ok\n"]);
    const terminal = streams(false);
    createLogger(terminal.streams, { WT_SESSION: "1" }, "win32").error("ng");
    expect(terminal.err).toEqual(["✗ ng\n"]);
  });
});

describe("createMemoryLogger", () => {
  it("出力を記録する", () => {
    const { logger, stdout, stderr } = createMemoryLogger();
    logger.info("i");
    logger.success("s");
    logger.warn("w");
    logger.error("e");
    logger.note("n");
    logger.plain("p");
    logger.output("o");
    expect(stderr).toEqual(["ℹ i", "✓ s", "⚠ w", "✗ e", "n", "p"]);
    expect(stdout).toEqual(["o"]);
  });
});
