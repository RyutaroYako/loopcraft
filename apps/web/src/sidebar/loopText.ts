import type { LoopKind } from "@loopcraft/core/loop";

export const kindLabel = (kind: LoopKind) =>
  kind === "reinforcing" ? "自己強化ループ" : "バランスループ";

export const kindExplanation = (negatives: number) =>
  negatives === 0
    ? "マイナスの関連が無いので、変化が増幅し続けます"
    : `マイナスの関連が ${negatives} 本（${negatives % 2 === 0 ? "偶数なので変化が増幅" : "奇数なので変化を打ち消す"}）`;
