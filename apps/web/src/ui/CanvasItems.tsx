import { Show, createMemo, useContext } from "solid-js";
import { EditorContext, type Editor, type Gesture, type NodeBox } from "../editor/editor.ts";
import * as edit from "@loopcraft/core/edit";
import {
  centroid,
  DEFAULT_CURVATURE,
  defaultCurvature,
  isClockwise,
  linkGeometry,
} from "@loopcraft/core/geometry";
import type { Link, LinkId, LoopId, Point, VariableId } from "@loopcraft/core/schema";

/*
 * キャンバス上の各要素。どれも ID だけを受け取り、描画のたびに最新の図から引き直す。
 * 削除と同じ更新の中で子の計算が先に走っても落ちないよう、見つからないときは何も描かない。
 */

const ORIGIN: Point = { x: 0, y: 0 };
const ARROW_OFFSETS: Partial<Record<string, Point>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
const NO_SIZE = { width: 0, height: 0 };

function geometryOf(editor: Editor, link: Link) {
  const boxes = editor.boxes();
  const from = boxes.get(link.from);
  const to = boxes.get(link.to);
  if (!from || !to) return undefined;
  return linkGeometry(from, to, link.curvature ?? defaultCurvature(editor.hasReverse(link)));
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
  /** 目立たせる範囲の外にあるとき、その理由（ループか、選んだ変数のまわりか） */
  const outside = () => {
    const emphasis = editor.emphasis();
    return emphasis && !emphasis.links.has(props.id) ? emphasis.kind : undefined;
  };
  const select = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    editor.setEditingVariable(null);
    editor.select({ kind: "link", id: props.id });
  };
  const label = () => geometry()?.label ?? ORIGIN;
  const labelOf = (id: VariableId | undefined) =>
    (id && editor.variableById().get(id)?.label) || "名称未設定";
  const from = () => labelOf(link()?.from);
  const to = () => labelOf(link()?.to);
  const toggle = () => editor.commit(edit.togglePolarity(editor.current(), props.id));
  return (
    <Show when={geometry() !== undefined}>
      <g
        class={[
          "link",
          link()?.polarity === "-" ? "negative" : "positive",
          {
            selected: selected(),
            highlighted: highlighted(),
            dimmed: outside() === "loop",
            faded: outside() === "neighborhood",
          },
        ]}
        data-link-id={props.id}
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
          tabindex="0"
          aria-label={`${from()}から${to()}への関連、極性${link()?.polarity === "-" ? "マイナス" : "プラス"}。押すと切り替え`}
          onPointerDown={select}
          onFocus={() => {
            if (!selected()) editor.select({ kind: "link", id: props.id });
          }}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            editor.select({ kind: "link", id: props.id });
            toggle();
          }}
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
    const curvature = draft.target
      ? defaultCurvature(editor.hasReverse({ from: draft.from, to: draft.target }))
      : DEFAULT_CURVATURE;
    return linkGeometry(from, to, curvature).path;
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
  const outside = () => {
    const emphasis = editor.emphasis();
    return emphasis && !emphasis.variables.has(props.id) ? emphasis.kind : undefined;
  };
  // キーボードだけでも選択・名前の変更・移動ができるようにする
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 8;
    const offset = ARROW_OFFSETS[event.key];
    if (offset) {
      event.preventDefault();
      const position = editor.current().variables.find((item) => item.id === props.id)?.position;
      if (!position) return;
      editor.select({ kind: "variable", id: props.id });
      const moved = { x: position.x + offset.x * step, y: position.y + offset.y * step };
      editor.commit(
        edit.moveVariables(editor.current(), new Map([[props.id, moved]])),
        `move:${props.id}`,
      );
      return;
    }
    if (event.key === "F2" || (event.key === "Enter" && selected())) {
      event.preventDefault();
      editor.select({ kind: "variable", id: props.id });
      editor.setEditingVariable(props.id);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      editor.select({ kind: "variable", id: props.id });
    }
  };
  return (
    <Show when={box() !== undefined}>
      <g
        class={[
          "node",
          {
            selected: selected(),
            highlighted: highlighted(),
            dimmed: outside() === "loop",
            faded: outside() === "neighborhood",
            target: props.connectTarget,
            editing: editor.editingVariable() === props.id,
            unnamed: label() === "",
          },
        ]}
        transform={`translate(${center().x} ${center().y})`}
        role="button"
        tabindex="0"
        aria-label={label() || "名称未設定"}
        aria-pressed={selected() ? "true" : "false"}
        aria-keyshortcuts="Enter F2 ArrowUp ArrowDown ArrowLeft ArrowRight Delete"
        data-variable-id={props.id}
        onPointerDown={(event) => props.onPointerDown(event, props.id)}
        onFocus={() => {
          // フォーカスした要素を選択して、Delete や検査パネルがその要素に効くようにする
          if (!selected()) editor.select({ kind: "variable", id: props.id });
        }}
        onKeyDown={onKeyDown}
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
        {/* ポインタ専用の操作。キーボードでは検査パネルから関連を追加する */}
        <g
          class="node-handle"
          aria-hidden="true"
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

/** 描画が追いついた後に、変数の要素へフォーカスを移す */
function focusVariable(id: VariableId) {
  requestAnimationFrame(() => {
    document.querySelector<SVGGElement>(`[data-variable-id="${CSS.escape(id)}"]`)?.focus();
  });
}

export function InlineLabelEditor(props: { id: VariableId }) {
  const editor = useContext(EditorContext);
  const box = () => editor.boxes().get(props.id);
  const width = () => Math.max(180, (box()?.size.width ?? 0) + 24);
  const center = () => box()?.center ?? ORIGIN;
  const original = editor.current().variables.find((item) => item.id === props.id)?.label ?? "";
  // 入力中の変化は 1 つのジェスチャーにまとめ、確定で 1 回の編集、Escape で無かったことにする。
  // 別の操作が割り込むとジェスチャーは自動で確定されるので、ここで後始末をしなくても履歴は壊れない
  let gesture: Gesture | undefined;
  let done = false;
  const preview = (label: string) => {
    gesture ??= editor.beginGesture();
    gesture.preview(edit.updateVariable(editor.current(), props.id, { label }));
  };
  const finish = (input: HTMLInputElement, how: "confirm" | "cancel" | "blur") => {
    if (done) return;
    done = true;
    if (how === "cancel") {
      gesture?.cancel();
    } else {
      preview(input.value.trim());
      gesture?.end();
    }
    editor.setEditingVariable(null);
    // キーボードで閉じたときは、入力欄が消えても変数にフォーカスを戻して操作を続けられるようにする
    if (how !== "blur") focusVariable(props.id);
  };
  return (
    <foreignObject x={center().x - width() / 2} y={center().y - 20} width={width()} height={40}>
      <input
        class="inline-label"
        name="variable-label-inline"
        aria-label="変数の名前"
        placeholder="例: 売上"
        value={original}
        ref={(element) => {
          queueMicrotask(() => {
            element.focus();
            element.select();
          });
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onInput={(event) => {
          if (!event.isComposing) preview(event.currentTarget.value);
        }}
        onCompositionEnd={(event) => preview(event.currentTarget.value)}
        onKeyDown={(event) => {
          // Safari は変換確定の Enter を compositionend の後に isComposing=false で送るので keyCode も見る
          if (event.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") finish(event.currentTarget, "confirm");
          if (event.key === "Escape") finish(event.currentTarget, "cancel");
        }}
        onBlur={(event) => finish(event.currentTarget, "blur")}
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
  /** 選んだ変数を通らないループの記号は、まわりの変数と一緒に控えめに薄くする */
  const faded = () => {
    const emphasis = editor.emphasis();
    return emphasis?.kind === "neighborhood" && !entry()?.variables.includes(emphasis.center);
  };
  const name = () => entry()?.featured?.loop.name ?? "";
  return (
    <Show when={entry() !== undefined}>
      <g
        class={[
          "loop-marker",
          entry()?.kind,
          { selected: selected(), dimmed: dimmed(), faded: faded() },
        ]}
        transform={`translate(${position().x} ${position().y})`}
        role="button"
        tabindex="0"
        aria-label={`${entry()?.featured?.badge ?? ""} ${name()}`}
        aria-pressed={selected() ? "true" : "false"}
        onPointerDown={(event) => props.onPointerDown(event, props.id, position())}
        onFocus={() => {
          if (!selected()) editor.select({ kind: "loop", id: props.id });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          editor.select({ kind: "loop", id: props.id });
        }}
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
