import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { createRoot, flush } from "solid-js";
import { createEditor } from "../editor/editor.ts";

/** createRoot で包むのは、createEditor の createMemo などに所有者が要るため */
export function setupEditor(initial: Diagram = createSampleDiagram(), editable = true) {
  let dispose = () => {};
  const editor = createRoot((d) => {
    dispose = d;
    return createEditor(initial, { editable });
  });
  return { editor, dispose, flush };
}
