/**
 * LocalFile 模块前端逻辑
 * 
 * 职责：
 * - 文件夹管理界面交互
 * - 访问日志展示
 * - 设置管理
 * - API通信
 */

// API 基础路径
const API_BASE = '/api/modules/localfile';

// 状态
let currentFolders = [];
let currentLogs = [];
let currentPage = 0;
let totalLogs = 0;
const LOGS_PER_PAGE = 20;

// DOM 元素
const elements = {};

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  bindEvents();
  loadData();
});

/**
 * 初始化DOM元素引用
 */
function initElements() {
  elements.folderCount = document.getElementById('folderCount');
  elements.readOnlyCount = document.getElementById('readOnlyCount');
  elements.readWriteCount = document.getElementById('readWriteCount');
  elements.todayAccessCount = document.getElementById('todayAccessCount');
  
  elements.foldersList = document.getElementById('foldersList');
  elements.addFolderBtn = document.getElementById('addFolderBtn');
  
  elements.logsTable = document.getElementById('logsTable');
  elements.logsBody = document.getElementById('logsBody');
  elements.operationFilter = document.getElementById('operationFilter');
  elements.agentFilter = document.getElementById('agentFilter');
  elements.refreshLogsBtn = document.getElementById('refreshLogsBtn');
  elements.pagination = document.getElementById('pagination');
  
  elements.retentionDays = document.getElementById('retentionDays');
  elements.saveRetentionBtn = document.getElementById('saveRetentionBtn');
  
  elements.folderModal = document.getElementById('folderModal');
  elements.modalTitle = document.getElementById('modalTitle');
  elements.modalClose = document.getElementById('modalClose');
  elements.folderForm = document.getElementById('folderForm');
  elements.folderId = document.getElementById('folderId');
  elements.folderPath = document.getElementById('folderPath');
  elements.folderDescription = document.getElementById('folderDescription');
  elements.permRead = document.getElementById('permRead');
  elements.permWrite = document.getElementById('permWrite');
  elements.testPathBtn = document.getElementById('testPathBtn');
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 添加文件夹
  elements.addFolderBtn.addEventListener('click', () => openModal());
  
  // 关闭模态框
  elements.modalClose.addEventListener('click', closeModal);
  elements.folderModal.addEventListener('click', (e) => {
    if (e.target === elements.folderModal) closeModal();
  });
  
  // 表单提交
  elements.folderForm.addEventListener('submit', handleFormSubmit);
  
  // 测试路径
  elements.testPathBtn.addEventListener('click', testPath);
  
  // 日志过滤
  elements.operationFilter.addEventListener('change', () => {
    currentPage = 0;
    loadLogs();
  });
  
  elements.agentFilter.addEventListener('input', debounce(() => {
    currentPage = 0;
    loadLogs();
  }, 300));
  
  elements.refreshLogsBtn.addEventListener('click', () => {
    currentPage = 0;
    loadLogs();
  });
  
  // 保存设置
  elements.saveRetentionBtn.addEventListener('click', saveRetention);
}

/**
 * 加载所有数据
 */
async function loadData() {
  await Promise.all([
    loadFolders(),
    loadLogs(),
    loadStats(),
    loadSettings()
  ]);
}

/**
 * 加载文件夹列表
 */
async function loadFolders() {
  try {
    const response = await fetch(`${API_BASE}/folders`);
    const data = await response.json();
    
    if (data.ok) {
      currentFolders = data.folders || [];
      renderFolders();
      updateFolderStats();
    } else {
      showToast('加载文件夹失败: ' + (data.message || data.error), 'error');
    }
  } catch (error) {
    showToast('加载文件夹失败: ' + error.message, 'error');
  }
}

/**
 * 渲染文件夹列表
 */
