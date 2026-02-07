/**
 * Automation 模块前端逻辑
 * 
 * 职责：
 * - 配置管理界面交互
 * - 屏幕信息展示
 * - 操作日志记录
 * - API通信
 */

// API 基础路径
const API_BASE = '/api/modules/automation';

// 状态
let currentConfig = {};
let operationLogs = [];

// DOM 元素
const elements = {};

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  bindEvents();
  loadConfig();
  loadScreenInfo();
});

/**
 * 初始化DOM元素引用
 */
function initElements() {
  elements.statusCard = document.getElementById('statusCard');
  elements.statusIndicator = document.getElementById('statusIndicator');
  elements.statusTitle = document.getElementById('statusTitle');
  elements.statusDesc = document.getElementById('statusDesc');
  elements.toggleBtn = document.getElementById('toggleBtn');
  
  elements.mouseToggle = document.getElementById('mouseToggle');
  elements.keyboardToggle = document.getElementById('keyboardToggle');
  elements.accessibilityToggle = document.getElementById('accessibilityToggle');
  
  elements.regionsList = document.getElementById('regionsList');
  elements.addRegionBtn = document.getElementById('addRegionBtn');
  
  elements.screenSize = document.getElementById('screenSize');
  elements.mousePos = document.getElementById('mousePos');
  elements.platform = document.getElementById('platform');
  elements.refreshScreenBtn = document.getElementById('refreshScreenBtn');
  
  elements.logsList = document.getElementById('logsList');
  elements.clearLogsBtn = document.getElementById('clearLogsBtn');
  
  elements.regionModal = document.getElementById('regionModal');
  elements.modalClose = document.getElementById('modalClose');
  elements.regionForm = document.getElementById('regionForm');
  elements.regionX = document.getElementById('regionX');
  elements.regionY = document.getElementById('regionY');
  elements.regionWidth = document.getElementById('regionWidth');
  elements.regionHeight = document.getElementById('regionHeight');
  elements.regionReason = document.getElementById('regionReason');
  elements.getCurrentMouseBtn = document.getElementById('getCurrentMouseBtn');
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 模块开关
  elements.toggleBtn.addEventListener('click', toggleModule);
  
  // 权限开关
  elements.mouseToggle.addEventListener('change', () => updatePermission('allowMouse', elements.mouseToggle.checked));
  elements.keyboardToggle.addEventListener('change', () => updatePermission('allowKeyboard', elements.keyboardToggle.checked));
  elements.accessibilityToggle.addEventListener('change', () => updatePermission('allowAccessibility', elements.accessibilityToggle.checked));
  
  // 受限区域
  elements.addRegionBtn.addEventListener('click', openModal);
  elements.modalClose.addEventListener('click', closeModal);
  elements.regionModal.addEventListener('click', (e) => {
    if (e.target === elements.regionModal) closeModal();
  });
  elements.regionForm.addEventListener('submit', handleAddRegion);
  elements.getCurrentMouseBtn.addEventListener('click', fillCurrentMousePosition);
  
  // 屏幕信息
  elements.refreshScreenBtn.addEventListener('click', loadScreenInfo);
  
  // 日志
  elements.clearLogsBtn.addEventListener('click', clearLogs);
  
  // 定时刷新鼠标位置
  setInterval(updateMousePosition, 1000);
}

/**
 * 加载配置
 */
async function loadConfig() {
  try {
    const response = await fetch(`${API_BASE}/config`);
    const data = await response.json();
    
    if (data.ok) {
      currentConfig = data.config;
      updateUI();
    }
  } catch (error) {
    console.error('加载配置失败:', error);
    showToast('加载配置失败', 'error');
  }
}

/**
 * 更新UI
 */
function updateUI() {
  // 更新状态卡片
  if (currentConfig.enabled) {
    elements.statusIndicator.classList.add('enabled');
    elements.statusIndicator.classList.remove('disabled');
    elements.statusTitle.textContent = '模块已启用';
    elements.statusDesc.textContent = getEnabledFeaturesText();
    elements.toggleBtn.textContent = '禁用';
    elements.toggleBtn.classList.remove('enabled');
  } else {
    elements.statusIndicator.classList.remove('enabled');
    elements.statusIndicator.classList.add('disabled');
    elements.statusTitle.textContent = '模块已禁用';
    elements.statusDesc.textContent = '所有自动化功能不可用';
    elements.toggleBtn.textContent = '启用';
    elements.toggleBtn.classList.add('enabled');
  }
  
  // 更新权限开关
  elements.mouseToggle.checked = currentConfig.allowMouse;
  elements.keyboardToggle.checked = currentConfig.allowKeyboard;
  elements.accessibilityToggle.checked = currentConfig.allowAccessibility;
  
  // 更新受限区域列表
  renderRegions();
}

/**
 * 获取已启用功能文本
 */
function getEnabledFeaturesText() {
  const features = [];
  if (currentConfig.allowMouse) features.push('鼠标');
  if (currentConfig.allowKeyboard) features.push('键盘');
  if (currentConfig.allowAccessibility) features.push('无障碍');
  
  if (features.length === 0) return '所有功能已禁用';
  return features.join('、') + '控制已启用';
}

