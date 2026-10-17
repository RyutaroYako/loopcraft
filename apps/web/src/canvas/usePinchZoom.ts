import type { Ref } from "vue";
import type { Point } from "@loopcraft/core/schema";
import type { Editor } from "../editor/useEditor.ts";
import { pinchOf } from "./gestures.ts";

export function usePinchZoom(
  editor: Editor,
  svg: Readonly<Ref<SVGSVGElement | null>>,
  screenPoint: (event: PointerEvent) => Point,
  onPinchStart: () => void,
) {
  const touches = new Map<number, Point>();
  let pinch: ReturnType<typeof pinchOf> | undefined;

  function measure() {
    const [a, b] = [...touches.values()] as [Point, Point];
    return pinchOf(a, b);
  }

  function onPointerDown(event: PointerEvent) {
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
    onPinchStart();
    for (const id of touches.keys()) {
      try {
        svg.value?.setPointerCapture(id);
      } catch {
        // 既に離された指はキャプチャできないが、次の pointerup で数え直す
      }
    }
    pinch = measure();
  }

  function onPointerMove(event: PointerEvent) {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, screenPoint(event));
    if (!pinch || touches.size !== 2) return;
    const next = measure();
    // 拡大縮小を先にしないのは、新しい中心で拡大してから動かすと、指の下の点が少しずつずれるため
    editor.panBy(next.center.x - pinch.center.x, next.center.y - pinch.center.y);
    editor.zoomAt(next.center, next.distance / Math.max(1, pinch.distance));
    pinch = next;
  }

  function onPointerUp(event: PointerEvent) {
    touches.delete(event.pointerId);
    // 測り直さないと、3 本目の指が残ったとき、別の 2 本の距離と比べて倍率が跳ぶ
    pinch = touches.size >= 2 ? measure() : undefined;
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}
