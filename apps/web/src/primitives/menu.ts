export interface MenuItem {
  label: string;
  checked?: boolean;
  run: () => void;
}

export const MENU_WIDTH = 220;
