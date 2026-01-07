/**
 * 总览面板组件
 * 显示组织结构树状图和岗位统计
 */

const OverviewPanel = {
  // 组件状态
  agents: [],      // 智能体列表
  roles: [],       // 岗位列表
  tree: null,      // 组织树

  // DOM 元素引用
  panel: null,
  roleStatsContainer: null,
  orgTreeContainer: null,

  /**
   * 初始化组件
   */
  init() {
    this.panel = document.getElementById('overview-panel');
    this.roleStatsContainer = document.getElementById('role-stats');
    this.orgTreeContainer = document.getElementById('org-tree');
  },

  /**
   * 设置智能体数据
   * @param {Array} agents - 智能体数组
   */
  setAgents(agents) {
    this.agents = agents || [];
    this.render();
  },

  /**
   * 设置岗位数据
   * @param {Array} roles - 岗位数组
   */
  setRoles(roles) {
    this.roles = roles || [];
    this.render();
  },

  /**
   * 设置组织树数据
   * @param {object} tree - 组织树
   */
  setTree(tree) {
    this.tree = tree;
    this.render();
  },

  /**
   * 显示面板
   */
  show() {
    if (this.panel) {
      this.panel.classList.remove('hidden');
    }
    // 隐藏智能体列表
    const agentList = document.getElementById('agent-list');
    if (agentList) {
      agentList.classList.add('hidden');
    }
  },

  /**
   * 隐藏面板
   */
  hide() {
    if (this.panel) {
      this.panel.classList.add('hidden');
    }
    // 显示智能体列表
    const agentList = document.getElementById('agent-list');
    if (agentList) {
      agentList.classList.remove('hidden');
    }
  },

  /**
   * 渲染面板
   */
  render() {
    this.renderRoleStats();
    this.renderOrgTree();
  },

  /**
   * 渲染岗位统计
   */
  renderRoleStats() {
    if (!this.roleStatsContainer) return;

    // 优先使用 API 返回的岗位数据（包含没有智能体的岗位）
    // 如果没有岗位数据，则从智能体列表统计
    let statsArray = [];
    
    if (this.roles && this.roles.length > 0) {
      // 使用 API 返回的岗位数据，包含 agentCount
      statsArray = this.roles.map(role => ({
        name: role.name,
        count: role.agentCount ?? 0
      }));
      // 按数量降序排列
      statsArray.sort((a, b) => b.count - a.count);
    } else {
      // 回退：从智能体列表统计
      const counts = TreeUtils.countByRole(this.agents);
      statsArray = TreeUtils.roleCountsToArray(counts);
    }

    if (statsArray.length === 0) {
      this.roleStatsContainer.innerHTML = `
        <h3>岗位统计</h3>
        <div style="color: #888; padding: 12px;">暂无数据</div>
      `;
      return;
    }

    const statsHtml = statsArray.map(stat => `
      <div class="role-stat-item ${stat.count === 0 ? 'empty-role' : ''}" onclick="OverviewPanel.onRoleClick('${this.escapeHtml(stat.name).replace(/'/g, "\\'")}')">
        <span class="role-stat-name">${this.escapeHtml(stat.name)}</span>
        <span class="role-stat-count">${stat.count}</span>
      </div>
    `).join('');

    this.roleStatsContainer.innerHTML = `
      <h3>岗位统计</h3>
      ${statsHtml}
    `;
  },

  /**
   * 渲染组织树
   */
  renderOrgTree() {
    if (!this.orgTreeContainer) return;

    if (!this.tree) {
      this.orgTreeContainer.innerHTML = `
        <h3>组织结构</h3>
        <div style="color: #888; padding: 12px;">暂无数据</div>
      `;
      return;
    }

    const treeHtml = this.renderTreeNode(this.tree);

    this.orgTreeContainer.innerHTML = `
      <h3>组织结构</h3>
      ${treeHtml}
    `;
  },

  /**
   * 递归渲染树节点
   * @param {object} node - 树节点
   * @returns {string} HTML 字符串
   */
  renderTreeNode(node) {
    if (!node) return '';

    const icon = this.getNodeIcon(node);
    const statusClass = node.status === 'terminated' ? 'terminated' : '';

    let childrenHtml = '';
    if (node.children && node.children.length > 0) {
      childrenHtml = `
        <div class="tree-children">
          ${node.children.map(child => this.renderTreeNode(child)).join('')}
        </div>
      `;
    }

    return `
      <div class="tree-node">
        <div class="tree-node-content ${statusClass}" onclick="OverviewPanel.onNodeClick('${node.id}')">
          <span class="tree-node-icon">${icon}</span>
          <span class="tree-node-name">${this.escapeHtml(node.id)}</span>
          <span class="tree-node-role">${this.escapeHtml(node.roleName)}</span>
        </div>
        ${childrenHtml}
      </div>
    `;
  },

  /**
   * 获取节点图标
   * @param {object} node - 树节点
   * @returns {string} 图标字符
   */
  getNodeIcon(node) {
    if (node.id === 'root') return '🌳';
    if (node.id === 'user') return '👤';
    if (node.status === 'terminated') return '⭕';
    if (node.children && node.children.length > 0) return '📁';
    return '🤖';
  },

  /**
   * 节点点击处理
   * @param {string} agentId - 智能体 ID
   */
  onNodeClick(agentId) {
    // 切换到列表视图并选择该智能体
    if (window.App) {
      window.App.switchToListView();
      window.App.selectAgent(agentId);
    }
  },

  /**
   * 岗位统计项点击处理
   * @param {string} roleName - 岗位名称
   */
  onRoleClick(roleName) {
    if (window.App) {
      window.App.switchToListViewWithFilter(roleName);
    }
  },

  /**
   * HTML 转义
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
window.OverviewPanel = OverviewPanel;
