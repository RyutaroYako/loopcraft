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
          <h2 id="empty-title">まだ変数がありません</h2>
          <p class="empty-note">
            読み取り専用で開いています。編集するには<code>--readonly</code>
            を付けずに開き直してください。
          </p>
        </section>
      }
    >
      <section class="empty-state" aria-labelledby="empty-title">
        <p class="eyebrow">Causal Loop Diagram</p>
        <h2 id="empty-title">最初の変数を置いて、つながりを描きはじめる</h2>
        <p class="empty-note">変数は、売上や社員数のように増えたり減ったりするものです</p>
        <ol class="empty-steps">
          <li>
            <span class="step-index">01</span>
            <span>
              <span class="for-mouse">
                キャンバスを<strong>ダブルクリック</strong>して変数を追加
              </span>
              <span class="for-touch">
                下の<strong>「変数を追加」</strong>で変数を追加
              </span>
            </span>
          </li>
          <li>
            <span class="step-index">02</span>
            <span>
              <span class="for-mouse">
                変数の右端の点を<strong>ドラッグ</strong>して因果の矢印を引く
              </span>
              <span class="for-touch">
                変数を選んで、<strong>矢印を引くボタン</strong>から因果の矢印を引く
              </span>
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
            変数を追加
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
