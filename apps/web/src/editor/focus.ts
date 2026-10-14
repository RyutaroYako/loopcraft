/**
 * フォーカスがどこにも無いか。消えた要素のフォーカスはふつう body に戻るが、環境によっては
 * null になったり、外れた要素を指したまま残ったりするので、どれも失ったとみなす
 */
export function isFocusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

/**
 * 押したボタンなどが描画から消えたときに、キーボード操作を続けられるようフォーカスを移す。
 * 描画を待ってから確かめ、その間にほかへ移ったフォーカスは奪わない
 */
export function refocusWhenLost(target: () => HTMLElement | SVGElement | null) {
  requestAnimationFrame(() => {
    if (isFocusLost()) target()?.focus();
  });
}
