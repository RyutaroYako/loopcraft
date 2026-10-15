import { createContext, createMemo, createSignal } from "solid-js";
import { findLoops } from "@loopcraft/core/cycles";
import { listLoopEntries } from "@loopcraft/core/loops";
import * as edit from "@loopcraft/core/edit";
import { boundsOf, nodeSize, type Size } from "@loopcraft/core/geometry";
import { linkPairKey } from "@loopcraft/core/integrity";
import { createEmptyDiagram, parseDiagramJson } from "@loopcraft/core/io";
import { autoLayout as layoutDiagram } from "@loopcraft/core/layout";
import { cycleKey } from "@loopcraft/core/loop";
import type { Diagram, LinkId, LoopId, Point, Variable, VariableId } from "@loopcraft/core/schema";
import { downloadDiagram } from "./file.ts";
import { refocusWhenLost } from "./focus.ts";
import { clearMeasureCache, measureLabel } from "./measure.ts";

export type Selection =
  | { kind: "variable"; id: VariableId }
  | { kind: "link"; id: LinkId }
  | { kind: "loop"; id: LoopId };

export interface Gesture {
  /** 履歴には残さない */
  preview(next: Diagram): void;
  /** 開始時からの変化を 1 回の編集として残す */
  end(): void;
  /** 開始時の図に戻す。履歴にも残さない */
  cancel(): void;
}

export interface Viewport {
  /** 図の原点が来る画面上の位置 */
  x: number;
  y: number;
  zoom: number;
}

export interface Notice {
  tone: "error" | "info";
  title: string;
  details?: string[];
  actions?: { label: string; run: () => void }[];
}

