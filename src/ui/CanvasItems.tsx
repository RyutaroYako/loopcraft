import { Show, createMemo, useContext } from "solid-js";
import { EditorContext, type Editor, type NodeBox } from "../editor/editor.ts";
import * as edit from "../model/edit.ts";
import { centroid, DEFAULT_CURVATURE, isClockwise, linkGeometry } from "../model/geometry.ts";
import type { Link, LinkId, LoopId, Point, VariableId } from "../model/schema.ts";

/*
 * キャンバス上の各要素。どれも ID だけを受け取り、描画のたびに最新の図から引き直す。
 * 削除と同じ更新の中で子の計算が先に走っても落ちないよう、見つからないときは何も描かない。
 */

const ORIGIN: Point = { x: 0, y: 0 };
const NO_SIZE = { width: 0, height: 0 };

export function geometryOf(editor: Editor, link: Link) {
  const boxes = editor.boxes();
  const from = boxes.get(link.from);
  const to = boxes.get(link.to);
  if (!from || !to) return undefined;
  return linkGeometry(from, to, link.curvature ?? DEFAULT_CURVATURE);
}

export function LinkView(props: { id: LinkId }) {
  const editor = useContext(EditorContext);
  const link = () => editor.linkById().get(props.id);
  const geometry = createMemo(() => {
    const current = link();
    return current && geometryOf(editor, current);
  });
  const selected = () => {
    const current = editor.selection();
    return current?.kind === "link" && current.id === props.id;
  };
  const highlighted = () => editor.highlightedLoop()?.links.has(props.id) ?? false;
  const dimmed = () => editor.highlightedLoop() !== undefined && !highlighted();
  const select = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    editor.setEditingVariable(null);
    editor.select({ kind: "link", id: props.id });
  };
  const label = () => geometry()?.label ?? ORIGIN;
  return (
    <Show when={geometry() !== undefined}>
      <g
        class={[
          "link",
          link()?.polarity === "-" ? "negative" : "positive",
          { selected: selected(), highlighted: highlighted(), dimmed: dimmed() },
        ]}
      >
        <path class="link-hit" d={geometry()?.path} onPointerDown={select} />
        <path class="link-path" d={geometry()?.path} marker-end="url(#arrowhead)" />
        <Show when={link()?.delay}>
          <DelayMark
            middle={geometry()?.middle ?? ORIGIN}
            tangent={geometry()?.tangent ?? ORIGIN}
          />
        </Show>
        <g
          class="polarity"
          transform={`translate(${label().x} ${label().y})`}
          role="button"
          aria-label={`極性 ${link()?.polarity === "-" ? "マイナス" : "プラス"}。クリックで切り替え`}
          onPointerDown={select}
          onClick={() => editor.commit(edit.togglePolarity(editor.current(), props.id))}
        >
          <title>クリックで極性を切り替え</title>
          <circle r="11" />
          <text text-anchor="middle" dominant-baseline="central">
            {link()?.polarity === "-" ? "−" : "+"}
          </text>
        </g>
      </g>
    </Show>
  );
}

function DelayMark(props: { middle: Point; tangent: Point }) {
  const path = () => {
    const { middle, tangent } = props;
    const normal = { x: -tangent.y, y: tangent.x };
    return [-2.5, 2.5]
      .map((shift) => {
        const cx = middle.x + tangent.x * shift;
        const cy = middle.y + tangent.y * shift;
        return `M ${cx - normal.x * 7} ${cy - normal.y * 7} L ${cx + normal.x * 7} ${cy + normal.y * 7}`;
      })
      .join(" ");
  };
  return <path class="delay-mark" d={path()} />;
}

export interface LinkDraft {
  from: VariableId;
  to: Point;
  target?: VariableId;
}

export function LinkDraftView(props: { draft: LinkDraft | null }) {
  const editor = useContext(EditorContext);
  const path = createMemo(() => {
    const draft = props.draft;
    const from = draft && editor.boxes().get(draft.from);
    if (!draft || !from) return undefined;
    const target = draft.target ? editor.boxes().get(draft.target) : undefined;
    const to: NodeBox = target ?? { center: draft.to, size: NO_SIZE };
    return linkGeometry(from, to, DEFAULT_CURVATURE).path;
  });
  return <path class="link-draft" d={path()} marker-end="url(#arrowhead)" />;
}

