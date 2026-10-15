import * as edit from "@loopcraft/core/edit";
import { createEmptyDiagram } from "@loopcraft/core/io";
import { createSampleDiagram } from "@loopcraft/core/sample";
import type { LinkId, LoopId, VariableId } from "@loopcraft/core/schema";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { setupEditor } from "../testing/editor.ts";
import { computeBoxes, MAX_ZOOM, MIN_ZOOM } from "./editor.ts";

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
    const before = editor.current();
    editor.commit(edit.setTitle(before, "A"));
    editor.commit(edit.setTitle(editor.current(), "B"));
    flush();
    expect(editor.diagram().title).toBe("B");
    expect(editor.historySize()).toEqual({ undo: 2, redo: 0 });
    editor.undo();
    editor.undo();
    editor.undo();
    flush();
    expect(editor.current()).toBe(before);
    editor.redo();
    editor.redo();
    editor.redo();
    flush();
    expect(editor.diagram().title).toBe("B");
  });

  it("同じ項目への連続した入力は 1 回の編集にまとめる", () => {
    vi.useFakeTimers();
    const editor = setup();
    editor.commit(edit.setTitle(editor.current(), "a"), "title");
    editor.commit(edit.setTitle(editor.current(), "ab"), "title");
    flush();
    expect(editor.historySize().undo).toBe(1);
    vi.advanceTimersByTime(2000);
    editor.commit(edit.setTitle(editor.current(), "abc"), "title");
    flush();
    expect(editor.historySize().undo).toBe(2);
    editor.commit(editor.current());
    flush();
    expect(editor.historySize().undo).toBe(2);
  });

  it("ジェスチャーは終わったときに 1 回の編集になり、取り消せば元に戻る", () => {
    const editor = setup();
    const before = editor.current();
    const gesture = editor.beginGesture();
    gesture.preview(edit.setTitle(editor.current(), "途中"));
    gesture.preview(edit.setTitle(editor.current(), "最後"));
    gesture.end();
    flush();
    expect(editor.diagram().title).toBe("最後");
    expect(editor.historySize().undo).toBe(1);

    const cancelled = editor.beginGesture();
    cancelled.preview(edit.setTitle(editor.current(), "捨てる"));
    cancelled.cancel();
    flush();
    expect(editor.diagram().title).toBe("最後");
    expect(editor.historySize().undo).toBe(1);

    editor.undo();
    flush();
    expect(editor.current()).toBe(before);
  });

  it("割り込まれたジェスチャーの古いハンドルは何もしない", () => {
    const editor = setup();
    const first = editor.beginGesture();
    first.preview(edit.setTitle(editor.current(), "1"));
    const second = editor.beginGesture();
    first.preview(edit.setTitle(editor.current(), "古い"));
    first.cancel();
    first.end();
    second.end();
    flush();
    expect(editor.diagram().title).toBe("1");
    expect(editor.historySize().undo).toBe(1);
  });

  it("変化の無いジェスチャーは履歴に残さない", () => {
    const editor = setup();
    editor.beginGesture().end();
    expect(editor.historySize().undo).toBe(0);
  });

  it("取り消しで消えた要素の選択を外す", () => {
    const editor = setup();
    editor.addVariableAt({ x: 0, y: 0 });
    flush();
    expect(editor.selection()?.kind).toBe("variable");
    editor.undo();
    flush();
    expect(editor.selection()).toBeNull();
    editor.select({ kind: "link", id: lid("l_sales") });
    editor.redo();
    flush();
    expect(editor.selection()).toEqual({ kind: "link", id: "l_sales" });
  });

  it("履歴は上限を超えたら古いものから捨てる", () => {
    const editor = setup();
    for (let index = 0; index < 205; index++)
      editor.commit(edit.setTitle(editor.current(), String(index)));
    flush();
    expect(editor.historySize().undo).toBe(200);
  });
});

