<script setup lang="ts">
/**
 * 确认对话框组件
 * 
 * 用于需要用户确认的操作，如删除智能体等危险操作
 * 设计原则：紧凑平衡、留白适中、视觉层次分明
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

const handleConfirm = () => {
  emit('confirm');
};

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
      root: { class: 'w-[360px] max-w-[90vw]' }
    }"
  >
    <template #container>
      <div class="confirm-container">
        <!-- 头部 -->
        <div class="confirm-header">
          <AlertTriangle class="w-4 h-4 text-red-500 flex-shrink-0" />
          <span class="text-sm font-medium text-[var(--text-1)]">{{ title || '确认操作' }}</span>
        </div>
        
        <!-- 内容区 -->
        <div class="confirm-body">
          <p class="text-sm text-[var(--text-2)] leading-relaxed">
            {{ message || '确定要执行此操作吗？此操作不可撤销。' }}
          </p>
        </div>
        
        <!-- 页脚 -->
        <div class="confirm-footer">
          <Button
            :label="cancelLabel || '取消'"
            variant="text"
            size="small"
            :disabled="loading"
            @click="handleCancel"
            class="!text-[var(--text-2)] !px-3 !py-1.5"
          />
          <Button
            :label="confirmLabel || '确认'"
            :severity="confirmSeverity || 'danger'"
            size="small"
            :loading="loading"
            @click="handleConfirm"
            class="!px-3 !py-1.5"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
/* 容器 - 整体样式 */
.confirm-container {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

/* 头部 - 紧凑设计，减少高度 */
.confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

/* 内容区 - 充足的留白 */
.confirm-body {
  padding: 24px 28px;
  background: var(--surface-1);
}

/* 页脚 - 紧凑但平衡 */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}
</style>
