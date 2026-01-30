import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Tab } from '../types';

export const useAppStore = defineStore('app', () => {
  // 侧栏收缩状态
  const isSidebarCollapsed = ref(localStorage.getItem('sidebar_collapsed') === 'true');
  
  // 主题状态
  const theme = ref<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  // 活动标签页
  const activeTabs = ref<Tab[]>([]);
  const currentTabId = ref('');

  // Actions
  const toggleSidebar = () => {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
    localStorage.setItem('sidebar_collapsed', String(isSidebarCollapsed.value));
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    theme.value = newTheme;
    localStorage.setItem('theme', newTheme);
  };

  const openTab = (tab: Tab) => {
    const existingTab = activeTabs.value.find(t => t.id === tab.id);
    if (!existingTab) {
      activeTabs.value.push(tab);
    }
    currentTabId.value = tab.id;
  };

  /**
   * 初始化应用，默认打开首页
   */
  const initApp = () => {
    if (activeTabs.value.length === 0) {
      openTab({
        id: 'home',
        type: 'org',
        title: '首页'
      });
    }
  };

  const closeTab = (tabId: string) => {
    if (tabId === 'home') return; // 首页不可关闭
    const index = activeTabs.value.findIndex(t => t.id === tabId);
    if (index === -1) return;

    activeTabs.value.splice(index, 1);
    
    // 如果关闭的是当前标签，且还有其他标签，切换到临近标签
    if (currentTabId.value === tabId && activeTabs.value.length > 0) {
      const nextTab = activeTabs.value[Math.min(index, activeTabs.value.length - 1)];
      currentTabId.value = nextTab ? nextTab.id : '';
    } else if (activeTabs.value.length === 0) {
      currentTabId.value = '';
    }
  };

  return {
    isSidebarCollapsed,
    theme,
    activeTabs,
    currentTabId,
    toggleSidebar,
    setTheme,
    openTab,
    closeTab,
    initApp
  };
});
