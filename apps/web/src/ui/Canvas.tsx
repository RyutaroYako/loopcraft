import { For, Show, createEffect, createSignal, onSettled, useContext } from "solid-js";
import { EditorContext, type Gesture } from "../editor/editor.ts";
import * as edit from "@loopcraft/core/edit";
import type { LinkId, LoopId, Point, VariableId } from "@loopcraft/core/schema";
import { ContextMenu, type MenuItem, type MenuState } from "./ContextMenu.tsx";
import { linkActions, variableActions } from "./itemActions.ts";
import {
  InlineLabelEditor,
  LinkDraftView,
  LinkView,
  LoopMarkerView,
  NodeView,
  type LinkDraft,
} from "./CanvasItems.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { HistoryButtons } from "./HistoryButtons.tsx";
import { FitIcon, MinusIcon, PlusIcon } from "./icons.tsx";

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
    | { kind: "tap"; id: VariableId }
    | { kind: "marker"; id: LoopId; offset: Point; gesture: Gesture }
  );

type DragInit = Drag extends infer D ? (D extends Drag ? Omit<D, keyof DragBase> : never) : never;

const DRAG_THRESHOLD = 3;

export function Canvas(props: { svgRef?: (svg: SVGSVGElement) => void }) {
  const editor = useContext(EditorContext);
  const [linkDraft, setLinkDraft] = createSignal<LinkDraft | null>(null);
  const [panning, setPanning] = createSignal(false);
  const [moving, setMoving] = createSignal(false);
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
    if (editor.connectingFrom() !== null) {
      // preventDefault しないと、押した変数にフォーカスが移り、選択がつないだ矢印からその変数に戻る
      event.preventDefault();
      // 押した時点でつながないのは、2 本指の 1 本目やパンの始まりでも矢印ができてしまうため
      startDrag(event, () => ({ kind: "tap", id }));
      return;
    }
    // 押した時点で選ばないのは、2 本指の 1 本目だと、拡大縮小のつもりで選択が変わりシートまで上がるため。
    // 動かし始めるか離したときに選ぶ
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
    // つなぐ途中に点からドラッグを始めないのは、指では点と変数を打ち分けられず、どちらもつなぐ先のつもりで触れるため
    if (editor.connectingFrom() !== null) return onNodePointerDown(event, from);
    if (!canStartDrag(event)) return;
    editor.setEditingVariable(null);
    startDrag(event, () => ({ kind: "connect", from }));
    setLinkDraft({ from, to: worldPoint(event) });
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
      if (drag.kind === "move") {
        // 押した時点で立てないのは、クリックのたびに薄さが切り替わってちらつくため
        setMoving(true);
        editor.select({ kind: "variable", id: drag.id });
      }
    }
    const point = editor.screenToWorld(screen);
    switch (drag.kind) {
      case "tap":
        return;
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

  const cancelDrag = () => {
    const finished = drag;
    if (!finished) return;
    drag = undefined;
    setPanning(false);
    setMoving(false);
    setLinkDraft(null);
    if ("gesture" in finished) finished.gesture.cancel();
    try {
      svg?.releasePointerCapture(finished.pointerId);
    } catch {
      // 既に離されたポインタは解放できないが、ドラッグはもう終わっている
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = undefined;
    setPanning(false);
    setMoving(false);
    const cancelled = event.type !== "pointerup";
    switch (finished.kind) {
      case "pan":
        if (!finished.moved && !cancelled) {
          const from = editor.connectingFrom();
          if (from !== null) {
            editor.stopConnecting();
            const point = worldPoint(event);
            editor.connectToNewVariable(from, { x: Math.round(point.x), y: Math.round(point.y) });
            return;
          }
          editor.select(null);
          editor.setFocusedLoop(null);
        }
        return;
      case "tap": {
        if (cancelled || finished.moved) return;
        const from = editor.connectingFrom();
        editor.stopConnecting();
        if (from !== null && from !== finished.id) editor.connect(from, finished.id);
        return;
      }
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

  const [menu, setMenu] = createSignal<MenuState | null>(null);
  let menuOrigin: HTMLElement | SVGElement | undefined;

  const canvasMenu = (point: Point): MenuItem[] => [
    {
      label: "ここに変数を追加",
      run: () => editor.addVariableAt({ x: Math.round(point.x), y: Math.round(point.y) }),
    },
    {
      label: "整列",
      disabled: editor.diagram().variables.length < 2,
      run: () => editor.autoLayout(),
    },
    {
      label: "全体を表示",
      disabled: editor.diagram().variables.length === 0,
      run: () => editor.fitView(),
    },
  ];

  const onContextMenu = (event: MouseEvent) => {
    // 読み取り専用で preventDefault しないのは、ブラウザ自身のメニューを残すため
    if (!editor.editable() || !svg) return;
    event.preventDefault();
    if (drag !== undefined) {
      // 動かしている途中で開かないのは、キャプチャで target が常に svg になり、狙いと違うメニューになるため
      if (drag.moved) return;
      // ドラッグ中でも一律に断らないのは、macOS の Ctrl+クリックやタッチの長押しが
      // 左ボタンの押下に続いて contextmenu を送るため
      cancelDrag();
    }
    const target = event.target instanceof Element ? event.target : svg;
    const node = target.closest<SVGElement>("[data-variable-id]");
    const link = target.closest<SVGElement>("[data-link-id]");
    // 届いた位置をそのまま使わないのは、メニューキーで開くと 0, 0 で届くため
    const origin = node ?? link ?? svg;
    // 矢印の線（g 要素）に戻さないのは、フォーカスを受け取れないため
    menuOrigin = node ?? link?.querySelector<SVGElement>(".polarity") ?? svg;
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    const rect = origin.getBoundingClientRect();
    const at = fromKeyboard
      ? { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
      : event;
    const position = screenPoint(at);
    editor.setEditingVariable(null);
    if (node) {
      const id = node.dataset.variableId as VariableId;
      editor.select({ kind: "variable", id });
      const label = editor.variableById().get(id)?.label || "名称未設定";
      setMenu({ ...position, label: `「${label}」の操作`, items: variableActions(editor, id) });
    } else if (link) {
      const id = link.dataset.linkId as LinkId;
      editor.select({ kind: "link", id });
      setMenu({ ...position, label: "関連の操作", items: linkActions(editor, id) });
    } else {
      setMenu({
        ...position,
        label: "キャンバスの操作",
        items: canvasMenu(worldPoint(at)),
      });
    }
  };

  const closeMenu = (restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) menuOrigin?.focus();
  };

  // 古くなったメニューを隠すだけにしないのは、元に戻すで同じ図に戻ると、古い項目のまま復活するため
  createEffect(
    () => [editor.diagram(), editor.viewport()],
    () => {
      if (!menu()) return;
      closeMenu(document.activeElement?.closest(".context-menu") != null);
    },
    { defer: true },
  );

  // dblclick 自体に pointerType を持たせられないので、直前の pointerdown から覚えておく
  let lastPointerType = "mouse";

  // event.target で振り分けないのは、ドラッグ中のキャプチャで dblclick の target が常に svg になるため
  const onDoubleClick = (event: MouseEvent) => {
    // 指やペンで受けないのは、パンや選び直しのつもりの素早い 2 回のタップで、変数ができたり入力欄が開いたりするため
    if (lastPointerType !== "mouse") return;
    const point = worldPoint(event);
    const node = nodeAt(point);
    if (node) {
      editor.select({ kind: "variable", id: node });
      editor.setEditingVariable(node);
      return;
    }
    const top = document.elementFromPoint(event.clientX, event.clientY);
    if (!top?.classList.contains("grid-bg")) return;
    editor.addVariableAt({ x: Math.round(point.x), y: Math.round(point.y) });
  };

  const touches = new Map<number, Point>();
  let pinch: { distance: number; center: Point } | undefined;

  const measurePinch = () => {
    const [a, b] = [...touches.values()] as [Point, Point];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const rememberPointerType = (event: PointerEvent) => {
    lastPointerType = event.pointerType;
  };

  const onTouchDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    // 主の指で数え直すのは、キャンバスの外で離された指の pointerup が届かず、数が残ることがあるため
    if (event.isPrimary) {
      touches.clear();
      pinch = undefined;
    }
    touches.set(event.pointerId, screenPoint(event));
    if (touches.size < 2) return;
    // 2 本目以降の指を通さないのは、乗った変数を選んだり動かし始めたりしないため
    event.stopPropagation();
    if (touches.size > 2) return;
    // 1 本目のドラッグを続けないのは、変数を動かしながら拡大縮小すると狙いが定まらないため
    cancelDrag();
    for (const id of touches.keys()) {
      try {
        svg!.setPointerCapture(id);
      } catch {
        // 既に離された指はキャプチャできないが、次の pointerup で数え直す
      }
    }
    pinch = measurePinch();
  };

  const onTouchMove = (event: PointerEvent) => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, screenPoint(event));
    if (!pinch || touches.size !== 2) return;
    const next = measurePinch();
    // 拡大縮小を先にしないのは、新しい中心で拡大してから動かすと、指の下の点が少しずつずれるため
    editor.panBy(next.center.x - pinch.center.x, next.center.y - pinch.center.y);
    editor.zoomAt(next.center, next.distance / Math.max(1, pinch.distance));
    pinch = next;
  };

  const onTouchUp = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    // 測り直さないと、3 本目の指が残ったとき、別の 2 本の距離と比べて倍率が跳ぶ
    pinch = touches.size >= 2 ? measurePinch() : undefined;
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
    props.svgRef?.(element);
    element.addEventListener("wheel", onWheel, { passive: false });
    // JSX の onPointerDown で受けないのは、変数のハンドラが先に伝播を止め、2 本目の指を数えられないため
    element.addEventListener("pointerdown", rememberPointerType, true);
    element.addEventListener("pointerdown", onTouchDown, true);
    element.addEventListener("pointermove", onTouchMove, true);
    element.addEventListener("pointerup", onTouchUp, true);
    element.addEventListener("pointercancel", onTouchUp, true);
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

  const isEmpty = () => editor.diagram().variables.length === 0;

  return (
    <div
      class="group/canvas relative min-h-0 min-w-0 overflow-hidden bg-canvas"
      ref={(element) => (container = element)}
    >
      <svg
        ref={bindSvg}
        class={[
          "canvas-svg",
          { panning: panning(), connecting: linkDraft() !== null, moving: moving() },
        ]}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onDblClick={onDoubleClick}
        onContextMenu={onContextMenu}
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
        <g class="canvas-content" transform={transform()}>
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
          <Show when={editor.editingVariable()} keyed>
            {(id) => <InlineLabelEditor id={id} />}
          </Show>
        </g>
      </svg>

      <Show when={isEmpty()}>
        <EmptyState />
      </Show>

      <Show when={editor.connectingFrom()} keyed>
        {(from) => (
          // 狭い画面で右端まで広げないのは、右上の全体表示と重なるため
          <div class="connect-banner absolute top-3 right-3 left-3 z-3 flex max-w-[480px] animate-[rise_0.3s_var(--ease-out)_both] items-center gap-3 rounded-lg bg-accent py-2.5 pr-2.5 pl-4 text-on-strong shadow-float max-md:right-16">
            <p class="grid min-w-0 flex-1 font-medium" role="status">
              「{editor.variableById().get(from)?.label || "名称未設定"}
              」からつなぐ先を選ぶ
              <span class="text-sm font-normal opacity-85">空いた所なら新しい変数につなぐ</span>
            </p>
            <button
              type="button"
              class="button small border-[rgb(255_255_255/0.4)] bg-transparent text-on-strong enabled:hover:border-on-strong enabled:hover:bg-[rgb(255_255_255/0.12)]"
              onClick={() => editor.stopConnecting()}
            >
              やめる
            </button>
          </div>
        )}
      </Show>

      <Show when={menu()} keyed>
        {(current) => (
          <ContextMenu
            menu={current}
            bounds={{ width: container?.clientWidth ?? 0, height: container?.clientHeight ?? 0 }}
            onClose={closeMenu}
          />
        )}
      </Show>

      {/* ツールバーの履歴と別に置くのは、狭い画面では親指の届く下端に操作を寄せるため */}
      <Show when={editor.editable()}>
        <div class="absolute right-4 bottom-4 flex max-md:right-3 max-md:bottom-7 max-md:left-3 max-md:pointer-events-none max-md:items-center max-md:justify-between max-md:gap-2 max-md:*:pointer-events-auto">
          {/* 広い画面で出さないのは、ツールバーに同じボタンがあるため */}
          <HistoryButtons
            class="hidden rounded-xl border border-line bg-glass p-0.5 shadow-float backdrop-blur-[8px] max-md:flex"
            buttonClass="size-11"
          />
          {/* 空のときに出さないのは、案内に同じボタンがあるため */}
          <Show when={!isEmpty()}>
            <button
              type="button"
              class="button primary ml-auto h-12 rounded-xl border-accent bg-accent pr-4.5 pl-3.5 text-lg shadow-[0_10px_24px_-10px_rgb(15_118_110/0.6)] enabled:hover:border-accent-strong enabled:hover:bg-accent-strong"
              title="空いた所のダブルクリックでも追加できます"
              onClick={() => editor.addVariableAt(editor.viewCenter())}
            >
              <PlusIcon />
              変数を追加
            </button>
          </Show>
        </div>
      </Show>

      {/*
        狭い画面で拡大縮小のボタンを出さないのは、ピンチで足りるため。全体表示は下端の操作と重ならない右上に寄せる。
        空のときに出さないのは、全体表示は押せず、右上で案内の見出しと重なるため
      */}
      <div
        class="absolute bottom-4 left-4 flex items-center gap-0.5 rounded-lg border border-line bg-glass p-1 shadow-float backdrop-blur-[8px] max-md:top-3 max-md:right-3 max-md:bottom-auto max-md:left-auto max-md:group-has-[.empty-state]/canvas:hidden max-md:*:not-last:hidden"
        role="toolbar"
        aria-label="表示倍率"
      >
        <button
          type="button"
          class="icon-button max-md:size-10"
          onClick={() => editor.zoomBy(1 / 1.2)}
          title="縮小"
        >
          <MinusIcon />
        </button>
        <span class="zoom-value min-w-11.5 text-center font-mono text-sm text-ink-2">
          {Math.round(editor.viewport().zoom * 100)}%
        </span>
        <button
          type="button"
          class="icon-button max-md:size-10"
          onClick={() => editor.zoomBy(1.2)}
          title="拡大"
        >
          <PlusIcon />
        </button>
        <span class="mx-1 h-4.5 w-px bg-line" />
        <button
          type="button"
          class="icon-button max-md:size-10"
          onClick={() => editor.fitView()}
          title="全体を表示"
          disabled={isEmpty()}
        >
          <FitIcon />
        </button>
      </div>

      <Show when={!isEmpty() && !editor.editable()}>
        <p class="pointer-events-none absolute right-4 bottom-4.5 flex gap-3.5 text-sm text-muted max-md:hidden">
          <span>ドラッグで移動、Ctrl+ホイールで拡大縮小</span>
        </p>
      </Show>
    </div>
  );
}
