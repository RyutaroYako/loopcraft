import { Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { pickJsonFile } from "../editor/file.ts";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { OpenIcon, PlusIcon, SparkIcon } from "./icons.tsx";

export function EmptyState() {
  const editor = useContext(EditorContext);
  const open = async () => {
    const file = await pickJsonFile();
    if (file) await editor.importFile(file);
  };
  return (
    <Show
      when={editor.editable()}
      fallback={
        <section class="empty-state" aria-labelledby="empty-title">
          <p class="eyebrow">Causal Loop Diagram</p>
          <h2 id="empty-title">まだ出来事がありません</h2>
          <p class="empty-note">
            読み取り専用で開いています。編集するには、<code>--readonly</code>{" "}
            を付けずに開き直してください。
          </p>
        </section>
      }
    >
      <section class="empty-state" aria-labelledby="empty-title">
        <p class="eyebrow">Causal Loop Diagram</p>
        <h2 id="empty-title">最初の出来事を置いて、つながりを描きはじめる</h2>
        <ol class="empty-steps">
          <li>
            <span class="step-index">01</span>
            <span>
              キャンバスを<strong>ダブルクリック</strong>して出来事を追加
            </span>
          </li>
          <li>
            <span class="step-index">02</span>
            <span>
              出来事の右端の点を<strong>ドラッグ</strong>して因果の矢印を引く
            </span>
          </li>
          <li>
            <span class="step-index">03</span>
            <span>
              矢印が輪になると<strong>ループを自動で検出</strong>。主張したいものを見出す
            </span>
          </li>
        </ol>
        <div class="empty-actions">
          <button
            type="button"
            class="button primary"
            onClick={() => editor.addVariableAt(editor.viewCenter())}
          >
            <PlusIcon />
            出来事を追加
          </button>
          <button
            type="button"
            class="button"
            onClick={() => editor.replaceDiagram(createSampleDiagram())}
          >
            <SparkIcon />
            サンプルを開く
          </button>
          <button type="button" class="button ghost" onClick={open}>
            <OpenIcon />
            JSON を読み込む
          </button>
        </div>
      </section>
    </Show>
  );
}
