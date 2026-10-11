import { For, Match, Show, Switch, createMemo, createSignal, useContext } from "solid-js";
import { EditorContext, type Editor, type LoopEntry } from "../editor/editor.ts";
import * as edit from "../model/edit.ts";
import type { LoopKind } from "../model/loop.ts";
import type { Link, LinkId, LoopId, VariableId } from "../model/schema.ts";
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
    <section class="inspector" aria-label="選択中の項目">
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
  const stats = () => {
    const diagram = editor.diagram();
    return [
      { label: "出来事", value: diagram.variables.length },
      { label: "関連", value: diagram.links.length },
      { label: "見出したループ", value: diagram.loops.length },
    ];
  };
  return (
    <div class="inspector-body">
      <SectionHeading kicker="Diagram" title="図の概要" />
      <dl class="stats">
        <For each={stats()} keyed={false}>
          {(stat) => (
            <div class="stat">
              <dt>{stat().label}</dt>
              <dd>{stat().value}</dd>
            </div>
          )}
        </For>
      </dl>
      <Field
        name="diagram-description"
        label="この図で伝えたいこと"
        value={editor.diagram().description ?? ""}
        placeholder="例: 人を増やすほど成長するが、育成の負担が成長を押し戻す"
        multiline
        hint="出来事・矢印・ループを選ぶと、ここで編集できます"
        onInput={(value) =>
          editor.commit(edit.setDescription(editor.current(), value), "diagram-description")
        }
      />
    </div>
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
        />
        <RelationList
          title="結果"
          empty="この出来事から出る矢印はありません"
          links={related().effects}
          labelOf={(link) => labelOf(editor, link.to)}
        />
      </div>
      <DeleteButton label="出来事を削除" />
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
            onClick={() => update({ polarity: "+" })}
          >
            <PolarityGlyph polarity="+" />
            同じ向きに動く
          </button>
          <button
            type="button"
            class={{ active: link()?.polarity === "-" }}
            aria-pressed={pressedState(link()?.polarity === "-")}
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
      <div class="inline-actions">
        <button
          type="button"
          class="button ghost small"
          disabled={link()?.curvature === undefined}
          onClick={() => update({ curvature: undefined })}
        >
          曲がり具合を戻す
        </button>
      </div>
      <DeleteButton label="関連を削除" />
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
    </div>
  );
}

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

type Filter = "all" | LoopKind;

function LoopList() {
  const editor = useContext(EditorContext);
  const [filter, setFilter] = createSignal<Filter>("all");
  const visible = createMemo(() =>
    editor.loopEntries().filter((entry) => filter() === "all" || entry.kind === filter()),
  );
  const count = (kind: Filter) =>
    editor.loopEntries().filter((entry) => kind === "all" || entry.kind === kind).length;
  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "すべて" },
    { value: "reinforcing", label: "自己強化 R" },
    { value: "balancing", label: "バランス B" },
  ];
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
      <div class="filter-chips" role="radiogroup" aria-label="ループの種類で絞り込む">
        <For each={filters}>
          {(item) => (
            <button
              type="button"
              role="radio"
              aria-checked={pressedState(filter() === item.value)}
              class={["chip", { active: filter() === item.value }]}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              <span class="chip-count">{count(item.value)}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={editor.detection().truncated}>
        <p class="loop-warning">
          ループが多すぎるため、先頭の {editor.detection().loops.length} 件だけを表示しています
        </p>
      </Show>
      <Show
        when={visible().length > 0}
        fallback={
          <div class="loop-empty">
            <svg viewBox="0 0 64 40" aria-hidden="true" class="loop-empty-art">
              <path d="M14 20a10 10 0 1 1 10 10h-6" />
              <path d="M50 20a10 10 0 1 1-10-10h6" />
              <path d="m20 26-3 4 4 3" />
              <path d="m44 14 3-4-4-3" />
            </svg>
            <p>
              {editor.loopEntries().length === 0
                ? "矢印をつないで輪を作ると、ここにループが自動で現れます"
                : "この種類のループはありません"}
            </p>
          </div>
        }
      >
        <ul class="loop-items">
          <For each={visible()} keyed={(entry) => entry.key}>
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
