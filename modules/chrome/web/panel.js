/**
 * Chrome 浏览器管理面板 JavaScript
 * 适配新框架 - 作为 ES 模块执行
 */

// 配置（使用 var 避免重复声明错误）
var CONFIG = {
  apiBase: '/api/modules/chrome',
  refreshInterval: 2000  // 2秒自动刷新
};

// 面板状态（使用 var 避免重复声明错误）
var state = {
  browsers: [],
  tabs: [],
  selectedBrowserId: null,
  selectedTabId: null,
  isLoading: false,
  refreshTimer: null,
  // 记录用户是否正在交互，避免刷新干扰
  isUserInteracting: false
};

// HTML 转义（使用 var 避免重复声明错误）
var escapeHtml = function(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// 初始化面板（使用 var 避免重复声明错误）
var init = function() {
  const panel = document.querySelector('.chrome-panel');
  if (!panel) {
    console.error('[ChromePanel] 错误: 找不到 .chrome-panel 容器');
    return;
  }

  // 绑定事件
  bindEvents(panel);

  // 首次加载
  loadBrowsers();

  // 启动自动刷新
  startAutoRefresh();
}

// 绑定事件处理（使用 var 避免重复声明错误）
var bindEvents = function(panel) {
  // 浏览器列表点击事件（事件委托）
  const browserList = panel.querySelector('#browser-list');
  if (browserList) {
    // 鼠标进入/离开标记交互状态
    browserList.addEventListener('mouseenter', () => state.isUserInteracting = true);
    browserList.addEventListener('mouseleave', () => state.isUserInteracting = false);

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
    tabList.addEventListener('mouseenter', () => state.isUserInteracting = true);
    tabList.addEventListener('mouseleave', () => state.isUserInteracting = false);

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

// 启动自动刷新（使用 var 避免重复声明错误）
var startAutoRefresh = function() {
  stopAutoRefresh();
  state.refreshTimer = setInterval(() => {
    // 用户正在交互时不刷新，避免干扰
    if (!state.isUserInteracting && !state.isLoading) {
      refreshData();
    }
  }, CONFIG.refreshInterval);
}

// 停止自动刷新（使用 var 避免重复声明错误）
var stopAutoRefresh = function() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }
}

// 刷新数据（保持选中状态）（使用 var 避免重复声明错误）
var refreshData = async function() {
  if (state.isLoading) return;

  // 静默刷新浏览器列表，不显示加载状态
  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers`);
    if (!response.ok) return;

    const data = await response.json();
    if (data.error) return;

    const newBrowsers = data.browsers || [];

    // 检查是否有变化
    const hasChanged = hasBrowserListChanged(state.browsers, newBrowsers);

    if (hasChanged) {
      state.browsers = newBrowsers;
      // 只更新DOM，不改变选中状态
      updateBrowserListUI();
    }

    // 如果当前有选中的浏览器，刷新其标签页
    if (state.selectedBrowserId) {
      // 检查选中的浏览器是否还存在
      const stillExists = newBrowsers.some(b => b.id === state.selectedBrowserId);
      if (stillExists) {
        await refreshTabsSilent();
      } else {
        // 浏览器已关闭，清空选择
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

// 检查浏览器列表是否有变化（使用 var 避免重复声明错误）
var hasBrowserListChanged = function(oldList, newList) {
  if (oldList.length !== newList.length) return true;
  for (let i = 0; i < oldList.length; i++) {
    if (oldList[i].id !== newList[i].id) return true;
    if (oldList[i].status !== newList[i].status) return true;
  }
  return false;
}

// 首次加载浏览器列表（使用 var 避免重复声明错误）
var loadBrowsers = async function() {
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      container.innerHTML = `<div class="error-text">错误: ${escapeHtml(data.error)}</div>`;
      return;
    }

    state.browsers = data.browsers || [];
    updateBrowserListUI();
  } catch (err) {
    console.error('[ChromePanel] 加载浏览器列表失败:', err);
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  } finally {
    state.isLoading = false;
  }
}

// 更新浏览器列表UI（不重置选中状态）（使用 var 避免重复声明错误）
var updateBrowserListUI = function() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#browser-list');
  if (!container) return;

  if (state.browsers.length === 0) {
    container.innerHTML = '<div class="empty-text">暂无浏览器实例</div>';
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

  container.innerHTML = html;
}

// 选择浏览器（使用 var 避免重复声明错误）
var selectBrowser = async function(browserId) {
  state.selectedBrowserId = browserId;
  state.selectedTabId = null;
  state.tabs = [];

  // 更新UI
  updateBrowserListUI();
  updateTabListUI();
  updateScreenshotUI();

  // 加载标签页
  await loadTabs(browserId);
}

// 关闭浏览器（使用 var 避免重复声明错误）
var closeBrowser = async function(browserId) {
  if (!confirm('确定要关闭此浏览器实例吗？')) return;

  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers/${encodeURIComponent(browserId)}/close`, {
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
      updateTabListUI();
      updateScreenshotUI();
    }

    // 立即刷新列表
    await refreshData();
  } catch (err) {
    console.error('关闭浏览器失败:', err);
    alert(`关闭失败: ${err.message}`);
  }
}

