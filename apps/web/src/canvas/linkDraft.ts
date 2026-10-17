import type { Point, VariableId } from "@loopcraft/core/schema";

export interface LinkDraft {
  from: VariableId;
  to: Point;
  target?: VariableId;
}
