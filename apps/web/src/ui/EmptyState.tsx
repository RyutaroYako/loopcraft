import { Show, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import { pickJsonFile } from "../editor/file.ts";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { OpenIcon, PlusIcon, SparkIcon } from "./icons.tsx";

// 案内全体で押下を受け取らないのは、案内の上でもダブルクリックで変数を足せるようにするため。
// 狭い画面で広い画面と同じ余白にしないのは、ボタンが下の拡大縮小の操作と重なるため
const sectionClass = [
  "pointer-events-none absolute top-[clamp(32px,14%,140px)] left-[clamp(24px,9%,120px)]",
  "grid max-w-[520px] animate-rise gap-6 py-7 pr-8",
  "bg-[radial-gradient(closest-side,var(--color-canvas)_70%,transparent)]",
  "max-md:top-4 max-md:gap-3.5 max-md:py-3",
];
const titleClass =
  "max-w-[19ch] text-[clamp(24px,3vw,30px)] leading-tight font-semibold tracking-display text-balance [word-break:auto-phrase]";

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
        <section class={sectionClass} aria-labelledby="empty-title">
          <p class="eyebrow">Causal Loop Diagram</p>
          <h2 id="empty-title" class={titleClass}>
            まだ変数がありません
          </h2>
          <p class="max-w-[40ch] text-ink-2 [word-break:auto-phrase] max-md:short:hidden">
            読み取り専用で開いています。編集するには
            <code class="mx-[0.25em] font-mono whitespace-nowrap">--readonly</code>
            を付けずに開き直してください。
          </p>
        </section>
      }
    >
      <section class={sectionClass} aria-labelledby="empty-title">
        <p class="eyebrow">Causal Loop Diagram</p>
        <h2 id="empty-title" class={titleClass}>
          最初の変数を置いて、つながりを描きはじめる
        </h2>
        <p class="max-w-[40ch] text-ink-2 [word-break:auto-phrase] max-md:short:hidden">
          変数は、売上や社員数のように増えたり減ったりするものです
        </p>
        <ol class="grid gap-2.5 border-y border-line py-3.5 text-ink-2 max-md:short:hidden">
          <li class="grid grid-cols-[32px_1fr] items-baseline animate-rise">
            <span class="font-mono text-xs text-accent">01</span>
            <span>
              下の<strong class="font-semibold text-ink">「変数を追加」</strong>で変数を置く
            </span>
          </li>
          <li class="grid grid-cols-[32px_1fr] items-baseline animate-rise [animation-delay:80ms]">
            <span class="font-mono text-xs text-accent">02</span>
            <span>
              変数の<strong class="font-semibold text-ink">端の点をドラッグ</strong>
              して、因果の矢印を引く
            </span>
          </li>
          <li class="grid grid-cols-[32px_1fr] items-baseline animate-rise [animation-delay:160ms]">
            <span class="font-mono text-xs text-accent">03</span>
            <span>
              矢印が輪になると<strong class="font-semibold text-ink">ループを自動で検出</strong>
              。主張したいものを見出す
            </span>
          </li>
        </ol>
        <div class="flex flex-wrap gap-2 *:pointer-events-auto">
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
