import { For, onCleanup } from "solid-js";

export interface MenuItem {
  label: string;
  /** 同じ操作のキーボードショートカット。表示するだけ */
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}

export interface MenuState {
  /** キャンバスの左上からの位置 */
  x: number;
  y: number;
  /** 読み上げ用のメニュー名（例: 「売上」の操作） */
  label: string;
  items: MenuItem[];
}

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 34;

/**
 * 右クリックで開くメニュー。開くと最初の項目にフォーカスし、上下の矢印で移り、
 * Escape・Tab・外側のクリックで閉じる（WAI-ARIA のメニューの作法）
 */
export function ContextMenu(props: {
  menu: MenuState;
  bounds: { width: number; height: number };
  onClose: (restoreFocus: boolean) => void;
}) {
  let element: HTMLDivElement | undefined;
  // 端で開いても、はみ出さないよう内側へ寄せる
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
      class="context-menu"
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
        // Tab でも閉じて元の要素へ戻す。消えたボタンの位置から無関係な所へ移らないようにする
        else if (event.key === "Tab") props.onClose(true);
        // メニューを開いている間は、Delete や元に戻すなどのショートカットを図に届けない
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
            class={["context-menu-item", { danger: item.danger }]}
            disabled={item.disabled}
            aria-keyshortcuts={item.shortcut}
            // 指した項目にフォーカスを移し、マウスとキーボードの強調を 1 つにする
            onPointerMove={(event) => event.currentTarget.focus()}
            onClick={() => {
              // 先に元の要素へフォーカスを戻す。消える操作なら、消えた後で図がキャンバスへ戻す
              props.onClose(true);
              item.run();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd aria-hidden="true">{item.shortcut}</kbd>}
          </button>
        )}
      </For>
    </div>
  );
}
