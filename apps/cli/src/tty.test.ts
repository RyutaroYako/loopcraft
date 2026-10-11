import { afterEach, describe, expect, it } from "vite-plus/test";
import { canPrompt, isInteractive } from "./tty.ts";

function setTTY(stream: NodeJS.ReadStream | NodeJS.WriteStream, value: boolean) {
  Object.defineProperty(stream, "isTTY", { configurable: true, value });
}

describe("tty", () => {
  const original = { stderr: process.stderr.isTTY, stdin: process.stdin.isTTY };

  afterEach(() => {
    setTTY(process.stderr, original.stderr);
    setTTY(process.stdin, original.stdin);
  });

  it("端末で CI でなければ対話できる", () => {
    setTTY(process.stderr, true);
    expect(isInteractive({})).toBe(true);
    expect(isInteractive({ CI: "true" })).toBe(false);
    setTTY(process.stderr, false);
    expect(isInteractive({})).toBe(false);
  });

  it("stdin も端末のときだけ入力を求める", () => {
    setTTY(process.stderr, true);
    setTTY(process.stdin, true);
    expect(canPrompt({})).toBe(true);
    setTTY(process.stdin, false);
    expect(canPrompt({})).toBe(false);
  });
});
