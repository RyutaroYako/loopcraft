import type { Ref } from "vue";
import { computed, ref } from "vue";
import { findLoops } from "@loopcraft/core/cycles";
import { linkPairKey } from "@loopcraft/core/integrity";
import { listLoopEntries } from "@loopcraft/core/loops";
import type { Diagram, VariableId } from "@loopcraft/core/schema";
import { computeBoxes } from "./boxes.ts";
import { clearMeasureCache } from "./measure.ts";

export function useDiagramIndex(diagram: Readonly<Ref<Diagram>>) {
  const measureVersion = ref(0);

  // 図から直接読まず一段挟むのは、変数を動かしただけで関連やループを数え直さないため
  const variables = computed(() => diagram.value.variables);
  const links = computed(() => diagram.value.links);
  const loops = computed(() => diagram.value.loops);

  const variableById = computed(() => new Map(variables.value.map((item) => [item.id, item])));
  const linkById = computed(() => new Map(links.value.map((link) => [link.id, link])));
  const linkPairs = computed(
    () => new Set(links.value.map((link) => linkPairKey(link.from, link.to))),
  );
  const boxes = computed(() => {
    void measureVersion.value;
    return computeBoxes(variables.value);
  });
  const detection = computed(() => findLoops(links.value));
  const loopEntries = computed(() =>
    listLoopEntries(loops.value, links.value, detection.value.loops),
  );
  const loopEntryByLoopId = computed(
    () =>
      new Map(
        loopEntries.value.flatMap((entry) =>
          entry.featured ? [[entry.featured.loop.id, entry] as const] : [],
        ),
      ),
  );

  function hasReverse(link: { from: VariableId; to: VariableId }) {
    return linkPairs.value.has(linkPairKey(link.to, link.from));
  }

  /** 読み込み前の Web フォントで測った幅は、読み込み後には合わない */
  function remeasure() {
    clearMeasureCache();
    measureVersion.value++;
  }

  return {
    links,
    variableById,
    linkById,
    boxes,
    detection,
    loopEntries,
    loopEntryByLoopId,
    hasReverse,
    remeasure,
  };
}
