import { createSignal, onCleanup, type Accessor } from "solid-js";

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "loopcraft:theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function loadThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function saveThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // 知らせないのは、保存できなくても表示は切り替わり、困るのは次に開いたときに戻ることだけだから
  }
}

function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(choice);
  const surface = getComputedStyle(root).getPropertyValue("--color-surface").trim();
  // media 付きの theme-color を消さずに書き換えるのは、システムに戻したときに元の値へ戻せるようにするため
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.systemContent ??= meta.content;
    meta.content = choice === "system" || !surface ? meta.dataset.systemContent : surface;
  }
}

export interface Theme {
  choice: Accessor<ThemeChoice>;
  choose: (choice: ThemeChoice) => void;
}

export function createTheme(): Theme {
  // シグナルとは別に持つのは、書き込んだ直後に読むと flush されるまで前の値が返るため
  let current = loadThemeChoice();
  const [choice, setChoice] = createSignal(current);
  applyTheme(current);
  const media = matchMedia(DARK_QUERY);
  const followSystem = () => {
    if (current === "system") applyTheme("system");
  };
  media.addEventListener("change", followSystem);
  onCleanup(() => media.removeEventListener("change", followSystem));
  return {
    choice,
    choose: (next) => {
      current = next;
      setChoice(next);
      saveThemeChoice(next);
      applyTheme(next);
    },
  };
}
