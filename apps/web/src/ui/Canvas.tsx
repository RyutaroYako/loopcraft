import { For, Show, createMemo, createSignal, onSettled, useContext } from "solid-js";
import { EditorContext, type Gesture } from "../editor/editor.ts";
import * as edit from "@loopcraft/core/edit";
import { curvatureFromHandle } from "@loopcraft/core/geometry";
import type { LinkId, LoopId, Point, VariableId } from "@loopcraft/core/schema";
import {
  geometryOf,
  InlineLabelEditor,
  LinkDraftView,
  LinkView,
  LoopMarkerView,
  NodeView,
  type LinkDraft,
} from "./CanvasItems.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { FitIcon, MinusIcon, PlusIcon } from "./icons.tsx";

/** 一度に追跡するポインタは 1 本だけ。2 本目の指などは無視する */
interface DragBase {
  pointerId: number;
  /** 押した位置（画面座標）。しきい値を超えるまではクリック扱い */
  start: Point;
  moved: boolean;
}

type Drag = DragBase &
  (
    | { kind: "pan"; origin: Point }
    | { kind: "move"; id: VariableId; origin: Point; grab: Point; gesture: Gesture }
    | { kind: "connect"; from: VariableId }
    | { kind: "curve"; id: LinkId; gesture: Gesture }
    | { kind: "marker"; id: LoopId; offset: Point; gesture: Gesture }
  );

type DragInit = Drag extends infer D ? (D extends Drag ? Omit<D, keyof DragBase> : never) : never;

/** これ以下の移動はクリックとみなす（画面上の px） */
const DRAG_THRESHOLD = 3;

