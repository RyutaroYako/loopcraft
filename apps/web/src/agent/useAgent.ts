import { isRunning } from "@loopcraft/core/agent";
import type { Ref } from "vue";
import { computed, ref, shallowRef, watch } from "vue";
import type { Editor } from "../editor/useEditor.ts";
import type { Autosave } from "../persistence/useAutosave.ts";
import type { AgentClient } from "./agentClient.ts";
import { createAgentSession } from "./agentSession.ts";
import type { AgentView } from "./agentSession.ts";
import { describeSelection } from "./agentText.ts";

export type Agent = ReturnType<typeof useAgent>;

/** 見張りをここで始めないのは、EventSource を開くため。マウントした後に start() を呼ぶ */
export function useAgent(
  client: AgentClient,
  { editor, autosave, locked }: { editor: Editor; autosave: Autosave; locked: Ref<boolean> },
) {
  const session = createAgentSession(client, {
    async prepare() {
      editor.settle();
      return (await autosave.saveNow()).kind === "ok";
    },
    onView(next) {
      view.value = next;
      locked.value = session.locked();
    },
    notify: editor.notify,
  });
  const view = shallowRef<AgentView>(session.view());
  const open = ref(false);
  const draft = ref("");
  /** 選んでいる要素を指示に添える */
  const withSelection = ref(true);
  const selection = computed(() => describeSelection(editor, editor.selection.value));
  watch(
    () => selection.value?.id,
    () => (withSelection.value = true),
  );

  const latest = computed(() => view.value.state.turns.at(-1));
  /** AI が変えた所。動いている間と、取り消せる間（その後に図が変わっていない）だけ示す */
  const touched = computed(() => {
    const turn = latest.value;
    if (!turn || (turn.status !== "running" && !turn.undoable)) return undefined;
    return { variables: new Set(turn.touched.variables), links: new Set(turn.touched.links) };
  });

  async function send(prompt = draft.value) {
    const text = prompt.trim();
    if (!text) return;
    const accepted = await session.send(text, withSelection.value ? selection.value : undefined);
    if (accepted && prompt === draft.value) draft.value = "";
  }

  return {
    info: client.info,
    open,
    draft,
    setDraft: (next: string) => (draft.value = next),
    withSelection,
    setWithSelection: (next: boolean) => (withSelection.value = next),
    selection,
    turns: computed(() => view.value.state.turns),
    running: computed(() => isRunning(view.value.state)),
    busy: computed(() => view.value.sending || isRunning(view.value.state)),
    touched,
    start: session.start,
    send,
    stop: session.stop,
    reset: session.reset,
    undo: session.undo,
  };
}
