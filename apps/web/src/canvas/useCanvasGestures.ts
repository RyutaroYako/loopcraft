import type { Ref } from "vue";
import { computed, ref } from "vue";
import * as edit from "@loopcraft/core/edit";
import type { LoopId, Point, VariableId } from "@loopcraft/core/schema";
import type { Editor, Gesture } from "../editor/useEditor.ts";
import { movedPast, nodeAt, offsetBy } from "./gestures.ts";
import type { LinkDraft } from "./linkDraft.ts";
import { usePinchZoom } from "./usePinchZoom.ts";

interface DragBase {
  pointerId: number;
  // ワールド座標で持たないのは、パン中はポインタの下のワールド座標が動かず、しきい値を超えないため
  start: Point;
  moved: boolean;
}

type Drag = DragBase &
  (
    | { kind: "pan"; origin: Point }
    | { kind: "move"; id: VariableId; origin: Point; grab: Point; gesture: Gesture }
    | { kind: "connect"; from: VariableId }
    | { kind: "marker"; id: LoopId; offset: Point; gesture: Gesture }
  );

type DragInit = Drag extends infer D ? (D extends Drag ? Omit<D, keyof DragBase> : never) : never;

export function useCanvasGestures(editor: Editor, svg: Readonly<Ref<SVGSVGElement | null>>) {
  const linkDraft = ref<LinkDraft | null>(null);
  const panning = ref(false);
  const moving = ref(false);
  let drag: Drag | undefined;

  const gesture = computed(() => {
    if (panning.value) return "pan";
    if (linkDraft.value !== null) return "connect";
    if (moving.value) return "move";
    return undefined;
  });

  function screenPoint(event: { clientX: number; clientY: number }): Point {
    const rect = svg.value!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function worldPoint(event: { clientX: number; clientY: number }) {
    return editor.screenToWorld(screenPoint(event));
  }

  function nodeUnder(point: Point) {
    return nodeAt(editor.boxes.value, point);
  }

  function canStartDrag(event: PointerEvent) {
    if (event.button !== 0) return false;
    event.stopPropagation();
    return drag === undefined;
  }

  function startDrag(event: PointerEvent, init: DragInit) {
    try {
      svg.value?.setPointerCapture(event.pointerId);
    } catch {
      // 既に離されたポインタなどはキャプチャできないが、ドラッグ自体は続けられる
    }
    drag = { pointerId: event.pointerId, start: screenPoint(event), moved: false, ...init } as Drag;
  }

  function onBackgroundPointerDown(event: PointerEvent) {
    if (!canStartDrag(event)) return;
    editor.setEditingVariable(null);
    const { x, y } = editor.viewport.value;
    startDrag(event, { kind: "pan", origin: { x, y } });
  }

  function onNodePointerDown(event: PointerEvent, id: VariableId) {
    if (!canStartDrag(event)) return;
    // 押した時点で選ばないのは、2 本指の 1 本目だと、拡大縮小のつもりで選択が変わりシートまで上がるため。
    // 動かし始めるか離したときに選ぶ
    if (editor.editingVariable.value === id) return;
    editor.setEditingVariable(null);
    const variable = editor.variableById.value.get(id);
    if (!variable) return;
    startDrag(event, {
      kind: "move",
      id,
      origin: variable.position,
      grab: worldPoint(event),
      gesture: editor.beginGesture(),
    });
  }

  function onHandlePointerDown(event: PointerEvent, from: VariableId) {
    if (!canStartDrag(event)) return;
    editor.setEditingVariable(null);
    startDrag(event, { kind: "connect", from });
    linkDraft.value = { from, to: worldPoint(event) };
  }

  function onMarkerPointerDown(event: PointerEvent, id: LoopId, position: Point) {
    if (!canStartDrag(event)) return;
    editor.select({ kind: "loop", id });
    const point = worldPoint(event);
    startDrag(event, {
      kind: "marker",
      id,
      offset: { x: position.x - point.x, y: position.y - point.y },
      gesture: editor.beginGesture(),
    });
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const screen = screenPoint(event);
    if (!drag.moved) {
      if (!movedPast(drag.start, screen)) return;
      drag.moved = true;
      if (drag.kind === "move") {
        // 押した時点で立てないのは、クリックのたびに薄さが切り替わってちらつくため
        moving.value = true;
        editor.select({ kind: "variable", id: drag.id });
      }
    }
    const point = editor.screenToWorld(screen);
    switch (drag.kind) {
      case "pan": {
        panning.value = true;
        const x = drag.origin.x + screen.x - drag.start.x;
        const y = drag.origin.y + screen.y - drag.start.y;
        editor.panBy(x - editor.viewport.value.x, y - editor.viewport.value.y);
        return;
      }
      case "move": {
        const position = offsetBy(drag.origin, drag.grab, point);
        drag.gesture.preview(
          edit.moveVariables(editor.diagram.value, new Map([[drag.id, position]])),
        );
        return;
      }
      case "connect": {
        const target = nodeUnder(point);
        linkDraft.value = {
          from: drag.from,
          to: point,
          target: target === drag.from ? undefined : target,
        };
        return;
      }
      case "marker": {
        const marker = offsetBy(point, { x: 0, y: 0 }, drag.offset);
        drag.gesture.preview(edit.updateLoop(editor.diagram.value, drag.id, { marker }));
        return;
      }
    }
  }

  function cancelDrag() {
    const finished = drag;
    if (!finished) return;
    drag = undefined;
    panning.value = false;
    moving.value = false;
    linkDraft.value = null;
    if ("gesture" in finished) finished.gesture.cancel();
    try {
      svg.value?.releasePointerCapture(finished.pointerId);
    } catch {
      // 既に離されたポインタは解放できないが、ドラッグはもう終わっている
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = undefined;
    panning.value = false;
    moving.value = false;
    const cancelled = event.type !== "pointerup";
    switch (finished.kind) {
      case "pan":
        if (!finished.moved && !cancelled) {
          editor.select(null);
          editor.setFocusedLoop(null);
        }
        return;
      case "move":
        if (!finished.moved && !cancelled) editor.select({ kind: "variable", id: finished.id });
        if (cancelled) finished.gesture.cancel();
        else finished.gesture.end();
        return;
      case "marker":
        if (cancelled) finished.gesture.cancel();
        else finished.gesture.end();
        return;
      case "connect": {
        linkDraft.value = null;
        if (cancelled || !finished.moved) return;
        // 空いた所で離しても変数を足さないのは、つなぎ損ねたときに名前の無い変数が勝手にできるため
        const target = nodeUnder(worldPoint(event));
        if (target && target !== finished.from) editor.connect(finished.from, target);
        return;
      }
    }
  }

  // 動かし始める前のドラッグを残さないのは、macOS の Ctrl+クリックやタッチの長押しが
  // 左ボタンの押下に続いて contextmenu を送り、ブラウザのメニューを閉じた後もドラッグが続いてしまうため
  function onContextMenu() {
    if (drag && !drag.moved) cancelDrag();
  }

  // dblclick 自体に pointerType を持たせられないので、直前の pointerdown から覚えておく
  let lastPointerType = "mouse";

  // event.target で振り分けないのは、ドラッグ中のキャプチャで dblclick の target が常に svg になるため
  function onDoubleClick(event: MouseEvent) {
    // 指やペンで受けないのは、パンや選び直しのつもりの素早い 2 回のタップで、変数ができたり入力欄が開いたりするため
    if (lastPointerType !== "mouse") return;
    const point = worldPoint(event);
    const node = nodeUnder(point);
    if (node) {
      editor.select({ kind: "variable", id: node });
      editor.setEditingVariable(node);
      return;
    }
    const top = document.elementFromPoint(event.clientX, event.clientY);
    if (top?.getAttribute("data-layer") !== "grid") return;
    editor.addVariableAt({ x: Math.round(point.x), y: Math.round(point.y) });
  }

  const pinch = usePinchZoom(editor, svg, screenPoint, cancelDrag);

  // 変数の pointerdown より先に受けるのは、変数のハンドラが伝播を止め、指の数や dblclick の入力の種類を覚え損ねるため
  function onPointerDownCapture(event: PointerEvent) {
    lastPointerType = event.pointerType;
    pinch.onPointerDown(event);
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      editor.zoomAt(screenPoint(event), Math.exp(-event.deltaY * 0.01));
    } else {
      editor.panBy(-event.deltaX, -event.deltaY);
    }
  }

  return {
    linkDraft: linkDraft as Readonly<Ref<LinkDraft | null>>,
    gesture,
    onBackgroundPointerDown,
    onNodePointerDown,
    onHandlePointerDown,
    onMarkerPointerDown,
    onPointerMove,
    onPointerUp,
    onContextMenu,
    onDoubleClick,
    onPointerDownCapture,
    onPointerMoveCapture: pinch.onPointerMove,
    onPointerUpCapture: pinch.onPointerUp,
    onWheel,
  };
}
