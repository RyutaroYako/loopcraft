import type { Editor } from "../editor/useEditor.ts";
import type { AutosaveStatus } from "../persistence/autosave.ts";
import type { Startup } from "../persistence/startup.ts";
import type { ReloadResult } from "../persistence/store.ts";
import { downloadText } from "../transfer/file.ts";
import type { Notice } from "./useNotices.ts";

interface Autosave {
  retry: () => Promise<void>;
  resume: () => Promise<void>;
  reload: () => Promise<ReloadResult>;
}

type Action = NonNullable<Notice["actions"]>[number];

export const createNotices = (context: {
  editor: Editor;
  startup: Startup;
  autosave: () => Autosave;
  reloadPage?: () => void;
}) => {
  const { editor, startup } = context;
  const { store, opened } = startup;
  // 読み取り専用で上書きを勧めないのは、サーバーが拒むため
  const overwrite = (label: string): Action[] =>
    startup.readonly ? [] : [{ label, run: run((a) => a.resume()) }];
  const reloadPage = context.reloadPage ?? (() => location.reload());

  const run =
    (task: (autosave: Autosave) => Promise<unknown>): Action["run"] =>
    () => {
      editor.dismissNotice();
      void task(context.autosave());
    };

  const exportAction: Action = { label: "JSON を書き出す", run: () => editor.exportFile() };

  const unreadable = opened.status === "unreadable" ? opened : undefined;
  const raw = unreadable?.raw;

  const downloadUnreadable: Action[] =
    raw === undefined
      ? []
      : [
          {
            label: "開けなかったデータを書き出す",
            run: () => downloadText(raw, "system-diagram-unreadable.json"),
          },
        ];

  const reloadSaved = run(async (autosave) => {
    const result = await autosave.reload();
    if (!result.ok) explain({ kind: "suspended", reason: "external", problems: result.problems });
  });

  const describe = (status: AutosaveStatus): Notice | undefined => {
    if (status.kind === "failing") {
      return {
        tone: "error",
        title: "自動保存できません",
        details: [
          `保存先: ${store.label}`,
          String(status.error),
          "未保存の変更は「JSON を書き出す」で残せます",
        ],
        actions: [{ label: "保存し直す", run: run((autosave) => autosave.retry()) }, exportAction],
      };
    }
    if (status.kind === "ok") return undefined;
    if (status.reason === "disconnected") {
      return {
        tone: "error",
        title: "loopcraft serve とのつながりが切れました",
        details: [
          "止めたか、起動し直した可能性があります。この画面からは保存できません",
          "未保存の変更は「JSON を書き出す」で残せます。起動し直したら、ターミナルに表示された新しい URL を開いてください",
        ],
        actions: [exportAction],
      };
    }
    if (status.reason === "external") {
      return {
        tone: "error",
        title: "ほかの場所で図が変更されました",
        details: [
          "上書きを防ぐため、自動保存を止めています",
          ...(status.problems?.length
            ? ["保存されている内容を読み込めませんでした:", ...status.problems]
            : []),
        ],
        actions: [
          { label: "保存されている内容を読み込む", run: reloadSaved },
          ...overwrite("この画面の内容で上書き"),
        ],
      };
    }
    return {
      tone: "error",
      title: "保存されていた図を開けませんでした",
      details: [
        `保存先: ${store.label}`,
        "元のデータはそのまま残し、自動保存を止めています。保存先の内容が直れば、自動で読み込みます",
        ...(unreadable?.problems ?? []),
      ],
      actions: [...downloadUnreadable, ...overwrite("この画面の内容で上書き")],
    };
  };

  /** 覚えておくのは、状態が戻ったときに、ほかの通知まで閉じないため */
  let explained: Notice | undefined;

  const explain = (status: AutosaveStatus) => {
    const notice = describe(status);
    if (!notice) return;
    explained = notice;
    editor.notify(notice);
  };

  return {
    explain,

    atStartup(initialStatus: AutosaveStatus | undefined) {
      if (startup.sessionInvalid) {
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
      }
    },

    recovered() {
      if (explained) editor.dismissNotice(explained);
      explained = undefined;
    },

    reloaded() {
      editor.notify({ tone: "info", title: "ほかの場所での変更を読み込みました" });
    },

    unwatched(detail: string | undefined) {
      editor.notify({
        tone: "error",
        title: "ほかの場所での変更を見張れなくなりました",
        details: [
          ...(detail ? [detail] : []),
          "loopcraft serve を起動し直すまで、ほかの場所での変更はこの画面に反映されません",
          "編集した内容の保存は続け、ほかの場所での変更とぶつかったときは保存のときに知らせます",
        ],
      });
    },
  };
};
