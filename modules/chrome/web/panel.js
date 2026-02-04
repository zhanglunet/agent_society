/**
 * Chrome 浏览器管理面板 JavaScript
 * 在独立 iframe 中运行，使用 const/let 安全
 */

// 配置
const CONFIG = {
  apiBase: '/api/modules/chrome',
  refreshInterval: 2000  // 2秒自动刷新
};

// 面板状态
const state = {
  browsers: [],
  tabs: [],
  selectedBrowserId: null,
  selectedTabId: null,
  isLoading: false,
  refreshTimer: null,
  isUserInteracting: false
};

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
  const panel = document.querySelector('.chrome-panel');
  if (!panel) {
    console.error('[ChromePanel] 错误: 找不到 .chrome-panel 容器');
    return;
  }

  bindEvents(panel);
  loadBrowsers();
  startAutoRefresh();
}

/**
 * 绑定事件处理
 */
function bindEvents(panel) {
  const browserList = panel.querySelector('#browser-list');
  if (browserList) {
    browserList.addEventListener('mouseenter', () => state.isUserInteracting = true);
    browserList.addEventListener('mouseleave', () => state.isUserInteracting = false);

    browserList.addEventListener('click', (e) => {
      const item = e.target.closest('.list-item');
      if (!item) return;

      const browserId = item.dataset.id;
      if (!browserId) return;

      if (e.target.closest('.btn-close')) {
        e.stopPropagation();
        closeBrowser(browserId);
        return;
      }

      selectBrowser(browserId);
    });
  }

  const tabList = panel.querySelector('#tab-list');
  if (tabList) {
    tabList.addEventListener('mouseenter', () => state.isUserInteracting = true);
    tabList.addEventListener('mouseleave', () => state.isUserInteracting = false);

    tabList.addEventListener('click', (e) => {
      const item = e.target.closest('.list-item');
      if (!item) return;

      const tabId = item.dataset.id;
      if (!tabId) return;

      if (e.target.closest('.btn-close')) {
        e.stopPropagation();
        closeTab(tabId);
        return;
      }

      selectTab(tabId);
    });
  }
}

/**
 * 启动自动刷新
 */
function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = setInterval(() => {
    if (!state.isUserInteracting && !state.isLoading) {
      refreshData();
    }
  }, CONFIG.refreshInterval);
}

/**
 * 停止自动刷新
 */
function stopAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

/**
 * 刷新数据
 */
