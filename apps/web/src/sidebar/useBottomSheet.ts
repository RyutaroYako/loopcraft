import type { Ref } from "vue";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { clampHeight, heightsFor, nearestSize, nextSize, TAP_SLOP } from "./bottomSheet.ts";
import type { SheetSize } from "./bottomSheet.ts";

export type BottomSheet = ReturnType<typeof useBottomSheet>;

/** 狭い画面で、一覧と検査パネルをキャンバスの下から引き出すシートの高さを持つ */
export function useBottomSheet() {
  const size = ref<SheetSize>("peek");
  const viewportHeight = ref(0);
  const dragHeight = ref<number | null>(null);
  let drag: { pointerId: number; startY: number; startHeight: number } | undefined;

  function onResize() {
    viewportHeight.value = window.innerHeight;
  }

  onMounted(() => {
    onResize();
    window.addEventListener("resize", onResize);
  });
  onUnmounted(() => window.removeEventListener("resize", onResize));

  const heights = computed(() => heightsFor(viewportHeight.value));
  const height = computed(() => dragHeight.value ?? heights.value[size.value]);
  const dragging = computed(() => dragHeight.value !== null);

  function follow(event: PointerEvent, from: NonNullable<typeof drag>) {
    return clampHeight(heights.value, from.startHeight + from.startY - event.clientY);
  }

  function setSize(next: SheetSize) {
    size.value = next;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // 既に離されたポインタはキャプチャできないが、取っ手の上で動かす分には追える
    }
    drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: height.value };
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragHeight.value = follow(event, drag);
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const released = follow(event, drag);
    const moved = Math.abs(drag.startY - event.clientY);
    drag = undefined;
    dragHeight.value = null;
    if (event.type !== "pointerup") return;
    if (moved < TAP_SLOP) size.value = nextSize(size.value);
    // 一段ずつにしないのは、上端近くまで引いても半分で止まり、指から離れて落ちるため
    else size.value = nearestSize(heights.value, released);
  }

  // ポインタの click で切り替えないのは、ドラッグの後に click が届くかが入力で違い、二重に送ることがあるため。
  // ポインタは pointerup で扱い、ここではキーボードの Enter と Space だけを受ける
  function onClick(event: MouseEvent) {
    if (event.detail === 0) size.value = nextSize(size.value);
  }

  return {
    size: size as Readonly<Ref<SheetSize>>,
    height,
    dragging,
    setSize,
    handle: { onPointerDown, onPointerMove, onPointerUp, onClick },
  };
}
