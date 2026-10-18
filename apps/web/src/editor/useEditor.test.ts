import * as edit from "@loopcraft/core/edit";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { LinkId, LoopId, VariableId } from "@loopcraft/core/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { setupEditor } from "../testing/editor.ts";
import { computeBoxes } from "./boxes.ts";
import { MAX_ZOOM, MIN_ZOOM } from "./viewport.ts";

const vid = (id: string) => id as VariableId;
const lid = (id: string) => id as LinkId;
const pid = (id: string) => id as LoopId;

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

function setup(...args: Parameters<typeof setupEditor>) {
  const result = setupEditor(...args);
  cleanup = result.dispose;
  return result.editor;
}

describe("履歴", () => {
  it("編集を取り消し、やり直す", () => {
    const editor = setup();
    const before = editor.diagram.value;
    editor.commit(edit.setTitle(before, "A"));
    editor.commit(edit.setTitle(editor.diagram.value, "B"));
    expect(editor.diagram.value.title).toBe("B");
    expect(editor.historySize.value).toEqual({ undo: 2, redo: 0 });
    editor.undo();
    editor.undo();
    editor.undo();
    expect(editor.diagram.value).toBe(before);
    editor.redo();
    editor.redo();
    editor.redo();
    expect(editor.diagram.value.title).toBe("B");
  });

  it("同じ項目への連続した入力は 1 回の編集にまとめる", () => {
    vi.useFakeTimers();
    const editor = setup();
    editor.commit(edit.setTitle(editor.diagram.value, "a"), "title");
    editor.commit(edit.setTitle(editor.diagram.value, "ab"), "title");
    expect(editor.historySize.value.undo).toBe(1);
    vi.advanceTimersByTime(2000);
    editor.commit(edit.setTitle(editor.diagram.value, "abc"), "title");
    expect(editor.historySize.value.undo).toBe(2);
    editor.commit(editor.diagram.value);
    expect(editor.historySize.value.undo).toBe(2);
  });

  it("ジェスチャーは終わったときに 1 回の編集になり、取り消せば元に戻る", () => {
    const editor = setup();
    const before = editor.diagram.value;
    const gesture = editor.beginGesture();
    gesture.preview(edit.setTitle(editor.diagram.value, "途中"));
    gesture.preview(edit.setTitle(editor.diagram.value, "最後"));
    gesture.end();
    expect(editor.diagram.value.title).toBe("最後");
    expect(editor.historySize.value.undo).toBe(1);

    const cancelled = editor.beginGesture();
    cancelled.preview(edit.setTitle(editor.diagram.value, "捨てる"));
    cancelled.cancel();
    expect(editor.diagram.value.title).toBe("最後");
    expect(editor.historySize.value.undo).toBe(1);

    editor.undo();
    expect(editor.diagram.value).toBe(before);
  });

  it("割り込まれたジェスチャーの古いハンドルは何もしない", () => {
    const editor = setup();
    const first = editor.beginGesture();
    first.preview(edit.setTitle(editor.diagram.value, "1"));
    const second = editor.beginGesture();
    first.preview(edit.setTitle(editor.diagram.value, "古い"));
    first.cancel();
    first.end();
    second.end();
    expect(editor.diagram.value.title).toBe("1");
    expect(editor.historySize.value.undo).toBe(1);
  });

  it("変化の無いジェスチャーは履歴に残さない", () => {
    const editor = setup();
    editor.beginGesture().end();
    expect(editor.historySize.value.undo).toBe(0);
  });

  it("取り消しで消えた要素の選択を外す", () => {
    const editor = setup();
    editor.addVariableAt({ x: 0, y: 0 });
    expect(editor.selection.value?.kind).toBe("variable");
    editor.undo();
    expect(editor.selection.value).toBeNull();
    editor.select({ kind: "link", id: lid("l_sales") });
    editor.redo();
    expect(editor.selection.value).toEqual({ kind: "link", id: "l_sales" });
  });

  it("履歴は上限を超えたら古いものから捨てる", () => {
    const editor = setup();
    for (let index = 0; index < 205; index++)
      editor.commit(edit.setTitle(editor.diagram.value, String(index)));
    expect(editor.historySize.value.undo).toBe(200);
  });
});

