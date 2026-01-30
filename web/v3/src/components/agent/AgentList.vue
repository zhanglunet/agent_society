<script setup lang="ts">
import { useAgentStore } from '../../stores/agent';
import { useChatStore } from '../../stores/chat';
import { useOrgStore } from '../../stores/org';
import { useDialog } from 'primevue/usedialog';
import { watch, onMounted, computed } from 'vue';
import { User, Bot, Circle, Square, Loader2, Briefcase } from 'lucide-vue-next';
import Button from 'primevue/button';
import ArtifactsList from '../artifacts/ArtifactsList.vue';

const props = defineProps<{
  orgId: string;
}>();

const agentStore = useAgentStore();
const chatStore = useChatStore();
const orgStore = useOrgStore();
const dialog = useDialog();

// 当前组织的智能体列表
const currentAgents = computed(() => agentStore.agentsMap[props.orgId] || []);
const currentAgentCount = computed(() => currentAgents.value.length);
const currentOrg = computed(() => orgStore.orgs.find(o => o.id === props.orgId));

/**
 * 打开工件管理器
 */
const openArtifacts = () => {
  if (!currentOrg.value) return;
  
  dialog.open(ArtifactsList, {
    props: {
      header: `工件管理器 - ${currentOrg.value.name}`,
      style: {
        width: '80vw',
        maxWidth: '1000px',
      },
      modal: true,
      dismissableMask: false,
    },
    data: {
      orgId: props.orgId
    }
  });
};

// 当组件挂载或 orgId 改变时加载智能体
const loadAgents = () => {
  if (props.orgId) {
    agentStore.fetchAgentsByOrg(props.orgId);
  }
};

onMounted(() => {
  loadAgents();
});

watch(() => props.orgId, () => {
  loadAgents();
});

/**
 * 处理智能体点击事件
 */
const handleAgentClick = (agent: any) => {
  // 更新当前组织选中的智能体，切换对话内容
  chatStore.setActiveAgent(props.orgId, agent.id);
};

/**
 * 处理停止智能体调用
 */
const handleAbortAgent = async (e: Event, agentId: string) => {
  e.stopPropagation(); // 阻止触发 handleAgentClick
  await agentStore.abortAgent(agentId);
};
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 头部功能区 -->
    <div class="p-2 border-b border-[var(--border)] bg-[var(--surface-1)]">
      <div class="flex items-center space-x-1 mb-1 px-1">
        <Button 
          v-if="props.orgId !== 'home'"
          variant="text" 
          size="small"
          class="!p-2 hover:!bg-[var(--surface-3)] group transition-all !min-w-0"
          title="工件管理器"
          @click="openArtifacts"
        >
          <Briefcase class="w-4 h-4 text-[var(--text-3)] group-hover:text-[var(--primary)]" />
        </Button>
      </div>
      
      <div class="px-2 pb-1 flex items-center justify-between">
        <span class="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
          智能体 ({{ currentAgentCount }})
        </span>
      </div>
    </div>

    <!-- 列表内容 -->
    <div class="flex-grow overflow-y-auto">
      <!-- 加载中 -->
      <div v-if="agentStore.loading && currentAgents.length === 0" class="flex flex-col items-center justify-center h-32 text-[var(--text-3)]">
        <Loader2 class="w-6 h-6 mb-2 animate-spin" />
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
              :class="[
                agent.status === 'busy' ? 'bg-amber-500' : 
                agent.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
              ]"
            >
              <Loader2 v-if="agent.status === 'busy'" class="w-2 h-2 text-white animate-spin" />
              <Circle v-else class="w-1.5 h-1.5 text-white fill-white" />
            </div>
          </div>

          <!-- 信息 -->
          <div class="flex-grow min-w-0 text-left">
            <div class="flex items-center justify-between mb-0.5">
              <span class="font-semibold text-sm text-[var(--text-1)] truncate">{{ agent.name }}</span>
              <!-- 停止按钮 (仅在 busy 状态显示) -->
              <button 
                v-if="agent.status === 'busy'"
                class="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all ml-2"
                title="停止请求"
                @click="handleAbortAgent($event, agent.id)"
              >
                <Square class="w-3 h-3 fill-current" />
              </button>
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
