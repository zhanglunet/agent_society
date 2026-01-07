/**
 * 智能体列表组件
 * 显示所有智能体，支持搜索筛选和排序
 */

const AgentList = {
  // 组件状态
  agents: [],           // 所有智能体
  filteredAgents: [],   // 筛选后的智能体
  selectedAgentId: null,// 当前选中的智能体 ID
  sortOrder: 'asc',     // 排序方向（默认升序，最早的在前）
  filterKeyword: '',    // 筛选关键词
  newMessageAgents: new Set(), // 有新消息的智能体 ID 集合

  // DOM 元素引用
  listContainer: null,
  searchInput: null,
  sortBtn: null,

  /**
   * 初始化组件
   */
  init() {
    this.listContainer = document.getElementById('agent-list');
    this.searchInput = document.getElementById('search-input');
    this.sortBtn = document.getElementById('sort-btn');

    // 绑定事件
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filterKeyword = e.target.value;
        this.applyFilterAndSort();
        this.render();
      });
    }

    if (this.sortBtn) {
      this.sortBtn.addEventListener('click', () => {
        this.sortOrder = SortUtils.toggleOrder(this.sortOrder);
        this.updateSortButtonText();
        this.applyFilterAndSort();
        this.render();
      });
    }

    this.updateSortButtonText();
  },

  /**
   * 更新排序按钮文本
   */
  updateSortButtonText() {
    if (this.sortBtn) {
      this.sortBtn.textContent = this.sortOrder === 'asc' ? '↑ 时间' : '↓ 时间';
      this.sortBtn.title = this.sortOrder === 'asc' ? '当前：最早优先' : '当前：最新优先';
    }
  },

  /**
   * 设置智能体数据
   * @param {Array} agents - 智能体数组
   */
  setAgents(agents) {
    this.agents = agents || [];
    this.applyFilterAndSort();
    this.render();
  },

  /**
   * 应用筛选和排序
   */
  applyFilterAndSort() {
    // 先筛选
    let result = FilterUtils.filterByKeyword(this.agents, this.filterKeyword);
    // 使用固定排序函数，确保 user 和 root 在顶部
    result = SortUtils.sortWithPinnedAgents(result, this.sortOrder);
    this.filteredAgents = result;
  },

  /**
   * 选择智能体（由用户点击触发，会通知 App）
   * @param {string} agentId - 智能体 ID
   */
  selectAgent(agentId) {
    if (this.selectedAgentId === agentId) {
      return; // 已经选中，不重复处理
    }
    this.selectedAgentId = agentId;
    // 清除该智能体的新消息标记
    this.newMessageAgents.delete(agentId);
    this.render();
    
    // 触发选择事件
    if (window.App && window.App.onAgentSelected) {
      window.App.onAgentSelected(agentId);
    }
  },

  /**
   * 更新选中状态（由 App 调用，不触发回调）
   * @param {string} agentId - 智能体 ID
   */
  updateSelection(agentId) {
    this.selectedAgentId = agentId;
    // 清除该智能体的新消息标记
    this.newMessageAgents.delete(agentId);
    this.render();
  },

  /**
   * 标记智能体有新消息
   * @param {string} agentId - 智能体 ID
   */
  markNewMessage(agentId) {
    // 不标记当前选中的智能体
    if (agentId !== this.selectedAgentId) {
      this.newMessageAgents.add(agentId);
      this.render();
    }
  },

  /**
   * 获取智能体图标类型
   * @param {object} agent - 智能体对象
   * @returns {string} 图标类型
   */
  getAgentIconType(agent) {
    if (agent.id === 'root') return 'root';
    if (agent.id === 'user') return 'user';
    if (agent.status === 'terminated') return 'terminated';
    return 'normal';
  },

  /**
   * 获取智能体图标文字
   * @param {object} agent - 智能体对象
   * @returns {string} 图标文字
   */
  getAgentIconText(agent) {
    if (agent.id === 'root') return '🌳';
    if (agent.id === 'user') return '👤';
    // 取岗位名称首字或 ID 首字母
    const name = agent.roleName || agent.id || '?';
    return name.charAt(0).toUpperCase();
  },

  /**
   * 格式化时间显示
   * @param {string} isoTime - ISO 格式时间字符串
   * @returns {string} 格式化后的时间
   */
  formatTime(isoTime) {
    if (!isoTime) return '';
    const date = new Date(isoTime);
    const now = new Date();
    
    // 同一天只显示时间
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    
    // 不同天显示日期
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  },

  /**
   * 渲染智能体列表
   */
  render() {
    if (!this.listContainer) return;

    if (this.filteredAgents.length === 0) {
      this.listContainer.innerHTML = `
        <div class="empty-state" style="color: #888; padding: 20px; text-align: center;">
          ${this.filterKeyword ? '没有找到匹配的智能体' : '暂无智能体'}
        </div>
      `;
      return;
    }

    const html = this.filteredAgents.map(agent => {
      const isSelected = agent.id === this.selectedAgentId;
      const hasNewMessage = this.newMessageAgents.has(agent.id);
      const iconType = this.getAgentIconType(agent);
      const iconText = this.getAgentIconText(agent);

      return `
        <div class="agent-item ${isSelected ? 'selected' : ''} ${hasNewMessage ? 'has-new-message' : ''}"
             data-agent-id="${agent.id}"
             onclick="AgentList.selectAgent('${agent.id}')">
          <div class="agent-icon ${iconType}">${iconText}</div>
          <div class="agent-info">
            <div class="agent-name">${this.escapeHtml(agent.id)}</div>
            <div class="agent-role">${this.escapeHtml(agent.roleName || '未知岗位')}</div>
          </div>
          <div class="agent-time">${this.formatTime(agent.createdAt)}</div>
          ${agent.status === 'terminated' ? '<span class="agent-status terminated">已终止</span>' : ''}
        </div>
      `;
    }).join('');

    this.listContainer.innerHTML = html;
  },

  /**
   * HTML 转义，防止 XSS
   * @param {string} text - 原始文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};

// 导出供其他模块使用
window.AgentList = AgentList;
