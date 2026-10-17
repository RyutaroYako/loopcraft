import { createSampleDiagram } from "@loopcraft/core/sample";
import type { Diagram } from "@loopcraft/core/schema";
import { effectScope } from "vue";
import { useEditor } from "../editor/useEditor.ts";

/** effectScope で包むのは、閉じたときに computed や後始末をまとめて止めるため */
export function setupEditor(initial: Diagram = createSampleDiagram(), editable = true) {
  const scope = effectScope();
  const editor = scope.run(() => useEditor(initial, { editable }))!;
  return { editor, dispose: () => scope.stop() };
}
