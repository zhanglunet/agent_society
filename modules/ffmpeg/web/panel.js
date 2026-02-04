/**
 * FFmpeg 任务管理面板 JavaScript
 * 适配新框架 - 作为 ES 模块执行
 */

// 配置和状态
const CONFIG = {
  apiBase: '/api/modules/ffmpeg',
  refreshIntervalMs: 3000
};

const state = {
  tasks: [],
  autoRefresh: true,
  refreshTimer: null,
  isLoading: false
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
 * 格式化时间
 */
function formatTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 初始化面板
 */
function init() {
  const panel = document.querySelector('.ffmpeg-panel');
  if (!panel) {
    console.warn('FFmpeg panel container not found');
    return;
  }

  // 绑定事件
  bindEvents(panel);

  // 加载任务列表
  loadTasks();

  // 启动自动刷新
  if (state.autoRefresh) {
    startAutoRefresh();
  }
}

/**
 * 绑定事件
 */
function bindEvents(panel) {
  // 自动刷新开关
  const autoRefreshCheckbox = panel.querySelector('#ffmpeg-auto-refresh');
  if (autoRefreshCheckbox) {
    autoRefreshCheckbox.addEventListener('change', (e) => {
      toggleAutoRefresh(e.target.checked);
    });
  }

  // 刷新按钮
  const refreshBtn = panel.querySelector('#btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadTasks);
  }
}

/**
 * 切换自动刷新
 */
function toggleAutoRefresh(enabled) {
  state.autoRefresh = enabled;
  if (enabled) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

/**
 * 启动自动刷新
 */
function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshTimer = setInterval(() => {
    if (!state.isLoading) {
      loadTasks();
    }
  }, CONFIG.refreshIntervalMs);
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
 * 加载任务列表
 */
async function loadTasks() {
  if (state.isLoading) return;
  state.isLoading = true;

  const panel = document.querySelector('.ffmpeg-panel');
  const container = panel?.querySelector('#task-list');
  const countEl = panel?.querySelector('#task-count');

  try {
    const response = await fetch(`${CONFIG.apiBase}/overview`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      if (container) {
        container.innerHTML = `<div class="error-text">错误: ${escapeHtml(data.message || data.error)}</div>`;
      }
      return;
    }

    state.tasks = data.tasks || [];

    if (countEl) {
      countEl.textContent = `(${state.tasks.length})`;
    }

    renderTasks();
  } catch (err) {
    console.error('加载任务列表失败:', err);
    if (container) {
      container.innerHTML = `<div class="error-text">加载失败: ${escapeHtml(err.message)}</div>`;
    }
  } finally {
    state.isLoading = false;
  }
}

/**
 * 渲染任务列表
 */
function renderTasks() {
  const panel = document.querySelector('.ffmpeg-panel');
  const container = panel?.querySelector('#task-list');
  if (!container) return;

  if (state.tasks.length === 0) {
    container.innerHTML = '<div class="empty-text">暂无任务</div>';
    return;
  }

  container.innerHTML = state.tasks.map(task => renderTaskCard(task)).join('');
}

/**
 * 渲染单个任务卡片
 */
function renderTaskCard(task) {
  const status = task.status || 'unknown';
  const progress = task.progress || {};
  const raw = progress.raw || {};

  // 进度信息
  const progressItems = [];
  if (raw.time) {
    progressItems.push(`<div class="task-progress-item"><span class="task-progress-label">time</span><span class="task-progress-value">${escapeHtml(raw.time)}</span></div>`);
  }
  if (raw.frame) {
    progressItems.push(`<div class="task-progress-item"><span class="task-progress-label">frame</span><span class="task-progress-value">${escapeHtml(String(raw.frame))}</span></div>`);
  }
  if (raw.fps) {
    progressItems.push(`<div class="task-progress-item"><span class="task-progress-label">fps</span><span class="task-progress-value">${escapeHtml(String(raw.fps))}</span></div>`);
  }

  // 操作按钮
  const actions = [];
  
  // 日志文件按钮
  if (task.files && task.files.length > 0) {
    task.files.forEach(file => {
      const fileName = file.path.split('/').pop();
      actions.push(`<button class="btn-secondary" onclick="window.open('/workspace/file?path=${encodeURIComponent(file.path)}', '_blank')">${escapeHtml(fileName)}</button>`);
    });
  }

  // 详情按钮
  actions.push(`<button class="btn-secondary" onclick="alert('${escapeHtml(JSON.stringify(task, null, 2))}')">详情</button>`);

  return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-id">${escapeHtml(task.taskId?.slice(0, 16) || 'unknown')}...</span>
        <span class="task-status ${escapeHtml(status)}">${escapeHtml(status)}</span>
      </div>
      ${progressItems.length > 0 ? `<div class="task-progress">${progressItems.join('')}</div>` : ''}
      <div class="task-meta">
        <span>创建: ${formatTime(task.createdAt)}</span>
        ${task.exitCode !== null && task.exitCode !== undefined ? `<span>退出码: ${escapeHtml(String(task.exitCode))}</span>` : ''}
        ${task.error ? `<span style="color: var(--danger, #f44336);">错误</span>` : ''}
      </div>
      ${actions.length > 0 ? `<div class="task-actions">${actions.join('')}</div>` : ''}
    </div>
  `;
}

// 自动初始化
setTimeout(init, 0);

// 导出到全局
if (typeof window !== 'undefined') {
  window.FfmpegPanel = { init, state, loadTasks };
}
