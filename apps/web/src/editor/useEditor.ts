import type { InjectionKey, Ref } from "vue";
import { computed, inject, ref, shallowRef } from "vue";
import * as edit from "@loopcraft/core/edit";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { autoLayout as layoutDiagram } from "@loopcraft/core/layout";
import { cycleKey } from "@loopcraft/core/loop";
import type { Diagram, LinkId, LoopId, Point, VariableId } from "@loopcraft/core/schema";
import { useNotices } from "../notice/useNotices.ts";
import { downloadDiagram } from "../transfer/file.ts";
import { readDiagramFile } from "../transfer/readDiagramFile.ts";
import { computeBoxes } from "./boxes.ts";
import { emphasisOf, highlightLoop, neighborhoodOf } from "./emphasis.ts";
import type { Selection } from "./emphasis.ts";
import { useDiagramIndex } from "./useDiagramIndex.ts";
import { useHistory } from "./useHistory.ts";
import type { Gesture } from "./useHistory.ts";
import { useViewport } from "./useViewport.ts";

export type { Gesture } from "./useHistory.ts";

export interface EditorOptions {
  editable?: boolean;
  /** 消した要素にフォーカスがあったまま放っておくと、キーボード操作を続けられない */
  restoreFocus?: () => void;
}

export type Editor = ReturnType<typeof useEditor>;

export const EditorKey: InjectionKey<Editor> = Symbol("Editor");

export function injectEditor(): Editor {
  const editor = inject(EditorKey);
  if (!editor) throw new Error("EditorKey が provide されていません");
  return editor;
}

