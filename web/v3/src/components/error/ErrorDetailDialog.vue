<template>
  <div class="error-detail-dialog">
    <!-- 用户友好提示 -->
    <div class="user-message-section">
      <div class="section-title">
        <AlertCircle class="icon" />
        <span>错误提示</span>
      </div>
      <div class="user-message">
        {{ error.userMessage }}
      </div>
    </div>

    <!-- 智能体信息 -->
    <div class="agent-info-section">
      <div class="info-row">
        <span class="label">智能体:</span>
        <span class="value">{{ agentDisplayName }}</span>
      </div>
      <div class="info-row">
        <span class="label">错误类型:</span>
        <Tag :value="error.errorType" :severity="tagSeverity" />
      </div>
      <div class="info-row">
        <span class="label">发生时间:</span>
        <span class="value">{{ formattedTime }}</span>
      </div>
    </div>

    <!-- 技术详情（可折叠） -->
    <Panel header="技术详情（供开发者参考）" toggleable collapsed class="technical-panel">
      <div class="technical-content">
        <!-- 详细错误消息 -->
        <div class="tech-section">
          <div class="tech-label">详细消息:</div>
          <pre class="tech-code">{{ error.technicalInfo?.detailedMessage || '无' }}</pre>
        </div>

        <!-- 原始错误 -->
        <div class="tech-section">
          <div class="tech-label">原始错误:</div>
          <pre class="tech-code">{{ error.technicalInfo?.originalError || '无' }}</pre>
        </div>

        <!-- HTTP 状态码 -->
        <div class="tech-section" v-if="error.technicalInfo?.technicalDetails?.status">
          <div class="tech-label">HTTP 状态码:</div>
          <pre class="tech-code">{{ error.technicalInfo.technicalDetails.status }}</pre>
        </div>

        <!-- 错误代码 -->
        <div class="tech-section" v-if="error.technicalInfo?.technicalDetails?.code">
          <div class="tech-label">错误代码:</div>
          <pre class="tech-code">{{ error.technicalInfo.technicalDetails.code }}</pre>
        </div>

        <!-- 错误类型 -->
        <div class="tech-section" v-if="error.technicalInfo?.technicalDetails?.type">
          <div class="tech-label">错误类型:</div>
          <pre class="tech-code">{{ error.technicalInfo.technicalDetails.type }}</pre>
        </div>

        <!-- 堆栈跟踪 -->
        <div class="tech-section" v-if="error.technicalInfo?.technicalDetails?.stack">
          <div class="tech-label">堆栈跟踪:</div>
          <pre class="tech-code stack-trace">{{ error.technicalInfo.technicalDetails.stack }}</pre>
        </div>

        <!-- 智能体上下文 -->
        <div class="tech-section" v-if="error.agentContext">
          <div class="tech-label">智能体上下文:</div>
          <pre class="tech-code">{{ JSON.stringify(error.agentContext, null, 2) }}</pre>
        </div>

        <!-- 完整错误对象 -->
        <div class="tech-section">
          <div class="tech-label">完整错误对象:</div>
          <pre class="tech-code">{{ JSON.stringify(error, null, 2) }}</pre>
        </div>
      </div>
    </Panel>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <Button 
        label="复制错误信息" 
        icon="pi pi-copy" 
        severity="secondary" 
        @click="copyError"
        class="action-button"
      />
      <Button 
        label="关闭" 
        @click="close"
        class="action-button"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 错误详情对话框
 * 
 * 显示完整的错误信息，包括：
 * - 用户友好的错误提示
 * - 智能体信息
 * - 详细的技术信息（可折叠）
 */
import { computed, inject, type Ref } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Panel from 'primevue/panel';
import { AlertCircle } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';

const toast = useToast();

// 注入 Dynamic Dialog 实例以关闭对话框
const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef');

const props = defineProps<{
  error: {
    agentId: string;
    errorType: string;
    errorCategory: string;
    timestamp: string;
    userMessage: string;
    technicalInfo?: {
      detailedMessage: string;
      originalError: string;
      errorName: string;
      technicalDetails: {
        status?: number;
        code?: string;
        type?: string;
        stack?: string;
      };
    };
    agentContext?: {
      agentName: string;
      roleId: string | null;
    };
  };
}>();

/**
 * 智能体显示名称
 */
const agentDisplayName = computed(() => {
  const ctx = props.error.agentContext;
  if (ctx?.agentName && ctx.agentName !== props.error.agentId) {
    return `${ctx.agentName} (${props.error.agentId})`;
  }
  return props.error.agentId;
});

/**
 * 格式化时间
 */
const formattedTime = computed(() => {
  try {
    const date = new Date(props.error.timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return props.error.timestamp;
  }
});

/**
 * 标签严重程度
 */
const tagSeverity = computed(() => {
  const category = props.error.errorCategory;
  switch (category) {
    case 'auth':
    case 'server':
      return 'danger';
    case 'rate_limit':
    case 'network':
      return 'warning';
    case 'context_length':
      return 'info';
    default:
      return 'secondary';
  }
});

/**
 * 复制错误信息到剪贴板
 */
const copyError = async () => {
  try {
    const errorText = JSON.stringify(props.error, null, 2);
    await navigator.clipboard.writeText(errorText);
    toast.add({
      severity: 'success',
      summary: '已复制',
      detail: '错误信息已复制到剪贴板',
      life: 2000
    });
  } catch {
    toast.add({
      severity: 'error',
      summary: '复制失败',
      detail: '无法复制到剪贴板',
      life: 2000
    });
  }
};

/**
 * 关闭对话框
 */
const close = () => {
  dialogRef?.value?.close?.();
};
</script>

<style scoped>
.error-detail-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.user-message-section {
  background: var(--surface-100);
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid var(--red-500);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.icon {
  width: 20px;
  height: 20px;
  color: var(--red-500);
}

.user-message {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
}

.agent-info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--surface-50);
  border-radius: 6px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.label {
  font-size: 13px;
  color: var(--text-color-secondary);
  min-width: 80px;
}

.value {
  font-size: 13px;
  color: var(--text-color);
  font-family: monospace;
}

.technical-panel :deep(.p-panel-header) {
  font-size: 13px;
  padding: 12px;
}

.technical-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.tech-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tech-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.tech-code {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  background: var(--surface-100);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-color);
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.stack-trace {
  max-height: 300px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--surface-200);
}

.action-button {
  font-size: 13px;
}
</style>
