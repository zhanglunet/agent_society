/**
 * 错误通知服务
 *
 * 职责：
 * - 定期轮询后端错误事件
 * - 收集错误到响应式列表，由组件负责渲染
 * - 提供查看详细错误信息的对话框
 *
 * @author Agent Society
 */

import { reactive } from 'vue';
import { apiService, type ErrorEvent } from './api';

// 轮询间隔（毫秒）
const POLL_INTERVAL = 3000;

// 响应式错误列表，供组件消费
export const errorList = reactive<ErrorEvent[]>([]);

// 存储当前错误，供查看详情时使用
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
  private processedErrors = new Set<string>(); // 防止重复显示

  /**
   * 初始化服务
   */
  init() {
    if (this.timer) return;

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

    // 添加到响应式错误列表，由组件负责渲染
    errorList.push(error);

    // 设置为当前错误（供详情查看）
    setCurrentErrorForDetail(error);

    // 10秒后自动从列表中移除
    setTimeout(() => {
      const index = errorList.findIndex(e => e === error);
      if (index !== -1) {
        errorList.splice(index, 1);
      }
    }, 10000);
  }

  /**
   * 根据错误分类获取严重程度
   */
  getSeverity(category: string): 'error' | 'warn' | 'info' {
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

  /**
   * 移除指定的错误
   */
  removeError(error: ErrorEvent) {
    const index = errorList.findIndex(e => e === error);
    if (index !== -1) {
      errorList.splice(index, 1);
    }
  }

  /**
   * 清空所有错误
   */
  clearAll() {
    errorList.length = 0;
  }
}

// 单例实例
export const errorNotificationService = new ErrorNotificationService();
