<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef } from "vue";
import { defaultCurvature, linkGeometry } from "@loopcraft/core/geometry";
import type { VariableId } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import CanvasActions from "./CanvasActions.vue";
import CanvasLink from "./CanvasLink.vue";
import CanvasLinkDraft from "./CanvasLinkDraft.vue";
import CanvasLoopMarker from "./CanvasLoopMarker.vue";
import CanvasNode from "./CanvasNode.vue";
import EmptyState from "./EmptyState.vue";
import InlineLabelEditor from "./InlineLabelEditor.vue";
import { useCanvasGestures } from "./useCanvasGestures.ts";
import ZoomControls from "./ZoomControls.vue";

const editor = injectEditor();
const diagram = editor.diagram;
const editingVariable = editor.editingVariable;
const container = useTemplateRef<HTMLDivElement>("container");
const svg = useTemplateRef<SVGSVGElement>("svg");
const gestures = useCanvasGestures(editor, svg);
const linkDraft = gestures.linkDraft;

const empty = computed(() => diagram.value.variables.length === 0);
// 端の変数が見つからない関連を描かないのは、削除と同じ更新の中で、消えた変数を指したまま一度描かれることがあるため
const links = computed(() =>
  diagram.value.links.flatMap((link) => {
    const from = editor.boxes.value.get(link.from);
    const to = editor.boxes.value.get(link.to);
    if (!from || !to) return [];
    const curvature = link.curvature ?? defaultCurvature(editor.hasReverse(link));
    return [{ link, geometry: linkGeometry(from, to, curvature) }];
  }),
);
const markers = computed(() =>
  diagram.value.loops.flatMap((loop) => {
    const entry = editor.loopEntryByLoopId.value.get(loop.id);
    return entry ? [{ loop, entry }] : [];
  }),
);
const nodes = computed(() =>
  diagram.value.variables.flatMap((variable) => {
    const box = editor.boxes.value.get(variable.id);
    return box ? [{ variable, box }] : [];
  }),
);
const transform = computed(() => {
  const { x, y, zoom } = editor.viewport.value;
  return `translate(${x} ${y}) scale(${zoom})`;
});

defineExpose({ svg });

let observer: ResizeObserver | undefined;

onMounted(() => {
  let fitted = false;
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    editor.setViewportSize({ width, height });
    if (!fitted && width > 0 && height > 0) {
      fitted = true;
      editor.fitView();
    }
  });
  if (container.value) observer.observe(container.value);
  void document.fonts?.ready.then(() => editor.remeasure());
});

onUnmounted(() => observer?.disconnect());

// すぐに focus しないのは、描画が追いつく前だとフォーカスが入らないことがあるため
function onLabelFinished(id: VariableId, refocus: boolean) {
  if (!refocus) return;
  requestAnimationFrame(() => {
    svg.value?.querySelector<SVGGElement>(`[data-variable-id="${CSS.escape(id)}"]`)?.focus();
  });
}
</script>

<template>
  <div ref="container" class="diagram-canvas">
    <!-- ダブルクリックにキーボードの代わりを付けないのは、変数は「変数を追加」ボタンでも足せ、名前の入力は変数の上の F2 や Enter でも始められるため -->
    <!-- eslint-disable-next-line a11y/no-static-element-interactions -->
    <svg
      ref="svg"
      class="canvas-svg"
      :data-gesture="gestures.gesture.value"
      :data-readonly="editor.editable ? undefined : ''"
      role="group"
      aria-label="システム図のキャンバス"
      tabindex="-1"
      @pointerdown.capture="gestures.onPointerDownCapture"
      @pointermove.capture="gestures.onPointerMoveCapture"
      @pointerup.capture="gestures.onPointerUpCapture"
      @pointercancel.capture="gestures.onPointerUpCapture"
      @pointerdown="gestures.onBackgroundPointerDown"
      @pointermove="gestures.onPointerMove"
      @pointerup="gestures.onPointerUp"
      @pointercancel="gestures.onPointerUp"
      @lostpointercapture="gestures.onPointerUp"
      @dblclick="gestures.onDoubleClick"
      @contextmenu="gestures.onContextMenu"
      @wheel="gestures.onWheel"
    >
      <defs>
        <pattern
          id="grid-dots"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
          :patternTransform="transform"
        >
          <circle cx="1" cy="1" r="1" class="grid-dot" />
        </pattern>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 L 2.5 5 z" fill="context-stroke" />
        </marker>
      </defs>
      <rect data-layer="grid" width="100%" height="100%" fill="url(#grid-dots)" />
      <g data-layer="content" :transform>
        <g class="links">
          <CanvasLink
            v-for="item in links"
            :key="item.link.id"
            :link="item.link"
            :geometry="item.geometry"
          />
        </g>
        <CanvasLinkDraft v-if="linkDraft" :draft="linkDraft" />
        <g class="loop-markers">
          <CanvasLoopMarker
            v-for="item in markers"
            :key="item.loop.id"
            :loop="item.loop"
            :entry="item.entry"
            @pointerdown:marker="gestures.onMarkerPointerDown"
          />
        </g>
        <g class="nodes">
          <CanvasNode
            v-for="item in nodes"
            :key="item.variable.id"
            :variable="item.variable"
            :box="item.box"
            :connect-target="linkDraft?.target === item.variable.id"
            @pointerdown:body="gestures.onNodePointerDown"
            @pointerdown:handle="gestures.onHandlePointerDown"
          />
        </g>
        <InlineLabelEditor
          v-if="editingVariable"
          :id="editingVariable"
          :key="editingVariable"
          @edit:finish="onLabelFinished"
        />
      </g>
    </svg>

    <EmptyState v-if="empty" />
    <CanvasActions v-if="editor.editable" :empty />
    <ZoomControls :empty />
    <p v-if="!empty && !editor.editable" class="readonly-hint">
      <span>ドラッグで移動、Ctrl+ホイールで拡大縮小</span>
    </p>
  </div>
</template>

<style scoped>
.diagram-canvas {
  position: relative;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
  background: var(--color-canvas);

  > .canvas-svg {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    touch-action: none;
    user-select: none;
    cursor: default;

    /*
     * キャンバス全体を縁取らないのは、削除や Escape のたびにフォーカスが戻り、操作のたびに画面の縁が光るため。
     * キーボードで辿る先の変数や矢印には、それぞれのフォーカス表示がある
     */
    &:focus {
      outline: none;
    }

    &[data-gesture="pan"] {
      cursor: grabbing;
    }

    &[data-gesture="connect"] {
      cursor: crosshair;
    }

    .grid-dot {
      fill: var(--color-line-strong);
    }
  }

  > .readonly-hint {
    position: absolute;
    inset-block-end: 18px;
    inset-inline-end: 16px;
    display: flex;
    gap: 14px;
    font-size: var(--text-sm);
    color: var(--color-muted);
    pointer-events: none;

    @media (width < 48rem) {
      display: none;
    }
  }
}
</style>
