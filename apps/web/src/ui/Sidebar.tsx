import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";
import { AutosaveContext } from "../editor/autosave.ts";
import { canvasElement, EditorContext, type Editor } from "../editor/editor.ts";
import type { LoopEntry } from "@loopcraft/core/loops";
import { downloadText } from "../editor/file.ts";
import { refocusWhenLost } from "../editor/focus.ts";
import { listBackups, readBackup, removeBackup } from "../editor/storage.ts";
import * as edit from "@loopcraft/core/edit";
import { defaultCurvature } from "@loopcraft/core/geometry";
import type { LoopKind } from "@loopcraft/core/loop";
import type { Link, LinkId, LoopId, VariableId } from "@loopcraft/core/schema";
import { createBottomSheet, SheetHandle } from "./BottomSheet.tsx";
import type { MenuItem } from "./ContextMenu.tsx";
import { linkActions, loopActions, variableActions } from "./itemActions.ts";
import { ArrowRightIcon, PinIcon } from "./icons.tsx";

/** 狭い画面用に別の部品を作らないのは、中身も状態も同じで、並べ方だけが違うため */
export function Sidebar() {
  const editor = useContext(EditorContext);
  const sheet = createBottomSheet();

  createEffect(
    () => editor.connectingFrom(),
    (from) => {
      // 開いたままにしないのは、つなぐ先の変数がシートの下に隠れるため
      if (from !== null) sheet.setSize("peek");
    },
    { defer: true },
  );

  return (
    <aside
      class={[
        // 中身の高さで分けないのは、選択で検査パネルが伸び縮みし、ループ一覧がカーソルの下で動くため。
        // 狭い画面で縮ませないのは、シートの高さに押し込められて一覧と概要が重なるため。スクロールはシート全体で受ける
        "sidebar grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] border-l border-line bg-surface max-md:relative max-md:z-2 max-md:-mt-4 max-md:flex max-md:h-(--sheet-height) max-md:flex-col max-md:overflow-y-auto max-md:overscroll-contain max-md:rounded-[18px_18px_0_0] max-md:border-l-0 max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-[0_-1px_0_var(--color-line),0_-12px_32px_-16px_rgb(24_24_27/0.22)] max-md:*:flex-none max-md:*:overflow-visible",
        // 指で動かしている間も遷移を残さないのは、遅れて付いてきて取っ手が指から離れるため
        sheet.dragging()
          ? "max-md:transition-none"
          : "max-md:transition-[height] max-md:duration-300",
      ]}
      data-size={sheet.size()}
      style={{ "--sheet-height": `${sheet.height()}px` }}
    >
      <SheetHandle sheet={sheet} />
      {/* 選んだときにシートを上げないのは、動かそうと触れた変数や、その行き先がシートの下に隠れるため */}
      {/*
        操作バーをグリッドの 1 行にしないのは、選ぶたびに行が増減し、ループ一覧がカーソルの下で動くため。
        狭い画面で包みを残さないのは、上端の操作バーをシート全体のスクロールに対して貼り付けるため
      */}
      <div class="flex min-h-0 flex-col border-b border-line max-md:contents max-md:*:flex-none max-md:*:overflow-visible">
        <SelectionBar expandable={sheet.size() === "peek"} onExpand={() => sheet.setSize("half")} />
        <Inspector />
      </div>
      <Browser />
    </aside>
  );
}

