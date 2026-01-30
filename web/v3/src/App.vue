<script setup lang="ts">
import GlobalSidebar from './components/layout/GlobalSidebar.vue';
import WorkspaceTabs from './components/layout/WorkspaceTabs.vue';
import Button from 'primevue/button';
import { Sun, Moon } from 'lucide-vue-next';
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAppStore } from './stores/app';
import { useAgentStore } from './stores/agent';
import { useOrgStore } from './stores/org';
import DynamicDialog from 'primevue/dynamicdialog';

const appStore = useAppStore();
const agentStore = useAgentStore();
const orgStore = useOrgStore();
const isDark = ref(false);

// 监听主题变化并更新 DOM
watch(() => appStore.theme, (newTheme) => {
    isDark.value = newTheme === 'dark';
    if (newTheme === 'dark') {
        document.documentElement.classList.add('my-app-dark');
    } else {
        document.documentElement.classList.remove('my-app-dark');
    }
}, { immediate: true });

const toggleDarkMode = () => {
    const newTheme = appStore.theme === 'dark' ? 'light' : 'dark';
    appStore.setTheme(newTheme);
};

let syncTimer: any = null;

const startGlobalSync = () => {
    stopGlobalSync();
    syncTimer = setInterval(async () => {
        // 1. 同步组织列表
        await orgStore.fetchOrgs(true);
        // 2. 同步全局智能体列表
        await agentStore.fetchAllAgents(true);
        // 3. 同步当前活动组织的智能体列表
        if (agentStore.currentOrgId) {
            await agentStore.fetchAgentsByOrg(agentStore.currentOrgId, true);
        }
    }, 2000); // 用户要求 2 秒更新一次
};

const stopGlobalSync = () => {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
};

onMounted(() => {
    appStore.initApp();
    
    // 初始加载
    orgStore.fetchOrgs();
    agentStore.fetchAllAgents();
    
    // 启动全局轮询
    startGlobalSync();
});

onUnmounted(stopGlobalSync);
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text-1)]">
    <DynamicDialog />
    <!-- 全局侧栏 -->
    <GlobalSidebar />

    <!-- 主容器 -->
    <main class="flex-grow flex flex-col min-w-0 relative">
      <!-- 顶部临时控制区 (后续会集成到各组件中) -->
      <div class="absolute top-2 right-4 z-50">
        <Button 
          variant="text" 
          rounded 
          @click="toggleDarkMode"
          :title="isDark ? '切换到明亮模式' : '切换到黑暗模式'"
          class="text-[var(--text-2)]"
        >
          <component :is="isDark ? Sun : Moon" class="w-5 h-5" />
        </Button>
      </div>

      <!-- 核心工作区标签页 -->
      <WorkspaceTabs />
    </main>
  </div>
</template>

<style>
/* 移除默认样式限制 */
#app {
  max-width: none;
  margin: 0;
  padding: 0;
  text-align: left;
  width: 100%;
  height: 100%;
}
body {
  margin: 0;
  overflow: hidden;
}
</style>