// 加载标签页列表（使用 var 避免重复声明错误）
var loadTabs = async function(browserId) {
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
    console.error('加载标签页失败:', err);
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

// 静默刷新标签页（不改变选中状态）（使用 var 避免重复声明错误）
var refreshTabsSilent = async function() {
  if (!state.selectedBrowserId) return;

  try {
    const response = await fetch(`${CONFIG.apiBase}/browsers/${encodeURIComponent(state.selectedBrowserId)}/tabs`);
    const data = await response.json();

    if (data.error) return;

    const newTabs = data.tabs || [];

    // 检查是否有变化
    const hasChanged = hasTabListChanged(state.tabs, newTabs);

    if (hasChanged) {
      state.tabs = newTabs;
      updateTabListUI();
    }

    // 如果当前有选中的标签页，刷新截图
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

// 检查标签页列表是否有变化（使用 var 避免重复声明错误）
var hasTabListChanged = function(oldList, newList) {
  if (oldList.length !== newList.length) return true;
  for (let i = 0; i < oldList.length; i++) {
    if (oldList[i].id !== newList[i].id) return true;
    if (oldList[i].url !== newList[i].url) return true;
    if (oldList[i].title !== newList[i].title) return true;
  }
  return false;
}

// 更新标签页列表UI（使用 var 避免重复声明错误）
var updateTabListUI = function() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#tab-list');
  const countEl = panel?.querySelector('#tab-count');
  if (!container) return;

  if (countEl) {
    countEl.textContent = `(${state.tabs.length})`;
  }

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

// 选择标签页（使用 var 避免重复声明错误）
var selectTab = async function(tabId) {
  state.selectedTabId = tabId;

  // 更新UI
  updateTabListUI();

  // 加载截图
  await loadScreenshot(tabId);
}

// 关闭标签页（使用 var 避免重复声明错误）
var closeTab = async function(tabId) {
  if (!confirm('确定要关闭此标签页吗？')) return;

  try {
    const response = await fetch(`${CONFIG.apiBase}/tabs/${encodeURIComponent(tabId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (data.error) {
      console.warn('标签页关闭错误:', data);
    }

    // 如果关闭的是当前选中的，清空选择
    if (state.selectedTabId === tabId) {
      state.selectedTabId = null;
      updateScreenshotUI();
    }

    // 立即刷新
    await refreshTabsSilent();
  } catch (err) {
    console.error('关闭标签页失败:', err);
  }
}

// 加载截图（使用 var 避免重复声明错误）
var loadScreenshot = async function(tabId) {
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
    } else if (data.files && data.files.length > 0) {
      container.innerHTML = `<div class="empty-text">截图已保存到: ${escapeHtml(data.files[0].path)}</div>`;
    } else {
      container.innerHTML = '<div class="empty-text">无法获取截图</div>';
    }
  } catch (err) {
    console.error('加载截图失败:', err);
    container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

// 更新截图UI（使用 var 避免重复声明错误）
var updateScreenshotUI = function() {
  const panel = document.querySelector('.chrome-panel');
  const container = panel?.querySelector('#screenshot-container');
  if (!container) return;

  container.innerHTML = '<div class="empty-text">请选择一个标签页</div>';
}

// 自动初始化
setTimeout(init, 100);

// 导出到全局
if (typeof window !== 'undefined') {
  window.ChromePanel = { init, state, refreshData };
}