function SelectionBar(props: { expandable: boolean; onExpand: () => void }) {
  const editor = useContext(EditorContext);
  const title = () => {
    const selection = editor.selection();
    if (!selection) return "";
    if (selection.kind === "variable") return labelOf(editor, selection.id);
    if (selection.kind === "link") {
      const link = editor.linkById().get(selection.id);
      return `${labelOf(editor, link?.from)} → ${labelOf(editor, link?.to)}`;
    }
    return editor.loopEntryByLoopId().get(selection.id)?.featured?.loop.name || "ループ";
  };
  const actions = (): MenuItem[] => {
    const selection = editor.selection();
    if (!selection || !editor.editable()) return [];
    if (selection.kind === "variable") return variableActions(editor, selection.id);
    if (selection.kind === "link") return linkActions(editor, selection.id);
    return loopActions(editor, selection.id);
  };
  return (
    <Show when={editor.selection()}>
      <div class="grid gap-0.5 border-b border-line bg-surface px-4 pt-3 pb-2 max-md:sticky max-md:top-6 max-md:z-1 max-md:flex-none max-md:pt-0">
        <div class="flex items-center justify-between gap-2">
          <p class="selection-bar-title min-w-0 truncate text-lg font-semibold">{title()}</p>
          {/* 広い画面で出さないのは、一覧がキャンバスの横に並び、広げるものが無いため */}
          <button
            type="button"
            class={[
              "button ghost small sheet-expand hidden",
              { "max-md:inline-flex": props.expandable },
            ]}
            onClick={props.onExpand}
          >
            詳しく
          </button>
        </div>
        <Show when={actions().length > 0}>
          {/* 狭い画面で折り返さないのは、畳んだシートの高さに収まらず、2 段目の操作が隠れるため */}
          <div
            class="-ml-2 flex flex-wrap gap-1 max-md:flex-nowrap max-md:overflow-x-auto max-md:*:min-h-10"
            role="toolbar"
            aria-label="選んだ項目の操作"
          >
            {/* 項目でキーにしないのは、極性を変えるたびに一覧が作り直され、押したボタンからフォーカスが外れるため */}
            <For each={actions()} keyed={false}>
              {(action) => (
                <button
                  type="button"
                  class={["button ghost small", { "danger-text": action().danger }]}
                  disabled={action().disabled}
                  onClick={() => action().run()}
                >
                  {action().label}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

type BrowserTab = "loops" | "variables";

function Browser() {
  const editor = useContext(EditorContext);
  const [tab, setTab] = createSignal<BrowserTab>("loops");
  const tabs: { value: BrowserTab; label: string; count: () => number }[] = [
    { value: "loops", label: "ループ", count: () => editor.loopEntries().length },
    { value: "variables", label: "変数", count: () => editor.diagram().variables.length },
  ];
  // Tab キーでタブを巡らせないのは、WAI-ARIA のタブの作法に従うため（Tab は一覧へ進む）
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab() === "loops" ? "variables" : "loops";
    setTab(next);
    document.getElementById(`browser-tab-${next}`)?.focus();
  };
  return (
    <section class="browser flex min-h-0 flex-col max-md:order-1">
      {/* 他と同じ 20px にしないのは、タブ自体の内側の余白があり、文字が下の一覧より右にずれるため */}
      <div
        class="browser-tabs flex gap-1 px-2 pt-3 pb-2 max-md:pt-0"
        role="tablist"
        aria-label="一覧"
        onKeyDown={onKeyDown}
      >
        <For each={tabs}>
          {(item) => (
            <button
              type="button"
              role="tab"
              id={`browser-tab-${item.value}`}
              aria-controls={`browser-panel-${item.value}`}
              aria-selected={tab() === item.value ? "true" : "false"}
              tabindex={tab() === item.value ? 0 : -1}
              class={[
                "inline-flex h-7.5 items-center gap-1.5 rounded-sm border-0 px-3 py-0 text-base font-medium transition-[background-color,color] max-md:min-h-10",
                tab() === item.value
                  ? "bg-surface-2 text-ink"
                  : "bg-transparent text-muted hover:text-ink",
              ]}
              onClick={() => setTab(item.value)}
            >
              {item.label}
              <span class="font-mono text-[11.5px] text-muted">
                {item.count()}
                <span class="sr-only">件</span>
              </span>
            </button>
          )}
        </For>
      </div>
      {/* Show で切り替えないのは、絞り込みやスクロール位置が消えるため */}
      <LoopList hidden={tab() !== "loops"} />
      <VariableList hidden={tab() !== "variables"} />
    </section>
  );
}

function VariableList(props: { hidden: boolean }) {
  const editor = useContext(EditorContext);
  const [query, setQuery] = createSignal("");
  const degrees = createMemo(() => {
    // 隠れている間も数えると、ドラッグの途中経過のたびに数え直してしまう
    if (props.hidden) return new Map<VariableId, { causes: number; effects: number }>();
    const counts = new Map<VariableId, { causes: number; effects: number }>();
    const of = (id: VariableId) => {
      let count = counts.get(id);
      if (!count) counts.set(id, (count = { causes: 0, effects: 0 }));
      return count;
    };
    for (const link of editor.diagram().links) {
      of(link.from).effects++;
      of(link.to).causes++;
    }
    return counts;
  });
  const visible = createMemo(() => {
    if (props.hidden) return [];
    const words = query().trim().toLowerCase();
    return editor
      .diagram()
      .variables.filter((variable) =>
        (variable.label || "名称未設定").toLowerCase().includes(words),
      );
  });
  const selectedId = () => {
    const selection = editor.selection();
    return selection?.kind === "variable" ? selection.id : undefined;
  };
  const choose = (id: VariableId) => {
    editor.select({ kind: "variable", id });
    const variable = editor.variableById().get(id);
    if (variable) editor.centerOn(variable.position);
    // 常にスクロールしないのは、広い画面では一覧とキャンバスが並んでいて要らないため。
    // 完全に隠れたときだけにしないのは、少し見えていても中央が外れると変化が見えないため
    const canvas = canvasElement();
    const rect = canvas?.getBoundingClientRect();
    const middle = rect && rect.top + rect.height / 2;
    if (canvas && middle !== undefined && (middle < 0 || middle > window.innerHeight)) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      canvas.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
  };
  return (
    <div
      class="flex min-h-0 flex-col"
      role="tabpanel"
      hidden={props.hidden}
      id="browser-panel-variables"
      aria-labelledby="browser-tab-variables"
    >
      <Show when={editor.diagram().variables.length > 0}>
        <label class="block px-5 pb-2.5">
          <span class="sr-only">変数を名前で絞り込む</span>
          <input
            class="h-8 w-full rounded-sm border border-line bg-surface px-2.5 py-0 text-base text-ink max-md:min-h-10"
            type="search"
            name="variable-search"
            placeholder="名前で絞り込む"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </Show>
      <Show
        when={visible().length > 0}
        fallback={
          <p class={emptyClass}>
            {editor.diagram().variables.length === 0
              ? "変数を追加すると、ここに並びます"
              : "名前が一致する変数はありません"}
          </p>
        }
      >
        <ul class={itemsClass}>
          <For each={visible()} keyed={(variable) => variable.id}>
            {(variable, index) => (
              <li
                class={[
                  "variable-item",
                  itemClass,
                  { [`active ${activeItemClass}`]: selectedId() === variable().id },
                ]}
                style={{ "--index": String(Math.min(index(), 12)) }}
              >
                <button
                  type="button"
                  class={[itemMainClass, "grid-cols-[minmax(0,1fr)]"]}
                  aria-current={selectedId() === variable().id ? "true" : undefined}
                  onClick={() => choose(variable().id)}
                >
                  <span class="grid min-w-0">
                    <span class={itemTitleClass}>{variable().label || "名称未設定"}</span>
                    <span class={itemRouteClass}>
                      原因 {degrees().get(variable().id)?.causes ?? 0} ・ 結果{" "}
                      {degrees().get(variable().id)?.effects ?? 0}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

// 見つからない ID で落とさず空で描くのは、削除と同じ更新の中で子の計算が先に走ることがあるため
function Inspector() {
  const editor = useContext(EditorContext);
  // selection() を 1 つの Match で使わないのは、種類ごとに型を絞り込めないため
  const selectedVariable = () => {
    const selection = editor.selection();
    return selection?.kind === "variable" ? selection.id : undefined;
  };
  const selectedLink = () => {
    const selection = editor.selection();
    return selection?.kind === "link" ? selection.id : undefined;
  };
  const selectedLoop = () => {
    const selection = editor.selection();
    return selection?.kind === "loop" ? selection.id : undefined;
  };
  return (
    // 選んでいないときに狭い画面で図の概要を先に出さないのは、一覧の方がよく使い、概要は広げたときに読めれば足りるため
    <section
      class={[
        "inspector min-h-0 flex-1 overflow-y-auto outline-none max-md:overflow-visible max-md:border-line",
        editor.selection() === null
          ? "max-md:order-2 max-md:border-t"
          : "max-md:order-0 max-md:border-b",
      ]}
      aria-label="選択中の項目"
      tabindex="-1"
    >
      <Switch fallback={<DiagramInspector />}>
        <Match when={selectedVariable()} keyed>
          {(id) => <VariableInspector id={id} />}
        </Match>
        <Match when={selectedLink()} keyed>
          {(id) => <LinkInspector id={id} />}
        </Match>
        <Match when={selectedLoop()} keyed>
          {(id) => <LoopInspector id={id} />}
        </Match>
      </Switch>
    </section>
  );
}

function SectionHeading(props: { kicker: string; title: string }) {
  return (
    <header class="grid gap-0.5">
      <p class="eyebrow">{props.kicker}</p>
      <h2 class="text-xl font-semibold tracking-[-0.015em]">{props.title}</h2>
    </header>
  );
}

function Field(props: {
  name: string;
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
  onInput: (value: string) => void;
}) {
  const editor = useContext(EditorContext);
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      <Show
        when={props.multiline}
        fallback={
          <input
            name={props.name}
            value={props.value}
            placeholder={props.placeholder}
            readonly={!editor.editable()}
            onInput={(event) => {
              if (!event.isComposing) props.onInput(event.currentTarget.value);
            }}
            onCompositionEnd={(event) => props.onInput(event.currentTarget.value)}
          />
        }
      >
        <textarea
          name={props.name}
          value={props.value}
          placeholder={props.placeholder}
          readonly={!editor.editable()}
          rows="3"
          onInput={(event) => {
            if (!event.isComposing) props.onInput(event.currentTarget.value);
          }}
          onCompositionEnd={(event) => props.onInput(event.currentTarget.value)}
        />
      </Show>
      <Show when={props.hint}>
        <span class="field-hint">{props.hint}</span>
      </Show>
    </label>
  );
}

function DiagramInspector() {
  const editor = useContext(EditorContext);
  const autosave = useContext(AutosaveContext);
  return (
    <div class={inspectorBodyClass}>
      <SectionHeading kicker="Diagram" title="図の概要" />
      <Field
        name="diagram-description"
        label="この図で伝えたいこと"
        value={editor.diagram().description ?? ""}
        placeholder="例: 人を増やすほど成長するが、育成の負担が成長を押し戻す"
        multiline
        hint={
          editor.editable()
            ? "変数・矢印・ループを選ぶと、ここで編集できます"
            : "変数・矢印・ループを選ぶと、ここで詳しく見られます"
        }
        onInput={(value) =>
          editor.commit(edit.setDescription(editor.current(), value), "diagram-description")
        }
      />
      <Show when={autosave.store.kind === "browser"}>
        <BackupList />
      </Show>
    </div>
  );
}

function BackupList() {
  const editor = useContext(EditorContext);
  const [backups, setBackups] = createSignal(listBackups());
  // 押してすぐ消さないのは、唯一の写しで元に戻せないため
  const [confirming, setConfirming] = createSignal<string | null>(null);
  const download = (key: string, savedAt: Date) => {
    const text = readBackup(key);
    if (text === undefined) {
      setBackups(listBackups());
      editor.notify({
        tone: "error",
        title: "退避したデータが見つかりません",
        details: ["別のタブで削除された可能性があります"],
      });
      return;
    }
    downloadText(text, `system-diagram-backup-${savedAt.getTime()}.json`);
  };
  const isConfirming = (key: string) => confirming() === key;
  let list: HTMLDivElement | undefined;
  const remove = (key: string) => {
    removeBackup(key);
    setConfirming(null);
    setBackups(listBackups());
    // 移さないと、押したボタンが行ごと消えてフォーカスが失われる
    refocusWhenLost(() => list?.querySelector("button"), inspectorElement);
  };
  return (
    <Show when={backups().length > 0}>
      <div class="grid gap-1.5 border-t border-line pt-3.5" ref={(element) => (list = element)}>
        <p class="field-label">退避したデータ</p>
        <p class="sr-only" aria-live="polite">
          {confirming() ? "削除すると元に戻せません。「削除する」か「やめる」を選んでください" : ""}
        </p>
        <p class="field-hint">開けなかった前回の図です。書き出して内容を確かめられます</p>
        <ul>
          <For each={backups()} keyed={(backup) => backup.key}>
            {(backup) => (
              <li class="flex items-center gap-1">
                <span class="flex-1 font-mono text-sm text-ink-2">
                  {backup().savedAt.toLocaleString("ja-JP")}
                </span>
                {/*
                  確認用のボタンに差し替えないのは、押したボタンのフォーカスが失われるため。
                  差し替えなければ、「削除」を押すと同じ位置の「やめる」にフォーカスが乗る
                */}
                <button
                  type="button"
                  class={[
                    "button",
                    "ghost",
                    "small",
                    { "danger-text": isConfirming(backup().key) },
                  ]}
                  onClick={() =>
                    isConfirming(backup().key)
                      ? remove(backup().key)
                      : download(backup().key, backup().savedAt)
                  }
                >
                  {isConfirming(backup().key) ? "削除する" : "書き出す"}
                </button>
                <button
                  type="button"
                  class="button ghost small"
                  onClick={() => setConfirming(isConfirming(backup().key) ? null : backup().key)}
                >
                  {isConfirming(backup().key) ? "やめる" : "削除"}
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  );
}

function VariableInspector(props: { id: VariableId }) {
  const editor = useContext(EditorContext);
  const variable = () => editor.variableById().get(props.id);
  const related = createMemo(() => {
    const links = editor.diagram().links;
    return {
      causes: links.filter((link) => link.to === props.id),
      effects: links.filter((link) => link.from === props.id),
    };
  });
  const candidates = (linked: VariableId[]) => {
    const excluded = new Set<VariableId>([props.id, ...linked]);
    return editor
      .diagram()
      .variables.filter((variable) => !excluded.has(variable.id))
      .map((variable) => ({ id: variable.id, label: variable.label || "名称未設定" }));
  };
  const update = (patch: Parameters<typeof edit.updateVariable>[2], key: string) =>
    editor.commit(edit.updateVariable(editor.current(), props.id, patch), `${key}:${props.id}`);
  return (
    <div class={inspectorBodyClass}>
      <SectionHeading kicker="Variable" title="変数" />
      <Field
        name="variable-label"
        label="名前"
        value={variable()?.label ?? ""}
        placeholder="例: 売上"
        onInput={(label) => update({ label }, "label")}
      />
      <Field
        name="variable-description"
        label="説明"
        value={variable()?.description ?? ""}
        placeholder="何を数えるか、どう測るか"
        multiline
        onInput={(description) => update({ description: description || undefined }, "description")}
      />
      <div class="grid grid-cols-2 gap-4">
        <RelationList
          title="原因"
          empty="この変数に影響する矢印はありません"
          links={related().causes}
          labelOf={(link) => labelOf(editor, link.from)}
          addLabel="原因を追加"
          candidates={candidates(related().causes.map((link) => link.from))}
          onAdd={(other) => editor.connect(other, props.id)}
        />
        <RelationList
          title="結果"
          empty="この変数から出る矢印はありません"
          links={related().effects}
          labelOf={(link) => labelOf(editor, link.to)}
          addLabel="結果を追加"
          candidates={candidates(related().effects.map((link) => link.to))}
          onAdd={(other) => editor.connect(props.id, other)}
        />
      </div>
    </div>
  );
}

function labelOf(editor: Editor, id: VariableId | undefined) {
  return (id && editor.variableById().get(id)?.label) || "名称未設定";
}

function RelationList(props: {
  title: string;
  empty: string;
  links: Link[];
  labelOf: (link: Link) => string;
  addLabel: string;
  candidates: { id: VariableId; label: string }[];
  onAdd: (id: VariableId) => void;
}) {
  const editor = useContext(EditorContext);
  return (
    <div class="grid content-start gap-1.5">
      <p class="field-label">{props.title}</p>
      <Show
        when={props.links.length > 0}
        fallback={<p class="text-[12.5px] text-muted">{props.empty}</p>}
      >
        <ul class="grid gap-0.5">
          <For each={props.links}>
            {(link) => (
              <li>
                <button
                  type="button"
                  class="-ml-1.5 flex w-full items-center gap-2 rounded-xs border-0 bg-transparent px-1.5 py-1.25 text-left text-base hover:bg-surface-2"
                  onClick={() => editor.select({ kind: "link", id: link.id })}
                >
                  <PolarityGlyph polarity={link.polarity} />
                  <span class="truncate">{props.labelOf(link)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={editor.editable() && props.candidates.length > 0}>
        <RelationPicker label={props.addLabel} candidates={props.candidates} onAdd={props.onAdd} />
      </Show>
    </div>
  );
}

/**
 * 選んだ時点で関連を作らないのは、閉じた select が矢印キーだけで値を変えるブラウザがあるため
 */
function RelationPicker(props: {
  label: string;
  candidates: { id: VariableId; label: string }[];
  onAdd: (id: VariableId) => void;
}) {
  const [chosen, setChosen] = createSignal<VariableId | "">("");
  const valid = () => props.candidates.some((candidate) => candidate.id === chosen());
  return (
    <div class="relation-picker mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] gap-1">
      <select
        class="h-7 w-full min-w-0 cursor-pointer rounded-[7px] border border-dashed border-line-strong bg-transparent px-1.5 py-0 text-[12.5px] text-muted transition-[border-color] hover:border-accent hover:text-ink focus-visible:border-accent focus-visible:text-ink"
        name={props.label}
        aria-label={props.label}
        onChange={(event) => setChosen(event.currentTarget.value as VariableId | "")}
      >
        <option value="" selected={!valid()}>
          {props.label}…
        </option>
        <For each={props.candidates} keyed={(candidate) => candidate.id}>
          {(candidate) => (
            <option value={candidate().id} selected={chosen() === candidate().id}>
              {candidate().label}
            </option>
          )}
        </For>
      </select>
      <button
        type="button"
        class="button small"
        disabled={!valid()}
        onClick={() => {
          const id = chosen();
          if (!id) return;
          setChosen("");
          props.onAdd(id);
        }}
      >
        追加
      </button>
    </div>
  );
}

function PolarityGlyph(props: { polarity: "+" | "-" }) {
  return (
    <span
      class={[
        "inline-grid size-4.5 flex-none place-items-center rounded-[5px] font-mono text-sm font-semibold",
        props.polarity === "+" ? "bg-surface-2 text-ink" : "bg-negative-soft text-negative",
      ]}
    >
      {props.polarity === "+" ? "+" : "−"}
    </span>
  );
}

function LinkInspector(props: { id: LinkId }) {
  const editor = useContext(EditorContext);
  const link = () => editor.linkById().get(props.id);
  const from = () => labelOf(editor, link()?.from);
  const to = () => labelOf(editor, link()?.to);
  const reversed = () => {
    const current = link();
    return current !== undefined && editor.hasReverse(current);
  };
  // undefined かどうかだけで見ないのは、既定と同じ値が明示されていることがあるため
  const customCurvature = () => {
    const curvature = link()?.curvature;
    return curvature !== undefined && curvature !== defaultCurvature(reversed());
  };
  const update = (patch: Parameters<typeof edit.updateLink>[2], key?: string) =>
    editor.commit(edit.updateLink(editor.current(), props.id, patch), key);
  const selectEnd = (end: "from" | "to") => {
    const id = link()?.[end];
    if (id) editor.select({ kind: "variable", id });
  };
  return (
    <div class={inspectorBodyClass}>
      <SectionHeading kicker="Link" title="関連" />
      <p class="flex flex-wrap items-center gap-2 text-faint">
        <button
          type="button"
          class="rounded-pill border border-line bg-surface px-2.5 py-1 text-base font-medium text-ink transition-[border-color] hover:border-accent"
          onClick={() => selectEnd("from")}
        >
          {from()}
        </button>
        <ArrowRightIcon />
        <button
          type="button"
          class="rounded-pill border border-line bg-surface px-2.5 py-1 text-base font-medium text-ink transition-[border-color] hover:border-accent"
          onClick={() => selectEnd("to")}
        >
          {to()}
        </button>
      </p>
      <fieldset class="field">
        <legend class="field-label">極性</legend>
        <div class="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1">
          <button
            type="button"
            class={segmentClass(link()?.polarity === "+")}
            aria-pressed={pressedState(link()?.polarity === "+")}
            disabled={!editor.editable()}
            onClick={() => update({ polarity: "+" })}
          >
            <PolarityGlyph polarity="+" />
            同じ向きに動く
          </button>
          <button
            type="button"
            class={segmentClass(link()?.polarity === "-")}
            aria-pressed={pressedState(link()?.polarity === "-")}
            disabled={!editor.editable()}
            onClick={() => update({ polarity: "-" })}
          >
            <PolarityGlyph polarity="-" />
            逆向きに動く
          </button>
        </div>
        <span class="field-hint">
          {link()?.polarity === "-"
            ? `${from()}が増えると${to()}は減る`
            : `${from()}が増えると${to()}も増える`}
        </span>
      </fieldset>
      <label class="relative grid cursor-pointer grid-cols-[auto_1fr] items-start gap-3">
        <input
          class="peer pointer-events-none absolute opacity-0"
          name="delay"
          type="checkbox"
          checked={link()?.delay ?? false}
          disabled={!editor.editable()}
          onChange={(event) => update({ delay: event.currentTarget.checked || undefined })}
        />
        <span
          class="relative mt-px h-4.5 w-8 rounded-[9px] bg-line-strong transition-[background-color] duration-250 peer-checked:bg-accent peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-[50%] after:bg-surface after:shadow-[0_1px_2px_rgb(24_24_27/0.2)] after:transition-[transform] after:duration-250 after:content-[''] peer-checked:after:transform-[translateX(14px)]"
          aria-hidden="true"
        />
        <span>
          <span class="block text-base font-medium">遅れがある</span>
          <span class="field-hint">影響が現れるまで時間がかかる関連に二重線を付けます</span>
        </span>
      </label>
      <Field
        name="link-description"
        label="説明"
        value={link()?.description ?? ""}
        placeholder="なぜこの因果があると言えるか"
        multiline
        onInput={(description) =>
          update({ description: description || undefined }, `description:${props.id}`)
        }
      />
      <Show when={editor.editable()}>
        {/* 曲がり具合を付ける操作が無いのに戻す操作を置くのは、以前の版や JSON で付いたものを戻す手段がここしか無いため */}
        <Show when={customCurvature()}>
          <div class="inline-actions -mt-1.5 flex gap-2">
            <button
              type="button"
              class="button ghost small"
              onClick={() => {
                update({ curvature: undefined });
                // 戻さないと、押したボタンが消えてフォーカスが失われる
                refocusWhenLost(inspectorElement);
              }}
            >
              {reversed() ? "既定の曲がりに戻す" : "直線に戻す"}
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function LoopInspector(props: { id: LoopId }) {
  const editor = useContext(EditorContext);
  const entry = () => editor.loopEntryByLoopId().get(props.id);
  const loop = () => entry()?.featured?.loop;
  const negatives = () =>
    (entry()?.links ?? []).filter((id) => editor.linkById().get(id)?.polarity === "-").length;
  const update = (patch: Parameters<typeof edit.updateLoop>[2], key?: string) =>
    editor.commit(edit.updateLoop(editor.current(), props.id, patch), key);
  return (
    <div class={inspectorBodyClass}>
      <SectionHeading
        kicker={entry()?.featured?.badge ?? "Loop"}
        title={kindLabel(entry()?.kind ?? "reinforcing")}
      />
      <Field
        name="loop-name"
        label="名前"
        value={loop()?.name ?? ""}
        placeholder="例: 成長エンジン"
        onInput={(name) => update({ name }, `name:${props.id}`)}
      />
      <Field
        name="loop-description"
        label="説明"
        value={loop()?.description ?? ""}
        placeholder="このループが何を引き起こすか"
        multiline
        onInput={(description) =>
          update({ description: description || undefined }, `description:${props.id}`)
        }
      />
      <div class="field">
        <span class="field-label">経路</span>
        <LoopPath links={entry()?.links ?? []} variables={entry()?.variables ?? []} />
        <span class="field-hint">{kindExplanation(negatives())}</span>
      </div>
    </div>
  );
}

const inspectorElement = () => document.querySelector<HTMLElement>(".inspector");

const inspectorBodyClass =
  "grid animate-[rise_0.35s_var(--ease-out)_both] gap-4.5 px-5 pt-5 pb-4.5";
const emptyClass =
  "grid content-start justify-items-start gap-2.5 px-5 py-2 text-[12.5px] text-muted";
const itemsClass =
  "grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto px-2.5 pb-5 max-md:flex-none max-md:overflow-visible";
const itemClass =
  "relative grid animate-[rise_0.4s_var(--ease-out)_calc(var(--index)*35ms)_both] grid-cols-[minmax(0,1fr)_auto] items-center rounded-md transition-[background-color] hover:bg-surface-2";
/** before: を常に付けないのは、Tailwind が before: の付いた要素すべてに content を足し、選んでいない行にも印が出るため */
const activeItemClass =
  "bg-surface-2 before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-0.5 before:rounded-[1px] before:bg-accent";
const itemMainClass =
  "loop-item-main grid min-w-0 items-center gap-3 border-0 bg-transparent py-2.25 pr-1 pl-2.5 text-left";
const itemTitleClass = "truncate text-[13.5px] font-medium";
const itemRouteClass = "truncate text-sm text-muted";

function segmentClass(active: boolean) {
  return [
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border text-[12.5px] font-medium transition-[background-color,color]",
    active
      ? "border-line bg-surface text-ink shadow-[0_1px_2px_rgb(24_24_27/0.06)]"
      : "border-transparent bg-transparent text-muted",
  ];
}

function badgeColor(kind: LoopKind, featured: boolean) {
  if (featured)
    return kind === "reinforcing" ? "bg-accent text-on-strong" : "bg-ink-2 text-on-strong";
  return kind === "reinforcing" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2";
}

function pressedState(value: boolean) {
  return value ? "true" : "false";
}

function kindLabel(kind: LoopKind) {
  return kind === "reinforcing" ? "自己強化ループ" : "バランスループ";
}

function kindExplanation(negatives: number) {
  return negatives === 0
    ? "逆向きの関連が無いので、変化が増幅し続けます"
    : `逆向きの関連が ${negatives} 本（${negatives % 2 === 0 ? "偶数なので変化が増幅" : "奇数なので変化を打ち消す"}）`;
}

function LoopPath(props: { links: LinkId[]; variables: VariableId[] }) {
  const editor = useContext(EditorContext);
  const steps = createMemo(() =>
    props.links.map((id, index) => ({
      label: labelOf(editor, props.variables[index]),
      polarity: editor.linkById().get(id)?.polarity ?? "+",
    })),
  );
  return (
    <ol class="relative grid gap-0.5 pl-3.5 before:absolute before:top-2.5 before:bottom-2.5 before:left-0.75 before:border-l before:border-dashed before:border-line-strong before:content-[''] after:pt-0.5 after:text-[11.5px] after:text-faint after:content-['先頭に戻る']">
      <For each={steps()} keyed={false}>
        {(step) => (
          <li class="relative flex items-center justify-between gap-2 py-1 text-base before:absolute before:-left-3.5 before:size-1.75 before:rounded-[50%] before:border-[1.5px] before:border-accent before:bg-surface before:content-['']">
            <span>{step().label}</span>
            <PolarityGlyph polarity={step().polarity} />
          </li>
        )}
      </For>
    </ol>
  );
}

function LoopList(props: { hidden: boolean }) {
  const editor = useContext(EditorContext);
  return (
    <div
      class="flex min-h-0 flex-col"
      role="tabpanel"
      hidden={props.hidden}
      id="browser-panel-loops"
      aria-labelledby="browser-tab-loops"
    >
      <Show when={editor.detection().truncated}>
        <p class="mx-5 mb-2.5 rounded-sm bg-warning-soft px-2.5 py-2 text-sm text-warning">
          ループが多すぎるため、先頭の {editor.detection().loops.length} 件だけを表示しています
        </p>
      </Show>
      <Show
        when={editor.loopEntries().length > 0}
        fallback={
          <div class={emptyClass}>
            <svg viewBox="0 0 64 40" aria-hidden="true" class="loop-empty-art">
              <path d="M14 20a10 10 0 1 1 10 10h-6" />
              <path d="M50 20a10 10 0 1 1-10-10h6" />
              <path d="m20 26-3 4 4 3" />
              <path d="m44 14 3-4-4-3" />
            </svg>
            <p>矢印をつないで輪を作ると、ここにループが自動で現れます</p>
          </div>
        }
      >
        <ul class={itemsClass}>
          <For each={editor.loopEntries()} keyed={(entry) => entry.key}>
            {(entry, index) => <LoopItem entry={entry()} index={index()} />}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function LoopItem(props: { entry: LoopEntry; index: number }) {
  const editor = useContext(EditorContext);
  const labels = createMemo(() =>
    props.entry.variables.map((id) => editor.variableById().get(id)?.label || "名称未設定"),
  );
  const active = () => {
    const highlighted = editor.highlightedLoop();
    return highlighted?.key === props.entry.key;
  };
  const choose = () => {
    const featured = props.entry.featured;
    if (featured) {
      editor.select({ kind: "loop", id: featured.loop.id });
    } else {
      editor.select(null);
      editor.setFocusedLoop(editor.focusedLoop() === props.entry.key ? null : props.entry.key);
    }
  };
  return (
    <li
      class={[
        "loop-item group/item",
        itemClass,
        props.entry.kind,
        { featured: !!props.entry.featured, [`active ${activeItemClass}`]: active() },
      ]}
      style={{ "--index": String(Math.min(props.index, 12)) }}
      onPointerEnter={() => editor.setHoveredLoop(props.entry.key)}
      onPointerLeave={() => editor.setHoveredLoop(null)}
    >
      <button
        type="button"
        class={[itemMainClass, "grid-cols-[30px_minmax(0,1fr)_auto]"]}
        onClick={choose}
      >
        <span
          class={[
            "grid size-7.5 place-items-center rounded-sm font-mono text-sm font-semibold group-hover/item:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.4)]",
            badgeColor(props.entry.kind, !!props.entry.featured),
            { "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.4)]": active() },
          ]}
        >
          {props.entry.featured?.badge ?? (props.entry.kind === "reinforcing" ? "R" : "B")}
        </span>
        <span class="grid min-w-0">
          <span class={[itemTitleClass, { "text-ink-2": !props.entry.featured }]}>
            {props.entry.featured?.loop.name || kindLabel(props.entry.kind)}
          </span>
          <span class={itemRouteClass}>{labels().join(" → ")}</span>
        </span>
        <span class="font-mono text-xs text-faint" title="ループを構成する関連の数">
          {props.entry.links.length}
        </span>
      </button>
      <button
        type="button"
        class={[
          "icon-button pin mr-1.5 enabled:hover:text-ink",
          props.entry.featured ? "text-accent" : "text-faint",
        ]}
        aria-pressed={pressedState(!!props.entry.featured)}
        title={props.entry.featured ? "見出しを外す" : "このループを見出す"}
        aria-label={props.entry.featured ? "見出しを外す" : "このループを見出す"}
        disabled={!editor.editable()}
        onClick={() => {
          const featured = props.entry.featured;
          if (featured) editor.unfeatureLoop(featured.loop.id);
          else editor.featureLoop(props.entry.links);
        }}
      >
        <PinIcon filled={!!props.entry.featured} />
      </button>
    </li>
  );
}
