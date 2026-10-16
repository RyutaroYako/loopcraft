import * as edit from "@loopcraft/core/edit";
import type { LinkId, LoopId, VariableId } from "@loopcraft/core/schema";
import type { Editor } from "../editor/editor.ts";
import type { MenuItem } from "./ContextMenu.tsx";

export function variableActions(editor: Editor, id: VariableId): MenuItem[] {
  return [
    { label: "名前を変える", shortcut: "F2", run: () => editor.setEditingVariable(id) },
    { label: "矢印を引く", run: () => editor.startConnecting(id) },
    {
      label: "変数を削除",
      shortcut: "Delete",
      danger: true,
      run: () => {
        editor.select({ kind: "variable", id });
        editor.deleteSelection();
      },
    },
  ];
}

export function linkActions(editor: Editor, id: LinkId): MenuItem[] {
  const link = editor.linkById().get(id);
  return [
    {
      label: link?.polarity === "-" ? "極性を +（同じ向き）にする" : "極性を −（逆向き）にする",
      run: () => editor.commit(edit.togglePolarity(editor.current(), id)),
    },
    {
      label: link?.delay ? "遅れを外す" : "遅れを付ける",
      run: () =>
        editor.commit(
          edit.updateLink(editor.current(), id, { delay: link?.delay ? undefined : true }),
        ),
    },
    {
      label: "関連を削除",
      shortcut: "Delete",
      danger: true,
      run: () => {
        editor.select({ kind: "link", id });
        editor.deleteSelection();
      },
    },
  ];
}

export function loopActions(editor: Editor, id: LoopId): MenuItem[] {
  const loop = editor.loopEntryByLoopId().get(id)?.featured?.loop;
  return [
    {
      label: "記号の位置を戻す",
      disabled: loop?.marker === undefined,
      run: () => editor.commit(edit.updateLoop(editor.current(), id, { marker: undefined })),
    },
    {
      label: "見出しを外す",
      shortcut: "Delete",
      danger: true,
      run: () => {
        editor.select({ kind: "loop", id });
        editor.deleteSelection();
      },
    },
  ];
}
