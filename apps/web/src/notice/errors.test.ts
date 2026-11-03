import { describe, expect, it, vi } from "vite-plus/test";
import { createErrorReporter, listenUnhandledErrors, messageOf } from "./errors.ts";

describe("createErrorReporter", () => {
  it("ロガーに原因ごと残し、お知らせには文言だけを出す", () => {
    const logger = { error: vi.fn() };
    const notify = vi.fn();
    const cause = new Error("boom");
    createErrorReporter(notify, logger)(cause, "render function");
    expect(logger.error).toHaveBeenCalledWith("予期しないエラー（render function）", cause);
    expect(notify).toHaveBeenCalledWith({
      tone: "error",
      title: "予期しないエラーが起きました",
      details: ["boom"],
    });
    expect(messageOf("rejected")).toBe("rejected");
  });
});

describe("listenUnhandledErrors", () => {
  it("取りこぼした例外と拒否を受けて既定の動作を止め、外したら受けない", () => {
    const target = new EventTarget();
    const report = vi.fn();
    const stop = listenUnhandledErrors(target, report);
    const cause = new Error("boom");
    const error = new ErrorEvent("error", { error: cause, cancelable: true });
    target.dispatchEvent(error);
    expect(report).toHaveBeenLastCalledWith(cause, "error");
    expect(error.defaultPrevented).toBe(true);

    const messageOnly = new ErrorEvent("error", { message: "ResizeObserver loop" });
    target.dispatchEvent(messageOnly);
    expect(report).toHaveBeenLastCalledWith("ResizeObserver loop", "error");

    const rejection = Object.assign(new Event("unhandledrejection", { cancelable: true }), {
      reason: "rejected",
    });
    target.dispatchEvent(rejection);
    expect(report).toHaveBeenLastCalledWith("rejected", "unhandledrejection");
    expect(rejection.defaultPrevented).toBe(true);

    stop();
    target.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(report).toHaveBeenCalledTimes(3);
  });
});
