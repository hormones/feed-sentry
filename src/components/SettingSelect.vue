<template>
  <div class="setting-select">
    <div v-if="$slots.label || label" class="setting-select__label">
      <slot name="label">
        <n-tooltip v-if="tooltip">
          <template #trigger>
            <n-text strong>
              {{ label }}
            </n-text>
          </template>
          {{ tooltip }}
        </n-tooltip>
        <n-text v-else strong>
          {{ label }}
        </n-text>
      </slot>
    </div>
    <n-select
      class="setting-select__control"
      :value="modelValue"
      :options="options"
      :placeholder="placeholder"
      :size="size"
      :disabled="disabled"
      :filterable="filterable"
      :clearable="clearable"
      @update:value="handleUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import type { SelectOption } from 'naive-ui';

withDefaults(defineProps<{
  modelValue?: string | number | null;
  options: SelectOption[];
  label?: string;
  tooltip?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  filterable?: boolean;
  size?: 'small' | 'medium' | 'large';
}>(), {
  modelValue: null,
  label: '',
  tooltip: '',
  placeholder: '',
  disabled: false,
  clearable: false,
  filterable: false,
  size: 'medium',
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | number | null): void;
  (event: 'change', value: string | number | null): void;
}>();

function handleUpdate(value: string | number | null) {
  emit('update:modelValue', value);
  emit('change', value);
}
</script>

<style scoped>
.setting-select {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-select__control {
  min-width: 180px;
}
</style>
