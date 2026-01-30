<script setup lang="ts">
import { useAgentStore } from '../../stores/agent';
import { watch, onMounted } from 'vue';
import { User, Bot, Circle } from 'lucide-vue-next';

const props = defineProps<{
  orgId: string;
}>();

const agentStore = useAgentStore();

// 当组件挂载或 orgId 改变时加载智能体
const loadAgents = () => {
  if (props.orgId) {
    agentStore.fetchAgentsByOrg(props.orgId);
  }
};

onMounted(loadAgents);
watch(() => props.orgId, loadAgents);

/**
 * 处理智能体点击事件
 */
const handleAgentClick = (agent: any) => {
  // TODO: 后续集成聊天 Store
  console.log('点击智能体:', agent.name);
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 头部统计 -->
    <div class="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-1)]">
      <span class="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
        智能体 ({{ agentStore.agentCount }})
      </span>
    </div>

    <!-- 列表内容 -->
    <div class="flex-grow overflow-y-auto">
      <!-- 加载中 -->
      <div v-if="agentStore.loading" class="flex flex-col items-center justify-center h-32 text-[var(--text-3)]">
        <i class="pi pi-spin pi-spinner text-xl mb-2"></i>
        <span class="text-xs">同步中...</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="agentStore.agents.length === 0" class="flex flex-col items-center justify-center h-32 text-[var(--text-3)] opacity-50 px-4 text-center">
        <Bot class="w-8 h-8 mb-2" />
        <span class="text-xs">该组织暂无活跃智能体</span>
      </div>

      <!-- 智能体列表 -->
      <div v-else class="p-2 space-y-1">
        <button
          v-for="agent in agentStore.agents"
          :key="agent.id"
          class="w-full flex items-center p-3 rounded-lg transition-all duration-200 group hover:bg-[var(--surface-3)] active:scale-[0.98]"
          @click="handleAgentClick(agent)"
        >
          <!-- 头像/图标 -->
          <div class="relative mr-3">
            <div class="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center border border-[var(--border)] group-hover:border-[var(--primary-weak)] transition-colors overflow-hidden">
              <User v-if="agent.id === 'user'" class="w-5 h-5 text-[var(--text-2)]" />
              <Bot v-else class="w-5 h-5 text-[var(--primary)]" />
            </div>
            <!-- 状态指示器 -->
            <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--surface-2)] bg-green-500 flex items-center justify-center shadow-sm">
              <Circle class="w-1.5 h-1.5 text-white fill-white" />
            </div>
          </div>

          <!-- 信息 -->
          <div class="flex-grow min-w-0 text-left">
            <div class="flex items-center justify-between mb-0.5">
              <span class="font-semibold text-sm text-[var(--text-1)] truncate">{{ agent.name }}</span>
            </div>
            <div class="text-xs text-[var(--text-3)] truncate flex items-center">
              <span class="inline-block px-1.5 py-0.5 rounded bg-[var(--surface-1)] mr-2 border border-[var(--border)]">
                {{ agent.role }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 隐藏滚动条但保留滚动功能 */
.overflow-y-auto {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.overflow-y-auto::-webkit-scrollbar {
  display: none;
}
</style>
