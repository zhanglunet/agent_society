/**
 * Chrome 模块管理面板 JavaScript
 */

const ChromePanel = {
  selectedBrowserId: null,
  selectedTabId: null,
  apiBase: '/api/modules/chrome',

  /**
   * 初始化面板
   */
  async init() {
    await this.loadBrowsers();
  },

  /**
   * 刷新所有数据
   */
  async refresh() {
    this.selectedBrowserId = null;
    this.selectedTabId = null;
    await this.loadBrowsers();
    this.renderTabList([]);
    this.renderScreenshot(null);
  },

  /**
   * 加载浏览器列表
   */
  async loadBrowsers() {
    const container = document.getElementById('browser-list');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const response = await fetch(`${this.apiBase}/browsers`);
      const data = await response.json();

      if (data.error) {
        container.innerHTML = `<div class="error">错误: ${data.error}</div>`;
        return;
      }

      const browsers = data.browsers || [];
      if (browsers.length === 0) {
        container.innerHTML = '<div class="empty">暂无浏览器实例</div>';
        return;
      }

      this.renderBrowserList(browsers);
    } catch (err) {
      container.innerHTML = `<div class="error">加载失败: ${err.message}</div>`;
    }
  },

  /**
   * 渲染浏览器列表
   */
  renderBrowserList(browsers) {
    const container = document.getElementById('browser-list');
    container.innerHTML = browsers.map(browser => `
      <div class="browser-item ${browser.id === this.selectedBrowserId ? 'selected' : ''}" 
           onclick="ChromePanel.selectBrowser('${browser.id}')">
        <div class="browser-info">
          <div class="browser-id">🌐 ${browser.id.slice(0, 8)}...</div>
          <div class="browser-status ${browser.status}">${browser.status}</div>
        </div>
        <button class="close-btn" onclick="event.stopPropagation(); ChromePanel.closeBrowser('${browser.id}')">
          关闭
        </button>
      </div>
    `).join('');
  },

  /**
   * 选择浏览器
   */
  async selectBrowser(browserId) {
    this.selectedBrowserId = browserId;
    this.selectedTabId = null;
    
    // 更新选中状态
    document.querySelectorAll('.browser-item').forEach(el => {
      el.classList.toggle('selected', el.querySelector('.browser-id').textContent.includes(browserId.slice(0, 8)));
    });

    await this.loadTabs(browserId);
    this.renderScreenshot(null);
  },

  /**
   * 关闭浏览器
   */
  async closeBrowser(browserId) {
    if (!confirm('确定要关闭此浏览器实例吗？')) return;

    try {
      const response = await fetch(`${this.apiBase}/browsers/${browserId}/close`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.error) {
        alert(`关闭失败: ${data.error}`);
        return;
      }

      await this.refresh();
    } catch (err) {
      alert(`关闭失败: ${err.message}`);
    }
  },

  /**
   * 加载标签页列表
   */
  async loadTabs(browserId) {
    const container = document.getElementById('tab-list');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const response = await fetch(`${this.apiBase}/browsers/${browserId}/tabs`);
      const data = await response.json();

      if (data.error) {
        container.innerHTML = `<div class="error">错误: ${data.error}</div>`;
        return;
      }

      const tabs = data.tabs || [];
      if (tabs.length === 0) {
        container.innerHTML = '<div class="empty">暂无标签页</div>';
        return;
      }

      this.renderTabList(tabs);
    } catch (err) {
      container.innerHTML = `<div class="error">加载失败: ${err.message}</div>`;
    }
  },

  /**
   * 渲染标签页列表
   */
  renderTabList(tabs) {
    const container = document.getElementById('tab-list');
    
    if (tabs.length === 0) {
      container.innerHTML = '<div class="empty">请先选择一个浏览器实例</div>';
      return;
    }

    container.innerHTML = tabs.map(tab => `
      <div class="tab-item ${tab.id === this.selectedTabId ? 'selected' : ''}"
           onclick="ChromePanel.selectTab('${tab.id}')">
        <div class="tab-info">
          <div class="tab-title">📄 ${this.escapeHtml(tab.title || '无标题')}</div>
          <div class="tab-url">${this.escapeHtml(tab.url || 'about:blank')}</div>
        </div>
        <button class="close-btn" onclick="event.stopPropagation(); ChromePanel.closeTab('${tab.id}')">
          关闭
        </button>
      </div>
    `).join('');
  },

  /**
   * 选择标签页
   */
  async selectTab(tabId) {
    this.selectedTabId = tabId;
    
    // 更新选中状态
    document.querySelectorAll('.tab-item').forEach(el => {
      el.classList.remove('selected');
    });
    event.currentTarget?.classList.add('selected');

    await this.loadScreenshot(tabId);
  },

  /**
   * 关闭标签页
   */
  async closeTab(tabId) {
    if (!confirm('确定要关闭此标签页吗？')) return;

    try {
      const response = await fetch(`${this.apiBase}/tabs/${tabId}/close`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.error) {
        alert(`关闭失败: ${data.error}`);
        return;
      }

      if (this.selectedBrowserId) {
        await this.loadTabs(this.selectedBrowserId);
      }
      this.renderScreenshot(null);
    } catch (err) {
      alert(`关闭失败: ${err.message}`);
    }
  },

  /**
   * 加载截图
   */
  async loadScreenshot(tabId) {
    const container = document.getElementById('screenshot-preview');
    container.innerHTML = '<div class="loading">加载截图中...</div>';

    try {
      const response = await fetch(`${this.apiBase}/tabs/${tabId}/screenshot`);
      const data = await response.json();

      if (data.error) {
        container.innerHTML = `<div class="error">截图失败: ${data.error}</div>`;
        return;
      }

      if (data.screenshot) {
        this.renderScreenshot(data.screenshot);
      } else {
        container.innerHTML = '<div class="empty">无法获取截图</div>';
      }
    } catch (err) {
      container.innerHTML = `<div class="error">加载失败: ${err.message}</div>`;
    }
  },

  /**
   * 渲染截图
   */
  renderScreenshot(base64Data) {
    const container = document.getElementById('screenshot-preview');
    
    if (!base64Data) {
      container.innerHTML = '<div class="empty">请先选择一个标签页</div>';
      return;
    }

    container.innerHTML = `<img src="data:image/png;base64,${base64Data}" alt="页面截图">`;
  },

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  ChromePanel.init();
});
