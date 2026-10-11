import { createEmptyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";
import type { Session } from "@loopcraft/core/session";
import type { AutosaveStatus } from "./autosave.ts";
import { createFileClient, type LoadResult } from "./fileStore.ts";
import { readSession } from "./session.ts";
import { loadStoredDiagram, type StoredDiagram } from "./storage.ts";
import { createBrowserStore, type DocumentStore } from "./store.ts";

export type Startup =
  /** sessionInvalid: serve の情報が埋め込まれていたのに読めず、ブラウザに保存している */
  | { kind: "browser"; stored: StoredDiagram; sessionInvalid?: boolean }
  | { kind: "file"; session: Session; loaded: LoadResult; store: DocumentStore };

/** 描画の前に、どこから図を開くかを決めて読み込む */
export async function prepareStartup(doc: Document = document): Promise<Startup> {
  const session = readSession(doc);
  if (session === undefined) return { kind: "browser", stored: loadStoredDiagram() };
  if (session === "invalid") {
    return { kind: "browser", stored: loadStoredDiagram(), sessionInvalid: true };
  }
  const client = createFileClient(session);
  const loaded = await client.load();
  return { kind: "file", session, loaded, store: client.store };
}

export interface ResolvedStartup {
  initial: Diagram;
  store: DocumentStore;
  editable: boolean;
  /** true なら、閲覧モードから編集モードへ切り替えられない */
  readonly: boolean;
  /** 自動保存を問題のある状態から始めるとき */
  initialStatus: AutosaveStatus | undefined;
}

export function resolveStartup(startup: Startup): ResolvedStartup {
  if (startup.kind === "browser") {
    const { stored } = startup;
    return {
      initial: stored.status === "ok" ? stored.diagram : createEmptyDiagram(),
      store: createBrowserStore(),
      editable: true,
      readonly: false,
      // 保存先が使えないときと、開けなかった前回の図を退避できなかったとき（書き出してもらうまで
      // 上書きしない）は、最初から問題のある状態として始めてツールバーにも出す
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
    initial: loaded.status === "ok" ? loaded.diagram : createEmptyDiagram(titleOf(session.file)),
    store,
    editable: session.editable && !session.readonly,
    readonly: session.readonly,
    // 読めなかったファイルを、空の図で上書きしてしまわないよう止めておく
    initialStatus:
      loaded.status === "invalid" || loaded.status === "error"
        ? { kind: "suspended", reason: "unreadable" }
        : undefined,
  };
}

function titleOf(file: string) {
  const name = file.split(/[\\/]/).at(-1) ?? file;
  return name.replace(/\.json$/i, "") || undefined;
}
