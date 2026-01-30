import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent } from '../types';
import { apiService } from '../services/api';

/**
 * 智能体状态管理
 * 负责根据当前选中的组织加载智能体列表
 */
export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([]);
  const loading = ref(false);
  const currentOrgId = ref<string | null>(null);

  /**
   * 根据组织 ID 获取智能体
   * @param orgId 组织 ID
   */
  const fetchAgentsByOrg = async (orgId: string) => {
    currentOrgId.value = orgId;
    loading.value = true;
    try {
      // 1. 获取针对该组织的智能体列表
      const fetchedAgents = await apiService.getAgents(orgId);
      
      if (orgId === 'home') {
        // 首页：只显示 root 和 user
        agents.value = fetchedAgents.filter(a => a.id === 'root' || a.id === 'user');
      } else {
        // 普通组织：
        // 1. 提取 user
        const userAgent = fetchedAgents.find(a => a.id === 'user');
        // 2. 提取其他智能体并按最后活跃时间排序
        const otherAgents = fetchedAgents
          .filter(a => a.id !== 'user')
          .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        
        // 3. 组合：user 始终在第一位
        const result: Agent[] = [];
        if (userAgent) result.push(userAgent);
        result.push(...otherAgents);
        
        agents.value = result;
      }
    } catch (error) {
      console.error('加载智能体列表失败:', error);
      agents.value = [];
    } finally {
      loading.value = false;
    }
  };

  /**
   * 获取当前选中的智能体数量
   */
  const agentCount = computed(() => agents.value.length);

  return {
    agents,
    loading,
    currentOrgId,
    fetchAgentsByOrg,
    agentCount
  };
});
