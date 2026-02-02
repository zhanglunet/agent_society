<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { LayoutGrid, Briefcase, Settings, ChevronLeft, ChevronRight, Home, Search, X, Loader2, Layers } from 'lucide-vue-next';
import { useAppStore } from '../../stores/app';
import { useOrgStore } from '../../stores/org';
import { useChatStore } from '../../stores/chat';
import { templateApi } from '../../services/templateApi';
import { useDialog } from 'primevue/usedialog';
import { ref, computed } from 'vue';
import ArtifactsList from '../artifacts/ArtifactsList.vue';
import SettingsDialog from '../settings/SettingsDialog.vue';
import RoleTreeView from '../overview/RoleTreeView.vue';
import OrgTemplateManager from '../template/OrgTemplateManager.vue';

const appStore = useAppStore();
const orgStore = useOrgStore();
const chatStore = useChatStore();
const dialog = useDialog();

const searchQuery = ref('');

const filteredOrgs = computed(() => {
  if (!searchQuery.value.trim()) return orgStore.orgs;
  const query = searchQuery.value.toLowerCase().trim();
  return orgStore.orgs.filter(org => 
    org.name.toLowerCase().includes(query) || 
    org.id.toLowerCase().includes(query)
  );
});

const openOverview = () => {
  dialog.open(RoleTreeView, {
    props: {
      header: '组织架构总览',
      style: {
        width: '800px',
      },
      modal: true,
      dismissableMask: false,
      closeOnEscape: false,
    }
  });
};

const openArtifacts = (org: any) => {
  dialog.open(ArtifactsList, {
    props: {
      header: `工件管理器 - ${org.name}`,
      style: {
        width: '80vw',
        maxWidth: '1000px',
      },
      modal: true,
      dismissableMask: false,
      closeOnEscape: false,
    },
    data: {
      orgId: org.id
    }
  });
};

const openSettings = () => {
  dialog.open(SettingsDialog, {
    props: {
      header: '系统设置',
      style: {
        width: '600px',
      },
      modal: true,
      dismissableMask: false,
      closeOnEscape: false,
    }
  });
};

const openTemplateManager = () => {
  const dialogRef = dialog.open(OrgTemplateManager, {
    props: {
      header: '组织模板管理器',
      style: {
        width: '90vw',
        height: '80vh',
        maxWidth: '1200px',
      },
      modal: true,
      dismissableMask: false,
      closeOnEscape: false,
      maximizable: true,
      // 通过 pt 覆盖最大化时的样式，确保真正填满窗口
      pt: {
        root: ({ state }: { state: { maximized: boolean } }) => ({
          class: [
            state.maximized ? '!w-screen !h-screen !max-w-none !m-0' : ''
          ]
        }),
        content: ({ state }: { state: { maximized: boolean } }) => ({
          class: [
            'overflow-hidden p-0',
            state.maximized ? '!w-full !h-[calc(100vh-4rem)]' : ''
          ]
        })
      }
    },
    // 监听 useTemplate 事件
    emits: {
      useTemplate: async (template: { id: string; name: string }) => {
        // 关闭对话框
        dialogRef.close();
        
        // 跳转到首页
        appStore.openTab({
          id: 'home',
          type: 'org',
          title: '首页'
        });
        
        try {
          // 获取模板内容（包含 org.md）
          const content = await templateApi.getTemplateContent(template.id);
          
          // 开启 root 新会话
          await chatStore.rootNewSession();
          
          // 构造提示词，包含 org.md 内容
          const prompt = `请基于以下组织模板创建一个新的组织：

## 组织模板名称
${template.name}

## 组织架构定义 (org.md)
\`\`\`markdown
${content.org}
\`\`\`

请根据以上模板创建组织，建立相应的岗位和智能体。`;
          
          // 发送消息给 root
          await chatStore.sendMessage('root', prompt);
        } catch (error) {
          console.error('使用模板创建组织失败:', error);
        }
      }
    }
  });
};

const tools = [
  { id: 'overview', icon: LayoutGrid, label: '总览视图', action: openOverview },
  { id: 'templates', icon: Layers, label: '组织模板', action: openTemplateManager },
  { id: 'settings', icon: Settings, label: '系统设置', action: openSettings },
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
          @click="tool.action"
        >
          <component :is="tool.icon" class="w-4 h-4 text-[var(--text-2)] hover:text-[var(--primary)] transition-colors" />
        </Button>
      </div>
    </div>

    <div class="flex-grow overflow-y-auto p-2 space-y-1">
      <div v-if="!appStore.isSidebarCollapsed" class="px-3 py-2 flex items-center justify-between">
        <span class="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider shrink-0">组织列表</span>
        <div class="relative ml-2 flex-grow max-w-[120px]">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-3)]" />
          <InputText 
            v-model="searchQuery" 
            placeholder="搜索..." 
            class="!text-[10px] !py-1 !pl-6 !pr-6 !w-full !bg-[var(--surface-3)] !border-none !rounded-md focus:!ring-1 focus:!ring-[var(--primary)]"
          />
          <button 
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--surface-4)] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
          >
            <X class="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
      
      <!-- 加载状态 -->
      <div v-if="orgStore.loading" class="flex justify-center p-4">
        <Loader2 class="w-5 h-5 animate-spin text-[var(--text-3)]" />
      </div>

      <Button 
            v-for="org in filteredOrgs" 
            :key="org.id"
            variant="text" 
            class="w-full !justify-start !px-3 !py-2 text-[var(--text-2)] hover:text-[var(--text-1)] active:translate-y-[1px] active:scale-[0.98] transition-all group"
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
            <!-- 工件管理器按钮 -->
            <Button 
              v-if="!appStore.isSidebarCollapsed && org.id !== 'home'"
              variant="text"
              rounded
              class="!p-1.5 hover:!bg-[var(--surface-4)] transition-all shrink-0"
              v-tooltip.top="'工件管理'"
              @click.stop="openArtifacts(org)"
            >
              <Briefcase class="w-3.5 h-3.5 text-[var(--text-3)] hover:text-[var(--primary)]" />
            </Button>
          </Button>
    </div>
  </aside>
</template>
