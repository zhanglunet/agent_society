<script setup lang="ts">
/**
 * 确认对话框组件
 * 
 * 用于需要用户确认的操作，如删除智能体等危险操作
 * 
 * @author Agent Society
 */
import { AlertTriangle } from 'lucide-vue-next';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

const props = defineProps<{
  visible: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmSeverity?: 'danger' | 'primary' | 'secondary';
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

/**
 * 处理确认
 */
const handleConfirm = () => {
  emit('confirm');
};

/**
 * 处理取消
 */
const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(val: boolean) => emit('update:visible', val)"
    modal
    :closable="!loading"
    :close-on-escape="!loading"
    class="confirm-dialog"
    :pt="{
      root: { class: 'w-[400px]' },
      header: { class: 'pb-2' },
      content: { class: 'pb-4' }
    }"
  >
    <template #header>
      <div class="flex items-center space-x-2">
        <AlertTriangle class="w-5 h-5 text-red-500" />
        <span class="font-semibold text-[var(--text-1)]">{{ title || '确认操作' }}</span>
      </div>
    </template>

    <div class="py-4">
      <p class="text-sm text-[var(--text-2)] leading-relaxed">
        {{ message || '确定要执行此操作吗？此操作不可撤销。' }}
      </p>
    </div>

    <template #footer>
      <div class="flex justify-end space-x-2 pt-2">
        <Button
          :label="cancelLabel || '取消'"
          variant="text"
          :disabled="loading"
          @click="handleCancel"
          class="!text-[var(--text-2)]"
        />
        <Button
          :label="confirmLabel || '确认'"
          :severity="confirmSeverity || 'danger'"
          :loading="loading"
          @click="handleConfirm"
          class="min-w-[80px]"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.confirm-dialog :deep(.p-dialog-header) {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.confirm-dialog :deep(.p-dialog-content) {
  padding: 0 1.25rem;
}

.confirm-dialog :deep(.p-dialog-footer) {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
</style>
