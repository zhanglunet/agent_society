import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Organization } from '../types';
import { apiService } from '../services/api';

export const useOrgStore = defineStore('org', () => {
  const orgs = ref<Organization[]>([]);
  const loading = ref(false);
  const lastUpdated = ref(0);

  const fetchOrgs = async (silent = false) => {
    if (!silent) loading.value = true;
    try {
      const allOrgs = await apiService.getOrganizations();
      
      // 过滤掉 root 和 user，它们是智能体，不是组织
      const filteredOrgs = allOrgs.filter(org => org.id !== 'root' && org.id !== 'user');
      
      // 逆序排序（最新的在前面）
      filteredOrgs.reverse();
      
      // 添加虚拟的“首页”组织
      const homeOrg: Organization = {
        id: 'home',
        name: '首页',
        initial: 'H',
        description: '系统总览与核心智能体'
      };
      
      orgs.value = [homeOrg, ...filteredOrgs];
      lastUpdated.value = Date.now();
    } finally {
      if (!silent) loading.value = false;
    }
  };

  return {
    orgs,
    loading,
    lastUpdated,
    fetchOrgs
  };
});