describe("読み取り専用", () => {
  it("編集の操作はすべて何もしない", async () => {
    const editor = setup(createSampleDiagram(), false);
    const before = editor.diagram.value;
    editor.commit(edit.setTitle(before, "x"));
    editor.beginGesture().preview(edit.setTitle(before, "y"));
    expect(editor.addVariableAt({ x: 0, y: 0 })).toBeUndefined();
    editor.connect(vid("staff"), vid("profit"));
    editor.select({ kind: "variable", id: vid("staff") });
    editor.deleteSelection();
    editor.featureLoop([lid("l_sales")]);
    editor.unfeatureLoop(pid("p_growth"));
    editor.replaceDiagram(createEmptyDiagram());
    editor.newDiagram();
    await editor.importFile(new File(["{}"], "x.json"));
    editor.setEditingVariable(vid("staff"));
    editor.undo();
    editor.redo();
    expect(editor.diagram.value).toBe(before);
    expect(editor.editingVariable.value).toBeNull();
    expect(editor.editable).toBe(false);
  });

  it("外部の変更を取り込み、消えた要素の選択と入力を外す", () => {
    const editor = setup(createSampleDiagram(), true);
    editor.select({ kind: "variable", id: vid("staff") });
    editor.setEditingVariable(vid("staff"));
    const next = edit.removeVariable(editor.diagram.value, vid("staff"));
    editor.applyExternal(next);
    editor.applyExternal(next);
    expect(editor.diagram.value).toBe(next);
    expect(editor.selection.value).toBeNull();
    expect(editor.editingVariable.value).toBeNull();
    expect(editor.historySize.value.undo).toBe(1);
    const kept = edit.setTitle(next, "残す");
    editor.select({ kind: "variable", id: vid("sales") });
    editor.setEditingVariable(vid("sales"));
    editor.applyExternal(kept);
    expect(editor.editingVariable.value).toBe("sales");
  });
});

describe("編集の操作", () => {
  it("変数を足して名前の入力を始める", () => {
    const editor = setup();
    const id = editor.addVariableAt({ x: 1, y: 2 })!;
    expect(editor.editingVariable.value).toBe(id);
    expect(editor.variableById.value.get(id)?.position).toEqual({ x: 1, y: 2 });
  });

  it("関連を作り、重複なら既存を選んで知らせる", () => {
    const editor = setup();
    editor.connect(vid("profit"), vid("staff"));
    expect(editor.selection.value?.kind).toBe("link");
    editor.connect(vid("staff"), vid("sales"));
    expect(editor.selection.value).toEqual({ kind: "link", id: "l_sales" });
    expect(editor.notice.value?.title).toBe("同じ向きの関連は既にあります");
    editor.connect(vid("staff"), vid("staff"));
    expect(editor.selection.value).toEqual({ kind: "link", id: "l_sales" });
  });

  it("選んでいるものを消す", () => {
    const editor = setup();
    editor.deleteSelection();
    for (const selection of [
      { kind: "variable", id: vid("training") },
      { kind: "link", id: lid("l_demand") },
      { kind: "loop", id: pid("p_burnout") },
    ] as const) {
      editor.select(selection);
      editor.deleteSelection();
    }
    expect(editor.variableById.value.has(vid("training"))).toBe(false);
    expect(editor.linkById.value.has(lid("l_demand"))).toBe(false);
    expect(editor.diagram.value.loops.map((loop) => loop.id)).toEqual(["p_growth"]);
    expect(editor.selection.value).toBeNull();
  });

  it("ループに注目し、外すと強調表示に残す", () => {
    const editor = setup();
    const unfeatured = editor.loopEntries.value.find((entry) => !entry.featured)!;
    editor.featureLoop(unfeatured.links);
    expect(editor.selection.value?.kind).toBe("loop");
    const id = editor.selection.value!.id as LoopId;
    expect(editor.loopEntryByLoopId.value.get(id)?.featured?.badge).toBe("B2");
    editor.unfeatureLoop(id);
    expect(editor.selection.value).toBeNull();
    expect(editor.focusedLoop.value).toBe(unfeatured.key);
    editor.unfeatureLoop(pid("ghost"));
    editor.select({ kind: "variable", id: vid("staff") });
    expect(editor.focusedLoop.value).toBeNull();
  });

  it("強調するループは、ホバー、選んだ注目ループ、一覧で選んだものの順", () => {
    const editor = setup();
    expect(editor.highlightedLoop.value).toBeUndefined();
    const [first, second, , fourth] = editor.loopEntries.value;
    editor.setFocusedLoop(fourth!.key);
    expect(editor.highlightedLoop.value?.key).toBe(fourth!.key);
    editor.select({ kind: "loop", id: second!.featured!.loop.id });
    expect(editor.highlightedLoop.value?.key).toBe(second!.key);
    editor.setHoveredLoop(first!.key);
    expect(editor.highlightedLoop.value?.links.has(lid("l_sales"))).toBe(true);
    editor.setHoveredLoop("unknown");
    expect(editor.highlightedLoop.value).toBeUndefined();
  });

  it("図を差し替え、新規にする", () => {
    const editor = setup();
    editor.setViewportSize({ width: 800, height: 600 });
    editor.select({ kind: "variable", id: vid("staff") });
    editor.newDiagram();
    expect(editor.diagram.value.variables).toEqual([]);
    expect(editor.selection.value).toBeNull();
    expect(editor.viewport.value).toEqual({ x: 400, y: 300, zoom: 1 });
  });
});

