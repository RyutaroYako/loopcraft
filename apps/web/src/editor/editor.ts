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
import { clearMeasureCache, measureLabel } from "./measure.ts";

export type Selection =
  | { kind: "variable"; id: VariableId }
  | { kind: "link"; id: LinkId }
  | { kind: "loop"; id: LoopId };

export interface Gesture {
  /** 履歴に残さずに途中経過を表示する */
  preview(next: Diagram): void;
  /** 開始時からの変化を 1 回の編集として履歴に残す */
  end(): void;
  /** 開始時の図に戻し、履歴にも残さない */
  cancel(): void;
}

export interface Viewport {
  /** 画面上での原点の位置 */
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
/** 同じ項目への連続した文字入力を 1 回の編集として扱う間隔 */
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

/**
 * フォーカスしていた要素が消えた（削除・元に戻す）ときに、キーボード操作を続けられるよう
 * 描画が追いついた後でキャンバスへフォーカスを移す
 */
function keepFocusInCanvas() {
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) {
      document.querySelector<SVGSVGElement>(".canvas-svg")?.focus();
    }
  });
}

export function createEditor(initial: Diagram, options: { editable?: boolean } = {}) {
  // 直前の編集をすぐ次の編集に使えるよう、最新の図はシグナルとは別に持つ
  // （シグナルの読み取りは次のマイクロタスクまで更新されない）
  let present = initial;
  const [diagram, setDiagram] = createSignal(initial);

  const undoStack: Diagram[] = [];
  const redoStack: Diagram[] = [];
  const [historySize, setHistorySize] = createSignal({ undo: 0, redo: 0 });
  let coalesce: { key: string; at: number } | undefined;
  let activeGesture: { base: Diagram } | undefined;

  /** 閲覧モードでは false。編集の操作はすべて何もしない */
  let isEditable = options.editable ?? true;
  const [editable, setEditableSignal] = createSignal(isEditable);

  const [selection, setSelection] = createSignal<Selection | null>(null);
  const [editingVariable, setEditingVariableSignal] = createSignal<VariableId | null>(null);
  const [hoveredLoop, setHoveredLoop] = createSignal<string | null>(null);
  /** 見出していないループを一覧で選んだときの強調表示 */
  const [focusedLoop, setFocusedLoop] = createSignal<string | null>(null);
  const [viewport, setViewport] = createSignal<Viewport>({ x: 0, y: 0, zoom: 1 });
  /** キャンバスの表示領域の大きさ。描画には使わないのでシグナルにしない */
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
  /** 逆向きの関連があるかを引くための「原因→結果」の組 */
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

  /** 見出したループを先に、残りの検出されたループを後に並べる */
  const loopEntries = createMemo(() => listLoopEntries(loops(), links(), detection().loops));

  const loopEntryByLoopId = createMemo(
    () =>
      new Map(
        loopEntries().flatMap((entry) =>
          entry.featured ? [[entry.featured.loop.id, entry] as const] : [],
        ),
      ),
  );

  /** キャンバス上で強調するループ。一覧のホバー > 選択中の見出し > 一覧で選んだもの */
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

  function updateHistorySize() {
    setHistorySize({ undo: undoStack.length, redo: redoStack.length });
  }

  function show(next: Diagram) {
    present = next;
    setDiagram(next);
  }

  /** 履歴に残る編集。coalesceKey が直前と同じなら 1 回の編集にまとめる */
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
   * ドラッグや名前の入力のように途中経過を見せつつ、終わったときに 1 回の編集として残す。
   * 返したハンドルは自分のジェスチャーにしか効かないので、別のジェスチャーや編集が
   * 割り込んだ後に古いハンドルを呼んでも履歴は壊れない。
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

  /** 進行中のジェスチャーがあれば、そこまでを 1 回の編集として履歴に残す */
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
    // 操作を求めるエラーを、すぐ消える案内で押し流さない
    const shown = currentNotice;
    if (next.tone === "info" && shown?.tone === "error" && shown.actions?.length) return;
    currentNotice = next;
    clearTimeout(noticeTimer);
    setNotice(next);
    if (next.tone === "info") noticeTimer = setTimeout(() => dismissNotice(), NOTICE_MS);
  }

  /** notice を渡したときは、それがまだ表示されている場合だけ閉じる */
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

  /** 関連を引いた先に新しい出来事を作り、すぐ名前を入力できるようにする */
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
   * 保存先が外部で書き換えられたときに、その内容を取り込む。閲覧モードでも行い、
   * 表示位置や選択はできるだけそのままにする。取り消し履歴には 1 回の変更として残す
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

  function setEditable(value: boolean) {
    finishGesture();
    isEditable = value;
    setEditableSignal(value);
    if (!value) setEditingVariableSignal(null);
  }

  function setEditingVariable(id: VariableId | null) {
    if (id !== null && !isEditable) return;
    setEditingVariableSignal(id);
  }

  /** 図を丸ごと差し替える。元に戻せる */
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

  /** 出来事の配置を自動で整える。元に戻せる */
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

  /** 図全体が収まるように表示範囲を合わせる。target を省くと現在の図 */
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

  function viewCenter(): Point {
    const size = currentSize;
    return screenToWorld({ x: size.width / 2, y: size.height / 2 });
  }

  return {
    diagram,
    /** イベントハンドラ内で、直前の編集を反映した図を読む */
    current: () => present,
    variableById,
    linkById,
    hasReverse,
    boxes,
    detection,
    loopEntries,
    loopEntryByLoopId,
    highlightedLoop,
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
    setEditable,
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
    viewCenter,
  };
}

export type Editor = ReturnType<typeof createEditor>;

export const EditorContext = createContext<Editor>();
