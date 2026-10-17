import type { Diagram } from "@loopcraft/core/schema";

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 1200;

export interface History {
  readonly past: readonly Diagram[];
  readonly future: readonly Diagram[];
  readonly coalesce?: { readonly key: string; readonly at: number };
}

export const emptyHistory: History = { past: [], future: [] };

export const record = (history: History, previous: Diagram): History => ({
  past: [...history.past, previous].slice(-HISTORY_LIMIT),
  future: [],
});

export const recordEdit = (
  history: History,
  previous: Diagram,
  key: string | undefined,
  now: number,
): History => {
  const merge =
    key !== undefined && history.coalesce?.key === key && now - history.coalesce.at < COALESCE_MS;
  const next = merge ? { ...history, future: [] } : record(history, previous);
  return { ...next, coalesce: key === undefined ? undefined : { key, at: now } };
};

export const undo = (
  history: History,
  present: Diagram,
): { history: History; diagram: Diagram } | undefined => {
  const previous = history.past.at(-1);
  if (!previous) return undefined;
  return {
    diagram: previous,
    history: { past: history.past.slice(0, -1), future: [...history.future, present] },
  };
};

export const redo = (
  history: History,
  present: Diagram,
): { history: History; diagram: Diagram } | undefined => {
  const next = history.future.at(-1);
  if (!next) return undefined;
  return {
    diagram: next,
    history: {
      past: [...history.past, present].slice(-HISTORY_LIMIT),
      future: history.future.slice(0, -1),
    },
  };
};
