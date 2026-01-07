/**
 * 排序函数属性测试
 * 功能: agent-web-viewer
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';

// 模拟 SortUtils（因为原文件是浏览器环境）
const SortUtils = {
  ASC: 'asc',
  DESC: 'desc',

  sortByCreatedAt(agents, order = this.ASC) {
    if (!Array.isArray(agents)) {
      return [];
    }
    const sorted = [...agents];
    sorted.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      if (order === this.ASC) {
        return timeA - timeB;
      } else {
        return timeB - timeA;
      }
    });
    return sorted;
  },

  sortWithPinnedAgents(agents, order = this.ASC) {
    if (!Array.isArray(agents)) {
      return [];
    }
    
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
    
    const pinned = [];
    if (userAgent) pinned.push(userAgent);
    if (rootAgent) pinned.push(rootAgent);
    
    const sortedRegular = this.sortByCreatedAt(regular, order);
    
    return [...pinned, ...sortedRegular];
  },

  toggleOrder(currentOrder) {
    return currentOrder === this.ASC ? this.DESC : this.ASC;
  },
};

// 使用整数时间戳生成日期字符串
const dateStringArb = fc.integer({ min: 1577836800000, max: 1893456000000 })
  .map(ts => new Date(ts).toISOString());

// 智能体生成器
const agentArbitrary = fc.record({
  id: fc.uuid(),
  roleId: fc.uuid(),
  roleName: fc.string({ minLength: 1, maxLength: 20 }),
  parentAgentId: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: dateStringArb,
  status: fc.oneof(fc.constant('active'), fc.constant('terminated')),
});

describe('功能: agent-web-viewer, 属性 1: 智能体列表排序正确性', () => {
  test('升序排序时，每个智能体的创建时间应小于或等于其后一个智能体的创建时间', () => {
    fc.assert(
      fc.property(
        fc.array(agentArbitrary, { minLength: 0, maxLength: 100 }),
        (agents) => {
          const sorted = SortUtils.sortByCreatedAt(agents, 'asc');
          
          // 验证排序正确性
          for (let i = 0; i < sorted.length - 1; i++) {
            const timeA = new Date(sorted[i].createdAt).getTime();
            const timeB = new Date(sorted[i + 1].createdAt).getTime();
            expect(timeA).toBeLessThanOrEqual(timeB);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('降序排序时，每个智能体的创建时间应大于或等于其后一个智能体的创建时间', () => {
    fc.assert(
      fc.property(
        fc.array(agentArbitrary, { minLength: 0, maxLength: 100 }),
        (agents) => {
          const sorted = SortUtils.sortByCreatedAt(agents, 'desc');
          
          for (let i = 0; i < sorted.length - 1; i++) {
            const timeA = new Date(sorted[i].createdAt).getTime();
            const timeB = new Date(sorted[i + 1].createdAt).getTime();
            expect(timeA).toBeGreaterThanOrEqual(timeB);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('排序不应改变数组长度', () => {
    fc.assert(
      fc.property(
        fc.array(agentArbitrary, { minLength: 0, maxLength: 100 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (agents, order) => {
          const sorted = SortUtils.sortByCreatedAt(agents, order);
          expect(sorted.length).toBe(agents.length);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('排序不应修改原数组', () => {
    fc.assert(
      fc.property(
        fc.array(agentArbitrary, { minLength: 1, maxLength: 50 }),
        (agents) => {
          const original = JSON.stringify(agents);
          SortUtils.sortByCreatedAt(agents, 'asc');
          expect(JSON.stringify(agents)).toBe(original);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('切换排序方向应正确工作', () => {
    expect(SortUtils.toggleOrder('asc')).toBe('desc');
    expect(SortUtils.toggleOrder('desc')).toBe('asc');
  });
});


// 固定智能体生成器
const userAgentArb = fc.record({
  id: fc.constant('user'),
  roleId: fc.uuid(),
  roleName: fc.constant('用户'),
  parentAgentId: fc.constant(undefined),
  createdAt: dateStringArb,
  status: fc.constant('active'),
});

const rootAgentArb = fc.record({
  id: fc.constant('root'),
  roleId: fc.uuid(),
  roleName: fc.constant('根节点'),
  parentAgentId: fc.constant(undefined),
  createdAt: dateStringArb,
  status: fc.constant('active'),
});

// 普通智能体生成器（排除 user 和 root）
const regularAgentArb = fc.record({
  id: fc.uuid(),
  roleId: fc.uuid(),
  roleName: fc.string({ minLength: 1, maxLength: 20 }),
  parentAgentId: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: dateStringArb,
  status: fc.oneof(fc.constant('active'), fc.constant('terminated')),
});

/**
 * 功能: agent-list-pinned-sorting
 * 属性 1: 固定智能体始终在顶部且顺序正确
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */
describe('功能: agent-list-pinned-sorting, 属性 1: 固定智能体位置正确性', () => {
  test('user 智能体存在时应始终在位置 0', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        fc.option(rootAgentArb, { nil: undefined }),
        fc.array(regularAgentArb, { minLength: 0, maxLength: 50 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, ...regularAgents];
          if (rootAgent) agents.push(rootAgent);
          // 打乱顺序
          const shuffled = [...agents].sort(() => Math.random() - 0.5);
          
          const sorted = SortUtils.sortWithPinnedAgents(shuffled, order);
          
          expect(sorted[0].id).toBe('user');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('root 智能体存在且 user 存在时应在位置 1', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 50 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          const shuffled = [...agents].sort(() => Math.random() - 0.5);
          
          const sorted = SortUtils.sortWithPinnedAgents(shuffled, order);
          
          expect(sorted[0].id).toBe('user');
          expect(sorted[1].id).toBe('root');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('只有 root 智能体时应在位置 0', () => {
    fc.assert(
      fc.property(
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 50 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (rootAgent, regularAgents, order) => {
          const agents = [rootAgent, ...regularAgents];
          const shuffled = [...agents].sort(() => Math.random() - 0.5);
          
          const sorted = SortUtils.sortWithPinnedAgents(shuffled, order);
          
          expect(sorted[0].id).toBe('root');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('user 始终在 root 之前', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 50 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          const shuffled = [...agents].sort(() => Math.random() - 0.5);
          
          const sorted = SortUtils.sortWithPinnedAgents(shuffled, order);
          
          const userIndex = sorted.findIndex(a => a.id === 'user');
          const rootIndex = sorted.findIndex(a => a.id === 'root');
          
          expect(userIndex).toBeLessThan(rootIndex);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * 功能: agent-list-pinned-sorting
 * 属性 2: 排序方向不影响固定智能体位置
 * Validates: Requirements 2.1, 2.2, 2.3
 */
describe('功能: agent-list-pinned-sorting, 属性 2: 排序方向不影响固定智能体', () => {
  test('切换排序方向时，固定智能体位置保持不变', () => {
    fc.assert(
      fc.property(
        fc.option(userAgentArb, { nil: undefined }),
        fc.option(rootAgentArb, { nil: undefined }),
        fc.array(regularAgentArb, { minLength: 1, maxLength: 50 }),
        (userAgent, rootAgent, regularAgents) => {
          const agents = [...regularAgents];
          if (userAgent) agents.push(userAgent);
          if (rootAgent) agents.push(rootAgent);
          
          const sortedAsc = SortUtils.sortWithPinnedAgents(agents, 'asc');
          const sortedDesc = SortUtils.sortWithPinnedAgents(agents, 'desc');
          
          // 找出固定智能体的位置
          const pinnedCountAsc = sortedAsc.filter(a => a.id === 'user' || a.id === 'root').length;
          const pinnedCountDesc = sortedDesc.filter(a => a.id === 'user' || a.id === 'root').length;
          
          // 固定智能体数量应相同
          expect(pinnedCountAsc).toBe(pinnedCountDesc);
          
          // 固定智能体的顺序应相同
          for (let i = 0; i < pinnedCountAsc; i++) {
            expect(sortedAsc[i].id).toBe(sortedDesc[i].id);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('排序方向只影响普通智能体的顺序', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 2, maxLength: 50 }),
        (userAgent, rootAgent, regularAgents) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          
          const sortedAsc = SortUtils.sortWithPinnedAgents(agents, 'asc');
          const sortedDesc = SortUtils.sortWithPinnedAgents(agents, 'desc');
          
          // 前两个应该是固定智能体
          expect(sortedAsc[0].id).toBe('user');
          expect(sortedAsc[1].id).toBe('root');
          expect(sortedDesc[0].id).toBe('user');
          expect(sortedDesc[1].id).toBe('root');
          
          // 普通智能体部分（从索引 2 开始）
          const regularAsc = sortedAsc.slice(2);
          const regularDesc = sortedDesc.slice(2);
          
          // 普通智能体应该包含相同的元素
          const idsAsc = regularAsc.map(a => a.id).sort();
          const idsDesc = regularDesc.map(a => a.id).sort();
          expect(idsAsc).toEqual(idsDesc);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * 功能: agent-list-pinned-sorting
 * 属性 3: 普通智能体按时间正确排序
 * Validates: Requirements 2.4, 3.1, 3.2, 3.3
 */
describe('功能: agent-list-pinned-sorting, 属性 3: 普通智能体排序正确性', () => {
  test('升序时，普通智能体按创建时间从早到晚排序', () => {
    fc.assert(
      fc.property(
        fc.option(userAgentArb, { nil: undefined }),
        fc.option(rootAgentArb, { nil: undefined }),
        fc.array(regularAgentArb, { minLength: 2, maxLength: 50 }),
        (userAgent, rootAgent, regularAgents) => {
          const agents = [...regularAgents];
          if (userAgent) agents.push(userAgent);
          if (rootAgent) agents.push(rootAgent);
          
          const sorted = SortUtils.sortWithPinnedAgents(agents, 'asc');
          
          // 计算固定智能体数量
          const pinnedCount = (userAgent ? 1 : 0) + (rootAgent ? 1 : 0);
          
          // 验证普通智能体部分的排序
          const regularPart = sorted.slice(pinnedCount);
          for (let i = 0; i < regularPart.length - 1; i++) {
            const timeA = new Date(regularPart[i].createdAt).getTime();
            const timeB = new Date(regularPart[i + 1].createdAt).getTime();
            expect(timeA).toBeLessThanOrEqual(timeB);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('降序时，普通智能体按创建时间从晚到早排序', () => {
    fc.assert(
      fc.property(
        fc.option(userAgentArb, { nil: undefined }),
        fc.option(rootAgentArb, { nil: undefined }),
        fc.array(regularAgentArb, { minLength: 2, maxLength: 50 }),
        (userAgent, rootAgent, regularAgents) => {
          const agents = [...regularAgents];
          if (userAgent) agents.push(userAgent);
          if (rootAgent) agents.push(rootAgent);
          
          const sorted = SortUtils.sortWithPinnedAgents(agents, 'desc');
          
          const pinnedCount = (userAgent ? 1 : 0) + (rootAgent ? 1 : 0);
          const regularPart = sorted.slice(pinnedCount);
          
          for (let i = 0; i < regularPart.length - 1; i++) {
            const timeA = new Date(regularPart[i].createdAt).getTime();
            const timeB = new Date(regularPart[i + 1].createdAt).getTime();
            expect(timeA).toBeGreaterThanOrEqual(timeB);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('普通智能体始终在固定智能体之后', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 1, maxLength: 50 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          const shuffled = [...agents].sort(() => Math.random() - 0.5);
          
          const sorted = SortUtils.sortWithPinnedAgents(shuffled, order);
          
          // 前两个必须是固定智能体
          expect(sorted[0].id).toBe('user');
          expect(sorted[1].id).toBe('root');
          
          // 从索引 2 开始都是普通智能体
          for (let i = 2; i < sorted.length; i++) {
            expect(sorted[i].id).not.toBe('user');
            expect(sorted[i].id).not.toBe('root');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// 模拟 FilterUtils
const FilterUtils = {
  filterByKeyword(agents, keyword) {
    if (!Array.isArray(agents)) {
      return [];
    }
    
    if (!keyword || keyword.trim() === '') {
      return [...agents];
    }
    
    const lowerKeyword = keyword.toLowerCase().trim();
    
    return agents.filter(agent => {
      const roleName = (agent.roleName || '').toLowerCase();
      const id = (agent.id || '').toLowerCase();
      return roleName.includes(lowerKeyword) || id.includes(lowerKeyword);
    });
  },
};

/**
 * 功能: agent-list-pinned-sorting
 * 属性 4: 筛选后固定智能体保持相对位置
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
describe('功能: agent-list-pinned-sorting, 属性 4: 筛选后固定智能体位置', () => {
  // 模拟 AgentList.applyFilterAndSort 的逻辑
  const applyFilterAndSort = (agents, keyword, order) => {
    let result = FilterUtils.filterByKeyword(agents, keyword);
    result = SortUtils.sortWithPinnedAgents(result, order);
    return result;
  };

  test('筛选后，通过筛选的固定智能体保持相对位置', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 30 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          
          // 使用 'user' 作为关键词，只有 user 能通过筛选
          const result = applyFilterAndSort(agents, 'user', order);
          
          if (result.length > 0) {
            expect(result[0].id).toBe('user');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('筛选掉 user 后，root 应在位置 0', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 30 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          
          // 使用 'root' 作为关键词，user 被筛选掉
          const result = applyFilterAndSort(agents, 'root', order);
          
          if (result.length > 0) {
            expect(result[0].id).toBe('root');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('空筛选关键词时，固定智能体在固定位置', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 30 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          const agents = [userAgent, rootAgent, ...regularAgents];
          const shuffled = [...agents].sort(() => Math.random() - 0.5);
          
          const result = applyFilterAndSort(shuffled, '', order);
          
          expect(result[0].id).toBe('user');
          expect(result[1].id).toBe('root');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('筛选后，固定智能体仍保持 user 在 root 之前的顺序', () => {
    fc.assert(
      fc.property(
        userAgentArb,
        rootAgentArb,
        fc.array(regularAgentArb, { minLength: 0, maxLength: 30 }),
        fc.oneof(fc.constant('asc'), fc.constant('desc')),
        (userAgent, rootAgent, regularAgents, order) => {
          // 修改 user 和 root 的 roleName 使它们都能通过筛选
          const modifiedUser = { ...userAgent, roleName: '测试用户' };
          const modifiedRoot = { ...rootAgent, roleName: '测试根节点' };
          const agents = [modifiedUser, modifiedRoot, ...regularAgents];
          
          // 使用 '测试' 作为关键词，两个固定智能体都能通过
          const result = applyFilterAndSort(agents, '测试', order);
          
          const userIndex = result.findIndex(a => a.id === 'user');
          const rootIndex = result.findIndex(a => a.id === 'root');
          
          if (userIndex !== -1 && rootIndex !== -1) {
            expect(userIndex).toBeLessThan(rootIndex);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
