<script setup lang="ts">
import { useAgentStore } from '../../stores/agent';
import { useChatStore } from '../../stores/chat';
import { watch, onMounted, computed } from 'vue';
import { User, Bot, Circle } from 'lucide-vue-next';

const props = defineProps<{
  orgId: string;
}>();

const agentStore = useAgentStore();
const chatStore = useChatStore();

// 当前组织的智能体列表
const currentAgents = computed(() => agentStore.agentsMap[props.orgId] || []);
const currentAgentCount = computed(() => currentAgents.value.length);

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
  if (agent.id === 'user') return;
  
  // 更新当前组织选中的智能体，切换对话内容
  chatStore.setActiveAgent(props.orgId, agent.id);
  
  // 以前的逻辑是添加 @，现在改为直接切换对话
  // 如果需要 @ 可以在后续对话中由用户自己输入，或者我们保留这个功能作为某种快捷方式
  // 但根据用户要求“切换到与这个智能体聊天对话的内容”，这里核心应该是切换状态
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 头部统计 -->
    <div class="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-1)]">
      <span class="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
        智能体 ({{ currentAgentCount }})
      </span>
    </div>

    <!-- 列表内容 -->
    <div class="flex-grow overflow-y-auto">
      <!-- 加载中 -->
      <div v-if="agentStore.loading && currentAgents.length === 0" class="flex flex-col items-center justify-center h-32 text-[var(--text-3)]">
        <i class="pi pi-spin pi-spinner text-xl mb-2"></i>
        <span class="text-xs">同步中...</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!agentStore.loading && currentAgents.length === 0" class="flex flex-col items-center justify-center h-32 text-[var(--text-3)] opacity-50 px-4 text-center">
        <Bot class="w-8 h-8 mb-2" />
        <span class="text-xs">该组织暂无活跃智能体</span>
      </div>

      <!-- 智能体列表 -->
      <div v-else class="p-2 space-y-1">
        <button
          v-for="agent in currentAgents"
          :key="agent.id"
          class="w-full flex items-center p-3 rounded-lg transition-all duration-200 group hover:bg-[var(--surface-3)] active:scale-[0.98]"
          :class="[
            chatStore.getActiveAgentId(props.orgId) === agent.id 
              ? 'bg-[var(--surface-3)] border-[var(--primary-weak)] border' 
              : 'border border-transparent'
          ]"
          @click="handleAgentClick(agent)"
        >
          <!-- 头像/图标 -->
          <div class="relative mr-3">
            <div class="w-10 h-10 rounded-full bg-[var(--surface-3)] flex items-center justify-center border border-[var(--border)] group-hover:border-[var(--primary-weak)] transition-colors overflow-hidden">
              <User v-if="agent.id === 'user'" class="w-5 h-5 text-[var(--text-2)]" />
              <Bot v-else class="w-5 h-5 text-[var(--primary)]" />
            </div>
            <!-- 状态指示器 -->
            <div 
              class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--surface-2)] flex items-center justify-center shadow-sm"
              :class="agent.status === 'online' ? 'bg-green-500' : 'bg-gray-400'"
            >
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
