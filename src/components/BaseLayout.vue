<template>
  <n-config-provider>
    <n-layout
      embedded
      class="base-layout"
      :style="cssVars"
    >
      <n-layout
        embedded
        class="base-layout__shell"
        :has-sider="hasLeft || hasRight"
      >
        <n-layout-sider
          v-if="hasLeft"
          class="base-layout__sider base-layout__sider--left"
          :width="leftWidth"
          bordered
        >
          <div :class="getPaneClass('left')">
            <slot name="left" />
          </div>
        </n-layout-sider>
        <n-layout
          embedded
          class="base-layout__center"
          :has-sider="hasRight"
        >
          <n-layout-content class="base-layout__content">
            <div :class="getPaneClass('middle')">
              <slot name="middle" />
            </div>
          </n-layout-content>
          <n-layout-sider
            v-if="hasRight"
            class="base-layout__sider base-layout__sider--right"
            :width="rightWidth"
            bordered
          >
            <div :class="getPaneClass('right')">
              <slot name="right" />
            </div>
          </n-layout-sider>
        </n-layout>
      </n-layout>
    </n-layout>
  </n-config-provider>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { computed, useSlots } from 'vue';

type PanePosition = 'left' | 'middle' | 'right';

const props = withDefaults(defineProps<{
  gap?: number;
  scrollable?: boolean | Partial<Record<PanePosition, boolean>>;
  leftWidth?: number | string;
  rightWidth?: number | string;
}>(), {
  gap: 16,
  scrollable: true,
  leftWidth: 280,
  rightWidth: 360,
});

const slots = useSlots();

const hasLeft = computed(() => Boolean(slots.left));
const hasRight = computed(() => Boolean(slots.right));

const cssVars = computed<CSSProperties>(() => ({
  '--base-layout-gap': `${props.gap}px`,
}));

const columnScrollable = computed<Record<PanePosition, boolean>>(() => {
  if (typeof props.scrollable === 'boolean') {
    return {
      left: props.scrollable,
      middle: props.scrollable,
      right: props.scrollable,
    };
  }

  return {
    left: props.scrollable?.left ?? true,
    middle: props.scrollable?.middle ?? true,
    right: props.scrollable?.right ?? true,
  };
});

function getPaneClass(position: PanePosition) {
  return [
    'base-layout__pane',
    {
      'base-layout__pane--scrollable': columnScrollable.value[position],
    },
  ];
}
</script>

<style scoped>
.base-layout {
  --base-layout-gap: 16px;
  height: 100%;
  background-color: transparent;
}

.base-layout__shell,
.base-layout__center {
  height: 100%;
}

.base-layout__sider {
  display: flex;
  flex-direction: column;
}

.base-layout__sider--left {
  border-right: 1px solid var(--n-border-color);
}

.base-layout__sider--right {
  border-left: 1px solid var(--n-border-color);
}

.base-layout__content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.base-layout__pane {
  display: flex;
  flex-direction: column;
  gap: var(--base-layout-gap);
  padding: var(--base-layout-gap);
  height: 100%;
  box-sizing: border-box;
}

.base-layout__pane--scrollable {
  overflow-y: auto;
}
</style>
