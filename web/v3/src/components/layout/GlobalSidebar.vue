<script setup lang="ts">
import Button from 'primevue/button';
import { LayoutGrid, Briefcase, Settings, ChevronLeft, ChevronRight, Home } from 'lucide-vue-next';
import { useAppStore } from '../../stores/app';
import { useOrgStore } from '../../stores/org';

const appStore = useAppStore();
const orgStore = useOrgStore();

const tools = [
  { id: 'overview', icon: LayoutGrid, label: '总览视图' },
  { id: 'artifacts', icon: Briefcase, label: '工件管理' },
  { id: 'settings', icon: Settings, label: '系统设置' },
];

const handleOrgClick = (org: any) => {
  appStore.openTab({
    id: org.id,
    type: 'org',
    title: org.name
  });
};
</script>

<template>
  <aside 
    class="flex flex-col bg-[var(--surface-2)] border-r border-[var(--border)] transition-all duration-300 ease-in-out h-full"
    :class="[appStore.isSidebarCollapsed ? 'w-16' : 'w-64']"
  >
    <!-- 顶部 Logo/收缩按钮 -->
    <div class="p-4 flex items-center justify-between">
      <span v-if="!appStore.isSidebarCollapsed" class="font-bold text-lg text-primary truncate">Agent Society</span>
      <Button 
        variant="text" 
        rounded 
        class="!p-1 min-w-8 active:translate-y-[1px] active:scale-[0.98] transition-all"
        @click="appStore.toggleSidebar()"
      >
        <component :is="appStore.isSidebarCollapsed ? ChevronRight : ChevronLeft" class="w-5 h-5" />
      </Button>
    </div>

    <!-- 全局工具栏 -->
    <div class="p-2">
      <div v-if="!appStore.isSidebarCollapsed" class="px-3 py-2 text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">工具栏</div>
      <div class="flex items-center gap-1 px-2" :class="[appStore.isSidebarCollapsed ? 'flex-wrap justify-center' : 'overflow-x-auto no-scrollbar']">
        <Button 
          v-for="tool in tools" 
          :key="tool.id"
          variant="text" 
          rounded
          class="!p-1.5 active:translate-y-[1px] active:scale-[0.98] transition-all"
          v-tooltip.bottom="tool.label"
        >
          <component :is="tool.icon" class="w-4 h-4 text-[var(--text-2)] hover:text-[var(--primary)] transition-colors" />
        </Button>
      </div>
    </div>

    <div class="flex-grow overflow-y-auto p-2 space-y-1">
      <div v-if="!appStore.isSidebarCollapsed" class="px-3 py-2 text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">组织列表</div>
      
      <!-- 加载状态 -->
      <div v-if="orgStore.loading" class="flex justify-center p-4">
        <i class="pi pi-spin pi-spinner text-[var(--text-3)]"></i>
      </div>

      <Button 
            v-for="org in orgStore.orgs" 
            :key="org.id"
            variant="text" 
            class="w-full !justify-start !px-3 !py-2 text-[var(--text-2)] hover:text-[var(--text-1)] active:translate-y-[1px] active:scale-[0.98] transition-all"
            :class="{ '!bg-[var(--surface-3)] !text-[var(--primary)]': appStore.currentTabId === org.id }"
            v-tooltip.right="appStore.isSidebarCollapsed ? org.name : null"
            @click="handleOrgClick(org)"
          >
            <div class="w-5 h-5 mr-3 shrink-0 flex items-center justify-center bg-[var(--primary-weak)] text-[var(--primary)] rounded text-xs font-bold transition-transform group-active:scale-95">
              <Home v-if="org.id === 'home'" class="w-3.5 h-3.5" />
              <template v-else>{{ org.initial }}</template>
            </div>
            <div v-if="!appStore.isSidebarCollapsed" class="flex flex-col min-w-0 items-start text-left flex-grow">
              <span class="truncate font-medium leading-tight w-full text-left">{{ org.name }}</span>
              <span v-if="org.role" class="truncate text-[10px] text-[var(--text-3)] leading-tight mt-0.5 w-full text-left">{{ org.role }}</span>
            </div>
          </Button>
    </div>
  </aside>
</template>
