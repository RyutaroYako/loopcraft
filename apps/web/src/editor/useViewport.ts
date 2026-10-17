import type { Ref } from "vue";
import { ref } from "vue";
import type { Size } from "@loopcraft/core/geometry";
import type { Point } from "@loopcraft/core/schema";
import type { NodeBox } from "./boxes.ts";
import * as view from "./viewport.ts";
import type { Viewport } from "./viewport.ts";

export function useViewport() {
  const viewport = ref<Viewport>(view.initialViewport);
  // ref にしないのは、描画には使わないため
  let size: Size = { width: 0, height: 0 };

  function setSize(next: Size) {
    size = next;
  }

  function screenToWorld(point: Point): Point {
    return view.screenToWorld(viewport.value, point);
  }

  function zoomAt(screenPoint: Point, factor: number) {
    viewport.value = view.zoomAt(viewport.value, screenPoint, factor);
  }

  function zoomBy(factor: number) {
    zoomAt({ x: size.width / 2, y: size.height / 2 }, factor);
  }

  function panBy(dx: number, dy: number) {
    viewport.value = view.panBy(viewport.value, dx, dy);
  }

  function fitTo(boxes: Iterable<NodeBox>) {
    if (size.width === 0 || size.height === 0) return;
    viewport.value = view.fitBoxes(size, boxes);
  }

  function centerOn(point: Point) {
    viewport.value = view.centerOn(viewport.value, size, point);
  }

  function center(): Point {
    return screenToWorld({ x: size.width / 2, y: size.height / 2 });
  }

  return {
    viewport: viewport as Readonly<Ref<Viewport>>,
    setSize,
    screenToWorld,
    zoomAt,
    zoomBy,
    panBy,
    fitTo,
    centerOn,
    center,
  };
}
