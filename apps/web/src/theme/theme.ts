export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "loopcraft:theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const loadThemeChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
};

const saveThemeChoice = (choice: ThemeChoice) => {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // 知らせないのは、保存できなくても表示は切り替わり、困るのは次に開いたときに戻ることだけだから
  }
};

const resolveTheme = (choice: ThemeChoice): "light" | "dark" => {
  if (choice !== "system") return choice;
  return matchMedia(DARK_QUERY).matches ? "dark" : "light";
};

const applyTheme = (choice: ThemeChoice) => {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(choice);
  const surface = getComputedStyle(root).getPropertyValue("--color-surface").trim();
  // media 付きの theme-color を消さずに書き換えるのは、システムに戻したときに元の値へ戻せるようにするため
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.systemContent ??= meta.content;
    meta.content = choice === "system" || !surface ? meta.dataset.systemContent : surface;
  }
};

export const createThemeController = () => {
  let current = loadThemeChoice();
  const followSystem = () => {
    if (current === "system") applyTheme("system");
  };
  return {
    choice: () => current,
    choose: (next: ThemeChoice) => {
      current = next;
      saveThemeChoice(next);
      applyTheme(next);
    },
    start: () => {
      applyTheme(current);
      const media = matchMedia(DARK_QUERY);
      media.addEventListener("change", followSystem);
      return () => media.removeEventListener("change", followSystem);
    },
  };
};
