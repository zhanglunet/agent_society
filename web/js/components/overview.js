/**
 * 总览面板组件
 * 显示组织结构树状图和岗位统计
 */

const OverviewPanel = {
  // 组件状态
  agents: [],      // 智能体列表
  roles: [],       // 岗位列表
  tree: null,      // 组织树
  roleTree: null,  // 岗位从属关系树

  // DOM 元素引用
  panel: null,
  roleStatsContainer: null,
  orgTreeContainer: null,
  roleTreeContainer: null,

  /**
   * 初始化组件
   */
  init() {
    this.panel = document.getElementById('overview-panel');
    this.roleStatsContainer = document.getElementById('role-stats');
    this.orgTreeContainer = document.getElementById('org-tree');
    this.roleTreeContainer = document.getElementById('role-tree');
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
   * 设置岗位树数据
   * @param {object} roleTree - 岗位从属关系树
   */
  setRoleTree(roleTree) {
    this.roleTree = roleTree;
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
    // 显示时重新渲染，确保数据是最新的
    this.render();
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
    this.renderRoleTree();
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
      // 使用 API 返回的岗位数据，包含 agentCount 和 id
      statsArray = this.roles.map(role => ({
        id: role.id,
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
      <div class="role-stat-item ${stat.count === 0 ? 'empty-role' : ''}">
        <span class="role-stat-name" onclick="OverviewPanel.onRoleClick('${this.escapeHtml(stat.name).replace(/'/g, "\\'")}')">${this.escapeHtml(stat.name)}</span>
        <div class="role-stat-actions">
          <span class="role-stat-count">${stat.count}</span>
          <button class="role-detail-btn" onclick="event.stopPropagation(); OverviewPanel.onRoleDetailClick('${this.escapeHtml(stat.id || stat.name).replace(/'/g, "\\'")}')" title="查看详情">ℹ️</button>
          ${this.renderRoleDeleteButton(stat)}
        </div>
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
        <h3>智能体组织结构</h3>
        <div style="color: #888; padding: 12px;">暂无数据</div>
      `;
      return;
    }

    const treeHtml = this.renderTreeNode(this.tree);

    this.orgTreeContainer.innerHTML = `
      <h3>智能体组织结构</h3>
      ${treeHtml}
    `;
  },

  /**
   * 渲染岗位从属关系树
   */
  renderRoleTree() {
    if (!this.roleTreeContainer) return;

    if (!this.roleTree) {
      this.roleTreeContainer.innerHTML = `
        <h3>岗位从属关系</h3>
        <div style="color: #888; padding: 12px;">暂无数据</div>
      `;
      return;
    }

    const treeHtml = this.renderRoleTreeNode(this.roleTree);

    this.roleTreeContainer.innerHTML = `
      <h3>岗位从属关系</h3>
      ${treeHtml}
    `;
  },

  /**
   * 递归渲染岗位树节点
   * @param {object|Array} node - 岗位树节点或节点数组
   * @returns {string} HTML 字符串
   */
  renderRoleTreeNode(node) {
    if (!node) return '';

    // 如果是数组，渲染所有节点
    if (Array.isArray(node)) {
      return node.map(n => this.renderRoleTreeNode(n)).join('');
    }

    const icon = this.getRoleNodeIcon(node);
    const hasActiveAgents = node.activeAgentCount > 0;
    const statusClass = hasActiveAgents ? '' : 'inactive-role';
    
    // 显示智能体数量（活跃/总数）
    const countDisplay = node.agentCount > 0 
      ? `<span class="role-tree-count">${node.activeAgentCount}/${node.agentCount}</span>`
      : '<span class="role-tree-count empty">0</span>';

    let childrenHtml = '';
    if (node.children && node.children.length > 0) {
      childrenHtml = `
        <div class="tree-children">
          ${node.children.map(child => this.renderRoleTreeNode(child)).join('')}
        </div>
      `;
    }

    return `
      <div class="tree-node role-tree-node">
        <div class="tree-node-content ${statusClass}" onclick="OverviewPanel.onRoleTreeNodeClick('${this.escapeHtml(node.name).replace(/'/g, "\\'")}')">
          <span class="tree-node-icon">${icon}</span>
          <span class="tree-node-name">${this.escapeHtml(node.name)}</span>
          ${countDisplay}
        </div>
        ${childrenHtml}
      </div>
    `;
  },

  /**
   * 获取岗位节点图标
   * @param {object} node - 岗位树节点
   * @returns {string} 图标字符
   */
  getRoleNodeIcon(node) {
    if (node.id === 'root' || node.name === 'root') return '🌳';
    if (node.children && node.children.length > 0) return '📂';
    if (node.activeAgentCount > 0) return '📋';
    return '📄';
  },

  /**
   * 岗位树节点点击处理
   * @param {string} roleName - 岗位名称
   */
  onRoleTreeNodeClick(roleName) {
    // 切换到列表视图并按岗位筛选
    if (window.App) {
      window.App.switchToListViewWithFilter(roleName);
    }
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
    
    // 获取显示名称（优先使用自定义名称）
    const displayName = this.getNodeDisplayName(node);

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
          <span class="tree-node-name">${this.escapeHtml(displayName)}</span>
          <span class="tree-node-role">${this.escapeHtml(node.roleName)}</span>
        </div>
        ${childrenHtml}
      </div>
    `;
  },

  /**
   * 获取节点显示名称
   * @param {object} node - 树节点
   * @returns {string} 显示名称
   */
  getNodeDisplayName(node) {
    // 从 App 获取智能体信息，检查是否有自定义名称
    if (window.App && window.App.agentsById) {
      const agent = window.App.agentsById.get(node.id);
      if (agent && agent.customName) {
        return agent.customName;
      }
    }
    return node.id;
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
   * 岗位统计项点击处理（筛选列表）
   * @param {string} roleName - 岗位名称
   */
  onRoleClick(roleName) {
    if (window.App) {
      window.App.switchToListViewWithFilter(roleName);
    }
  },

  /**
   * 渲染岗位删除按钮
   * @param {object} stat - 岗位统计对象
   * @returns {string} HTML 字符串
   */
  renderRoleDeleteButton(stat) {
    // 系统岗位不显示删除按钮
    if (stat.name === 'root' || stat.name === 'user') {
      return '';
    }
    
    // 如果没有岗位ID，不显示删除按钮
    if (!stat.id) {
      return '';
    }
    
    return `
      <button class="role-delete-btn" 
              onclick="event.stopPropagation(); OverviewPanel.confirmDeleteRole('${this.escapeHtml(stat.id).replace(/'/g, "\\'")}', '${this.escapeHtml(stat.name).replace(/'/g, "\\'")}', ${stat.count})" 
              title="删除岗位">🗑️</button>
    `;
  },

  /**
   * 确认删除岗位
   * @param {string} roleId - 岗位 ID
   * @param {string} roleName - 岗位名称
   * @param {number} agentCount - 该岗位上的智能体数量
   */
  async confirmDeleteRole(roleId, roleName, agentCount) {
    let confirmMessage = `确定要删除岗位 "${roleName}" 吗？\n\n删除后将会：\n- 终止该岗位上的所有智能体（${agentCount}个）\n- 递归删除所有子岗位\n- 停止接受任何交互\n- 保留历史数据用于审计\n\n此操作不可撤销！`;
    
    if (agentCount === 0) {
      confirmMessage = `确定要删除岗位 "${roleName}" 吗？\n\n该岗位当前没有智能体，但删除后将会：\n- 递归删除所有子岗位\n- 保留历史数据用于审计\n\n此操作不可撤销！`;
    }
    
    const confirmed = confirm(confirmMessage);
    
    if (!confirmed) {
      return;
    }

    try {
      Toast.show('正在删除岗位...', 'info');
      const result = await API.deleteRole(roleId, '用户删除');
      
      if (result.ok) {
        const affectedCount = result.deleteResult.affectedAgents.length + result.deleteResult.affectedRoles.length;
        Toast.show(`岗位 "${roleName}" 已删除，影响了 ${affectedCount} 个对象`, 'success');
        
        // 刷新数据
        if (window.App && window.App.loadRoles) {
          await window.App.loadRoles();
        }
        if (window.App && window.App.loadAgents) {
          await window.App.loadAgents();
        }
        if (window.App && window.App.loadOrgTree) {
          await window.App.loadOrgTree();
        }
      } else {
        Toast.show('删除失败: ' + (result.message || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('删除岗位失败:', error);
      Toast.show('删除失败: ' + error.message, 'error');
    }
  },

  /**
   * 岗位详情按钮点击处理
   * @param {string} roleId - 岗位 ID
   */
  onRoleDetailClick(roleId) {
    if (window.RoleDetailModal) {
      window.RoleDetailModal.showByRoleId(roleId);
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
