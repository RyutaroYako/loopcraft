import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("measureLabel", () => {
  it("canvas が使えなければ文字種から概算し、結果を覚える", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { measureLabel, clearMeasureCache } = await import("./measure.ts");
    expect(measureLabel("ab")).toBe(16);
    expect(measureLabel("社員")).toBe(28);
    expect(measureLabel("ab")).toBe(16);
    clearMeasureCache();
    expect(measureLabel("ab")).toBe(16);
  });

  it("canvas で測れるときはその幅を使い、書体を設定し直す", async () => {
    const context = { font: "", measureText: vi.fn(() => ({ width: 42 })) };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const { measureLabel, clearMeasureCache, LABEL_FONT } = await import("./measure.ts");
    expect(measureLabel("x")).toBe(42);
    expect(context.font).toBe(LABEL_FONT);
    context.font = "other";
    clearMeasureCache();
    expect(context.font).toBe(LABEL_FONT);
  });
});
