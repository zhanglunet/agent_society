<script setup lang="ts">
/**
 * 应用根组件
 * 
 * 职责：
 * - 应用整体布局（侧边栏 + 主内容区）
 * - 主题管理（亮/暗模式切换）
 * - 全局数据同步轮询
 * - 首次运行配置检查
 * 
 * @author Agent Society
 */
import GlobalSidebar from './components/layout/GlobalSidebar.vue';
import WorkspaceTabs from './components/layout/WorkspaceTabs.vue';
import SettingsDialog from './components/settings/SettingsDialog.vue';
import ConfirmDialog from 'primevue/confirmdialog';
import Toast from 'primevue/toast';
import ErrorToast from './components/error/ErrorToast.vue';
import Button from 'primevue/button';
import { Sun, Moon, AlertCircle } from 'lucide-vue-next';
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useAppStore } from './stores/app';
import { useAgentStore } from './stores/agent';
import { useOrgStore } from './stores/org';
import DynamicDialog from 'primevue/dynamicdialog';
import { useDialog } from 'primevue/usedialog';
import { configApi } from './services/configApi';
import { errorNotificationService } from './services/errorNotification';
import { uiCommandService } from './services/uiCommandService';


const appStore = useAppStore();
const agentStore = useAgentStore();
const orgStore = useOrgStore();
const dialog = useDialog();
const isDark = ref(false);

// 将 dialog 挂载到全局，供 fileViewerService 使用
import { registerOpenFileViewer } from './components/file-viewer/services/fileViewerService';
import { openFileViewer } from './components/file-viewer';

onMounted(() => {
  // 注册全局 dialog
  (window as any).$dialog = dialog;
  // 注册打开文件查看器函数
  registerOpenFileViewer(openFileViewer);
});

// 配置检查状态
const configChecked = ref(false);
const hasLocalConfig = ref(true); // 默认假设有配置，避免闪烁

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

/**
 * 启动全局数据同步轮询
 */
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

/**
 * 停止全局数据同步轮询
 */
const stopGlobalSync = () => {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
};

/**
 * 打开首次运行配置对话框
 */
const openFirstRunDialog = () => {
    dialog.open(SettingsDialog, {
        props: {
            header: '首次运行配置',
            style: {
                width: '600px',
            },
            modal: true,
            dismissableMask: false,
            closable: false, // 首次运行时不能关闭
            closeOnEscape: false,
        },
        data: {
            firstRun: true
        }
    });
};

/**
 * 检查配置状态
 */
const checkConfigStatus = async () => {
    try {
        const status = await configApi.getConfigStatus();
        hasLocalConfig.value = status.hasLocalConfig;
        
        // 如果没有本地配置，认为是首次运行，弹出配置对话框
        if (!status.hasLocalConfig) {
            openFirstRunDialog();
        }
    } catch (err) {
        console.warn('检查配置状态失败:', err);
    } finally {
        configChecked.value = true;
    }
};

onMounted(() => {
    appStore.initApp();
    
    // 初始加载
    orgStore.fetchOrgs();
    agentStore.fetchAllAgents();
    
    // 启动全局轮询
    startGlobalSync();
    
    // 检查配置状态（首次运行检测）
    checkConfigStatus();
    
    // 初始化错误通知服务
    errorNotificationService.init();
    
    // 启动 UI 命令服务（处理智能体的页面操作请求）
    uiCommandService.start();
});

onUnmounted(() => {
    stopGlobalSync();
    uiCommandService.stop();
});
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--text-1)]">
    <DynamicDialog />
    
    <!-- 首次运行提示条 -->
    <div 
      v-if="configChecked && !hasLocalConfig" 
      class="fixed top-0 left-0 right-0 z-[100] bg-orange-500 text-white px-4 py-2 flex items-center justify-center gap-2"
    >
      <AlertCircle class="w-4 h-4" />
      <span class="text-sm">首次运行，请先配置大模型参数</span>
    </div>
    
    <!-- 全局侧栏 -->
    <GlobalSidebar />

    <!-- 主容器 -->
    <main class="flex-grow flex flex-col min-w-0 relative">
      <!-- 顶部工具栏 -->
      <div class="absolute top-2 right-4 z-20 flex items-center gap-1">
        <!-- 模块管理 -->
        <ModuleManager ref="moduleManagerRef" />
        
        <!-- 主题切换 -->
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

    <ConfirmDialog />
    <Toast />
    <!-- 错误通知 Toast（自定义模板） -->
    <ErrorToast />
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
