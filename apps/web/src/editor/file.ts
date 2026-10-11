import { stringifyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";

export function downloadDiagram(diagram: Diagram) {
  downloadText(stringifyDiagram(diagram), `${fileNameOf(diagram.title)}.json`);
}

export function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // すぐに解放するとダウンロードが始まる前に失敗するブラウザがあるので、少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function fileNameOf(title: string) {
  const name = title.trim().replace(/[\\/:*?"<>|]+/g, "_");
  return name || "system-diagram";
}

/** ファイル選択ダイアログを開き、選ばれたファイルを返す。キャンセル時は undefined */
export function pickJsonFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
    input.addEventListener("cancel", () => resolve(undefined), { once: true });
    input.click();
  });
}
