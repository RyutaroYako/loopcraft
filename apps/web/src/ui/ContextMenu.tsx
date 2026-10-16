import { For, onCleanup } from "solid-js";

export interface MenuItem {
  label: string;
  /** 表示するだけでキーを割り当てないのは、同じショートカットが App に既にあるため */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
}

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 34;

export function ContextMenu(props: {
  menu: MenuState;
  bounds: { width: number; height: number };
  onClose: (restoreFocus: boolean) => void;
}) {
  let element: HTMLDivElement | undefined;
  const left = () => Math.max(8, Math.min(props.menu.x, props.bounds.width - MENU_WIDTH - 8));
  const top = () =>
    Math.max(
      8,
      Math.min(props.menu.y, props.bounds.height - props.menu.items.length * ITEM_HEIGHT - 16),
    );
  const buttons = () => [...(element?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? [])];
  const move = (step: number) => {
    const list = buttons();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(index + step + list.length) % list.length]!.focus();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (element && !element.contains(event.target as Node)) props.onClose(false);
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  onCleanup(() => document.removeEventListener("pointerdown", onPointerDown, true));

  return (
    <div
      ref={(node) => {
        element = node;
        queueMicrotask(() => buttons()[0]?.focus());
      }}
      class="context-menu absolute z-20 grid rounded-md border border-line bg-surface p-1 shadow-float"
      role="menu"
      aria-label={props.menu.label}
      style={{ left: `${left()}px`, top: `${top()}px`, width: `${MENU_WIDTH}px` }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") move(1);
        else if (event.key === "ArrowUp") move(-1);
        else if (event.key === "Home") buttons()[0]?.focus();
        else if (event.key === "End") buttons().at(-1)?.focus();
        else if (event.key === "Escape") props.onClose(true);
        // Tab を既定の動きに任せないのは、消えたボタンの位置から無関係な所へ移るため
        else if (event.key === "Tab") props.onClose(true);
        // 伝播を止めないと、Delete や元に戻すが window のショートカットに届いて図が変わる
        event.stopPropagation();
        if (["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"].includes(event.key)) {
          event.preventDefault();
        }
      }}
    >
      <For each={props.menu.items}>
        {(item) => (
          <button
            type="button"
            role="menuitem"
            // hover を別に光らせないのは、指した項目へフォーカスを移すので 2 つ同時に光るため。
            // フォーカスを薄い背景だけにしないのは、白地との差が小さく、キーボードではどの項目が選ばれているか読めないため
            class={[
              "flex h-8 items-center justify-between gap-3 rounded-xs border-0 bg-transparent px-2.5 py-0 text-left text-base focus:bg-surface-2 focus:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-accent)]",
              item.danger ? "text-negative" : "text-ink disabled:text-faint",
            ]}
            disabled={item.disabled}
            aria-keyshortcuts={item.shortcut}
            // hover だけで光らせないのは、キーボードのフォーカスと 2 つ同時に光るため
            onPointerMove={(event) => event.currentTarget.focus()}
            onClick={() => {
              // run の後で戻さないのは、消える操作では戻し先が既に無いため
              props.onClose(true);
              item.run();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <kbd class="text-xs text-muted" aria-hidden="true">
                {item.shortcut}
              </kbd>
            )}
          </button>
        )}
      </For>
    </div>
  );
}