export function NodeView(props: {
  id: VariableId;
  connectTarget: boolean;
  onPointerDown: (event: PointerEvent, id: VariableId) => void;
  onHandlePointerDown: (event: PointerEvent, id: VariableId) => void;
}) {
  const editor = useContext(EditorContext);
  const label = () => editor.variableById().get(props.id)?.label ?? "";
  const box = () => editor.boxes().get(props.id);
  const size = () => box()?.size ?? NO_SIZE;
  const center = () => box()?.center ?? ORIGIN;
  const selected = () => {
    const current = editor.selection();
    return current?.kind === "variable" && current.id === props.id;
  };
  const highlighted = () => editor.highlightedLoop()?.variables.has(props.id) ?? false;
  const dimmed = () => editor.highlightedLoop() !== undefined && !highlighted();
  return (
    <Show when={box() !== undefined}>
      <g
        class={[
          "node",
          {
            selected: selected(),
            highlighted: highlighted(),
            dimmed: dimmed(),
            target: props.connectTarget,
            editing: editor.editingVariable() === props.id,
            unnamed: label() === "",
          },
        ]}
        transform={`translate(${center().x} ${center().y})`}
        role="button"
        aria-label={label() || "名称未設定"}
        aria-pressed={selected() ? "true" : "false"}
        onPointerDown={(event) => props.onPointerDown(event, props.id)}
      >
        <rect
          class="node-body"
          x={-size().width / 2}
          y={-size().height / 2}
          width={size().width}
          height={size().height}
          rx={size().height / 2}
        />
        <text class="node-label" text-anchor="middle" dominant-baseline="central">
          {label() || "名称未設定"}
        </text>
        <g
          class="node-handle"
          role="button"
          aria-label={`${label() || "名称未設定"}から関連を引く`}
          transform={`translate(${size().width / 2} 0)`}
          onPointerDown={(event) => props.onHandlePointerDown(event, props.id)}
        >
          <title>ドラッグして関連を引く</title>
          <circle class="node-handle-hit" r="11" />
          <circle class="node-handle-dot" r="4.5" />
        </g>
      </g>
    </Show>
  );
}

export function InlineLabelEditor(props: { id: VariableId }) {
  const editor = useContext(EditorContext);
  const box = () => editor.boxes().get(props.id);
  const width = () => Math.max(180, (box()?.size.width ?? 0) + 24);
  const center = () => box()?.center ?? ORIGIN;
  const original = editor.current().variables.find((item) => item.id === props.id)?.label ?? "";
  let done = false;
  const setLabel = (label: string) =>
    editor.commit(edit.updateVariable(editor.current(), props.id, { label }), `label:${props.id}`);
  const finish = (input: HTMLInputElement, cancel: boolean) => {
    if (done) return;
    done = true;
    setLabel(cancel ? original : input.value.trim());
    editor.setEditingVariable(null);
  };
  return (
    <foreignObject x={center().x - width() / 2} y={center().y - 20} width={width()} height={40}>
      <input
        class="inline-label"
        name="variable-label-inline"
        aria-label="出来事の名前"
        placeholder="出来事の名前"
        value={original}
        ref={(element) => {
          queueMicrotask(() => {
            element.focus();
            element.select();
          });
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onInput={(event) => {
          if (!event.isComposing) setLabel(event.currentTarget.value);
        }}
        onCompositionEnd={(event) => setLabel(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.isComposing) return;
          if (event.key === "Enter") finish(event.currentTarget, false);
          if (event.key === "Escape") finish(event.currentTarget, true);
        }}
        onBlur={(event) => finish(event.currentTarget, false)}
      />
    </foreignObject>
  );
}

export function LoopMarkerView(props: {
  id: LoopId;
  onPointerDown: (event: PointerEvent, id: LoopId, position: Point) => void;
}) {
  const editor = useContext(EditorContext);
  const entry = () => editor.loopEntryByLoopId().get(props.id);
  const points = createMemo(() => {
    const variables = editor.variableById();
    return (entry()?.variables ?? []).flatMap((id) => {
      const variable = variables.get(id);
      return variable ? [variable.position] : [];
    });
  });
  const position = () => entry()?.featured?.loop.marker ?? centroid(points());
  const selected = () => {
    const current = editor.selection();
    return current?.kind === "loop" && current.id === props.id;
  };
  const dimmed = () => {
    const highlighted = editor.highlightedLoop();
    return highlighted !== undefined && highlighted.key !== entry()?.key;
  };
  const name = () => entry()?.featured?.loop.name ?? "";
  return (
    <Show when={entry() !== undefined}>
      <g
        class={["loop-marker", entry()?.kind, { selected: selected(), dimmed: dimmed() }]}
        transform={`translate(${position().x} ${position().y})`}
        role="button"
        aria-label={`${entry()?.featured?.badge ?? ""} ${name()}`}
        onPointerDown={(event) => props.onPointerDown(event, props.id, position())}
      >
        <title>{entry()?.kind === "reinforcing" ? "自己強化ループ" : "バランスループ"}</title>
        <circle class="loop-marker-bg" r="26" />
        <g transform={isClockwise(points()) ? undefined : "scale(-1 1)"}>
          <path class="loop-marker-arc" d={LOOP_ARC} />
          <path class="loop-marker-head" d={LOOP_ARROW_HEAD} />
        </g>
        <text class="loop-marker-badge" text-anchor="middle" dominant-baseline="central">
          {entry()?.featured?.badge}
        </text>
        <Show when={name()}>
          <text class="loop-marker-name" y="42" text-anchor="middle">
            {name()}
          </text>
        </Show>
      </g>
    </Show>
  );
}

/** 半径 18 の円弧（-60° から 240° まで時計回り）と、その終端の矢じり */
const LOOP_ARC = arcPath(18, -60, 240);
const LOOP_ARROW_HEAD = arrowHeadPath(18, 240);

function polar(radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
}

function arcPath(radius: number, from: number, to: number) {
  const start = polar(radius, from);
  const end = polar(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}

function arrowHeadPath(radius: number, at: number) {
  const tip = polar(radius, at + 14);
  const outer = polar(radius + 5, at - 4);
  const inner = polar(radius - 5, at - 4);
  return `M ${outer.x} ${outer.y} L ${tip.x} ${tip.y} L ${inner.x} ${inner.y}`;
}