export interface NodeBox {
  center: Point;
  size: Size;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;
const NOTICE_MS = 3200;

export function computeBoxes(variables: readonly Variable[]): Map<VariableId, NodeBox> {
  return new Map(
    variables.map((variable) => [
      variable.id,
      { center: variable.position, size: nodeSize(measureLabel(variable.label || "名称未設定")) },
    ]),
  );
}

/** フォーカスしていた要素が消えたまま放っておくと、キーボード操作を続けられない */
function keepFocusInCanvas() {
  refocusWhenLost(canvasElement);
}

export function canvasElement() {
  return document.querySelector<SVGSVGElement>(".canvas-svg");
}

export function createEditor(initial: Diagram, options: { editable?: boolean } = {}) {
  // 最新の図を diagram() から読まないのは、シグナルの読み取りが次のマイクロタスクまで
  // 更新されず、直前の編集をすぐ次の編集に使えないため
  let present = initial;
  const [diagram, setDiagram] = createSignal(initial);

  const undoStack: Diagram[] = [];
  const redoStack: Diagram[] = [];
  const [historySize, setHistorySize] = createSignal({ undo: 0, redo: 0 });
  let coalesce: { key: string; at: number } | undefined;
  let activeGesture: { base: Diagram } | undefined;

  /** シグナルにしないのは、開いた後に変わることが無いため */
  const isEditable = options.editable ?? true;
  const editable = () => isEditable;

  const [selection, setSelection] = createSignal<Selection | null>(null);
  const [editingVariable, setEditingVariableSignal] = createSignal<VariableId | null>(null);
  const [hoveredLoop, setHoveredLoop] = createSignal<string | null>(null);
  /** selection で表さないのは、見出していないループには LoopId が無いため */
  const [focusedLoop, setFocusedLoop] = createSignal<string | null>(null);
  const [viewport, setViewport] = createSignal<Viewport>({ x: 0, y: 0, zoom: 1 });
  /** シグナルにしないのは、描画には使わないため */
  let currentSize: Size = { width: 0, height: 0 };
  const [notice, setNotice] = createSignal<Notice | null>(null);
  let currentNotice: Notice | null = null;
  const [fontsVersion, setFontsVersion] = createSignal(0);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  void document.fonts?.ready.then(() => {
    clearMeasureCache();
    setFontsVersion((version) => version + 1);
  });

  const links = createMemo(() => diagram().links);
  const loops = createMemo(() => diagram().loops);
  const variableById = createMemo(
    () => new Map(diagram().variables.map((variable) => [variable.id, variable])),
  );
  const linkById = createMemo(() => new Map(links().map((link) => [link.id, link])));
  const linkPairs = createMemo(
    () => new Set(links().map((link) => linkPairKey(link.from, link.to))),
  );
  const hasReverse = (link: { from: VariableId; to: VariableId }) =>
    linkPairs().has(linkPairKey(link.to, link.from));
  const boxes = createMemo(() => {
    fontsVersion();
    return computeBoxes(diagram().variables);
  });
  const detection = createMemo(() => findLoops(links()));

  const loopEntries = createMemo(() => listLoopEntries(loops(), links(), detection().loops));

  const loopEntryByLoopId = createMemo(
    () =>
      new Map(
        loopEntries().flatMap((entry) =>
          entry.featured ? [[entry.featured.loop.id, entry] as const] : [],
        ),
      ),
  );

  const highlightedLoop = createMemo(() => {
    const selected = selection();
    const key =
      hoveredLoop() ??
      (selected?.kind === "loop" ? loopEntryByLoopId().get(selected.id)?.key : undefined) ??
      focusedLoop();
    if (!key) return undefined;
    const entry = loopEntries().find((item) => item.key === key);
    if (!entry) return undefined;
    return { key, links: new Set(entry.links), variables: new Set(entry.variables) };
  });

  // 矢印の無い変数や名前の入力中にも作ると、足したばかりの変数でほかがすべて薄くなる
  const neighborhood = createMemo(() => {
    const selected = selection();
    if (selected?.kind !== "variable" || editingVariable() !== null) return undefined;
    const variables = new Set<VariableId>([selected.id]);
    const linkIds = new Set<LinkId>();
    for (const link of links()) {
      if (link.from !== selected.id && link.to !== selected.id) continue;
      linkIds.add(link.id);
      variables.add(link.from);
      variables.add(link.to);
    }
    return linkIds.size > 0 ? { center: selected.id, variables, links: linkIds } : undefined;
  });

  // ループと変数のまわりを別々に描き分けないのは、どちらを優先するかを 1 か所で決めるため
  const emphasis = createMemo(() => {
    const loop = highlightedLoop();
    if (loop) return { kind: "loop" as const, variables: loop.variables, links: loop.links };
    const near = neighborhood();
    return near && { kind: "neighborhood" as const, ...near };
  });

  function updateHistorySize() {
    setHistorySize({ undo: undoStack.length, redo: redoStack.length });
  }

  function show(next: Diagram) {
    present = next;
    setDiagram(next);
  }

  function commit(next: Diagram, coalesceKey?: string) {
    finishGesture();
    if (!isEditable || next === present) return;
    const now = Date.now();
    const merge =
      coalesceKey !== undefined && coalesce?.key === coalesceKey && now - coalesce.at < COALESCE_MS;
    if (!merge) pushUndo(present);
    coalesce = coalesceKey === undefined ? undefined : { key: coalesceKey, at: now };
    redoStack.length = 0;
    show(next);
    updateHistorySize();
  }

  /**
   * ハンドルが自分のジェスチャーかを確かめるのは、別のジェスチャーや編集が割り込んだ後に
   * 古いハンドルを呼んでも履歴を壊さないため
   */
  function beginGesture(): Gesture {
    finishGesture();
    if (!isEditable) return { preview() {}, end() {}, cancel() {} };
    const state = { base: present };
    activeGesture = state;
    return {
      preview(next) {
        if (activeGesture === state) show(next);
      },
      end() {
        if (activeGesture === state) finishGesture();
      },
      cancel() {
        if (activeGesture !== state) return;
        activeGesture = undefined;
        show(state.base);
      },
    };
  }

  function finishGesture() {
    const state = activeGesture;
    activeGesture = undefined;
    if (!state || state.base === present) return;
    pushUndo(state.base);
    redoStack.length = 0;
    coalesce = undefined;
    updateHistorySize();
  }

  function pushUndo(diagram: Diagram) {
    undoStack.push(diagram);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  }

  function undo() {
    finishGesture();
    if (!isEditable) return;
    const previous = undoStack.pop();
    if (!previous) return;
    redoStack.push(present);
    coalesce = undefined;
    show(previous);
    updateHistorySize();
    dropStaleSelection(previous);
    keepFocusInCanvas();
  }

  function redo() {
    finishGesture();
    if (!isEditable) return;
    const next = redoStack.pop();
    if (!next) return;
    pushUndo(present);
    coalesce = undefined;
    show(next);
    updateHistorySize();
    dropStaleSelection(next);
    keepFocusInCanvas();
  }

  function dropStaleSelection(target: Diagram) {
    const selected = selection();
    if (!selected) return;
    const collection = { variable: target.variables, link: target.links, loop: target.loops }[
      selected.kind
    ];
    if (!collection.some((item) => item.id === selected.id)) setSelection(null);
  }

  function notify(next: Notice) {
    // 案内で上書きしないのは、操作を求めるエラーをすぐ消える案内で押し流さないため
    const shown = currentNotice;
    if (next.tone === "info" && shown?.tone === "error" && shown.actions?.length) return;
    currentNotice = next;
    clearTimeout(noticeTimer);
    setNotice(next);
    if (next.tone === "info") noticeTimer = setTimeout(() => dismissNotice(), NOTICE_MS);
  }

  /** only を渡すのは、閉じるまでに別の通知へ替わっていたら、それを閉じないため */
  function dismissNotice(only?: Notice) {
    if (only !== undefined && currentNotice !== only) return;
    clearTimeout(noticeTimer);
    currentNotice = null;
    setNotice(null);
  }

  function select(next: Selection | null) {
    setSelection(next);
    if (next) setFocusedLoop(null);
  }

  function addVariableAt(position: Point) {
    if (!isEditable) return undefined;
    const result = edit.addVariable(present, { label: "", position });
    commit(result.diagram);
    select({ kind: "variable", id: result.id });
    setEditingVariable(result.id);
    return result.id;
  }

  function connect(from: VariableId, to: VariableId) {
    if (!isEditable) return;
    const result = edit.addLink(present, { from, to });
    if (result.ok) {
      commit(result.diagram);
      select({ kind: "link", id: result.id });
      return;
    }
    if (result.reason === "duplicate" && result.existing) {
      select({ kind: "link", id: result.existing });
      notify({ tone: "info", title: "同じ向きの関連は既にあります" });
    }
  }

  function connectToNewVariable(from: VariableId, position: Point) {
    if (!isEditable) return;
    const added = edit.addVariable(present, { label: "", position });
    const linked = edit.addLink(added.diagram, { from, to: added.id });
    if (!linked.ok) return;
    commit(linked.diagram);
    select({ kind: "variable", id: added.id });
    setEditingVariable(added.id);
  }

  function deleteSelection() {
    if (!isEditable) return;
    const selected = selection();
    if (!selected) return;
    if (selected.kind === "variable") commit(edit.removeVariable(present, selected.id));
    if (selected.kind === "link") commit(edit.removeLinks(present, new Set([selected.id])));
    if (selected.kind === "loop") commit(edit.removeLoop(present, selected.id));
    setSelection(null);
    keepFocusInCanvas();
  }

  function featureLoop(links: LinkId[]) {
    if (!isEditable) return;
    const result = edit.featureLoop(present, links);
    commit(result.diagram);
    select({ kind: "loop", id: result.id });
  }

  function unfeatureLoop(id: LoopId) {
    if (!isEditable) return;
    const loop = present.loops.find((item) => item.id === id);
    commit(edit.removeLoop(present, id));
    if (selection()?.id === id) setSelection(null);
    if (loop) setFocusedLoop(cycleKey(loop.links));
  }

  /**
   * replaceDiagram を使わないのは、表示位置や選択をできるだけ残すため。
   * 読み取り専用でも止めないのは、外部の変更は表示に反映するため
   */
  function applyExternal(next: Diagram) {
    finishGesture();
    if (next === present) return;
    pushUndo(present);
    redoStack.length = 0;
    coalesce = undefined;
    show(next);
    updateHistorySize();
    dropStaleSelection(next);
    if (editingVariable() && !next.variables.some((item) => item.id === editingVariable())) {
      setEditingVariableSignal(null);
    }
  }

  function setEditingVariable(id: VariableId | null) {
    if (id !== null && !isEditable) return;
    setEditingVariableSignal(id);
  }

  function replaceDiagram(next: Diagram) {
    if (!isEditable) return;
    commit(next);
    setSelection(null);
    setFocusedLoop(null);
    setEditingVariable(null);
    fitView(next);
  }

  async function importFile(file: File) {
    if (!isEditable) return;
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      notify({
        tone: "error",
        title: `${file.name} を読み込めませんでした`,
        details: [
          "ファイルを開けませんでした。フォルダや、移動・削除されたファイルは読み込めません",
          String(error),
        ],
      });
      return;
    }
    const result = parseDiagramJson(text);
    if (!result.ok) {
      notify({
        tone: "error",
        title: `${file.name} を読み込めませんでした`,
        details: result.errors.map((error) =>
          error.path ? `${error.path}: ${error.message}` : error.message,
        ),
      });
      return;
    }
    replaceDiagram(result.diagram);
    notify({ tone: "info", title: `${file.name} を読み込みました` });
  }

