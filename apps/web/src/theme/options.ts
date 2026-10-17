import type { IconName } from "../primitives/icons.ts";
import type { ThemeChoice } from "./theme.ts";

export const THEME_OPTIONS: readonly {
  value: ThemeChoice;
  label: string;
  shortLabel: string;
  icon: IconName;
}[] = [
  { value: "system", label: "システムに合わせる", shortLabel: "システム", icon: "monitor" },
  { value: "light", label: "ライト", shortLabel: "ライト", icon: "sun" },
  { value: "dark", label: "ダーク", shortLabel: "ダーク", icon: "moon" },
];