function renderFolders() {
  if (currentFolders.length === 0) {
    elements.foldersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📂</div>
        <p>暂无授权的文件夹</p>
        <p class="form-hint">点击"添加文件夹"按钮开始配置</p>
      </div>
    `;
    return;
  }
  
  elements.foldersList.innerHTML = currentFolders.map(folder => `
    <div class="folder-item" data-id="${folder.id}">
      <div class="folder-icon">📁</div>
      <div class="folder-info">
        <div class="folder-path">${escapeHtml(folder.path)}</div>
        ${folder.description ? `<div class="folder-description">${escapeHtml(folder.description)}</div>` : ''}
      </div>
      <div class="folder-perms">
        ${folder.read ? '<span class="perm-badge read">可读</span>' : ''}
        ${folder.write ? '<span class="perm-badge write">可写</span>' : ''}
      </div>
      <div class="folder-actions">
        <button class="btn btn-sm btn-secondary" onclick="editFolder('${folder.id}')">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFolder('${folder.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

/**
 * 更新文件夹统计
 */
function updateFolderStats() {
  elements.folderCount.textContent = currentFolders.length;
  
  const readOnly = currentFolders.filter(f => f.read && !f.write).length;
  const readWrite = currentFolders.filter(f => f.read && f.write).length;
  
  elements.readOnlyCount.textContent = readOnly;
  elements.readWriteCount.textContent = readWrite;
}

/**
 * 加载日志
 */
async function loadLogs() {
  try {
    const params = new URLSearchParams({
      limit: LOGS_PER_PAGE.toString(),
      offset: (currentPage * LOGS_PER_PAGE).toString()
    });
    
    if (elements.operationFilter.value) {
      params.append('operation', elements.operationFilter.value);
    }
    
    if (elements.agentFilter.value) {
      params.append('agentId', elements.agentFilter.value);
    }
    
    const response = await fetch(`${API_BASE}/logs?${params}`);
    const data = await response.json();
    
    if (data.logs) {
      currentLogs = data.logs;
      totalLogs = data.total;
      renderLogs();
      renderPagination();
    }
  } catch (error) {
    elements.logsBody.innerHTML = `
      <tr>
        <td colspan="5" class="loading">加载失败: ${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

/**
 * 渲染日志表格
 */
function renderLogs() {
  if (currentLogs.length === 0) {
    elements.logsBody.innerHTML = `
      <tr>
        <td colspan="5" class="loading">暂无日志记录</td>
      </tr>
    `;
    return;
  }
  
  elements.logsBody.innerHTML = currentLogs.map(log => {
    const date = new Date(log.timestamp);
    const timeStr = date.toLocaleString('zh-CN');
    const opClass = log.operation.replace(/_/g, '-');
    const opText = getOperationText(log.operation);
    
    return `
      <tr>
        <td class="log-time">${timeStr}</td>
        <td class="log-agent" title="ID: ${escapeHtml(log.agentId)}">${escapeHtml(log.agentName)}</td>
        <td><span class="log-operation ${opClass}">${opText}</span></td>
        <td class="log-path" title="${escapeHtml(log.path)}">${escapeHtml(log.path)}</td>
        <td>
          <span class="log-result ${log.success ? 'success' : 'failed'}">
            ${log.success ? '✓ 成功' : '✗ 失败'}
            ${log.error ? `<br><small>${escapeHtml(log.error)}</small>` : ''}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 渲染分页
 */
function renderPagination() {
  const totalPages = Math.ceil(totalLogs / LOGS_PER_PAGE);
  
  if (totalPages <= 1) {
    elements.pagination.innerHTML = '';
    return;
  }
  
  let html = `
    <button onclick="changePage(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>上一页</button>
    <span class="page-info">第 ${currentPage + 1} / ${totalPages} 页</span>
    <button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
  `;
  
  elements.pagination.innerHTML = html;
}

/**
 * 切换页面
 */
function changePage(page) {
  const totalPages = Math.ceil(totalLogs / LOGS_PER_PAGE);
  if (page < 0 || page >= totalPages) return;
  
  currentPage = page;
  loadLogs();
}

/**
 * 加载统计数据
 */
async function loadStats() {
  try {
    // 获取今日开始时间
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const response = await fetch(`${API_BASE}/stats?startTime=${today.toISOString()}`);
    const data = await response.json();
    
    if (data.ok && data.stats) {
      elements.todayAccessCount.textContent = data.stats.total || 0;
    }
  } catch (error) {
    console.error('加载统计失败:', error);
  }
}

/**
 * 加载设置
 */
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE}/settings/retention`);
    const data = await response.json();
    
    if (data.ok) {
      elements.retentionDays.value = data.logRetentionDays || 30;
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

/**
 * 保存日志保留设置
 */
async function saveRetention() {
  const days = parseInt(elements.retentionDays.value, 10);
  
  if (isNaN(days) || days < 1) {
    showToast('请输入有效的天数', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/settings/retention`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showToast('设置已保存', 'success');
    } else {
      showToast('保存失败: ' + (data.message || data.error), 'error');
    }
  } catch (error) {
    showToast('保存失败: ' + error.message, 'error');
  }
}

/**
 * 打开模态框
 */
function openModal(folderId = null) {
  elements.folderForm.reset();
  elements.folderId.value = '';
  
  if (folderId) {
    const folder = currentFolders.find(f => f.id === folderId);
    if (folder) {
      elements.modalTitle.textContent = '编辑授权文件夹';
      elements.folderId.value = folder.id;
      elements.folderPath.value = folder.path;
      elements.folderDescription.value = folder.description || '';
      elements.permRead.checked = folder.read;
      elements.permWrite.checked = folder.write;
    }
  } else {
    elements.modalTitle.textContent = '添加授权文件夹';
    elements.permRead.checked = true;
  }
  
  elements.folderModal.classList.add('active');
}

/**
 * 关闭模态框
 */
function closeModal() {
  elements.folderModal.classList.remove('active');
  // 清除测试结果
  const existingResult = elements.folderForm.querySelector('.test-result');
  if (existingResult) {
    existingResult.remove();
  }
}

/**
 * 编辑文件夹
 */
function editFolder(folderId) {
  openModal(folderId);
}

/**
 * 删除文件夹
 */
async function deleteFolder(folderId) {
  const folder = currentFolders.find(f => f.id === folderId);
  if (!folder) return;
  
  if (!confirm(`确定要删除授权文件夹 "${folder.path}" 吗？\n\n这将移除智能体对该文件夹的访问权限。`)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/folders/${folderId}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showToast('删除成功', 'success');
      await loadFolders();
    } else {
      showToast('删除失败: ' + (data.message || data.error), 'error');
    }
  } catch (error) {
    showToast('删除失败: ' + error.message, 'error');
  }
}

