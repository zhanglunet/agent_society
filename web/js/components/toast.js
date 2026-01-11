/**
 * Toast 通知组件
 * 显示临时提示消息
 */

const Toast = {
  // DOM 容器
  container: null,

  /**
   * 初始化组件
   */
  init() {
    // 创建容器（如果不存在）
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  /**
   * 显示 Toast 消息
   * @param {string} message - 消息内容
   * @param {string} type - 类型 ('success', 'error', 'warning', 'info')
   * @param {number} duration - 显示时长（毫秒），默认 3000
   */
  show(message, type = 'info', duration = 3000) {
    if (!this.container) {
      this.init();
    }

    // 创建 Toast 元素
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // 添加到容器
    this.container.appendChild(toast);

    // 自动移除
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  },

  /**
   * 显示成功消息
   * @param {string} message - 消息内容
   */
  success(message) {
    this.show(message, 'success');
  },

  /**
   * 显示错误消息
   * @param {string} message - 消息内容
   */
  error(message) {
    this.show(message, 'error');
  },

  /**
   * 显示警告消息
   * @param {string} message - 消息内容
   * @param {number} [duration] - 显示时长（毫秒）
   */
  warning(message, duration) {
    this.show(message, 'warning', duration);
  },

  /**
   * 显示信息消息
   * @param {string} message - 消息内容
   */
  info(message) {
    this.show(message, 'info');
  },
};

// 导出供其他模块使用
window.Toast = Toast;