export function useEditor(initial: Diagram, options: EditorOptions = {}) {
  const editable = options.editable ?? true;
  const restoreFocus = options.restoreFocus ?? (() => {});
  // shallowRef にするのは、深い ref だと中身がプロキシに替わり、core の編集関数が返す「変わっていない図」を === で見分けられないため
  const diagram = shallowRef(initial);
  const history = useHistory(diagram);

  const selection = ref<Selection | null>(null);
  const editingVariable = ref<VariableId | null>(null);
  const hoveredLoop = ref<string | null>(null);
  // selection で表さないのは、注目していないループには LoopId が無いため
  const focusedLoop = ref<string | null>(null);
  const index = useDiagramIndex(diagram);
  const view = useViewport();
  const notices = useNotices();

  const highlightedLoop = computed(() => {
    const selected = selection.value;
    return highlightLoop(index.loopEntries.value, {
      hovered: hoveredLoop.value,
      selected:
        selected?.kind === "loop" ? index.loopEntryByLoopId.value.get(selected.id)?.key : undefined,
      focused: focusedLoop.value,
    });
  });
  const emphasis = computed(() =>
    emphasisOf(
      highlightedLoop.value,
      neighborhoodOf(selection.value, index.links.value, editingVariable.value),
    ),
  );
  function commit(next: Diagram, coalesceKey?: string) {
    if (editable) history.commit(next, coalesceKey);
  }

  function beginGesture(): Gesture {
    return editable ? history.beginGesture() : { preview() {}, end() {}, cancel() {} };
  }

  function travel(move: () => boolean) {
    if (!editable || !move()) return;
    dropStaleSelection(diagram.value);
    restoreFocus();
  }

  function undo() {
    travel(history.undo);
  }

  function redo() {
    travel(history.redo);
  }

  function dropStaleSelection(target: Diagram) {
    const selected = selection.value;
    if (!selected) return;
    const collection = { variable: target.variables, link: target.links, loop: target.loops }[
      selected.kind
    ];
    if (!collection.some((item) => item.id === selected.id)) select(null);
  }

  function select(next: Selection | null) {
    selection.value = next;
    if (next) focusedLoop.value = null;
  }

  function setEditingVariable(id: VariableId | null) {
    if (id !== null && !editable) return;
    editingVariable.value = id;
  }

  function setHoveredLoop(key: string | null) {
    hoveredLoop.value = key;
  }

  function setFocusedLoop(key: string | null) {
    focusedLoop.value = key;
  }

  function addVariableAt(position: Point) {
    if (!editable) return undefined;
    const result = edit.addVariable(diagram.value, { label: "", position });
    commit(result.diagram);
    select({ kind: "variable", id: result.id });
    setEditingVariable(result.id);
    return result.id;
  }

  function connect(from: VariableId, to: VariableId) {
    if (!editable) return;
    const result = edit.addLink(diagram.value, { from, to });
    if (result.ok) {
      commit(result.diagram);
      select({ kind: "link", id: result.id });
      return;
    }
    if (result.reason === "duplicate" && result.existing) {
      select({ kind: "link", id: result.existing });
      notices.notify({ tone: "info", title: "同じ向きの関連は既にあります" });
    }
  }

  function deleteSelection() {
    if (!editable) return;
    const selected = selection.value;
    if (!selected) return;
    if (selected.kind === "variable") commit(edit.removeVariable(diagram.value, selected.id));
    if (selected.kind === "link") commit(edit.removeLinks(diagram.value, new Set([selected.id])));
    if (selected.kind === "loop") commit(edit.removeLoop(diagram.value, selected.id));
    select(null);
    restoreFocus();
  }

  function featureLoop(linkIds: LinkId[]) {
    if (!editable) return;
    const result = edit.featureLoop(diagram.value, linkIds);
    commit(result.diagram);
    select({ kind: "loop", id: result.id });
  }

  function unfeatureLoop(id: LoopId) {
    if (!editable) return;
    const loop = diagram.value.loops.find((item) => item.id === id);
    commit(edit.removeLoop(diagram.value, id));
    if (selection.value?.id === id) select(null);
    if (loop) focusedLoop.value = cycleKey(loop.links);
  }

  /**
   * replaceDiagram を使わないのは、表示位置や選択をできるだけ残すため。
   * 読み取り専用でも止めないのは、外部の変更は表示に反映するため
   */
  function applyExternal(next: Diagram) {
    if (!history.applyExternal(next)) return;
    dropStaleSelection(next);
    const editing = editingVariable.value;
    if (editing && !next.variables.some((item) => item.id === editing)) {
      editingVariable.value = null;
    }
  }

  function replaceDiagram(next: Diagram) {
    if (!editable) return;
    commit(next);
    select(null);
    focusedLoop.value = null;
    setEditingVariable(null);
    fitView(next);
  }

  async function importFile(file: File) {
    if (!editable) return;
    const result = await readDiagramFile(file);
    if (!result.ok) {
      notices.notify({
        tone: "error",
        title: `${file.name} を読み込めませんでした`,
        details: result.details,
      });
      return;
    }
    replaceDiagram(result.diagram);
    notices.notify({ tone: "info", title: `${file.name} を読み込みました` });
  }

  function exportFile() {
    downloadDiagram(diagram.value);
  }

  function autoLayout() {
    if (!editable) return;
    const sizes = new Map([...index.boxes.value].map(([id, box]) => [id, box.size]));
    const next = layoutDiagram(diagram.value, sizes);
    commit(next);
    fitView(next);
  }

  function newDiagram() {
    replaceDiagram(createEmptyDiagram());
  }

  function fitView(target: Diagram = diagram.value) {
    view.fitTo(computeBoxes(target.variables).values());
  }

  return {
    editable,
    diagram: diagram as Readonly<Ref<Diagram>>,
    variableById: index.variableById,
    linkById: index.linkById,
    boxes: index.boxes,
    detection: index.detection,
    loopEntries: index.loopEntries,
    loopEntryByLoopId: index.loopEntryByLoopId,
    highlightedLoop,
    emphasis,
    historySize: history.size,
    selection: selection as Readonly<Ref<Selection | null>>,
    editingVariable: editingVariable as Readonly<Ref<VariableId | null>>,
    focusedLoop: focusedLoop as Readonly<Ref<string | null>>,
    viewport: view.viewport,
    notice: notices.notice,
    noticeKey: notices.key,

    hasReverse: index.hasReverse,
    commit,
    applyExternal,
    beginGesture,
    undo,
    redo,
    select,
    setEditingVariable,
    setHoveredLoop,
    setFocusedLoop,
    notify: notices.notify,
    dismissNotice: notices.dismiss,
    addVariableAt,
    connect,
    deleteSelection,
    featureLoop,
    unfeatureLoop,
    replaceDiagram,
    importFile,
    exportFile,
    newDiagram,
    autoLayout,
    remeasure: index.remeasure,
    setViewportSize: view.setSize,
    screenToWorld: view.screenToWorld,
    zoomAt: view.zoomAt,
    zoomBy: view.zoomBy,
    panBy: view.panBy,
    fitView,
    centerOn: view.centerOn,
    viewCenter: view.center,
  };
}
