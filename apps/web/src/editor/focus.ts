/**
 * フォーカスがどこにも無いか。消えた要素のフォーカスはふつう body に戻るが、環境によっては
 * null になったり、外れた要素を指したまま残ったりするので、どれも失ったとみなす
 */
export function isFocusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

type FocusTarget = () => HTMLElement | SVGElement | null | undefined;

/**
 * 押したボタンなどが描画から消えたときに、キーボード操作を続けられるようフォーカスを移す。
 * 描画を待ってから確かめ、その間にほかへ移ったフォーカスは奪わない。
 * 候補は先頭から順に試し、実際にフォーカスを受け取れた最初の要素で止める
 */
export function refocusWhenLost(...candidates: FocusTarget[]) {
  requestAnimationFrame(() => {
    if (!isFocusLost()) return;
    for (const candidate of candidates) {
      const element = candidate();
      if (!element?.isConnected) continue;
      element.focus();
      if (document.activeElement === element) return;
    }
  });
}