  function exportFile() {
    downloadDiagram(present);
  }

  function autoLayout() {
    if (!isEditable) return;
    const next = layoutDiagram(present, new Map([...boxes()].map(([id, box]) => [id, box.size])));
    commit(next);
    fitView(next);
  }

  function newDiagram() {
    replaceDiagram(createEmptyDiagram());
  }

  function setViewportSize(size: Size) {
    currentSize = size;
  }

  function screenToWorld(point: Point): Point {
    const { x, y, zoom } = viewport();
    return { x: (point.x - x) / zoom, y: (point.y - y) / zoom };
  }

  function zoomAt(screenPoint: Point, factor: number) {
    setViewport((current) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
      const ratio = zoom / current.zoom;
      return {
        zoom,
        x: screenPoint.x - (screenPoint.x - current.x) * ratio,
        y: screenPoint.y - (screenPoint.y - current.y) * ratio,
      };
    });
  }

  function zoomBy(factor: number) {
    const size = currentSize;
    zoomAt({ x: size.width / 2, y: size.height / 2 }, factor);
  }

  function panBy(dx: number, dy: number) {
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function fitView(target: Diagram = present) {
    const size = currentSize;
    if (size.width === 0 || size.height === 0) return;
    const bounds = boundsOf([...computeBoxes(target.variables).values()]);
    if (!bounds) {
      setViewport({ x: size.width / 2, y: size.height / 2, zoom: 1 });
      return;
    }
    const margin = Math.min(96, Math.min(size.width, size.height) * 0.08);
    const zoom = Math.min(
      1.25,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (size.width - margin * 2) / Math.max(1, bounds.maxX - bounds.minX),
          (size.height - margin * 2) / Math.max(1, bounds.maxY - bounds.minY),
        ),
      ),
    );
    setViewport({
      zoom,
      x: size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
      y: size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
    });
  }

  function centerOn(point: Point) {
    const size = currentSize;
    setViewport((current) => ({
      ...current,
      x: size.width / 2 - point.x * current.zoom,
      y: size.height / 2 - point.y * current.zoom,
    }));
  }

  function viewCenter(): Point {
    const size = currentSize;
    return screenToWorld({ x: size.width / 2, y: size.height / 2 });
  }

  return {
    diagram,
    /** diagram() と違い、イベントハンドラ内でも直前の編集を反映している */
    current: () => present,
    variableById,
    linkById,
    hasReverse,
    boxes,
    detection,
    loopEntries,
    loopEntryByLoopId,
    highlightedLoop,
    emphasis,
    historySize,
    editable,
    selection,
    editingVariable,
    hoveredLoop,
    focusedLoop,
    viewport,
    notice,

    commit,
    applyExternal,
    beginGesture,
    undo,
    redo,
    select,
    setEditingVariable,
    setHoveredLoop,
    setFocusedLoop,
    setViewportSize,
    dismissNotice,
    notify,
    addVariableAt,
    connect,
    connectToNewVariable,
    deleteSelection,
    featureLoop,
    unfeatureLoop,
    replaceDiagram,
    importFile,
    exportFile,
    newDiagram,
    autoLayout,
    screenToWorld,
    zoomAt,
    zoomBy,
    panBy,
    fitView,
    centerOn,
    viewCenter,
  };
}

export type Editor = ReturnType<typeof createEditor>;

export const EditorContext = createContext<Editor>();
