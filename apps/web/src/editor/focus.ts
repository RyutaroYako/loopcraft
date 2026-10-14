/**
 * フォーカスしていた要素が描画から消えたかどうか。消えた要素のフォーカスはふつう body に戻るが、
 * 環境によっては null になったり、外れた要素を指したまま残ったりするので、どれも失ったとみなす
 */
export function isFocusLost(doc: Document = document): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body || !active.isConnected;
}
