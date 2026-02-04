/**
 * Chrome 浏览器管理面板 JavaScript
 * 适配新框架 - 作为 ES 模块执行
 */

// 面板状态
const state = {
  browsers: [],
  tabs: [],
  selectedBrowserId: null,
  selectedTabId: null,
  isLoading: false
};

// API 基础路径
const API_BASE = '/api/modules/chrome';

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * 初始化面板
 */
function init() {
  // 找到当前容器
  const panel = document.querySelector('.chrome-panel');
  if (!panel) {
    console.warn('Chrome panel container not found');
    return;
  }
  
  // 绑定事件
  bindEvents(panel);
  
  // 加载浏览器列表
  loadBrowsers();
}

/**
 * 绑定事件处理
 */
function bindEvents(panel) {
  // 启动新浏览器按钮
  const launchBtn = panel.querySelector('#btn-launch-browser');
  if (launchBtn) {
    launchBtn.addEventListener('click', launchNewBrowser);
  }

  // 刷新截图按钮
  const refreshBtn = panel.querySelector('#btn-refresh-screenshot');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (state.selectedTabId) {
        loadScreenshot(state.selectedTabId);
      }
    });
  }

  // 浏览器列表点击事件（事件委托）
  const browserList = panel.querySelector('#browser-list');
  if (browserList) {
    browserList.addEventListener('click', (e) => {
      const item = e.target.closest('.list-item');
      if (!item) return;

      const browserId = item.dataset.id;
      if (!browserId) return;

      // 关闭按钮
      if (e.target.closest('.btn-close')) {
        e.stopPropagation();
        closeBrowser(browserId);
        return;
      }

      // 选择浏览器
      selectBrowser(browserId);
    });
  }

  // 标签页列表点击事件（事件委托）
  const tabList = panel.querySelector('#tab-list');
  if (tabList) {
    tabList.addEventListener('click', (e) => {
      const item = e.target.closest('.list-item');
      if (!item) return;

      const tabId = item.dataset.id;
      if (!tabId) return;

      // 关闭按钮
      if (e.target.closest('.btn-close')) {
        e.stopPropagation();
        closeTab(tabId);
        return;
      }

      // 选择标签页
      selectTab(tabId);
    });
  }
}

/**
 * 加载浏览器列表
 */
async function loadBrowsers() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#browser-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-text">加载中...</div>';

  try {
    const response = await fetch(`${API_BASE}/browsers`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      container.innerHTML = `<div class="error-text">错误: ${escapeHtml(data.error)}</div>`;
      return;
    }

    state.browsers = data.browsers || [];
    renderBrowserList();
  } catch (err) {
    console.error('加载浏览器列表失败:', err);
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 渲染浏览器列表
 */
function renderBrowserList() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#browser-list');
  if (!container) return;

  if (state.browsers.length === 0) {
    container.innerHTML = `
      <div class="empty-text">暂无浏览器实例</div>
      <button class="launch-btn" id="btn-launch-empty">🌐 启动新浏览器</button>
    `;
    
    const launchBtn = container.querySelector('#btn-launch-empty');
    if (launchBtn) {
      launchBtn.addEventListener('click', launchNewBrowser);
    }
    return;
  }

  const html = state.browsers.map(browser => {
    const isSelected = browser.id === state.selectedBrowserId;
    const shortId = browser.id.slice(0, 8) + '...';
    
    return `
      <div class="list-item ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(browser.id)}">
        <div class="list-item-content">
          <span class="item-icon">🌐</span>
          <div class="item-info">
            <span class="item-title" title="${escapeHtml(browser.id)}">${escapeHtml(shortId)}</span>
            <span class="item-subtitle">
              <span class="status-badge ${escapeHtml(browser.status)}"></span>
              ${escapeHtml(browser.status)}
            </span>
          </div>
        </div>
        <button class="btn-close" title="关闭浏览器">✕</button>
      </div>
    `;
  }).join('');

  container.innerHTML = html + `
    <button class="launch-btn" id="btn-launch-more">+ 启动新浏览器</button>
  `;
  
  const launchBtn = container.querySelector('#btn-launch-more');
  if (launchBtn) {
    launchBtn.addEventListener('click', launchNewBrowser);
  }
}

/**
 * 选择浏览器
 */
async function selectBrowser(browserId) {
  state.selectedBrowserId = browserId;
  state.selectedTabId = null;
  state.tabs = [];
  
  // 更新选中状态
  renderBrowserList();
  
  // 清空标签页列表和截图
  const panel = document.querySelector('.chrome-panel');
  const tabList = panel?.querySelector('#tab-list');
  if (tabList) {
    tabList.innerHTML = '<div class="loading-text">加载中...</div>';
  }
  
  const screenshotContainer = panel?.querySelector('#screenshot-container');
  if (screenshotContainer) {
    screenshotContainer.innerHTML = '<div class="empty-text">请选择一个标签页</div>';
  }

  // 加载标签页
  await loadTabs(browserId);
}

/**
 * 关闭浏览器
 */