describe("ファイル", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
  });

  it("JSON を読み込み、壊れていれば場所つきで知らせる", async () => {
    const editor = setup(createEmptyDiagram());
    await editor.importFile(
      new File([JSON.stringify(createSampleDiagram())], "sample.json", {
        type: "application/json",
      }),
    );
    expect(editor.diagram.value.variables.length).toBeGreaterThan(0);
    expect(editor.notice.value).toMatchObject({
      tone: "info",
      title: "sample.json を読み込みました",
    });

    await editor.importFile(new File(["{"], "broken.json"));
    expect(editor.notice.value).toMatchObject({
      tone: "error",
      title: "broken.json を読み込めませんでした",
    });

    await editor.importFile(
      new File(
        [
          JSON.stringify({
            ...createEmptyDiagram(),
            links: [{ id: "l", from: "a", to: "b", polarity: "+" }],
          }),
        ],
        "dangling.json",
      ),
    );
    expect(editor.notice.value?.details?.[0]).toMatch(/^links\.0\.from: /);
  });

  it("読めないファイルを知らせる", async () => {
    const editor = setup();
    const file = new File([""], "folder");
    file.text = () => Promise.reject(new Error("NotReadableError"));
    await editor.importFile(file);
    expect(editor.notice.value?.details?.[1]).toContain("NotReadableError");
  });

  it("書き出す", () => {
    const editor = setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    editor.exportFile();
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});

describe("通知", () => {
  it("操作を求めるエラーは案内で押し流さない", () => {
    const editor = setup();
    editor.notify({ tone: "error", title: "要対応", actions: [{ label: "直す", run: () => {} }] });
    editor.notify({ tone: "info", title: "案内" });
    expect(editor.notice.value?.title).toBe("要対応");
    editor.notify({ tone: "error", title: "別のエラー" });
    expect(editor.notice.value?.title).toBe("別のエラー");
    editor.dismissNotice();
    expect(editor.notice.value).toBeNull();
  });
});

describe("表示範囲", () => {
  it("画面と図の座標を変換し、拡大縮小と移動をする", () => {
    const editor = setup();
    editor.setViewportSize({ width: 1000, height: 800 });
    editor.panBy(100, 50);
    expect(editor.screenToWorld({ x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    editor.zoomAt({ x: 100, y: 50 }, 2);
    expect(editor.viewport.value).toEqual({ x: 100, y: 50, zoom: 2 });
    editor.zoomBy(100);
    expect(editor.viewport.value.zoom).toBe(MAX_ZOOM);
    editor.zoomBy(0.0001);
    expect(editor.viewport.value.zoom).toBe(MIN_ZOOM);
    expect(editor.viewCenter()).toEqual(editor.screenToWorld({ x: 500, y: 400 }));
  });

  it("図全体が収まるように合わせ、大きさが分からなければ何もしない", () => {
    const editor = setup();
    editor.fitView();
    expect(editor.viewport.value).toEqual({ x: 0, y: 0, zoom: 1 });
    editor.setViewportSize({ width: 1200, height: 900 });
    editor.fitView();
    const { zoom } = editor.viewport.value;
    expect(zoom).toBeGreaterThan(MIN_ZOOM);
    expect(zoom).toBeLessThanOrEqual(1.25);
  });

  it("変数の大きさはラベルの幅で決まり、名前が無ければ仮の名前で測る", () => {
    const boxes = computeBoxes([
      { id: vid("a"), label: "", position: { x: 0, y: 0 } },
      { id: vid("b"), label: "とても長い変数の名前", position: { x: 0, y: 0 } },
    ]);
    expect(boxes.get(vid("a"))!.size.width).toBeLessThan(boxes.get(vid("b"))!.size.width);
  });
});
