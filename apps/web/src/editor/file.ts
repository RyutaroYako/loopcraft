import { stringifyDiagram } from "@loopcraft/core/io";
import type { Diagram } from "@loopcraft/core/schema";

export function downloadDiagram(diagram: Diagram) {
  downloadText(stringifyDiagram(diagram), `${fileNameOf(diagram.title)}.json`);
}

export function downloadText(text: string, fileName: string) {
  downloadBlob(new Blob([text], { type: "application/json" }), fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // すぐに解放しないのは、ダウンロードが始まる前に失敗するブラウザがあるため
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** 拡張子は付けない */
export function fileNameOf(title: string) {
  const name = title.trim().replace(/[\\/:*?"<>|]+/g, "_");
  return name || "system-diagram";
}

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
