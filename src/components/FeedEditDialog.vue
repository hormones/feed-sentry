<template>
  <n-modal
    :show="visible"
    preset="card"
    :title="dialogTitle"
    :mask-closable="false"
    :closable="!loading"
    :style="modalStyle"
    @update:show="value => emit('update:visible', value)"
  >
    <n-form
      ref="formRef"
      class="feed-edit-dialog__form"
      :model="formValue"
      :rules="rules"
      :disabled="loading"
      label-placement="top"
    >
      <n-form-item :label="t('options.feedEditDialog.fields.title.label')" path="title">
        <n-input
          v-model:value="formValue.title"
          :placeholder="t('options.feedEditDialog.fields.title.placeholder')"
        />
      </n-form-item>
      <n-form-item :label="t('options.feedEditDialog.fields.link.label')" path="link">
        <n-input
          v-model:value="formValue.link"
          :placeholder="t('options.feedEditDialog.fields.link.placeholder')"
        />
      </n-form-item>
    </n-form>
    <template #action>
      <n-space justify="end">
        <n-button :disabled="loading" @click="handleCancel">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" :loading="loading" @click="handleSubmit">
          {{ t('common.actions.save') }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type { FormInst, FormItemRule, FormRules } from 'naive-ui';
import useI18n from '@/composables/useI18n';

export interface FeedFormValue {
  title: string;
  link: string;
  pollInterval: number;
  notify: boolean;
  keywords: string[];
  keywordNotify: boolean;
}

const props = withDefaults(defineProps<{
  visible: boolean;
  loading?: boolean;
  initialValue?: Partial<FeedFormValue>;
}>(), {
  loading: false,
  initialValue: () => ({}),
});

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'submit', value: FeedFormValue): void;
  (event: 'cancel'): void;
}>();

const defaultValue: FeedFormValue = {
  title: '',
  link: '',
  pollInterval: 600,
  notify: false,
  keywords: [],
  keywordNotify: true,
};

const formRef = ref<FormInst | null>(null);
const formValue = reactive<FeedFormValue>({ ...defaultValue });

const { t } = useI18n();

const dialogTitle = computed(() =>
  props.initialValue?.title
    ? t('options.feedEditDialog.titles.edit')
    : t('options.feedEditDialog.titles.create'),
);
const modalStyle: CSSProperties = {
  width: '480px',
  maxWidth: 'calc(100vw - 48px)',
};

const rules: FormRules = {
  title: [
    { required: true, message: t('options.feedEditDialog.validation.titleRequired'), trigger: ['input', 'blur'] },
  ],
  link: [
    { required: true, message: t('options.feedEditDialog.validation.linkRequired'), trigger: ['input', 'blur'] },
    {
      validator: (_rule: FormItemRule, value: string) => /^https?:\/\//i.test(value.trim()),
      message: t('options.feedEditDialog.validation.linkInvalid'),
      trigger: 'blur',
    },
  ],
};

watch(
  () => props.visible,
  visible => {
    if (visible) {
      resetForm();
    }
  },
  { immediate: true },
);

watch(
  () => props.initialValue,
  () => {
    if (props.visible) {
      resetForm();
    }
  },
  { deep: true },
);

function resetForm() {
  Object.assign(formValue, defaultValue);
  if (props.initialValue) {
    Object.assign(formValue, {
      ...props.initialValue,
      keywords: [...(props.initialValue.keywords ?? [])],
    });
  }
}

async function handleSubmit() {
  if (!formRef.value) {
    return;
  }

  try {
    await formRef.value.validate();
    emit('submit', { ...formValue, keywords: [...formValue.keywords] });
  } catch (error) {
    // Validation errors are handled by Naive UI
  }
}

function handleCancel() {
  emit('cancel');
  emit('update:visible', false);
}
</script>

<style scoped>
.feed-edit-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}
</style>
