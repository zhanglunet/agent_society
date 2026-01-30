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
      // 1. 先获取所有智能体（用于过滤或查找 root/user）
      const allAgents = await apiService.getAgents(orgId);
      
      if (orgId === 'home') {
        // 首页：只显示 root 和 user
        agents.value = allAgents.filter(a => a.id === 'root' || a.id === 'user');
      } else {
        // 普通组织：显示 user + 该组织的所有智能体
        // 注意：目前后端 apiService.getAgents(orgId) 返回的是所有智能体，但带了 orgId 标记
        // 我们需要找到属于该组织的智能体，并确保 user 也在列表中
        const orgAgents = allAgents.filter(a => a.orgId === orgId);
        const userAgent = allAgents.find(a => a.id === 'user');
        
        const result: Agent[] = [...orgAgents];
        if (userAgent && !result.find(a => a.id === 'user')) {
          result.unshift(userAgent);
        }
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
