/**
 * Chrome 模块管理面板 JavaScript
 * 遵循标准模块面板命名约定: window.ModulePanel_{PascalCaseName}
 */

const ModulePanel_Chrome = {
  selectedBrowserId: null,
  selectedTabId: null,
  apiBase: '/api/modules/chrome',
  initTimeout: 10000, // 初始化超时时间（毫秒）

  /**
   * 初始化面板
   */
  async init() {
    try {
      // 使用超时保护，避免无限等待
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('加载超时')), this.initTimeout);
      });
      
      await Promise.race([
        this.loadBrowsers(),
        timeoutPromise
      ]);
    } catch (err) {
      console.error('Chrome 面板初始化失败:', err);
      const container = document.getElementById('browser-list');
      if (container) {
        container.innerHTML = `<div class="error">初始化失败: ${err.message}</div>`;
      }
    }
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
    if (!container) {
      throw new Error('找不到浏览器列表容器');
    }
    container.innerHTML = '<div class="loading">加载中...</div>';

    const response = await fetch(`${this.apiBase}/browsers`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
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
  },

  /**
   * 渲染浏览器列表
   */
  renderBrowserList(browsers) {
    const container = document.getElementById('browser-list');
    container.innerHTML = browsers.map(browser => `
      <div class="browser-item ${browser.id === this.selectedBrowserId ? 'selected' : ''}" 
           onclick="ModulePanel_Chrome.selectBrowser('${browser.id}')">
        <div class="browser-info">
          <div class="browser-id">🌐 ${browser.id.slice(0, 8)}...</div>
          <div class="browser-status ${browser.status}">${browser.status}</div>
        </div>
        <button class="close-btn" onclick="event.stopPropagation(); ModulePanel_Chrome.closeBrowser('${browser.id}')">
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
           onclick="ModulePanel_Chrome.selectTab('${tab.id}')">
        <div class="tab-info">
          <div class="tab-title">📄 ${this.escapeHtml(tab.title || '无标题')}</div>
          <div class="tab-url">${this.escapeHtml(tab.url || 'about:blank')}</div>
        </div>
        <button class="close-btn" onclick="event.stopPropagation(); ModulePanel_Chrome.closeTab('${tab.id}')">
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
      el.classList.toggle('selected', el.onclick?.toString().includes(tabId));
    });

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

    container.innerHTML = `<img src="data:image/jpeg;base64,${base64Data}" alt="页面截图">`;
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

// 注册到全局（标准命名约定）
window.ModulePanel_Chrome = ModulePanel_Chrome;

// 保留别名以兼容旧代码
window.ChromePanel = ModulePanel_Chrome;

// 页面加载完成后初始化（独立页面使用）
// 嵌入式使用时由 ModulesPanel 调用 ModulePanel_Chrome.init()
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ModulePanel_Chrome.init();
  });
}
// 嵌入式模式下不自动初始化，等待 ModulesPanel 调用
