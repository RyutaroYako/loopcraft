import type { Ref } from "vue";
import { ref } from "vue";
import { createThemeController } from "./theme.ts";
import type { ThemeChoice } from "./theme.ts";

export type Theme = ReturnType<typeof useTheme>;

/** OS の設定の見張りをここで始めないのは、window に触るため。マウントした後に start() を呼ぶ */
export function useTheme() {
  const controller = createThemeController();
  const choice = ref<ThemeChoice>(controller.choice());

  function choose(next: ThemeChoice) {
    controller.choose(next);
    choice.value = next;
  }

  return { choice: choice as Readonly<Ref<ThemeChoice>>, choose, start: controller.start };
}
