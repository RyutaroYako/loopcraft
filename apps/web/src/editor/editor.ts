import { createContext, createMemo, createSignal } from "solid-js";
import { findLoops, type DetectedLoop } from "@loopcraft/core/cycles";
import * as edit from "@loopcraft/core/edit";
import { boundsOf, nodeSize, type Size } from "@loopcraft/core/geometry";
import { createEmptyDiagram, parseDiagramJson } from "@loopcraft/core/io";
import { classifyLoop, cycleKey, type LoopKind } from "@loopcraft/core/loop";
import type {
  Diagram,
  Link,
  LinkId,
  Loop,
  LoopId,
  Point,
  Variable,
  VariableId,
} from "@loopcraft/core/schema";
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

/** ループ一覧の 1 行。検出されたループと、それを見出した Loop の対応 */
export interface LoopEntry {
  key: string;
  links: LinkId[];
  variables: VariableId[];
  kind: LoopKind;
  /** 見出したループなら、その Loop と R1 / B2 のような番号 */
  featured?: { loop: Loop; badge: string };
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

export function variablesOfLoop(links: readonly LinkId[], linkById: ReadonlyMap<LinkId, Link>) {
  return links.flatMap((id) => {
    const link = linkById.get(id);
    return link ? [link.from] : [];
  });
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

export function createEditor(initial: Diagram) {
  // 直前の編集をすぐ次の編集に使えるよう、最新の図はシグナルとは別に持つ
  // （シグナルの読み取りは次のマイクロタスクまで更新されない）
  let present = initial;
  const [diagram, setDiagram] = createSignal(initial);

  const undoStack: Diagram[] = [];
  const redoStack: Diagram[] = [];
  const [historySize, setHistorySize] = createSignal({ undo: 0, redo: 0 });
  let coalesce: { key: string; at: number } | undefined;
  let activeGesture: { base: Diagram } | undefined;

  const [selection, setSelection] = createSignal<Selection | null>(null);
  const [editingVariable, setEditingVariable] = createSignal<VariableId | null>(null);
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
  const boxes = createMemo(() => {
    fontsVersion();
    return computeBoxes(diagram().variables);
  });
  const detection = createMemo(() => findLoops(links()));

  const featuredLoops = createMemo(() => {
    const counters: Record<LoopKind, number> = { reinforcing: 0, balancing: 0 };
    const byLink = linkById();
    return loops().map((loop) => {
      const kind = classifyLoop(loop.links.map((id) => byLink.get(id)?.polarity ?? "+"));
      counters[kind]++;
      const badge = `${kind === "reinforcing" ? "R" : "B"}${counters[kind]}`;
      return { loop, kind, badge, key: cycleKey(loop.links) };
    });
  });

  /** 見出したループを先に、残りの検出されたループを後に並べる */
  const loopEntries = createMemo((): LoopEntry[] => {
    const byLink = linkById();
    const featured = featuredLoops();
    const featuredKeys = new Set(featured.map((item) => item.key));
    return [
      ...featured.map(({ loop, kind, badge, key }) => ({
        key,
        links: loop.links,
        variables: variablesOfLoop(loop.links, byLink),
        kind,
        featured: { loop, badge },
      })),
      ...detection()
        .loops.filter((loop: DetectedLoop) => !featuredKeys.has(loop.key))
        .map(({ key, links, variables, kind }) => ({ key, links, variables, kind })),
    ];
  });

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
      (selected?.kind === "loop"
        ? featuredLoops().find((item) => item.loop.id === selected.id)?.key
        : undefined) ??
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
    if (next === present) return;
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

  function dismissNotice() {
    clearTimeout(noticeTimer);
    currentNotice = null;
    setNotice(null);
  }

  function select(next: Selection | null) {
    setSelection(next);
    if (next) setFocusedLoop(null);
  }

  function addVariableAt(position: Point) {
    const result = edit.addVariable(present, { label: "", position });
    commit(result.diagram);
    select({ kind: "variable", id: result.id });
    setEditingVariable(result.id);
    return result.id;
  }

  function connect(from: VariableId, to: VariableId) {
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
    const added = edit.addVariable(present, { label: "", position });
    const linked = edit.addLink(added.diagram, { from, to: added.id });
    if (!linked.ok) return;
    commit(linked.diagram);
    select({ kind: "variable", id: added.id });
    setEditingVariable(added.id);
  }

  function deleteSelection() {
    const selected = selection();
    if (!selected) return;
    if (selected.kind === "variable") commit(edit.removeVariable(present, selected.id));
    if (selected.kind === "link") commit(edit.removeLinks(present, new Set([selected.id])));
    if (selected.kind === "loop") commit(edit.removeLoop(present, selected.id));
    setSelection(null);
    keepFocusInCanvas();
  }

  function featureLoop(links: LinkId[]) {
    const result = edit.featureLoop(present, links);
    commit(result.diagram);
    select({ kind: "loop", id: result.id });
  }

  function unfeatureLoop(id: LoopId) {
    const loop = present.loops.find((item) => item.id === id);
    commit(edit.removeLoop(present, id));
    if (selection()?.id === id) setSelection(null);
    if (loop) setFocusedLoop(cycleKey(loop.links));
  }

  /** 図を丸ごと差し替える。元に戻せる */
  function replaceDiagram(next: Diagram) {
    commit(next);
    setSelection(null);
    setFocusedLoop(null);
    setEditingVariable(null);
    fitView(next);
  }

  async function importFile(file: File) {
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
    boxes,
    detection,
    loopEntries,
    loopEntryByLoopId,
    highlightedLoop,
    historySize,
    selection,
    editingVariable,
    hoveredLoop,
    focusedLoop,
    viewport,
    notice,

    commit,
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
