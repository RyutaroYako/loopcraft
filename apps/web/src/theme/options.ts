import type { IconName } from "../primitives/icons.ts";
import type { ThemeChoice } from "./theme.ts";

export const THEME_OPTIONS: readonly {
  value: ThemeChoice;
  label: string;
  icon: IconName;
}[] = [
  { value: "system", label: "システムに合わせる", icon: "monitor" },
  { value: "light", label: "ライト", icon: "sun" },
  { value: "dark", label: "ダーク", icon: "moon" },
];
