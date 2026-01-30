import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Agent } from '../types';
import { apiService } from '../services/api';

/**
 * 智能体状态管理
 * 负责根据当前选中的组织加载智能体列表
 */
export const useAgentStore = defineStore('agent', () => {
  const agentsMap = ref<Record<string, Agent[]>>({});
  const allAgents = ref<Agent[]>([]); // 全局智能体列表
  const loading = ref(false);
  const currentOrgId = ref<string | null>(null);

  /**
   * 加载所有智能体，用于全局搜索和跨组织解析
   */
  const fetchAllAgents = async (silent = false) => {
    if (!silent) loading.value = true;
    try {
      // getAgents('home') 内部会调用 /api/agents 并返回所有
      // 但我们需要一个干净的全局列表，不带 orgId 过滤
      const all = await apiService.getAgents('all'); 
      allAgents.value = all;
      return all;
    } catch (error) {
      console.error('加载全局智能体列表失败:', error);
      return [];
    } finally {
      if (!silent) loading.value = false;
    }
  };

  /**
   * 根据组织 ID 获取智能体
   * @param orgId 组织 ID
   * @param silent 是否静默更新 (不触发 loading 状态)
   */
  const fetchAgentsByOrg = async (orgId: string, silent = false) => {
    currentOrgId.value = orgId;
    if (!silent) loading.value = true;
    try {
      // 1. 获取针对该组织的智能体列表
      const fetchedAgents = await apiService.getAgents(orgId);
      
      // 更新全局列表中的这部分智能体信息（可选，保持同步）
      fetchedAgents.forEach(agent => {
        const index = allAgents.value.findIndex(a => a.id === agent.id);
        if (index !== -1) {
          allAgents.value[index] = agent;
        } else {
          allAgents.value.push(agent);
        }
      });
      
      let result: Agent[] = [];
      if (orgId === 'home') {
        // 首页：只显示 root 和 user
        result = fetchedAgents.filter(a => a.id === 'root' || a.id === 'user');
      } else {
        // 普通组织：
        // 1. 提取 user
        const userAgent = fetchedAgents.find(a => a.id === 'user');
        // 2. 提取其他智能体并按最后活跃时间排序
        const otherAgents = fetchedAgents
          .filter(a => a.id !== 'user')
          .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        
        // 3. 组合：user 始终在第一位
        if (userAgent) result.push(userAgent);
        result.push(...otherAgents);
      }
      
      agentsMap.value[orgId] = result;
    } catch (error) {
      console.error('加载智能体列表失败:', error);
      if (!agentsMap.value[orgId]) {
        agentsMap.value[orgId] = [];
      }
    } finally {
      if (!silent) loading.value = false;
    }
  };

  /**
   * 获取当前选中的智能体列表 (兼容旧接口)
   */
  const agents = computed(() => {
    if (!currentOrgId.value) return [];
    return agentsMap.value[currentOrgId.value] || [];
  });

  /**
   * 获取当前选中的智能体数量
   */
  const agentCount = computed(() => agents.value.length);

  /**
   * 中断智能体的 LLM 调用
   * @param agentId 智能体 ID
   */
  const abortAgent = async (agentId: string) => {
    try {
      await apiService.abortAgentLlmCall(agentId);
      // 中断后立即刷新当前组织的智能体状态
      if (currentOrgId.value) {
        await fetchAgentsByOrg(currentOrgId.value);
      }
    } catch (error) {
      console.error('中断智能体调用失败:', error);
    }
  };

  return {
    agentsMap,
    allAgents,
    agents,
    loading,
    currentOrgId,
    fetchAgentsByOrg,
    fetchAllAgents,
    abortAgent,
    agentCount
  };
});
