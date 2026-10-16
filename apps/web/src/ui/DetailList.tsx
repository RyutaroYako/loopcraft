import { For, Show } from "solid-js";

const MAX_ITEMS = 8;

export function DetailList(props: { items: string[] }) {
  return (
    <>
      <ul class="grid gap-0.5 font-mono text-detail wrap-anywhere text-ink-2">
        <For each={props.items.slice(0, MAX_ITEMS)}>{(item) => <li>{item}</li>}</For>
      </ul>
      <Show when={props.items.length > MAX_ITEMS}>
        <p class="text-sm text-muted">ほか {props.items.length - MAX_ITEMS} 件</p>
      </Show>
    </>
  );
}
