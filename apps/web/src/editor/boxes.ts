import { nodeSize } from "@loopcraft/core/geometry";
import type { Size } from "@loopcraft/core/geometry";
import type { Point, Variable, VariableId } from "@loopcraft/core/schema";
import { measureLabel } from "./measure.ts";

export interface NodeBox {
  center: Point;
  size: Size;
}

export const UNNAMED = "名称未設定";

export const computeBoxes = (variables: readonly Variable[]): Map<VariableId, NodeBox> =>
  new Map(
    variables.map((variable) => [
      variable.id,
      { center: variable.position, size: nodeSize(measureLabel(variable.label || UNNAMED)) },
    ]),
  );
