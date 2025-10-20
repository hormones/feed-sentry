<template>
  <div class="tag-input">
    <n-dynamic-tags
      :value="modelValue"
      :max="max"
      :disabled="disabled"
      size="small"
      @update:value="handleUpdate"
    >
      <template #input="{ submit, deactivate }">
        <n-input
          v-model:value="inputValue"
          size="small"
          :placeholder="placeholderText"
          @keydown.enter.prevent="() => handleSubmit(submit, deactivate)"
          @blur="() => handleSubmit(submit, deactivate)"
        />
      </template>
    </n-dynamic-tags>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import useI18n from '@/composables/useI18n';

const props = withDefaults(defineProps<{
  modelValue: string[];
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}>(), {
  modelValue: () => [],
  max: 10,
  placeholder: undefined,
  disabled: false,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void;
  (event: 'change', value: string[]): void;
}>();

const { t } = useI18n();

const inputValue = ref('');
const placeholderText = computed(() => props.placeholder ?? t('components.tagInput.placeholder'));

function sortKeywords(keywords: string[]): string[] {
  return [...keywords].sort((a, b) => {
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    return a.localeCompare(b);
  });
}

function handleUpdate(value: string[]) {
  const sorted = sortKeywords(value);
  emit('update:modelValue', sorted);
  emit('change', sorted);
}

function handleSubmit(_submit: (value: string) => void, deactivate: () => void) {
  const value = inputValue.value.trim();
  if (!value) {
    deactivate();
    inputValue.value = '';
    return;
  }

  const segments = value
    .split(/[\s\u3000]+/)
    .map(segment => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    deactivate();
    inputValue.value = '';
    return;
  }

  const maxCount = typeof props.max === 'number' ? props.max : Number.POSITIVE_INFINITY;
  const current = [...props.modelValue];
  const existing = new Set(current);
  const additions: string[] = [];
  for (const segment of segments) {
    if (existing.has(segment)) {
      continue;
    }
    if (existing.size + additions.length >= maxCount) {
      break;
    }
    additions.push(segment);
  }

  if (!additions.length) {
    deactivate();
    inputValue.value = '';
    return;
  }

  const nextValue = sortKeywords([...current, ...additions]);
  emit('update:modelValue', nextValue);
  emit('change', nextValue);
  inputValue.value = '';
}
</script>

<style scoped>
.tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-input :deep(.n-dynamic-tags__item) {
  margin: 0;
}
</style>
