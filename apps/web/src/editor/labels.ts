import type { VariableId } from "@loopcraft/core/schema";
import { UNNAMED } from "./boxes.ts";
import type { Editor } from "./useEditor.ts";

export const labelOf = (editor: Editor, id: VariableId | undefined) =>
  (id && editor.variableById.value.get(id)?.label) || UNNAMED;
