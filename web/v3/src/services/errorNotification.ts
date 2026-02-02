/**
 * 错误通知服务
 * 
 * 职责：
 * - 定期轮询后端错误事件
 * - 使用 Toast 显示用户友好的错误提示
 * - 提供查看详细错误信息的对话框
 * 
 * @author Agent Society
 */

import { apiService, type ErrorEvent } from './api';
import { useToast } from 'primevue/usetoast';

// 轮询间隔（毫秒）
const POLL_INTERVAL = 3000;

// 存储当前错误，供 Toast 组件查看详情时使用
let currentErrorForDetail: ErrorEvent | null = null;

export function getCurrentErrorForDetail(): ErrorEvent | null {
  return currentErrorForDetail;
}

export function setCurrentErrorForDetail(error: ErrorEvent | null): void {
  currentErrorForDetail = error;
}

class ErrorNotificationService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTimestamp: string = '';
  private toast: ReturnType<typeof useToast> | null = null;
  private processedErrors = new Set<string>(); // 防止重复显示

  /**
   * 初始化服务
   */
  init() {
    if (this.timer) return;
    
    // 延迟获取 toast（确保在 Vue 组件上下文中调用）
    setTimeout(() => {
      try {
        this.toast = useToast();
      } catch (e) {
        console.warn('[ErrorNotification] Toast not available:', e);
      }
    }, 0);

    this.startPolling();
    console.log('[ErrorNotification] Service initialized');
  }

  /**
   * 开始轮询
   */
  private startPolling() {
    this.timer = setInterval(() => {
      this.pollErrors();
    }, POLL_INTERVAL);
  }

  /**
   * 停止轮询
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 轮询错误事件
   */
  private async pollErrors() {
    try {
      const { errors } = await apiService.getRecentEvents(
        this.lastTimestamp || undefined
      );

      if (errors && errors.length > 0) {
        // 更新最后时间戳
        const lastError = errors[errors.length - 1];
        if (lastError) {
          this.lastTimestamp = lastError.timestamp;
        }

        // 处理每个错误
        errors.forEach(error => {
          this.handleError(error);
        });
      }
    } catch (err) {
      // 静默处理轮询错误，避免递归
      console.debug('[ErrorNotification] Poll failed:', err);
    }
  }

  /**
   * 处理单个错误事件
   */
  private handleError(error: ErrorEvent) {
    // 生成错误唯一标识
    const errorId = `${error.agentId}-${error.timestamp}-${error.errorType}`;
    
    // 防止重复显示同一错误
    if (this.processedErrors.has(errorId)) {
      return;
    }
    this.processedErrors.add(errorId);

    // 限制缓存大小
    if (this.processedErrors.size > 100) {
      const first = this.processedErrors.values().next().value;
      if (first) {
        this.processedErrors.delete(first);
      }
    }

    // 显示 Toast 通知
    this.showToast(error);
  }

  /**
   * 显示 Toast 通知
   */
  private showToast(error: ErrorEvent) {
    if (!this.toast) {
      console.warn('[ErrorNotification] Toast not initialized, error:', error);
      return;
    }

    const severity = this.getSeverity(error.errorCategory);
    const agentName = error.agentContext?.agentName || error.agentId;

    // 存储当前错误，供 Toast 组件点击查看详情
    setCurrentErrorForDetail(error);
    
    // 显示带操作的 Toast
    this.toast.add({
      severity,
      summary: `${agentName} - 操作失败`,
      detail: error.userMessage,
      life: 10000, // 10秒后自动关闭
      closable: true,
      group: 'error-notification'
    });
  }

  /**
   * 根据错误分类获取严重程度
   */
  private getSeverity(category: string): 'error' | 'warn' | 'info' {
    switch (category) {
      case 'auth':
      case 'server':
        return 'error';
      case 'rate_limit':
      case 'network':
        return 'warn';
      case 'context_length':
        return 'info';
      default:
        return 'error';
    }
  }
}

// 单例实例
export const errorNotificationService = new ErrorNotificationService();
