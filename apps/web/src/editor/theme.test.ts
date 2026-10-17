import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createTheme, loadThemeChoice, THEME_STORAGE_KEY } from "./theme.ts";
import type { Theme } from "./theme.ts";

let systemDark = false;
const listeners = new Set<() => void>();
const disposers: (() => void)[] = [];

function setSystemDark(dark: boolean) {
  systemDark = dark;
  for (const listener of listeners) listener();
}

function mountTheme(): Theme {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return createTheme();
  });
}

beforeEach(() => {
  systemDark = false;
  // jsdom には matchMedia が無い
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  listeners.clear();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe("テーマ", () => {
  it("保存が無いか読めない値なら、システムに合わせる", () => {
    expect(loadThemeChoice()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(loadThemeChoice()).toBe("system");
  });

  it("選んだテーマで表示し、次に開いたときも使う", () => {
    mountTheme().choose("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    delete document.documentElement.dataset.theme;
    const reopened = mountTheme();
    expect(reopened.choice()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("システムに合わせるときは、OS の設定が変わると追従する", () => {
    mountTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    setSystemDark(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ライトかダークを選んでいるときは、OS の設定が変わっても変えない", () => {
    mountTheme().choose("light");
    setSystemDark(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("システムに戻すと、保存した選択を消して OS の設定に従う", () => {
    systemDark = true;
    const theme = mountTheme();
    theme.choose("light");
    theme.choose("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("閉じた後は OS の設定の変化を見張らない", () => {
    mountTheme();
    for (const dispose of disposers.splice(0)) dispose();
    expect(listeners.size).toBe(0);
  });
});