/**
 * 切换模块状态
 */
async function toggleModule() {
  const newEnabled = !currentConfig.enabled;
  await updateConfig({ enabled: newEnabled });
}

/**
 * 更新权限
 */
async function updatePermission(key, value) {
  await updateConfig({ [key]: value });
}

/**
 * 更新配置
 */
async function updateConfig(updates) {
  try {
    const response = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    const data = await response.json();
    
    if (data.ok) {
      Object.assign(currentConfig, updates);
      updateUI();
      showToast('设置已保存', 'success');
    } else {
      showToast('保存失败: ' + (data.message || data.error), 'error');
    }
  } catch (error) {
    showToast('保存失败: ' + error.message, 'error');
  }
}

/**
 * 渲染受限区域
 */
function renderRegions() {
  const regions = currentConfig.restrictedRegions || [];
  
  if (regions.length === 0) {
    elements.regionsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📐</div>
        <p>暂无受限区域</p>
      </div>
    `;
    return;
  }
  
  elements.regionsList.innerHTML = regions.map((region, index) => `
    <div class="region-item">
      <span class="region-coords">${region.x}, ${region.y}</span>
      <span class="region-coords">${region.width} × ${region.height}</span>
      <span class="region-reason">${escapeHtml(region.reason || '未命名')}</span>
      <button class="region-delete" onclick="deleteRegion(${index})">&times;</button>
    </div>
  `).join('');
}

/**
 * 删除受限区域
 */
async function deleteRegion(index) {
  const regions = [...(currentConfig.restrictedRegions || [])];
  regions.splice(index, 1);
  await updateConfig({ restrictedRegions: regions });
}

/**
 * 打开模态框
 */
function openModal() {
  elements.regionForm.reset();
  elements.regionModal.classList.add('active');
}

/**
 * 关闭模态框
 */
function closeModal() {
  elements.regionModal.classList.remove('active');
}

/**
 * 获取当前鼠标位置填充表单
 */
async function fillCurrentMousePosition() {
  try {
    const response = await fetch(`${API_BASE}/screen/info`);
    const data = await response.json();
    
    if (data.ok && data.mouse) {
      elements.regionX.value = data.mouse.x;
      elements.regionY.value = data.mouse.y;
      elements.regionWidth.value = 100;
      elements.regionHeight.value = 50;
    }
  } catch (error) {
    showToast('获取鼠标位置失败', 'error');
  }
}

/**
 * 添加受限区域
 */
async function handleAddRegion(e) {
  e.preventDefault();
  
  const region = {
    x: parseInt(elements.regionX.value, 10),
    y: parseInt(elements.regionY.value, 10),
    width: parseInt(elements.regionWidth.value, 10),
    height: parseInt(elements.regionHeight.value, 10),
    reason: elements.regionReason.value.trim()
  };
  
  const regions = [...(currentConfig.restrictedRegions || []), region];
  await updateConfig({ restrictedRegions: regions });
  closeModal();
}

/**
 * 加载屏幕信息
 */
async function loadScreenInfo() {
  try {
    const response = await fetch(`${API_BASE}/screen/info`);
    const data = await response.json();
    
    if (data.ok) {
      elements.platform.textContent = data.platform;
      
      if (data.screen) {
        elements.screenSize.textContent = `${data.screen.width} × ${data.screen.height}`;
      }
      
      if (data.mouse) {
        elements.mousePos.textContent = `${data.mouse.x}, ${data.mouse.y}`;
      }
    }
  } catch (error) {
    console.error('加载屏幕信息失败:', error);
  }
}

/**
 * 更新鼠标位置显示
 */
async function updateMousePosition() {
  try {
    const response = await fetch(`${API_BASE}/screen/info`);
    const data = await response.json();
    
    if (data.ok && data.mouse) {
      elements.mousePos.textContent = `${data.mouse.x}, ${data.mouse.y}`;
    }
  } catch (error) {
    // 静默失败
  }
}

/**
 * 清空日志
 */
function clearLogs() {
  operationLogs = [];
  renderLogs();
}

/**
 * 渲染日志
 */
function renderLogs() {
  if (operationLogs.length === 0) {
    elements.logsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>暂无操作记录</p>
      </div>
    `;
    return;
  }
  
  elements.logsList.innerHTML = operationLogs.map(log => `
    <div class="log-item">
      <span class="log-time">${log.time}</span>
      <span class="log-action">${escapeHtml(log.action)}</span>
      <span class="log-status ${log.status}">${log.status === 'success' ? '成功' : '失败'}</span>
    </div>
  `).join('');
}

/**
 * 添加日志条目
 */
function addLog(action, status) {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  
  operationLogs.unshift({ time, action, status });
  if (operationLogs.length > 50) {
    operationLogs.pop();
  }
  
  renderLogs();
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
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 导出全局函数供HTML调用
window.deleteRegion = deleteRegion;
