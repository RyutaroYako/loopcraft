import type { Point } from "@loopcraft/core/schema";

const polar = (radius: number, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
};

const arcPath = (radius: number, from: number, to: number) => {
  const start = polar(radius, from);
  const end = polar(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
};

const arrowHeadPath = (radius: number, at: number) => {
  const tip = polar(radius, at + 14);
  const outer = polar(radius + 5, at - 4);
  const inner = polar(radius - 5, at - 4);
  return `M ${outer.x} ${outer.y} L ${tip.x} ${tip.y} L ${inner.x} ${inner.y}`;
};

export const LOOP_ARC = arcPath(18, -60, 240);
export const LOOP_ARROW_HEAD = arrowHeadPath(18, 240);

export const delayMarkPath = (middle: Point, tangent: Point) => {
  const normal = { x: -tangent.y, y: tangent.x };
  return [-2.5, 2.5]
    .map((shift) => {
      const cx = middle.x + tangent.x * shift;
      const cy = middle.y + tangent.y * shift;
      return `M ${cx - normal.x * 7} ${cy - normal.y * 7} L ${cx + normal.x * 7} ${cy + normal.y * 7}`;
    })
    .join(" ");
};
