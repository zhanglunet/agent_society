<script setup lang="ts">
import { X, LayoutGrid } from 'lucide-vue-next';
import Button from 'primevue/button';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Splitter from 'primevue/splitter';
import SplitterPanel from 'primevue/splitterpanel';
import { useAppStore } from '../../stores/app';
import AgentList from '../agent/AgentList.vue';
import ChatArea from '../chat/ChatArea.vue';
import HomeOverview from '../dashboard/HomeOverview.vue';

const appStore = useAppStore();
</script>

<template>
  <div class="flex-grow flex flex-col h-full bg-[var(--bg)]">
    <Tabs v-model:value="appStore.currentTabId" class="flex flex-col h-full !bg-transparent overflow-visible" :pt="{ root: { class: 'bg-transparent border-none overflow-visible' } }">
      <TabList class="px-3 py-2 !bg-[var(--bg)] gap-2 flex items-center border-b border-[var(--border)] relative z-10" :pt="{ root: { class: '!bg-transparent border-none overflow-visible' }, content: { class: '!bg-transparent overflow-visible' } }">
        <Tab v-for="tab in appStore.activeTabs" :key="tab.id" :value="tab.id" class="custom-tab group">
          <span class="truncate">{{ tab.title }}</span>
          <Button 
            v-if="tab.id !== 'home'"
            variant="text" 
            rounded 
            class="!p-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:!bg-[var(--surface-3)]"
            @click.stop="appStore.closeTab(tab.id)"
          >
            <X class="w-3 h-3 text-[var(--text-3)]" />
          </Button>
        </Tab>
      </TabList>
      
      <TabPanels class="!p-0 flex-grow overflow-hidden bg-transparent">
        <div v-if="appStore.activeTabs.length === 0" class="flex flex-col items-center justify-center h-full text-[var(--text-3)]">
          <div class="w-16 h-16 mb-4 rounded-full bg-[var(--surface-2)] flex items-center justify-center">
            <LayoutGrid class="w-8 h-8 opacity-20" />
          </div>
          <p>暂无活动工作区</p>
          <p class="text-sm mt-1">请从侧栏选择一个组织开始工作</p>
        </div>
        <TabPanel v-for="tab in appStore.activeTabs" :key="tab.id" :value="tab.id" class="h-full">
          <!-- 首页展示概览视图 -->
          <HomeOverview v-if="tab.id === 'home'" />
          
          <!-- 其他组织展示三段式布局：中（智能体列表） + 右（主内容） -->
          <Splitter v-else class="h-full border-none rounded-none bg-transparent">
            <!-- 中：智能体列表 (Workspace Sidebar) -->
            <SplitterPanel :size="25" :minSize="20" class="flex flex-col bg-[var(--surface-2)] border-r border-[var(--border)]">
              <AgentList :orgId="tab.id" />
            </SplitterPanel>

            <!-- 右：主内容 (Main Content) -->
            <SplitterPanel :size="75" class="flex flex-col bg-[var(--bg)]">
              <ChatArea :orgId="tab.id" :tabTitle="tab.title" />
            </SplitterPanel>
          </Splitter>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
/* 强制所有容器 overflow visible 以防止阴影被截断 */
:deep(.p-tablist),
:deep(.p-tablist-content),
:deep(.p-tablist-tab-list) {
  border: none !important;
  background: transparent !important;
  overflow: visible !important;
}

:deep(.p-tablist-tab-list) {
  gap: 0.5rem;
}

:deep(.custom-tab) {
  background: transparent !important;
  border: none !important;
  color: var(--text-2) !important;
  padding: 0.5rem 1.25rem !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  border-radius: 0.5rem !important; /* rounded-lg */
  margin: 0 !important;
}

:deep(.custom-tab.p-tab-active) {
  color: var(--primary) !important;
  background: var(--surface-1) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.05) !important;
  border: 1px solid var(--border) !important;
  z-index: 20;
}

:deep(.custom-tab:hover:not(.p-tab-active)) {
  background: var(--surface-3) !important;
  color: var(--text-1) !important;
}

/* 隐藏 PrimeVue 默认的下划线和墨水条 */
:deep(.p-tablist-active-bar) {
  display: none !important;
}

:deep(.p-tabs-ink-bar) {
  display: none !important;
}

/* Splitter 样式微调：精简分割线 */
:deep(.p-splitter) {
  background: transparent !important;
  border: none !important;
}

:deep(.p-splitter-gutter) {
  background: var(--border) !important;
  width: 1px !important;
  transition: background 0.2s;
}

:deep(.p-splitter-gutter:hover) {
  background: var(--primary) !important;
}

:deep(.p-splitter-gutter-handle) {
  display: none !important;
}
</style>
