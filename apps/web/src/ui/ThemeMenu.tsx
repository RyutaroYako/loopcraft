import type { JSX } from "@solidjs/web";
import { Show, createSignal } from "solid-js";
import type { Theme, ThemeChoice } from "../editor/theme.ts";
import { ContextMenu, MENU_WIDTH, type MenuState } from "./ContextMenu.tsx";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons.tsx";

export const THEME_OPTIONS: {
  choice: ThemeChoice;
  label: string;
  shortLabel: string;
  icon: () => JSX.Element;
}[] = [
  { choice: "system", label: "システムに合わせる", shortLabel: "システム", icon: MonitorIcon },
  { choice: "light", label: "ライト", shortLabel: "ライト", icon: SunIcon },
  { choice: "dark", label: "ダーク", shortLabel: "ダーク", icon: MoonIcon },
];

export function ThemeMenu(props: { theme: Theme; class?: string }) {
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  let button: HTMLButtonElement | undefined;
  const current = () => THEME_OPTIONS.find((option) => option.choice === props.theme.choice())!;
  const open = () => {
    const rect = button!.getBoundingClientRect();
    setMenu({
      x: rect.right - MENU_WIDTH,
      y: rect.bottom + 6,
      label: "テーマ",
      items: THEME_OPTIONS.map((option) => ({
        label: option.label,
        checked: option.choice === props.theme.choice(),
        run: () => props.theme.choose(option.choice),
      })),
    });
  };
  return (
    <>
      <button
        ref={(element) => (button = element)}
        type="button"
        class={["icon-button", props.class]}
        aria-label={`テーマ: ${current().label}`}
        aria-haspopup="menu"
        aria-expanded={menu() ? "true" : "false"}
        title="テーマを切り替える"
        onClick={() => (menu() ? setMenu(null) : open())}
      >
        {current().icon()}
      </button>
      <Show when={menu()}>
        {(state) => (
          // ボタンの隣に置かないのは、ContextMenu が親の大きさを基準に、はみ出さない位置へ寄せるため
          <div class="pointer-events-none fixed inset-0 z-30">
            <ContextMenu
              menu={state()}
              bounds={{ width: window.innerWidth, height: window.innerHeight }}
              anchor={button}
              onClose={(restoreFocus) => {
                setMenu(null);
                if (restoreFocus) button?.focus();
              }}
            />
          </div>
        )}
      </Show>
    </>
  );
}
