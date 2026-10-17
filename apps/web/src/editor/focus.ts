/**
 * body だけで判定しないのは、消えた要素のフォーカスが環境によって null になったり、
 * 外れた要素を指したまま残ったりするため
 */
export const isFocusLost = (): boolean => {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
};

type FocusTarget = () => HTMLElement | SVGElement | null | undefined;

/**
 * すぐ確かめないのは、押したボタンなどがまだ描画から消えていないため。待つ間にほかへ移った
 * フォーカスは奪わない。focus() の後に確かめるのは、受け取れない要素もあるため
 */
export const refocusWhenLost = (...candidates: FocusTarget[]) => {
  requestAnimationFrame(() => {
    if (!isFocusLost()) return;
    for (const candidate of candidates) {
      const element = candidate();
      if (!element?.isConnected) continue;
      element.focus();
      if (document.activeElement === element) return;
    }
  });
};
