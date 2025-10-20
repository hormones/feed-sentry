<template>
  <div class="view-switcher">
    <n-space align="center" justify="space-between" class="view-switcher__row">
      <n-radio-group
        size="small"
        :value="modelValue"
        :disabled="loading"
        button-style="solid"
        @update:value="handleValueChange"
      >
        <n-radio-button
          v-for="option in options"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </n-radio-button>
      </n-radio-group>
      <n-tooltip trigger="hover" placement="bottom">
        <template #trigger>
          <n-button
            quaternary
            circle
            size="small"
            :aria-label="markAllAriaLabel"
            :disabled="loading || markAllDisabled"
            @click="emit('mark-all-read')"
          >
            <template #icon>
              <n-icon
                size="18"
                aria-hidden="true"
                :component="CheckmarkCircleOutline"
              />
            </template>
          </n-button>
        </template>
        <span>{{ markAllTooltip }}</span>
      </n-tooltip>
    </n-space>
    <div v-if="$slots.extra" class="view-switcher__extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckmarkCircleOutline } from '@vicons/ionicons5';
import useI18n from '@/composables/useI18n';

export type ViewSwitcherValue = 'all' | 'feeds';

withDefaults(defineProps<{
  modelValue: ViewSwitcherValue;
  loading?: boolean;
  markAllDisabled?: boolean;
}>(), {
  modelValue: 'all',
  loading: false,
  markAllDisabled: false,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: ViewSwitcherValue): void;
  (event: 'mark-all-read'): void;
}>();

const { t } = useI18n();

const options = computed(() => [
  { label: t('popup.viewSwitcher.options.all'), value: 'all' as const },
  { label: t('popup.viewSwitcher.options.feeds'), value: 'feeds' as const },
]);

const markAllTooltip = computed(() => t('popup.viewSwitcher.tooltip.markAllRead'));
const markAllAriaLabel = computed(() => t('popup.viewSwitcher.aria.markAllRead'));

function handleValueChange(value: ViewSwitcherValue): void {
  emit('update:modelValue', value);
}
</script>

<style scoped>
.view-switcher {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-switcher__row {
  width: 100%;
}

.view-switcher__extra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
