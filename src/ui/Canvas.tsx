import { For, Show, createMemo, createSignal, onSettled, useContext } from "solid-js";
import { EditorContext } from "../editor/editor.ts";
import * as edit from "../model/edit.ts";
import { curvatureFromHandle } from "../model/geometry.ts";
import type { LinkId, LoopId, Point, VariableId } from "../model/schema.ts";
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

type Drag =
  | { kind: "pan"; start: Point; origin: Point; moved: boolean }
  | { kind: "move"; id: VariableId; start: Point; origin: Point; moved: boolean }
  | { kind: "connect"; from: VariableId }
  | { kind: "curve"; id: LinkId }
  | { kind: "marker"; id: LoopId; offset: Point };

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

  const startDrag = (event: PointerEvent, next: Drag) => {
    event.stopPropagation();
    try {
      svg!.setPointerCapture(event.pointerId);
    } catch {
      // 既に離されたポインタなどはキャプチャできないが、ドラッグ自体は続けられる
    }
    drag = next;
  };

  const onBackgroundPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    editor.setEditingVariable(null);
    const { x, y } = editor.viewport();
    startDrag(event, { kind: "pan", start: screenPoint(event), origin: { x, y }, moved: false });
  };

  const onNodePointerDown = (event: PointerEvent, id: VariableId) => {
    if (event.button !== 0) return;
    editor.select({ kind: "variable", id });
    if (editor.editingVariable() === id) return;
    editor.setEditingVariable(null);
    const variable = editor.current().variables.find((item) => item.id === id);
    if (!variable) return;
    editor.beginGesture();
    startDrag(event, {
      kind: "move",
      id,
      start: worldPoint(event),
      origin: variable.position,
      moved: false,
    });
  };

  const onHandlePointerDown = (event: PointerEvent, from: VariableId) => {
    if (event.button !== 0) return;
    editor.setEditingVariable(null);
    startDrag(event, { kind: "connect", from });
    setLinkDraft({ from, to: worldPoint(event) });
  };

  const onCurvePointerDown = (event: PointerEvent, id: LinkId) => {
    if (event.button !== 0) return;
    editor.beginGesture();
    startDrag(event, { kind: "curve", id });
  };

  const onMarkerPointerDown = (event: PointerEvent, id: LoopId, position: Point) => {
    if (event.button !== 0) return;
    editor.select({ kind: "loop", id });
    const point = worldPoint(event);
    editor.beginGesture();
    startDrag(event, {
      kind: "marker",
      id,
      offset: { x: position.x - point.x, y: position.y - point.y },
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const point = worldPoint(event);
    switch (drag.kind) {
      case "pan": {
        const screen = screenPoint(event);
        const dx = screen.x - drag.start.x;
        const dy = screen.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setPanning(true);
        const { x, y } = drag.origin;
        editor.panBy(x + dx - editor.viewport().x, y + dy - editor.viewport().y);
        return;
      }
      case "move": {
        const dx = point.x - drag.start.x;
        const dy = point.y - drag.start.y;
        if (!drag.moved && Math.hypot(dx, dy) * editor.viewport().zoom < DRAG_THRESHOLD) return;
        drag.moved = true;
        const position = { x: Math.round(drag.origin.x + dx), y: Math.round(drag.origin.y + dy) };
        editor.previewGesture(edit.moveVariables(editor.current(), new Map([[drag.id, position]])));
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
        editor.previewGesture(edit.updateLink(editor.current(), link.id, { curvature }));
        return;
      }
      case "marker": {
        const marker = {
          x: Math.round(point.x + drag.offset.x),
          y: Math.round(point.y + drag.offset.y),
        };
        editor.previewGesture(edit.updateLoop(editor.current(), drag.id, { marker }));
        return;
      }
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const finished = drag;
    drag = undefined;
    setPanning(false);
    if (!finished) return;
    switch (finished.kind) {
      case "pan":
        if (!finished.moved) {
          editor.select(null);
          editor.setFocusedLoop(null);
        }
        return;
      case "move":
      case "curve":
      case "marker":
        editor.endGesture();
        return;
      case "connect": {
        const draft = linkDraft();
        setLinkDraft(null);
        if (event.type === "pointercancel" || !draft) return;
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
        onDblClick={onDoubleClick}
        role="application"
        aria-label="システム図のキャンバス"
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
