import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useOrgStore } from './org';

/**
 * 新手引导状态管理
 * 
 * 职责：
 * - 管理引导显示状态（仅运行时）
 * - 检查是否应该显示引导
 * - 显示/隐藏引导
 * 
 * 注意：
 * - 不使用localStorage
 * - 不存储引导完成状态
 * - 每次刷新检查组织列表
 * - 纯前端实现
 * 
 * @author Agent Society
 */
export const useGuideStore = defineStore('guide', () => {
  // 是否显示引导（JS状态，仅运行时，不持久化）
  const isVisible = ref(false);

  /**
   * 检查是否应该显示引导（JS逻辑）
   * 
   * 规则：
   * - 只有在没有真实组织时才显示引导
   * - 过滤掉"首页"虚拟组织（id为'home'）
   * 
   * @returns 是否应该显示引导
   */
  const shouldShowGuide = (): boolean => {
    const orgStore = useOrgStore();
    // 过滤掉"首页"虚拟组织
    const realOrgs = orgStore.orgs.filter(org => org.id !== 'home');
    // 只有在没有真实组织时才显示引导
    return realOrgs.length === 0;
  };

  /**
   * 显示引导（JS逻辑）
   * 
   * 流程：
   * 1. 检查是否满足引导条件
   * 2. 如果满足，显示引导
   * 3. 如果不满足，跳过引导
   * 
   * @returns 是否成功显示引导
   */
  const showGuide = (): boolean => {
    if (!shouldShowGuide()) {
      console.log('不满足引导条件，跳过引导');
      return false;
    }
    isVisible.value = true;
    console.log('显示新手引导');
    return true;
  };

  /**
   * 隐藏引导（JS逻辑）
   * 
   * 调用时机：
   * - 用户点击发送按钮
   * - 用户点击关闭按钮
   * - 组织被创建后
   */
  const hideGuide = () => {
    isVisible.value = false;
    console.log('隐藏新手引导');
  };

  return {
    isVisible,
    shouldShowGuide,
    showGuide,
    hideGuide,
  };
});
