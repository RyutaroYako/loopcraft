import { domToBlob } from "modern-screenshot";

/** 図の座標 */
const PADDING = 32;
/** 等倍だと高解像度の画面で粗く見える */
const SCALE = 2;

/** 図の中身は `.canvas-content` の <g> に、背景の方眼は `.grid-bg` にある前提 */
export async function captureDiagram(svg: SVGSVGElement): Promise<Blob> {
  const content = svg.querySelector<SVGGElement>(".canvas-content");
  // modern-screenshot は <svg> を直接渡すとスタイルを写さずにそのまま使うので、親の要素ごと写す
  const container = svg.parentElement;
  if (!content || !container) throw new Error("図が見つかりません");
  // <g> 自身の transform を含まない座標、つまり図の座標で範囲を測る
  const box = content.getBBox();
  const width = Math.ceil(box.width + PADDING * 2);
  const height = Math.ceil(box.height + PADDING * 2);
  const blob = await domToBlob(container, {
    width,
    height,
    scale: SCALE,
    backgroundColor: getComputedStyle(container).backgroundColor,
    filter: (node) =>
      !(node instanceof Element) ||
      ((node.parentElement !== container || node === svg) && !node.classList.contains("grid-bg")),
    onCloneNode: (cloned) => {
      const clonedSvg = (cloned as Element).querySelector("svg");
      const group = clonedSvg?.querySelector<SVGGElement>(".canvas-content");
      if (!clonedSvg || !group) return;
      clonedSvg.style.width = `${width}px`;
      clonedSvg.style.height = `${height}px`;
      // 写した computed style の transform は属性より優先されるので、style で上書きする
      group.removeAttribute("transform");
      group.style.transform = `translate(${PADDING - box.x}px, ${PADDING - box.y}px)`;
    },
  });
  if (!blob) throw new Error("画像を作れませんでした");
  return blob;
}