export function Canvas() {
  const editor = useContext(EditorContext);
  const [linkDraft, setLinkDraft] = createSignal<LinkDraft | null>(null);
  const [panning, setPanning] = createSignal(false);
  let svg: SVGSVGElement | undefined;
  let drag: Drag | undefined;

  const screenPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = svg!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const worldPoint = (event: { clientX: number; clientY: number }) =>
    editor.screenToWorld(screenPoint(event));

  const nodeAt = (point: Point): VariableId | undefined => {
    for (const [id, box] of [...editor.boxes()].reverse()) {
      if (
        Math.abs(point.x - box.center.x) <= box.size.width / 2 + 4 &&
        Math.abs(point.y - box.center.y) <= box.size.height / 2 + 4
      ) {
        return id;
      }
    }
    return undefined;
  };

  /** ドラッグを始められたら true。別のポインタでドラッグ中なら何もしない */
  const canStartDrag = (event: PointerEvent) => {
    if (event.button !== 0) return false;
    event.stopPropagation();
    return drag === undefined;
  };

  const startDrag = (event: PointerEvent, init: () => DragInit) => {
    try {
      svg!.setPointerCapture(event.pointerId);
    } catch {
      // 既に離されたポインタなどはキャプチャできないが、ドラッグ自体は続けられる
    }
    drag = {
      pointerId: event.pointerId,
      start: screenPoint(event),
      moved: false,
      ...init(),
    } as Drag;
  };

  const onBackgroundPointerDown = (event: PointerEvent) => {
    if (!canStartDrag(event)) return;
    editor.setEditingVariable(null);
    const { x, y } = editor.viewport();
    startDrag(event, () => ({ kind: "pan", origin: { x, y } }));
  };

  const onNodePointerDown = (event: PointerEvent, id: VariableId) => {
    if (!canStartDrag(event)) return;
    editor.select({ kind: "variable", id });
    if (editor.editingVariable() === id) return;
    editor.setEditingVariable(null);
    const variable = editor.current().variables.find((item) => item.id === id);
    if (!variable) return;
    startDrag(event, () => ({
      kind: "move",
      id,
      origin: variable.position,
      grab: worldPoint(event),
      gesture: editor.beginGesture(),
    }));
  };

  const onHandlePointerDown = (event: PointerEvent, from: VariableId) => {
    if (!canStartDrag(event)) return;
    editor.setEditingVariable(null);
    startDrag(event, () => ({ kind: "connect", from }));
    setLinkDraft({ from, to: worldPoint(event) });
  };

  const onCurvePointerDown = (event: PointerEvent, id: LinkId) => {
    if (!canStartDrag(event)) return;
    startDrag(event, () => ({ kind: "curve", id, gesture: editor.beginGesture() }));
  };

  const onMarkerPointerDown = (event: PointerEvent, id: LoopId, position: Point) => {
    if (!canStartDrag(event)) return;
    editor.select({ kind: "loop", id });
    const point = worldPoint(event);
    startDrag(event, () => ({
      kind: "marker",
      id,
      offset: { x: position.x - point.x, y: position.y - point.y },
      gesture: editor.beginGesture(),
    }));
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const screen = screenPoint(event);
    if (!drag.moved) {
      if (Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) < DRAG_THRESHOLD) return;
      drag.moved = true;
    }
    const point = editor.screenToWorld(screen);
    switch (drag.kind) {
      case "pan": {
        setPanning(true);
        const x = drag.origin.x + screen.x - drag.start.x;
        const y = drag.origin.y + screen.y - drag.start.y;
        editor.panBy(x - editor.viewport().x, y - editor.viewport().y);
        return;
      }
      case "move": {
        const position = {
          x: Math.round(drag.origin.x + point.x - drag.grab.x),
          y: Math.round(drag.origin.y + point.y - drag.grab.y),
        };
        drag.gesture.preview(edit.moveVariables(editor.current(), new Map([[drag.id, position]])));
        return;
      }
      case "connect": {
        const target = nodeAt(point);
        setLinkDraft({
          from: drag.from,
          to: point,
          target: target === drag.from ? undefined : target,
        });
        return;
      }
      case "curve": {
        const { id } = drag;
        const link = editor.current().links.find((item) => item.id === id);
        const boxes = editor.boxes();
        const from = link && boxes.get(link.from);
        const to = link && boxes.get(link.to);
        if (!link || !from || !to) return;
        const curvature =
          Math.round(curvatureFromHandle(from.center, to.center, point) * 100) / 100;
        drag.gesture.preview(edit.updateLink(editor.current(), link.id, { curvature }));
        return;
      }
      case "marker": {
        const marker = {
          x: Math.round(point.x + drag.offset.x),
          y: Math.round(point.y + drag.offset.y),
        };
        drag.gesture.preview(edit.updateLoop(editor.current(), drag.id, { marker }));
        return;
      }
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = undefined;
    setPanning(false);
    const cancelled = event.type !== "pointerup";
    switch (finished.kind) {
      case "pan":
        if (!finished.moved && !cancelled) {
          editor.select(null);
          editor.setFocusedLoop(null);
        }
        return;
      case "move":
      case "curve":
      case "marker":
        if (cancelled) finished.gesture.cancel();
        else finished.gesture.end();
        return;
      case "connect": {
        setLinkDraft(null);
        if (cancelled || !finished.moved) return;
        const point = worldPoint(event);
        const target = nodeAt(point);
        if (target === finished.from) return;
        if (target) {
          editor.connect(finished.from, target);
          return;
        }
        const origin = editor.boxes().get(finished.from)?.center;
        if (origin && Math.hypot(point.x - origin.x, point.y - origin.y) > 60) {
          editor.connectToNewVariable(finished.from, {
            x: Math.round(point.x),
            y: Math.round(point.y),
          });
        }
        return;
      }
    }
  };

  // ドラッグ中はポインタをキャプチャしているので、dblclick の target は常に svg になる。
  // 実際にポインタの下にあるものを調べて振り分ける
  const onDoubleClick = (event: MouseEvent) => {
    const point = worldPoint(event);
    const node = nodeAt(point);
    if (node) {
      editor.select({ kind: "variable", id: node });
      editor.setEditingVariable(node);
      return;
    }
    const top = document.elementFromPoint(event.clientX, event.clientY);
    const handle = selectedLinkHandle();
    if (handle && top?.classList.contains("curve-handle")) {
      editor.commit(edit.updateLink(editor.current(), handle.id, { curvature: undefined }));
      return;
    }
    if (!top?.classList.contains("grid-bg")) return;
    editor.addVariableAt({ x: Math.round(point.x), y: Math.round(point.y) });
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      editor.zoomAt(screenPoint(event), Math.exp(-event.deltaY * 0.01));
    } else {
      editor.panBy(-event.deltaX, -event.deltaY);
    }
  };

  const bindSvg = (element: SVGSVGElement) => {
    svg = element;
    element.addEventListener("wheel", onWheel, { passive: false });
  };

  let container: HTMLDivElement | undefined;
  onSettled(() => {
    let fitted = false;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      editor.setViewportSize({ width, height });
      if (!fitted && width > 0 && height > 0) {
        fitted = true;
        editor.fitView();
      }
    });
    observer.observe(container!);
    return () => observer.disconnect();
  });

  const transform = () => {
    const { x, y, zoom } = editor.viewport();
    return `translate(${x} ${y}) scale(${zoom})`;
  };

  const selectedLinkHandle = createMemo(() => {
    const selected = editor.selection();
    if (selected?.kind !== "link") return undefined;
    const link = editor.linkById().get(selected.id);
    const geometry = link && geometryOf(editor, link);
    return geometry ? { id: selected.id, point: geometry.middle } : undefined;
  });

  const isEmpty = () => editor.diagram().variables.length === 0;

  return (
    <div class="canvas" ref={(element) => (container = element)}>
      <svg
        ref={bindSvg}
        class={["canvas-svg", { panning: panning(), connecting: linkDraft() !== null }]}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onDblClick={onDoubleClick}
        role="group"
        aria-label="システム図のキャンバス"
        tabindex="-1"
      >
        <defs>
          <pattern
            id="grid-dots"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
            patternTransform={transform()}
          >
            <circle cx="1" cy="1" r="1" class="grid-dot" />
          </pattern>
          <marker
            id="arrowhead"
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 L 2.5 5 z" fill="context-stroke" />
          </marker>
        </defs>
        <rect class="grid-bg" width="100%" height="100%" fill="url(#grid-dots)" />
        <g transform={transform()}>
          <g class="links">
            <For each={editor.diagram().links} keyed={(link) => link.id}>
              {(link) => <LinkView id={link().id} />}
            </For>
          </g>
          <Show when={linkDraft() !== null}>
            <LinkDraftView draft={linkDraft()} />
          </Show>
          <g class="loop-markers">
            <For each={editor.diagram().loops} keyed={(loop) => loop.id}>
              {(loop) => <LoopMarkerView id={loop().id} onPointerDown={onMarkerPointerDown} />}
            </For>
          </g>
          <g class="nodes">
            <For each={editor.diagram().variables} keyed={(variable) => variable.id}>
              {(variable) => (
                <NodeView
                  id={variable().id}
                  connectTarget={linkDraft()?.target === variable().id}
                  onPointerDown={onNodePointerDown}
                  onHandlePointerDown={onHandlePointerDown}
                />
              )}
            </For>
          </g>
          <Show when={selectedLinkHandle() !== undefined}>
            <circle
              class="curve-handle"
              cx={selectedLinkHandle()?.point.x}
              cy={selectedLinkHandle()?.point.y}
              r={6 / editor.viewport().zoom}
              onPointerDown={(event) => {
                const handle = selectedLinkHandle();
                if (handle) onCurvePointerDown(event, handle.id);
              }}
            >
              <title>ドラッグで曲がり具合を変更、ダブルクリックで元に戻す</title>
            </circle>
          </Show>
          <Show when={editor.editingVariable()} keyed>
            {(id) => <InlineLabelEditor id={id} />}
          </Show>
        </g>
      </svg>

      <Show when={isEmpty()}>
        <EmptyState />
      </Show>

      <div class="zoom-controls" role="toolbar" aria-label="表示倍率">
        <button
          type="button"
          class="icon-button"
          onClick={() => editor.zoomBy(1 / 1.2)}
          title="縮小"
        >
          <MinusIcon />
        </button>
        <span class="zoom-value">{Math.round(editor.viewport().zoom * 100)}%</span>
        <button type="button" class="icon-button" onClick={() => editor.zoomBy(1.2)} title="拡大">
          <PlusIcon />
        </button>
        <span class="zoom-divider" />
        <button
          type="button"
          class="icon-button"
          onClick={() => editor.fitView()}
          title="全体を表示"
          disabled={isEmpty()}
        >
          <FitIcon />
        </button>
      </div>

      <Show when={!isEmpty()}>
        <p class="canvas-hint">
          <span>ダブルクリックで出来事を追加</span>
          <span>右端の点をドラッグで関連</span>
          <span>
            <kbd>Delete</kbd> で削除
          </span>
        </p>
      </Show>
    </div>
  );
}
