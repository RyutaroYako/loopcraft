import type { AutosaveStatus } from "./autosave.ts";
import type { Editor, Notice } from "./editor.ts";
import { downloadText } from "./file.ts";
import type { Startup } from "./startup.ts";
import type { DocumentStore, ReloadResult } from "./store.ts";

interface Autosave {
  retry: () => Promise<void>;
  resume: () => Promise<void>;
  reload: () => Promise<ReloadResult>;
}

type Action = NonNullable<Notice["actions"]>[number];

/** 自動保存の状態や、開いたときの問題を、取れる操作と一緒に知らせる */
export function createNotices(context: {
  editor: Editor;
  store: DocumentStore;
  startup: Startup;
  autosave: () => Autosave;
  reloadPage?: () => void;
}) {
  const { editor, store, startup } = context;
  const fileName = store.label;
  const reloadPage = context.reloadPage ?? (() => location.reload());

  const run =
    (task: (autosave: Autosave) => Promise<unknown>): Action["run"] =>
    () => {
      editor.dismissNotice();
      void task(context.autosave());
    };

  const exportAction: Action = { label: "JSON を書き出す", run: () => editor.exportFile() };

  const unreadable =
    startup.kind === "browser" && startup.stored.status === "invalid" ? startup.stored : undefined;

  const downloadUnreadable: Action[] = unreadable
    ? [
        {
          label: "開けなかったデータを書き出す",
          run: () => downloadText(unreadable.raw, "system-diagram-unreadable.json"),
        },
      ]
    : [];

  /** 読み直して、読めなければその理由をもう一度知らせる */
  const reloadFromFile = run(async (autosave) => {
    const result = await autosave.reload();
    if (!result.ok) explain({ kind: "suspended", reason: "external", problems: result.problems });
  });

  function describe(status: AutosaveStatus): Notice | undefined {
    if (status.kind === "failing") {
      return store.kind === "browser"
        ? {
            tone: "error",
            title: "ブラウザに自動保存できません",
            details: ["「JSON を書き出す」でファイルに保存してください", String(status.error)],
            actions: [exportAction],
          }
        : {
            tone: "error",
            title: `${fileName} に保存できません`,
            details: [String(status.error)],
            actions: [
              { label: "保存し直す", run: run((autosave) => autosave.retry()) },
              exportAction,
            ],
          };
    }
    if (status.kind === "ok") return undefined;
    if (status.reason === "disconnected") {
      return {
        tone: "error",
        title: "loopcraft serve とのつながりが切れました",
        details: [
          "止めたか、起動し直した可能性があります。この画面からは保存できません",
          "未保存の変更は「JSON を書き出す」で残せます。起動し直したら、このページを再読み込みしてください",
        ],
        actions: [exportAction, { label: "ページを再読み込み", run: reloadPage }],
      };
    }
    if (status.reason === "external") {
      return store.kind === "browser"
        ? {
            tone: "error",
            title: "別のタブでこの図が保存されました",
            details: [
              "上書きを防ぐため、このタブの自動保存を止めています",
              "別のタブの内容を使うときは、このタブを再読み込みしてください",
            ],
            actions: [{ label: "このタブの内容で保存し直す", run: run((a) => a.resume()) }],
          }
        : {
            tone: "error",
            title: `${fileName} がほかの場所で変更されました`,
            details: [
              "上書きを防ぐため、自動保存を止めています",
              ...(status.problems?.length
                ? ["ファイルの内容を読み込めませんでした:", ...status.problems]
                : []),
            ],
            actions: [
              { label: "ファイルの内容を読み込む", run: reloadFromFile },
              { label: "この画面の内容で上書き", run: run((a) => a.resume()) },
            ],
          };
    }
    if (startup.kind === "file") {
      const { loaded } = startup;
      return {
        tone: "error",
        title: `${fileName} を開けませんでした`,
        details: [
          "ファイルはそのまま残しています。直してから再読み込みするか、この画面の内容で上書きしてください",
          ...(loaded.status === "invalid" ? loaded.errors : []),
          ...(loaded.status === "error" ? [String(loaded.error)] : []),
        ],
        actions: [{ label: "この画面の内容で上書き", run: run((a) => a.resume()) }],
      };
    }
    return {
      tone: "error",
      title: "自動保存を止めています",
      details: [
        "前回開けなかった図を退避できなかったため、上書きしないよう止めています",
        "開けなかったデータを書き出して手元に残せたら、自動保存を再開してください",
      ],
      actions: [
        ...downloadUnreadable,
        { label: "書き出したので自動保存を再開", run: run((a) => a.resume()) },
      ],
    };
  }

  function explain(status: AutosaveStatus) {
    const notice = describe(status);
    if (notice) editor.notify(notice);
  }

  return {
    explain,

    /** 開いた時点で知らせることがあれば知らせる */
    atStartup(initialStatus: AutosaveStatus | undefined) {
      if (startup.kind === "browser" && startup.sessionInvalid) {
        editor.notify({
          tone: "error",
          title: "loopcraft serve の情報を読めませんでした",
          details: [
            "この画面の変更はファイルではなく、ブラウザに保存されます",
            "ページを再読み込みするか、loopcraft serve を起動し直してください",
          ],
          actions: [{ label: "ページを再読み込み", run: reloadPage }],
        });
      } else if (initialStatus) {
        explain(initialStatus);
      } else if (unreadable?.backupKey) {
        editor.notify({
          tone: "error",
          title: "前回の図を開けませんでした",
          details: [
            "元のデータはブラウザ内に退避しました。「図の概要」の「退避したデータ」からいつでも書き出せます",
            ...unreadable.errors,
          ],
          actions: downloadUnreadable,
        });
      } else if (startup.kind === "file" && startup.loaded.status === "missing") {
        editor.notify({
          tone: "info",
          title: `${fileName} はまだありません`,
          details: ["編集を始めると、最初の保存で作成します"],
        });
      }
    },

    /** 外部での変更を取り込んだとき */
    reloaded() {
      editor.notify({ tone: "info", title: `${fileName} の変更を読み込みました` });
    },

    /** 外部での変更を見張れなくなったとき。保存は続けられる */
    unwatched(detail: string | undefined) {
      editor.notify({
        tone: "error",
        title: "ほかの場所での変更を見張れなくなりました",
        details: [
          ...(detail ? [detail] : []),
          "保存は続けます。ほかの場所で変更すると、保存するときに競合として知らせます",
        ],
      });
    },
  };
}
