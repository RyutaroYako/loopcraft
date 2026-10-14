import { For, Match, Show, Switch, createMemo, createSignal, useContext } from "solid-js";
import { AutosaveContext } from "../editor/autosave.ts";
import { EditorContext, type Editor } from "../editor/editor.ts";
import type { LoopEntry } from "@loopcraft/core/loops";
import { downloadText } from "../editor/file.ts";
import { refocusWhenLost } from "../editor/focus.ts";
import { listBackups, readBackup, removeBackup } from "../editor/storage.ts";
import * as edit from "@loopcraft/core/edit";
import { defaultCurvature } from "@loopcraft/core/geometry";
import type { LoopKind } from "@loopcraft/core/loop";
import type { Link, LinkId, LoopId, VariableId } from "@loopcraft/core/schema";
import { ArrowRightIcon, PinIcon, TrashIcon } from "./icons.tsx";

export function Sidebar() {
  return (
    <aside class="sidebar">
      <Inspector />
      <LoopList />
    </aside>
  );
}

/*
 * 検査パネルは選択中の ID ごとに作り直し、中身は ID から最新の図を引き直す。
 * 削除と同じ更新の中で子の計算が先に走っても落ちないよう、見つからないときは空で描く。
 */
function Inspector() {
  const editor = useContext(EditorContext);
  // 型を絞り込むため、種類ごとに選択中の ID を取り出す
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
            ? "出来事・矢印・ループを選ぶと、ここで編集できます"
            : "出来事・矢印・ループを選ぶと、ここで詳しく見られます"
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

/** 読み込めなかったときに退避したデータ。あるときだけ表示し、書き出しと削除ができる */
function BackupList() {
  const editor = useContext(EditorContext);
  const [backups, setBackups] = createSignal(listBackups());
  /** 削除の確認中の項目。唯一の写しを消すので、一度確かめてから消す */
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
    // 押したボタンは行ごと消えるので、残りの項目か検査パネルへフォーカスを移す
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
                  確認中もボタン自体は差し替えず、表示と働きだけを切り替える。
                  押したボタンにフォーカスが残るので、キーボードでもそのまま選べる
                  （「削除」を押すと同じ位置の「やめる」にフォーカスが乗る）
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
  /** 自分自身と、既に同じ向きで繋がっている出来事を除いた候補 */
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
      <SectionHeading kicker="Variable" title="出来事" />
      <Field
        name="variable-label"
        label="名前"
        value={variable()?.label ?? ""}
        placeholder="例: 社員数"
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
      <div class="relations">
        <RelationList
          title="原因"
          empty="この出来事に影響する矢印はありません"
          links={related().causes}
          labelOf={(link) => labelOf(editor, link.from)}
          addLabel="原因を追加"
          candidates={candidates(related().causes.map((link) => link.from))}
          onAdd={(other) => editor.connect(other, props.id)}
        />
        <RelationList
          title="結果"
          empty="この出来事から出る矢印はありません"
          links={related().effects}
          labelOf={(link) => labelOf(editor, link.to)}
          addLabel="結果を追加"
          candidates={candidates(related().effects.map((link) => link.to))}
          onAdd={(other) => editor.connect(props.id, other)}
        />
      </div>
      <Show when={editor.editable()}>
        <DeleteButton label="出来事を削除" />
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
 * 候補を選んでから「追加」で確定する。閉じた select は矢印キーだけで値が変わる
 * ブラウザがあるので、選んだ時点では関連を作らない
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
  /** 既定の形（直線、逆向きの関連があれば決まった曲がり）と違う曲がり具合が付いているか */
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
        {/* 以前の版や JSON で付けた曲がり具合は、ここでだけ既定の形に戻せる */}
        <Show when={customCurvature()}>
          <div class="inline-actions">
            <button
              type="button"
              class="button ghost small"
              onClick={() => {
                update({ curvature: undefined });
                // 押したボタンは消えるので、検査パネルへフォーカスを戻す
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

function LoopList() {
  const editor = useContext(EditorContext);
  return (
    <section class="loop-list" aria-labelledby="loop-list-title">
      <header class="loop-list-header">
        <div>
          <p class="eyebrow">Loops</p>
          <h2 id="loop-list-title">ループ</h2>
        </div>
        <p class="loop-count">
          <span>{editor.loopEntries().length}</span> 検出
        </p>
      </header>
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
    </section>
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
