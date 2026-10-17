import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import type { Session } from "@loopcraft/core/session";
import type { AutosaveStatus } from "./autosave.ts";
import { createFileClient } from "./fileStore.ts";
import type { LoadResult } from "./fileStore.ts";
import { readSession } from "./session.ts";
import { loadStoredDiagram } from "./storage.ts";
import { createBrowserStore } from "./store.ts";
import type { DocumentStore, Opened } from "./store.ts";

export interface Startup {
  store: DocumentStore;
  opened: Opened;
  /** 開けなかったときと、まだ無いときに始める図 */
  blank: Diagram;
  /** serve --readonly */
  readonly: boolean;
  /** serve の情報が埋め込まれていたのに読めず、ブラウザに保存している */
  sessionInvalid: boolean;
}

export const prepareStartup = async (doc: Document = document): Promise<Startup> => {
  const session = readSession(doc);
  if (session === undefined || session === "invalid") {
    return startInBrowser(loadStoredDiagram(), session === "invalid");
  }
  const client = createFileClient(session);
  return startWithFile(session, await client.load(), client.store);
};

export const startInBrowser = (opened: Opened, sessionInvalid = false): Startup => ({
  store: createBrowserStore(),
  opened,
  blank: createEmptyDiagram(),
  readonly: false,
  sessionInvalid,
});

export const startWithFile = (
  session: Session,
  loaded: LoadResult,
  store: DocumentStore,
): Startup => ({
  store,
  opened:
    loaded.status === "invalid"
      ? { status: "unreadable", problems: loaded.errors }
      : loaded.status === "error"
        ? { status: "unreadable", problems: [String(loaded.error)] }
        : loaded,
  blank: session.sample ? createSampleDiagram() : createEmptyDiagram(titleOf(session.file)),
  readonly: session.readonly,
  sessionInvalid: false,
});

export interface ResolvedStartup {
  initial: Diagram;
  store: DocumentStore;
  readonly: boolean;
  initialStatus: AutosaveStatus | undefined;
}

export const resolveStartup = ({ store, opened, blank, readonly }: Startup): ResolvedStartup => ({
  initial: opened.status === "ok" ? opened.diagram : blank,
  store,
  readonly,
  // ok で始めると、開けなかった図を空の図で上書きしてしまう
  initialStatus:
    opened.status === "unreadable" ? { kind: "suspended", reason: "unreadable" } : undefined,
});

const titleOf = (file: string) => {
  const name = file.split(/[\\/]/).at(-1) ?? file;
  return name.replace(/\.json$/i, "") || undefined;
};
