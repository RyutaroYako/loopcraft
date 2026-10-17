import type { Point, VariableId } from "@loopcraft/core/schema";
import type { NodeBox } from "../editor/boxes.ts";

const DRAG_THRESHOLD = 3;
const NODE_HIT_MARGIN = 4;

export const movedPast = (start: Point, point: Point) =>
  Math.hypot(point.x - start.x, point.y - start.y) >= DRAG_THRESHOLD;

// 先頭から探さないのは、後に描いた変数が上に重なって見えるため
export const nodeAt = (boxes: ReadonlyMap<VariableId, NodeBox>, point: Point) => {
  for (const [id, box] of [...boxes].reverse()) {
    if (
      Math.abs(point.x - box.center.x) <= box.size.width / 2 + NODE_HIT_MARGIN &&
      Math.abs(point.y - box.center.y) <= box.size.height / 2 + NODE_HIT_MARGIN
    ) {
      return id;
    }
  }
  return undefined;
};

export const offsetBy = (origin: Point, from: Point, to: Point): Point => ({
  x: Math.round(origin.x + to.x - from.x),
  y: Math.round(origin.y + to.y - from.y),
});

export const pinchOf = (a: Point, b: Point) => ({
  distance: Math.hypot(a.x - b.x, a.y - b.y),
  center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
});