describe("読み取り専用", () => {
  it("編集の操作はすべて何もしない", async () => {
    const editor = setup(createSampleDiagram(), false);
    const before = editor.current();
    editor.commit(edit.setTitle(before, "x"));
    editor.beginGesture().preview(edit.setTitle(before, "y"));
    expect(editor.addVariableAt({ x: 0, y: 0 })).toBeUndefined();
    editor.connect(vid("staff"), vid("profit"));
    editor.connectToNewVariable(vid("staff"), { x: 0, y: 0 });
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
    flush();
    expect(editor.current()).toBe(before);
    expect(editor.editingVariable()).toBeNull();
    expect(editor.editable()).toBe(false);
  });

  it("外部の変更を取り込み、消えた要素の選択と入力を外す", () => {
    const editor = setup(createSampleDiagram(), true);
    editor.select({ kind: "variable", id: vid("staff") });
    editor.setEditingVariable(vid("staff"));
    flush();
    const next = edit.removeVariable(editor.current(), vid("staff"));
    editor.applyExternal(next);
    editor.applyExternal(next);
    flush();
    expect(editor.current()).toBe(next);
    expect(editor.selection()).toBeNull();
    expect(editor.editingVariable()).toBeNull();
    expect(editor.historySize().undo).toBe(1);
    const kept = edit.setTitle(next, "残す");
    editor.select({ kind: "variable", id: vid("sales") });
    editor.setEditingVariable(vid("sales"));
    flush();
    editor.applyExternal(kept);
    flush();
    expect(editor.editingVariable()).toBe("sales");
  });
});

