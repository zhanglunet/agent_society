/**
 * 排序工具函数
 * 提供智能体列表的排序功能
 */

const SortUtils = {
  // 排序方向常量
  ASC: 'asc',   // 升序（最早的在前）
  DESC: 'desc', // 降序（最新的在前）

  /**
   * 按创建时间排序智能体列表
   * @param {Array} agents - 智能体数组
   * @param {string} order - 排序方向 ('asc' 或 'desc')
   * @returns {Array} 排序后的新数组
   */
  sortByCreatedAt(agents, order = this.ASC) {
    if (!Array.isArray(agents)) {
      return [];
    }
    
    // 创建副本避免修改原数组
    const sorted = [...agents];
    
    sorted.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      
      if (order === this.ASC) {
        return timeA - timeB; // 升序：早的在前
      } else {
        return timeB - timeA; // 降序：晚的在前
      }
    });
    
    return sorted;
  },

  /**
   * 按岗位名称排序智能体列表
   * @param {Array} agents - 智能体数组
   * @param {string} order - 排序方向 ('asc' 或 'desc')
   * @returns {Array} 排序后的新数组
   */
  sortByRoleName(agents, order = this.ASC) {
    if (!Array.isArray(agents)) {
      return [];
    }
    
    const sorted = [...agents];
    
    sorted.sort((a, b) => {
      const nameA = (a.roleName || '').toLowerCase();
      const nameB = (b.roleName || '').toLowerCase();
      
      if (order === this.ASC) {
        return nameA.localeCompare(nameB, 'zh-CN');
      } else {
        return nameB.localeCompare(nameA, 'zh-CN');
      }
    });
    
    return sorted;
  },

  /**
   * 按创建时间排序智能体列表，固定 user 和 root 在顶部
   * @param {Array} agents - 智能体数组
   * @param {string} order - 排序方向 ('asc' 或 'desc')
   * @returns {Array} 排序后的新数组，user 在第一位，root 在第二位
   */
  sortWithPinnedAgents(agents, order = this.ASC) {
    if (!Array.isArray(agents)) {
      return [];
    }
    
    // 分离固定智能体和普通智能体
    const regular = [];
    let userAgent = null;
    let rootAgent = null;
    
    for (const agent of agents) {
      if (agent.id === 'user') {
        userAgent = agent;
      } else if (agent.id === 'root') {
        rootAgent = agent;
      } else {
        regular.push(agent);
      }
    }
    
    // 按固定顺序添加: user 第一，root 第二
    const pinned = [];
    if (userAgent) pinned.push(userAgent);
    if (rootAgent) pinned.push(rootAgent);
    
    // 对普通智能体排序
    const sortedRegular = this.sortByCreatedAt(regular, order);
    
    // 合并结果
    return [...pinned, ...sortedRegular];
  },

  /**
   * 切换排序方向
   * @param {string} currentOrder - 当前排序方向
   * @returns {string} 新的排序方向
   */
  toggleOrder(currentOrder) {
    return currentOrder === this.ASC ? this.DESC : this.ASC;
  },
};

// 导出供其他模块使用
window.SortUtils = SortUtils;
