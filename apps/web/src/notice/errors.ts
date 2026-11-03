import type { Notice } from "./useNotices.ts";

export interface Logger {
  error(message: string, cause: unknown): void;
}

// console に直接書かないのは、出し先を差し替えて、出したことをテストで確かめられるようにするため
export const consoleLogger: Logger = {
  error: (message, cause) => console.error(`[loopcraft] ${message}`, cause),
};

export const messageOf = (reason: unknown) =>
  reason instanceof Error ? reason.message : String(reason);

export type ReportError = (reason: unknown, source: string) => void;

export const createErrorReporter =
  (notify: (notice: Notice) => void, logger: Logger): ReportError =>
  (reason, source) => {
    logger.error(`予期しないエラー（${source}）`, reason);
    notify({ tone: "error", title: "予期しないエラーが起きました", details: [messageOf(reason)] });
  };

/**
 * 既定の動作を止めるのは、ブラウザがコンソールに出す分と、ロガーが出す分が二重になるため
 */
export const listenUnhandledErrors = (target: EventTarget, report: ReportError) => {
  const onError = (event: Event) => {
    const { error, message } = event as ErrorEvent;
    event.preventDefault();
    report(error ?? message, "error");
  };
  const onRejection = (event: Event) => {
    event.preventDefault();
    report((event as PromiseRejectionEvent).reason, "unhandledrejection");
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
};
