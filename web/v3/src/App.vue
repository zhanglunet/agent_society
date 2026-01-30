<script setup lang="ts">
import GlobalSidebar from './components/layout/GlobalSidebar.vue';
import WorkspaceTabs from './components/layout/WorkspaceTabs.vue';
import Button from 'primevue/button';
import { Sun, Moon } from 'lucide-vue-next';
import { ref, onMounted } from 'vue';
import { useAppStore } from './stores/app';
import { useAgentStore } from './stores/agent';

const appStore = useAppStore();
const agentStore = useAgentStore();
const isDark = ref(false);

const toggleDarkMode = () => {
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle('my-app-dark');
};

onMounted(() => {
    isDark.value = document.documentElement.classList.contains('my-app-dark');
    appStore.initApp();
    agentStore.fetchAllAgents();
});
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text-1)]">
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
