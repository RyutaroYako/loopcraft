import { boundsOf } from "@loopcraft/core/geometry";
import type { Size } from "@loopcraft/core/geometry";
import type { Point } from "@loopcraft/core/schema";
import type { NodeBox } from "./boxes.ts";

export interface Viewport {
  /** 図の原点が来る画面上の位置 */
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
const MAX_FIT_ZOOM = 1.25;

export const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 };

export const screenToWorld = ({ x, y, zoom }: Viewport, point: Point): Point => ({
  x: (point.x - x) / zoom,
  y: (point.y - y) / zoom,
});

export const zoomAt = (viewport: Viewport, screenPoint: Point, factor: number): Viewport => {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
  const ratio = zoom / viewport.zoom;
  return {
    zoom,
    x: screenPoint.x - (screenPoint.x - viewport.x) * ratio,
    y: screenPoint.y - (screenPoint.y - viewport.y) * ratio,
  };
};

export const panBy = (viewport: Viewport, dx: number, dy: number): Viewport => ({
  ...viewport,
  x: viewport.x + dx,
  y: viewport.y + dy,
});

export const centerOn = (viewport: Viewport, size: Size, point: Point): Viewport => ({
  ...viewport,
  x: size.width / 2 - point.x * viewport.zoom,
  y: size.height / 2 - point.y * viewport.zoom,
});

export const fitBoxes = (size: Size, boxes: Iterable<NodeBox>): Viewport => {
  const bounds = boundsOf([...boxes]);
  if (!bounds) return { x: size.width / 2, y: size.height / 2, zoom: 1 };
  const margin = Math.min(96, Math.min(size.width, size.height) * 0.08);
  const zoom = Math.min(
    MAX_FIT_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(
        (size.width - margin * 2) / Math.max(1, bounds.maxX - bounds.minX),
        (size.height - margin * 2) / Math.max(1, bounds.maxY - bounds.minY),
      ),
    ),
  );
  return {
    zoom,
    x: size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
    y: size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
  };
};
