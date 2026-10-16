import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  untrack,
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
import { ArrowRightIcon, PinIcon, TrashIcon } from "./icons.tsx";

type SheetSize = "peek" | "half" | "full";

const SHEET_SIZES: SheetSize[] = ["peek", "half", "full"];
const SHEET_TAP_SLOP = 6;
const SHEET_SNAP_DISTANCE = 40;

/** 狭い画面用に別の部品を作らないのは、中身も状態も同じで、並べ方だけが違うため */
export function Sidebar() {
  const editor = useContext(EditorContext);
  const [size, setSize] = createSignal<SheetSize>("peek");
  const [dragHeight, setDragHeight] = createSignal<number | null>(null);
  let sheet: HTMLElement | undefined;
  let drag: { pointerId: number; startY: number; startHeight: number } | undefined;
  // click だけで切り替えないのは、ドラッグの後にも click が届き、決めた高さをさらに一段送るため
  let suppressClick = false;

  const step = (delta: number) => {
    const index = SHEET_SIZES.indexOf(size()) + delta;
    setSize(SHEET_SIZES[Math.max(0, Math.min(SHEET_SIZES.length - 1, index))]!);
  };

  createEffect(
    () => editor.selection(),
    (selection) => {
      // 畳んだままにしないのは、選んだ項目の編集欄がシートの外に隠れるため
      if (selection && untrack(size) === "peek") setSize("half");
    },
    { defer: true },
  );

  createEffect(
    () => editor.connectingFrom(),
    (from) => {
      // 開いたままにしないのは、つなぐ先の変数がシートの下に隠れるため
      if (from !== null) setSize("peek");
    },
    { defer: true },
  );

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !sheet) return;
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // 既に離されたポインタはキャプチャできないが、取っ手の上で動かす分には追える
    }
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheet.getBoundingClientRect().height,
    };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const height = drag.startHeight + drag.startY - event.clientY;
    setDragHeight(Math.max(64, Math.min(window.innerHeight - 64, height)));
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.startY - event.clientY;
    drag = undefined;
    setDragHeight(null);
    // 取り消しで click を捨てる印を立てないのは、click が届かず、次のタップを握りつぶすため
    if (event.type !== "pointerup" || Math.abs(moved) < SHEET_TAP_SLOP) return;
    suppressClick = true;
    if (Math.abs(moved) >= SHEET_SNAP_DISTANCE) step(moved > 0 ? 1 : -1);
  };

  return (
    <aside
      ref={(element) => (sheet = element)}
      class={["sidebar", `sheet-${size()}`, { "has-selection": editor.selection() !== null }]}
      style={dragHeight() === null ? undefined : { height: `${dragHeight()}px` }}
    >
      <button
        type="button"
        class="sheet-handle"
        aria-label={size() === "full" ? "パネルを畳む" : "パネルを広げる"}
        onClick={() => {
          if (suppressClick) {
            suppressClick = false;
            return;
          }
          if (size() === "full") setSize("peek");
          else step(1);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span class="sheet-grip" aria-hidden="true" />
      </button>
      <Inspector />
      <Browser />
    </aside>
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
    <section class="browser">
      <div class="browser-tabs" role="tablist" aria-label="一覧" onKeyDown={onKeyDown}>
        <For each={tabs}>
          {(item) => (
            <button
              type="button"
              role="tab"
              id={`browser-tab-${item.value}`}
              aria-controls={`browser-panel-${item.value}`}
              aria-selected={tab() === item.value ? "true" : "false"}
              tabindex={tab() === item.value ? 0 : -1}
              class={["browser-tab", { active: tab() === item.value }]}
              onClick={() => setTab(item.value)}
            >
              {item.label}
              <span class="browser-tab-count">
                {item.count()}
                <span class="visually-hidden">件</span>
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
      class="loop-list"
      role="tabpanel"
      hidden={props.hidden}
      id="browser-panel-variables"
      aria-labelledby="browser-tab-variables"
    >
      <Show when={editor.diagram().variables.length > 0}>
        <label class="browser-search">
          <span class="visually-hidden">変数を名前で絞り込む</span>
          <input
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
          <p class="loop-empty">
            {editor.diagram().variables.length === 0
              ? "キャンバスをダブルクリックすると、ここに変数が並びます"
              : "名前が一致する変数はありません"}
          </p>
        }
      >
        <ul class="loop-items">
          <For each={visible()} keyed={(variable) => variable.id}>
            {(variable, index) => (
              <li
                class={["variable-item", { active: selectedId() === variable().id }]}
                style={{ "--index": String(Math.min(index(), 12)) }}
              >
                <button
                  type="button"
                  class="loop-item-main"
                  aria-current={selectedId() === variable().id ? "true" : undefined}
                  onClick={() => choose(variable().id)}
                >
                  <span class="loop-item-text">
                    <span class="loop-item-title">{variable().label || "名称未設定"}</span>
                    <span class="loop-item-route">
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
    <section class="inspector" aria-label="選択中の項目" tabindex="-1">
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
    <header class="section-heading">
      <p class="eyebrow">{props.kicker}</p>
      <h2>{props.title}</h2>
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
    <div class="inspector-body">
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
      <div class="backup-list" ref={(element) => (list = element)}>
        <p class="field-label">退避したデータ</p>
        <p class="visually-hidden" aria-live="polite">
          {confirming() ? "削除すると元に戻せません。「削除する」か「やめる」を選んでください" : ""}
        </p>
        <p class="field-hint">開けなかった前回の図です。書き出して内容を確かめられます</p>
        <ul>
          <For each={backups()} keyed={(backup) => backup.key}>
            {(backup) => (
              <li>
                <span class="backup-date">{backup().savedAt.toLocaleString("ja-JP")}</span>
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
    <div class="inspector-body">
      <SectionHeading kicker="Variable" title="変数" />
      <Field
        name="variable-label"
        label="名前"
        value={variable()?.label ?? ""}
        placeholder="例: 売上"
        onInput={(label) => update({ label }, "label")}
      />
      <Show when={editor.editable()}>
        <button
          type="button"
          class="button connect-start"
          onClick={() => editor.startConnecting(props.id)}
        >
          <ArrowRightIcon />
          キャンバスで矢印を引く
        </button>
      </Show>
      <Field
        name="variable-description"
        label="説明"
        value={variable()?.description ?? ""}
        placeholder="何を数えるか、どう測るか"
        multiline
        onInput={(description) => update({ description: description || undefined }, "description")}
      />
      <div class="relations">
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
      <Show when={editor.editable()}>
        <DeleteButton label="変数を削除" />
      </Show>
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
    <div class="relation-list">
      <p class="field-label">{props.title}</p>
      <Show when={props.links.length > 0} fallback={<p class="muted">{props.empty}</p>}>
        <ul>
          <For each={props.links}>
            {(link) => (
              <li>
                <button
                  type="button"
                  class="relation"
                  onClick={() => editor.select({ kind: "link", id: link.id })}
                >
                  <PolarityGlyph polarity={link.polarity} />
                  <span>{props.labelOf(link)}</span>
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
    <div class="relation-picker">
      <select
        class="relation-add"
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
    <span class={["polarity-glyph", props.polarity === "+" ? "positive" : "negative"]}>
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
    <div class="inspector-body">
      <SectionHeading kicker="Link" title="関連" />
      <p class="link-route">
        <button type="button" class="route-end" onClick={() => selectEnd("from")}>
          {from()}
        </button>
        <ArrowRightIcon />
        <button type="button" class="route-end" onClick={() => selectEnd("to")}>
          {to()}
        </button>
      </p>
      <fieldset class="field">
        <legend class="field-label">極性</legend>
        <div class="segmented">
          <button
            type="button"
            class={{ active: link()?.polarity === "+" }}
            aria-pressed={pressedState(link()?.polarity === "+")}
            disabled={!editor.editable()}
            onClick={() => update({ polarity: "+" })}
          >
            <PolarityGlyph polarity="+" />
            同じ向きに動く
          </button>
          <button
            type="button"
            class={{ active: link()?.polarity === "-" }}
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
      <label class="toggle">
        <input
          name="delay"
          type="checkbox"
          checked={link()?.delay ?? false}
          disabled={!editor.editable()}
          onChange={(event) => update({ delay: event.currentTarget.checked || undefined })}
        />
        <span class="toggle-track" aria-hidden="true" />
        <span>
          <span class="toggle-label">遅れがある</span>
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
          <div class="inline-actions">
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
        <DeleteButton label="関連を削除" />
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
    <div class="inspector-body">
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
      <Show when={editor.editable()}>
        <div class="inline-actions">
          <button
            type="button"
            class="button ghost small"
            disabled={loop()?.marker === undefined}
            onClick={() => update({ marker: undefined })}
          >
            記号の位置を戻す
          </button>
        </div>
        <DeleteButton label="見出しを外す" />
      </Show>
    </div>
  );
}

const inspectorElement = () => document.querySelector<HTMLElement>(".inspector");

function DeleteButton(props: { label: string }) {
  const editor = useContext(EditorContext);
  return (
    <button type="button" class="button danger" onClick={() => editor.deleteSelection()}>
      <TrashIcon />
      {props.label}
      <kbd>Delete</kbd>
    </button>
  );
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
    <ol class="loop-path">
      <For each={steps()} keyed={false}>
        {(step) => (
          <li>
            <span class="loop-path-label">{step().label}</span>
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
      class="loop-list"
      role="tabpanel"
      hidden={props.hidden}
      id="browser-panel-loops"
      aria-labelledby="browser-tab-loops"
    >
      <Show when={editor.detection().truncated}>
        <p class="loop-warning">
          ループが多すぎるため、先頭の {editor.detection().loops.length} 件だけを表示しています
        </p>
      </Show>
      <Show
        when={editor.loopEntries().length > 0}
        fallback={
          <div class="loop-empty">
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
        <ul class="loop-items">
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
        "loop-item",
        props.entry.kind,
        { featured: !!props.entry.featured, active: active() },
      ]}
      style={{ "--index": String(Math.min(props.index, 12)) }}
      onPointerEnter={() => editor.setHoveredLoop(props.entry.key)}
      onPointerLeave={() => editor.setHoveredLoop(null)}
    >
      <button type="button" class="loop-item-main" onClick={choose}>
        <span class="loop-badge">
          {props.entry.featured?.badge ?? (props.entry.kind === "reinforcing" ? "R" : "B")}
        </span>
        <span class="loop-item-text">
          <span class="loop-item-title">
            {props.entry.featured?.loop.name || kindLabel(props.entry.kind)}
          </span>
          <span class="loop-item-route">{labels().join(" → ")}</span>
        </span>
        <span class="loop-length" title="ループを構成する関連の数">
          {props.entry.links.length}
        </span>
      </button>
      <button
        type="button"
        class={["icon-button", "pin", { pinned: !!props.entry.featured }]}
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
