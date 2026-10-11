import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { createRoot, flush } from "solid-js";
import { createEditor } from "../editor/editor.ts";

/** リアクティブな所有者の下でエディタを作る。dispose で後片付けする */
export function setupEditor(initial: Diagram = createSampleDiagram(), editable = true) {
  let dispose = () => {};
  const editor = createRoot((d) => {
    dispose = d;
    return createEditor(initial, { editable });
  });
  return { editor, dispose, flush };
}
