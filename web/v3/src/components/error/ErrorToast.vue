<template>
  <Toast 
    position="top-right" 
    group="error-notification"
    @click="onToastClick"
  >
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
 * 自定义 Toast 模板，支持点击查看详情
 */
import Toast from 'primevue/toast';
import Button from 'primevue/button';
import Tooltip from 'primevue/tooltip';
import { useDialog } from 'primevue/usedialog';
import ErrorDetailDialog from './ErrorDetailDialog.vue';
import { getCurrentErrorForDetail } from '../../services/errorNotification';

const dialog = useDialog();
const vTooltip = Tooltip;

interface ErrorMessage {
  summary?: string;
  detail?: string;
}

/**
 * 处理点击事件
 */
const handleClick = (_message: ErrorMessage) => {
  // 从服务获取当前错误信息
  const error = getCurrentErrorForDetail();
  if (error) {
    openErrorDetail(error);
  }
};

/**
 * 打开错误详情对话框
 */
const openErrorDetail = (error: any) => {
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

// 防止事件冒泡
const onToastClick = () => {
  // Toast 点击事件已处理
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
