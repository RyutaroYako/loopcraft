import { createSignal, onSettled } from "solid-js";

export type SheetSize = "peek" | "half" | "full";

const SIZES: SheetSize[] = ["peek", "half", "full"];
const TAP_SLOP = 6;
const PEEK_HEIGHT = 136;
/** 全体まで広げても、56px のツールバーの下にキャンバスを 120px は残す */
const FULL_GAP = 56 + 120;

/** CSS で段ごとの高さを決めないのは、引いた高さに近い段を選ぶために、JS でも同じ値が要るため */
function heightsFor(viewport: number): Record<SheetSize, number> {
  return { peek: PEEK_HEIGHT, half: Math.round(viewport / 2), full: viewport - FULL_GAP };
}

function nearestSize(heights: Record<SheetSize, number>, height: number) {
  return SIZES.reduce((best, size) =>
    Math.abs(heights[size] - height) < Math.abs(heights[best] - height) ? size : best,
  );
}

/** 狭い画面で、一覧と検査パネルをキャンバスの下から引き出すシートの高さを持つ */
export function createBottomSheet() {
  const [size, setSize] = createSignal<SheetSize>("peek");
  const [viewport, setViewport] = createSignal(window.innerHeight);
  const [dragHeight, setDragHeight] = createSignal<number | null>(null);
  let drag: { pointerId: number; startY: number; startHeight: number } | undefined;

  onSettled(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const heights = () => heightsFor(viewport());
  const height = () => dragHeight() ?? heights()[size()];
  const cycle = () => setSize(SIZES[(SIZES.indexOf(size()) + 1) % SIZES.length]!);
  const follow = (event: PointerEvent) => {
    const { peek, full } = heights();
    const raised = drag!.startHeight + drag!.startY - event.clientY;
    return Math.max(peek, Math.min(full, raised));
  };

  const handle = {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return;
      try {
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
      } catch {
        // 既に離されたポインタはキャプチャできないが、取っ手の上で動かす分には追える
      }
      drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: height() };
    },
    onPointerMove: (event: PointerEvent) => {
      if (event.pointerId !== drag?.pointerId) return;
      setDragHeight(follow(event));
    },
    onPointerUp: (event: PointerEvent) => {
      if (event.pointerId !== drag?.pointerId) return;
      const released = follow(event);
      const moved = Math.abs(drag.startY - event.clientY);
      drag = undefined;
      setDragHeight(null);
      if (event.type !== "pointerup") return;
      if (moved < TAP_SLOP) cycle();
      // 一段ずつにしないのは、上端近くまで引いても半分で止まり、指から離れて落ちるため
      else setSize(nearestSize(heights(), released));
    },
    onClick: (event: MouseEvent) => {
      // ポインタの click で切り替えないのは、ドラッグの後に click が届くかが入力で違い、二重に送ることがあるため。
      // ポインタは pointerup で扱い、ここではキーボードの Enter と Space だけを受ける
      if (event.detail === 0) cycle();
    },
  };

  return { size, setSize, height, dragging: () => dragHeight() !== null, handle };
}

export function SheetHandle(props: { sheet: ReturnType<typeof createBottomSheet> }) {
  const handle = props.sheet.handle;
  return (
    <button
      type="button"
      class="sheet-handle"
      aria-label={props.sheet.size() === "full" ? "パネルを畳む" : "パネルを広げる"}
      onClick={handle.onClick}
      onPointerDown={handle.onPointerDown}
      onPointerMove={handle.onPointerMove}
      onPointerUp={handle.onPointerUp}
      onPointerCancel={handle.onPointerUp}
    >
      <span class="sheet-grip" aria-hidden="true" />
    </button>
  );
}
