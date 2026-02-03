<template>
  <!-- Toast 组件由 PrimeVue ToastService 管理 -->
  <Toast position="top-right" group="error-notification">
    <template #message="slotProps">
      <div class="error-toast-content" @click="handleClick(slotProps.message)">
        <div class="error-toast-header">
          <span class="error-summary">{{ slotProps.message.summary }}</span>
          <Button
            icon="pi pi-info-circle"
            severity="secondary"
            text
            size="small"
            class="detail-btn"
            @click.stop="handleClick(slotProps.message)"
            v-tooltip.left="'点击查看详情'"
          />
        </div>
        <div class="error-detail">{{ slotProps.message.detail }}</div>
        <div class="error-hint">点击查看详细错误信息</div>
      </div>
    </template>
  </Toast>
</template>

<script setup lang="ts">
/**
 * 错误通知 Toast 组件
 *
 * 职责：
 * - 监听 errorList 响应式数组
 * - 使用 Toast 显示每个错误
 * - 支持点击查看详情
 */
import { watch } from 'vue';
import Toast from 'primevue/toast';
import Button from 'primevue/button';
import Tooltip from 'primevue/tooltip';
import { useToast } from 'primevue/usetoast';
import { useDialog } from 'primevue/usedialog';
import ErrorDetailDialog from './ErrorDetailDialog.vue';
import { errorList, errorNotificationService } from '../../services/errorNotification';
import type { ErrorEvent } from '../../services/api';

const toast = useToast();
const dialog = useDialog();
const vTooltip = Tooltip;

interface ErrorMessage {
  summary?: string;
  detail?: string;
}

/**
 * 显示单个错误的 Toast
 */
const showErrorToast = (error: ErrorEvent) => {
  const severity = errorNotificationService.getSeverity(error.errorCategory);
  const agentName = error.agentContext?.agentName || error.agentId;

  toast.add({
    severity,
    summary: `${agentName} - 操作失败`,
    detail: error.userMessage,
    life: 10000,
    closable: true,
    group: 'error-notification'
  });
};

/**
 * 监听错误列表，显示新增的错误
 */
let processedErrors = new Set<ErrorEvent>();

watch(
  errorList,
  (newList) => {
    newList.forEach((error) => {
      if (!processedErrors.has(error)) {
        processedErrors.add(error);
        showErrorToast(error);
      }
    });

    // 清理已移除的错误
    const currentSet = new Set(newList);
    for (const error of processedErrors) {
      if (!currentSet.has(error)) {
        processedErrors.delete(error);
      }
    }
  },
  { deep: true }
);

/**
 * 处理点击事件 - 打开错误详情对话框
 */
const handleClick = (_message: ErrorMessage) => {
  // 获取最新的错误作为详情
  const latestError = errorList[errorList.length - 1];
  if (latestError) {
    openErrorDetail(latestError);
  }
};

/**
 * 打开错误详情对话框
 */
const openErrorDetail = (error: ErrorEvent) => {
  dialog.open(ErrorDetailDialog, {
    props: {
      header: '错误详情',
      style: {
        width: '600px',
        maxWidth: '90vw'
      },
      modal: true,
      closable: true,
      closeOnEscape: true
    },
    data: {
      error: error
    }
  });
};
</script>

<style scoped>
.error-toast-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
  cursor: pointer;
}

.error-toast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.error-summary {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.detail-btn {
  padding: 4px;
  width: 28px;
  height: 28px;
}

.error-detail {
  font-size: 13px;
  line-height: 1.5;
  color: inherit;
  opacity: 0.9;
}

.error-hint {
  font-size: 11px;
  opacity: 0.6;
  font-style: italic;
  margin-top: 2px;
}
</style>