async function closeBrowser(browserId) {
  if (!confirm('确定要关闭此浏览器实例吗？')) return;

  try {
    const response = await fetch(`${API_BASE}/browsers/${encodeURIComponent(browserId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (data.error) {
      alert(`关闭失败: ${data.error}`);
      return;
    }

    // 如果关闭的是当前选中的，清空选择
    if (state.selectedBrowserId === browserId) {
      state.selectedBrowserId = null;
      state.selectedTabId = null;
      state.tabs = [];
      
      const panel = document.querySelector('.chrome-panel');
      const tabList = panel?.querySelector('#tab-list');
      if (tabList) {
        tabList.innerHTML = '<div class="empty-text">请选择一个浏览器实例</div>';
      }
      
      const screenshotContainer = panel?.querySelector('#screenshot-container');
      if (screenshotContainer) {
        screenshotContainer.innerHTML = '<div class="empty-text">请选择一个标签页</div>';
      }
    }

    // 刷新列表
    await loadBrowsers();
  } catch (err) {
    console.error('关闭浏览器失败:', err);
    alert(`关闭失败: ${err.message}`);
  }
}

/**
 * 启动新浏览器
 */
async function launchNewBrowser() {
  try {
    const panel = document.querySelector('.chrome-panel');
    const container = panel?.querySelector('#browser-list');
    if (container) {
      container.innerHTML = '<div class="loading-text">启动中...</div>';
    }

    // 调用 chrome_launch 工具
    const response = await fetch('/api/tool-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'chrome_launch',
        args: { headless: true }
      })
    });

    const data = await response.json();

    if (data.error) {
      alert(`启动失败: ${data.error}`);
      await loadBrowsers();
      return;
    }

    // 刷新列表
    await loadBrowsers();
    
    // 选中新启动的浏览器
    if (data.result?.browserId) {
      selectBrowser(data.result.browserId);
    }
  } catch (err) {
    console.error('启动浏览器失败:', err);
    alert(`启动失败: ${err.message}`);
    await loadBrowsers();
  }
}

/**
 * 加载标签页列表
 */
async function loadTabs(browserId) {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#tab-list');
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE}/browsers/${encodeURIComponent(browserId)}/tabs`);
    const data = await response.json();

    if (data.error) {
      container.innerHTML = `<div class="error-text">错误: ${escapeHtml(data.error)}</div>`;
      return;
    }

    state.tabs = data.tabs || [];
    renderTabList();
  } catch (err) {
    console.error('加载标签页失败:', err);
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 渲染标签页列表
 */
function renderTabList() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#tab-list');
  const countEl = panel?.querySelector('#tab-count');
  if (!container) return;

  if (countEl) {
    countEl.textContent = `(${state.tabs.length})`;
  }

  if (state.tabs.length === 0) {
    container.innerHTML = '<div class="empty-text">暂无标签页</div>';
    return;
  }

  container.innerHTML = state.tabs.map(tab => {
    const isSelected = tab.id === state.selectedTabId;
    const title = tab.title || '无标题';
    const url = tab.url || 'about:blank';
    
    return `
      <div class="list-item ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(tab.id)}">
        <div class="list-item-content">
          <span class="item-icon">📄</span>
          <div class="item-info">
            <span class="item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
            <span class="item-subtitle" title="${escapeHtml(url)}">${escapeHtml(url)}</span>
          </div>
        </div>
        <button class="btn-close" title="关闭标签页">✕</button>
      </div>
    `;
  }).join('');
}

/**
 * 选择标签页
 */
async function selectTab(tabId) {
  state.selectedTabId = tabId;
  
  // 更新选中状态
  renderTabList();
  
  // 加载截图
  await loadScreenshot(tabId);
}

/**
 * 关闭标签页
 */
async function closeTab(tabId) {
  if (!confirm('确定要关闭此标签页吗？')) return;

  try {
    const response = await fetch(`${API_BASE}/tabs/${encodeURIComponent(tabId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (data.error) {
      // 根据错误类型显示不同提示
      let errorMessage = `关闭失败: ${data.error}`;
      if (data.errorType === 'connection_lost') {
        errorMessage = '标签页连接已断开';
      } else if (data.errorType === 'timeout') {
        errorMessage = '关闭操作超时';
      } else if (data.message) {
        errorMessage = `关闭失败: ${data.message}`;
      }
      
      console.warn('标签页关闭错误:', data);
      // 不 alert，因为可能已经关闭了
    }

    // 如果关闭的是当前选中的，清空选择
    if (state.selectedTabId === tabId) {
      state.selectedTabId = null;
      
      const panel = document.querySelector('.chrome-panel');
      const screenshotContainer = panel?.querySelector('#screenshot-container');
      if (screenshotContainer) {
        screenshotContainer.innerHTML = '<div class="empty-text">请选择一个标签页</div>';
      }
    }

    // 刷新列表
    if (state.selectedBrowserId) {
      await loadTabs(state.selectedBrowserId);
    }
  } catch (err) {
    console.error('关闭标签页失败:', err);
    // 刷新列表
    if (state.selectedBrowserId) {
      await loadTabs(state.selectedBrowserId);
    }
  }
}

/**
 * 加载截图
 */
async function loadScreenshot(tabId) {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#screenshot-container');
  if (!container) return;

  container.innerHTML = '<div class="loading-text">加载截图中...</div>';

  try {
    const response = await fetch(`${API_BASE}/tabs/${encodeURIComponent(tabId)}/screenshot`);
    const data = await response.json();

    if (data.error) {
      container.innerHTML = `<div class="error-text">截图失败: ${escapeHtml(data.error)}</div>`;
      return;
    }

    if (data.screenshot) {
      container.innerHTML = `<img src="data:image/jpeg;base64,${data.screenshot}" alt="页面截图">`;
    } else if (data.files && data.files.length > 0) {
      // 截图已保存到文件
      container.innerHTML = `<div class="empty-text">截图已保存到: ${escapeHtml(data.files[0].path)}</div>`;
    } else {
      container.innerHTML = '<div class="empty-text">无法获取截图</div>';
    }
  } catch (err) {
    console.error('加载截图失败:', err);
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

// 自动初始化
// 使用 setTimeout 确保 DOM 已就绪
setTimeout(init, 0);

// 导出到全局（供可能的需要）
if (typeof window !== 'undefined') {
  window.ChromePanel = { init, state };
}