describe("編集の操作", () => {
  it("変数を足して名前の入力を始める", () => {
    const editor = setup();
    const id = editor.addVariableAt({ x: 1, y: 2 })!;
    flush();
    expect(editor.editingVariable()).toBe(id);
    expect(editor.variableById().get(id)?.position).toEqual({ x: 1, y: 2 });
  });

  it("関連を作り、重複なら既存を選んで知らせる", () => {
    const editor = setup();
    editor.connect(vid("profit"), vid("staff"));
    flush();
    expect(editor.selection()?.kind).toBe("link");
    editor.connect(vid("staff"), vid("sales"));
    flush();
    expect(editor.selection()).toEqual({ kind: "link", id: "l_sales" });
    expect(editor.notice()?.title).toBe("同じ向きの関連は既にあります");
    editor.connect(vid("staff"), vid("staff"));
    flush();
    expect(editor.selection()).toEqual({ kind: "link", id: "l_sales" });
  });

  it("関連を引いた先に新しい変数を作る", () => {
    const editor = setup();
    editor.connectToNewVariable(vid("staff"), { x: 9, y: 9 });
    flush();
    const added = editor.diagram().variables.at(-1)!;
    expect(editor.editingVariable()).toBe(added.id);
    expect(editor.diagram().links.at(-1)).toMatchObject({ from: "staff", to: added.id });
    editor.connectToNewVariable(vid("ghost"), { x: 0, y: 0 });
    flush();
    expect(editor.diagram().variables.at(-1)).toBe(added);
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
      flush();
      editor.deleteSelection();
      flush();
    }
    expect(editor.variableById().has(vid("training"))).toBe(false);
    expect(editor.linkById().has(lid("l_demand"))).toBe(false);
    expect(editor.diagram().loops.map((loop) => loop.id)).toEqual(["p_growth"]);
    expect(editor.selection()).toBeNull();
  });

  it("ループを見出し、外すと強調表示に残す", () => {
    const editor = setup();
    const unfeatured = editor.loopEntries().find((entry) => !entry.featured)!;
    editor.featureLoop(unfeatured.links);
    flush();
    expect(editor.selection()?.kind).toBe("loop");
    const id = editor.selection()!.id as LoopId;
    expect(editor.loopEntryByLoopId().get(id)?.featured?.badge).toBe("B2");
    editor.unfeatureLoop(id);
    flush();
    expect(editor.selection()).toBeNull();
    expect(editor.focusedLoop()).toBe(unfeatured.key);
    editor.unfeatureLoop(pid("ghost"));
    editor.select({ kind: "variable", id: vid("staff") });
    flush();
    expect(editor.focusedLoop()).toBeNull();
  });

  it("強調するループは、ホバー、選んだ見出し、一覧で選んだものの順", () => {
    const editor = setup();
    expect(editor.highlightedLoop()).toBeUndefined();
    const [first, second, , fourth] = editor.loopEntries();
    editor.setFocusedLoop(fourth!.key);
    flush();
    expect(editor.highlightedLoop()?.key).toBe(fourth!.key);
    editor.select({ kind: "loop", id: second!.featured!.loop.id });
    flush();
    expect(editor.highlightedLoop()?.key).toBe(second!.key);
    editor.setHoveredLoop(first!.key);
    flush();
    expect(editor.highlightedLoop()?.links.has(lid("l_sales"))).toBe(true);
    editor.setHoveredLoop("unknown");
    flush();
    expect(editor.highlightedLoop()).toBeUndefined();
  });

  it("図を差し替え、新規にする", () => {
    const editor = setup();
    editor.setViewportSize({ width: 800, height: 600 });
    editor.select({ kind: "variable", id: vid("staff") });
    editor.newDiagram();
    flush();
    expect(editor.diagram().variables).toEqual([]);
    expect(editor.selection()).toBeNull();
    expect(editor.viewport()).toEqual({ x: 400, y: 300, zoom: 1 });
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
    flush();
    expect(editor.diagram().variables.length).toBeGreaterThan(0);
    expect(editor.notice()).toMatchObject({ tone: "info", title: "sample.json を読み込みました" });

    await editor.importFile(new File(["{"], "broken.json"));
    flush();
    expect(editor.notice()).toMatchObject({
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
    flush();
    expect(editor.notice()?.details?.[0]).toMatch(/^links\.0\.from: /);
  });

  it("読めないファイルを知らせる", async () => {
    const editor = setup();
    const file = new File([""], "folder");
    file.text = () => Promise.reject(new Error("NotReadableError"));
    await editor.importFile(file);
    flush();
    expect(editor.notice()?.details?.[1]).toContain("NotReadableError");
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
  it("案内は時間で消え、操作を求めるエラーは案内で押し流さない", () => {
    vi.useFakeTimers();
    const editor = setup();
    editor.notify({ tone: "info", title: "案内" });
    flush();
    expect(editor.notice()?.title).toBe("案内");
    vi.advanceTimersByTime(4000);
    flush();
    expect(editor.notice()).toBeNull();
    editor.notify({ tone: "error", title: "要対応", actions: [{ label: "直す", run: () => {} }] });
    editor.notify({ tone: "info", title: "案内" });
    flush();
    expect(editor.notice()?.title).toBe("要対応");
    editor.notify({ tone: "error", title: "別のエラー" });
    flush();
    expect(editor.notice()?.title).toBe("別のエラー");
    editor.dismissNotice();
    flush();
    expect(editor.notice()).toBeNull();
  });
});

describe("表示範囲", () => {
  it("画面と図の座標を変換し、拡大縮小と移動をする", () => {
    const editor = setup();
    editor.setViewportSize({ width: 1000, height: 800 });
    editor.panBy(100, 50);
    flush();
    expect(editor.screenToWorld({ x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    editor.zoomAt({ x: 100, y: 50 }, 2);
    flush();
    expect(editor.viewport()).toEqual({ x: 100, y: 50, zoom: 2 });
    editor.zoomBy(100);
    flush();
    expect(editor.viewport().zoom).toBe(MAX_ZOOM);
    editor.zoomBy(0.0001);
    flush();
    expect(editor.viewport().zoom).toBe(MIN_ZOOM);
    expect(editor.viewCenter()).toEqual(editor.screenToWorld({ x: 500, y: 400 }));
  });

  it("図全体が収まるように合わせ、大きさが分からなければ何もしない", () => {
    const editor = setup();
    editor.fitView();
    flush();
    expect(editor.viewport()).toEqual({ x: 0, y: 0, zoom: 1 });
    editor.setViewportSize({ width: 1200, height: 900 });
    editor.fitView();
    flush();
    const { zoom } = editor.viewport();
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
