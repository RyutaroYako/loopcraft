/** ここで Enter を横取りしないのは、ボタンやリンクなどが自前で Enter を扱うため */
export const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("button, a, input, textarea, select, [contenteditable], [role=button]") !== null;

export const isTextInput = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