async function refreshData() {
  if (state.isLoading) return;

  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers`);
    if (!response.ok) return;

    const data = await response.json();
    if (data.error) return;

    const newBrowsers = data.browsers || [];

    if (hasBrowserListChanged(state.browsers, newBrowsers)) {
      state.browsers = newBrowsers;
      updateBrowserListUI();
    }

    if (state.selectedBrowserId) {
      const stillExists = newBrowsers.some(b => b.id === state.selectedBrowserId);
      if (stillExists) {
        await refreshTabsSilent();
      } else {
        state.selectedBrowserId = null;
        state.selectedTabId = null;
        state.tabs = [];
        updateBrowserListUI();
        updateTabListUI();
        updateScreenshotUI();
      }
    }
  } catch (err) {
    console.error('[ChromePanel] 刷新失败:', err);
  }
}

/**
 * 检查浏览器列表变化
 */
function hasBrowserListChanged(oldList, newList) {
  if (oldList.length !== newList.length) return true;
  for (let i = 0; i < oldList.length; i++) {
    if (oldList[i].id !== newList[i].id) return true;
    if (oldList[i].status !== newList[i].status) return true;
  }
  return false;
}

/**
 * 首次加载浏览器列表
 */
async function loadBrowsers() {
  state.isLoading = true;

  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#browser-list');
  if (!container) {
    state.isLoading = false;
    return;
  }

  container.innerHTML = '<div class="loading-text">加载中...</div>';

  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) {
      container.innerHTML = `<div class="error-text">错误: ${escapeHtml(data.error)}</div>`;
      return;
    }

    state.browsers = data.browsers || [];
    updateBrowserListUI();
  } catch (err) {
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  } finally {
    state.isLoading = false;
  }
}

/**
 * 更新浏览器列表UI
 */
function updateBrowserListUI() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#browser-list');
  if (!container) return;

  if (state.browsers.length === 0) {
    container.innerHTML = '<div class="empty-text">暂无浏览器实例</div>';
    return;
  }

  container.innerHTML = state.browsers.map(browser => {
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
}

/**
 * 选择浏览器
 */
async function selectBrowser(browserId) {
  state.selectedBrowserId = browserId;
  state.selectedTabId = null;
  state.tabs = [];

  updateBrowserListUI();
  updateTabListUI();
  updateScreenshotUI();

  await loadTabs(browserId);
}

/**
 * 关闭浏览器
 */
async function closeBrowser(browserId) {
  if (!confirm('确定要关闭此浏览器实例吗？')) return;

  try {
    await fetch(`${CONFIG.apiBase}/browsers/${encodeURIComponent(browserId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (state.selectedBrowserId === browserId) {
      state.selectedBrowserId = null;
      state.selectedTabId = null;
      state.tabs = [];
      updateTabListUI();
      updateScreenshotUI();
    }

    await refreshData();
  } catch (err) {
    alert(`关闭失败: ${err.message}`);
  }
}

/**
 * 加载标签页列表
 */
async function loadTabs(browserId) {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#tab-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-text">加载中...</div>';

  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers/${encodeURIComponent(browserId)}/tabs`);
    const data = await response.json();

    if (data.error) {
      container.innerHTML = `<div class="error-text">错误: ${escapeHtml(data.error)}</div>`;
      return;
    }

    state.tabs = data.tabs || [];
    updateTabListUI();
  } catch (err) {
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 静默刷新标签页
 */
async function refreshTabsSilent() {
  if (!state.selectedBrowserId) return;

  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers/${encodeURIComponent(state.selectedBrowserId)}/tabs`);
    const data = await response.json();
    if (data.error) return;

    const newTabs = data.tabs || [];
    if (hasTabListChanged(state.tabs, newTabs)) {
      state.tabs = newTabs;
      updateTabListUI();
    }

    if (state.selectedTabId) {
      const stillExists = newTabs.some(t => t.id === state.selectedTabId);
      if (!stillExists) {
        state.selectedTabId = null;
        updateTabListUI();
        updateScreenshotUI();
      }
    }
  } catch (err) {
    console.error('[ChromePanel] 刷新标签页失败:', err);
  }
}

/**
 * 检查标签页列表变化
 */
function hasTabListChanged(oldList, newList) {
  if (oldList.length !== newList.length) return true;
  for (let i = 0; i < oldList.length; i++) {
    if (oldList[i].id !== newList[i].id) return true;
    if (oldList[i].url !== newList[i].url) return true;
  }
  return false;
}

/**
 * 更新标签页列表UI
 */
function updateTabListUI() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#tab-list');
  const countEl = panel?.querySelector('#tab-count');
  if (!container) return;

  if (countEl) countEl.textContent = `(${state.tabs.length})`;

  if (state.tabs.length === 0) {
    container.innerHTML = state.selectedBrowserId
      ? '<div class="empty-text">暂无标签页</div>'
      : '<div class="empty-text">请选择一个浏览器实例</div>';
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
  updateTabListUI();
  await loadScreenshot(tabId);
}

/**
 * 关闭标签页
 */
async function closeTab(tabId) {
  if (!confirm('确定要关闭此标签页吗？')) return;

  try {
    await fetch(`${CONFIG.apiBase}/tabs/${encodeURIComponent(tabId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (state.selectedTabId === tabId) {
      state.selectedTabId = null;
      updateScreenshotUI();
    }

    await refreshTabsSilent();
  } catch (err) {
    console.error('关闭标签页失败:', err);
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
    const response = await fetch(`${CONFIG.apiBase}/tabs/${encodeURIComponent(tabId)}/screenshot`);
    const data = await response.json();

    if (data.error) {
      container.innerHTML = `<div class="error-text">截图失败: ${escapeHtml(data.error)}</div>`;
      return;
    }

    if (data.screenshot) {
      container.innerHTML = `<img src="data:image/jpeg;base64,${data.screenshot}" alt="页面截图">`;
    } else {
      container.innerHTML = '<div class="empty-text">无法获取截图</div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 更新截图UI
 */
function updateScreenshotUI() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#screenshot-container');
  if (container) container.innerHTML = '<div class="empty-text">请选择一个标签页</div>';
}

// 启动
document.addEventListener('DOMContentLoaded', init);
