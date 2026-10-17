import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import type { Session } from "@loopcraft/core/session";
import type { AutosaveStatus } from "./autosave.ts";
import { createFileClient } from "./fileStore.ts";
import type { LoadResult } from "./fileStore.ts";
import { readSession } from "./session.ts";
import { loadStoredDiagram } from "./storage.ts";
import type { StoredDiagram } from "./storage.ts";
import { createBrowserStore } from "./store.ts";
import type { DocumentStore } from "./store.ts";

export type Startup =
  /** sessionInvalid: serve の情報が埋め込まれていたのに読めず、ブラウザに保存している */
  | { kind: "browser"; stored: StoredDiagram; sessionInvalid?: boolean }
  | { kind: "file"; session: Session; loaded: LoadResult; store: DocumentStore };

export const prepareStartup = async (doc: Document = document): Promise<Startup> => {
  const session = readSession(doc);
  if (session === undefined) return { kind: "browser", stored: loadStoredDiagram() };
  if (session === "invalid") {
    return { kind: "browser", stored: loadStoredDiagram(), sessionInvalid: true };
  }
  const client = createFileClient(session);
  const loaded = await client.load();
  return { kind: "file", session, loaded, store: client.store };
};

export interface ResolvedStartup {
  initial: Diagram;
  store: DocumentStore;
  /** serve --readonly */
  readonly: boolean;
  initialStatus: AutosaveStatus | undefined;
}

export const resolveStartup = (startup: Startup): ResolvedStartup => {
  if (startup.kind === "browser") {
    const { stored } = startup;
    return {
      initial: stored.status === "ok" ? stored.diagram : createEmptyDiagram(),
      store: createBrowserStore(),
      readonly: false,
      // 保存先が使えないときと、開けなかった前回の図を退避できなかったときに ok で始めないのは、
      // ツールバーに最初から問題を出し、書き出してもらうまで上書きしないため
      initialStatus:
        stored.status === "unavailable"
          ? { kind: "failing", error: stored.error }
          : stored.status === "invalid" && stored.backupKey === undefined
            ? { kind: "suspended", reason: "unreadable" }
            : undefined,
    };
  }
  const { session, loaded, store } = startup;
  return {
    initial:
      loaded.status === "ok"
        ? loaded.diagram
        : loaded.status === "missing" && session.sample
          ? createSampleDiagram()
          : createEmptyDiagram(titleOf(session.file)),
    store,
    readonly: session.readonly,
    // ok で始めると、読めなかったファイルを空の図で上書きしてしまう
    initialStatus:
      loaded.status === "invalid" || loaded.status === "error"
        ? { kind: "suspended", reason: "unreadable" }
        : undefined,
  };
};

const titleOf = (file: string) => {
  const name = file.split(/[\\/]/).at(-1) ?? file;
  return name.replace(/\.json$/i, "") || undefined;
};