/**
 * 处理表单提交
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const folderId = elements.folderId.value;
  const path = elements.folderPath.value.trim();
  const description = elements.folderDescription.value.trim();
  const read = elements.permRead.checked;
  const write = elements.permWrite.checked;
  
  if (!path) {
    showToast('请输入文件夹路径', 'error');
    return;
  }
  
  if (!read && !write) {
    showToast('请至少选择一种权限', 'error');
    return;
  }
  
  try {
    let response;
    
    if (folderId) {
      // 更新
      response = await fetch(`${API_BASE}/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read, write, description })
      });
    } else {
      // 添加
      response = await fetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, read, write, description })
      });
    }
    
    const data = await response.json();
    
    if (data.ok) {
      showToast(folderId ? '更新成功' : '添加成功', 'success');
      closeModal();
      await loadFolders();
    } else {
      const errorMsg = getErrorMessage(data.error);
      showToast(errorMsg, 'error');
    }
  } catch (error) {
    showToast('操作失败: ' + error.message, 'error');
  }
}

/**
 * 测试路径
 */
async function testPath() {
  const path = elements.folderPath.value.trim();
  
  if (!path) {
    showToast('请先输入路径', 'error');
    return;
  }
  
  // 清除之前的测试结果
  const existingResult = elements.folderForm.querySelector('.test-result');
  if (existingResult) {
    existingResult.remove();
  }
  
  try {
    const response = await fetch(`${API_BASE}/check-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    
    const data = await response.json();
    
    const resultDiv = document.createElement('div');
    resultDiv.className = `test-result ${data.ok ? 'success' : 'error'}`;
    
    if (data.ok) {
      let msg = `路径存在: ${data.exists ? '是' : '否'}<br>`;
      msg += `类型: ${data.isDirectory ? '目录' : '文件'}<br>`;
      msg += `读取权限: ${data.canRead ? '✓' : '✗'}<br>`;
      msg += `写入权限: ${data.canWrite ? '✓' : '✗'}`;
      resultDiv.innerHTML = msg;
    } else {
      resultDiv.textContent = '检查失败: ' + (data.message || data.error);
    }
    
    elements.folderForm.insertBefore(resultDiv, elements.folderForm.querySelector('.form-actions'));
    
  } catch (error) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'test-result error';
    resultDiv.textContent = '检查失败: ' + error.message;
    elements.folderForm.insertBefore(resultDiv, elements.folderForm.querySelector('.form-actions'));
  }
}

/**
 * 获取错误信息
 */
function getErrorMessage(error) {
  const messages = {
    'invalid_path': '路径无效',
    'path_already_exists': '该路径已存在',
    'path_not_accessible': '路径不存在或无法访问',
    'folder_not_found': '文件夹不存在',
    'save_failed': '保存失败'
  };
  return messages[error] || ('操作失败: ' + error);
}

/**
 * 获取操作文本
 */
function getOperationText(operation) {
  const texts = {
    'read': '读取',
    'write': '写入',
    'list': '列目录',
    'copy_to_workspace': '复制到工作区',
    'copy_from_workspace': '从工作区复制',
    'check_permission': '权限检查'
  };
  return texts[operation] || operation;
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 显示Toast通知
 */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 防抖函数
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// 导出全局函数供HTML调用
window.editFolder = editFolder;
window.deleteFolder = deleteFolder;
window.changePage = changePage;
