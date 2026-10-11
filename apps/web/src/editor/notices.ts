import type { AutosaveStatus } from "./autosave.ts";
import type { Editor, Notice } from "./editor.ts";
import { downloadText } from "./file.ts";
import type { Startup } from "./startup.ts";
import type { DocumentStore } from "./store.ts";

interface Autosave {
  resume: () => Promise<void>;
  reload: () => Promise<boolean>;
}

type Action = NonNullable<Notice["actions"]>[number];

/** 自動保存の状態や、開いたときの問題を、取れる操作と一緒に知らせる */
export function createNotices(context: {
  editor: Editor;
  store: DocumentStore;
  startup: Startup;
  autosave: () => Autosave;
}) {
  const { editor, store, startup } = context;
  const fileName = store.label;

  const resume: Action["run"] = () => {
    editor.dismissNotice();
    void context.autosave().resume();
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
            details: [
              "loopcraft serve が動いているか、ファイルに書き込めるかを確かめてください",
              String(status.error),
            ],
            actions: [{ label: "保存し直す", run: resume }, exportAction],
          };
    }
    if (status.kind === "suspended" && status.reason === "external") {
      return store.kind === "browser"
        ? {
            tone: "error",
            title: "別のタブでこの図が保存されました",
            details: [
              "上書きを防ぐため、このタブの自動保存を止めています",
              "別のタブの内容を使うときは、このタブを再読み込みしてください",
            ],
            actions: [{ label: "このタブの内容で保存し直す", run: resume }],
          }
        : {
            tone: "error",
            title: `${fileName} がほかの場所で変更されました`,
            details: ["上書きを防ぐため、自動保存を止めています"],
            actions: [
              {
                label: "ファイルの内容を読み込む",
                run: () => {
                  editor.dismissNotice();
                  void context.autosave().reload();
                },
              },
              { label: "この画面の内容で上書き", run: resume },
            ],
          };
    }
    if (status.kind === "suspended") {
      if (startup.kind === "file") {
        return {
          tone: "error",
          title: `${fileName} を開けませんでした`,
          details: [
            "ファイルはそのまま残しています。直してから再読み込みするか、この画面の内容で上書きしてください",
            ...(startup.loaded.status === "invalid" ? startup.loaded.errors : []),
          ],
          actions: [{ label: "この画面の内容で上書き", run: resume }],
        };
      }
      return {
        tone: "error",
        title: "自動保存を止めています",
        details: [
          "前回開けなかった図を退避できなかったため、上書きしないよう止めています",
          "開けなかったデータを書き出して手元に残せたら、自動保存を再開してください",
        ],
        actions: [...downloadUnreadable, { label: "書き出したので自動保存を再開", run: resume }],
      };
    }
    return undefined;
  }

  const explain = (status: AutosaveStatus) => {
    const notice = describe(status);
    if (notice) editor.notify(notice);
  };

  return {
    explain,

    /** 開いた時点で知らせることがあれば知らせる */
    atStartup(initialStatus: AutosaveStatus | undefined) {
      if (initialStatus) {
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
  };
}
