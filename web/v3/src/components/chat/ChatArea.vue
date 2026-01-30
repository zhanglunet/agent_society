<script setup lang="ts">
import { Send, User, Bot, Sparkles, Wrench, ChevronDown, ChevronUp, ArrowDown } from 'lucide-vue-next';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useChatStore } from '../../stores/chat';
import { useAgentStore } from '../../stores/agent';

const props = defineProps<{
  orgId: string;
  tabTitle: string;
}>();

const chatStore = useChatStore();
const agentStore = useAgentStore();

// 当前正在对话的智能体 ID
const activeAgentId = computed(() => chatStore.getActiveAgentId(props.orgId));

// 当前对话的智能体信息
const activeAgent = computed(() => {
  const orgAgents = agentStore.agentsMap[props.orgId] || [];
  return orgAgents.find(a => a.id === activeAgentId.value);
});

const message = computed({
  get: () => chatStore.inputValues[activeAgentId.value] || '',
  set: (val) => chatStore.updateInputValue(activeAgentId.value, val)
});
const isSending = ref(false);
const messageContainer = ref<HTMLElement | null>(null);
const expandedToolCalls = ref<Record<string, boolean>>({});
const showScrollBottomButton = ref(false);
const SCROLL_THRESHOLD = 150; // 距离底部小于 150px 视为“在底部”

const toggleToolCall = (msgId: string) => {
  expandedToolCalls.value[msgId] = !expandedToolCalls.value[msgId];
};

/**
 * 检查滚动位置，决定是否显示“返回底部”按钮
 */
const handleScroll = () => {
  if (!messageContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messageContainer.value;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  showScrollBottomButton.value = distanceFromBottom > SCROLL_THRESHOLD;
};

/**
 * 滚动到底部
 * @param force 是否强制滚动，忽略当前位置
 */
const scrollToBottom = (force = false) => {
  if (!messageContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messageContainer.value;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

  // 如果强制滚动，或者当前已经在底部附近，则执行滚动
  if (force || distanceFromBottom <= SCROLL_THRESHOLD) {
    setTimeout(() => {
      if (messageContainer.value) {
        messageContainer.value.scrollTo({
          top: messageContainer.value.scrollHeight,
          behavior: force ? 'smooth' : 'auto'
        });
      }
    }, 50);
  }
};

const currentMessages = computed(() => {
  const msgs = chatStore.chatMessages[activeAgentId.value] || [];
  
  // 如果当前是 user 视图，过滤出与当前组织成员相关的消息
  if (activeAgentId.value === 'user') {
    // 排除 user 自身 ID，只关注组织内的智能体
    const orgAgentIds = (agentStore.agentsMap[props.orgId] || [])
      .map(a => a.id)
      .filter(id => id !== 'user');

    return msgs.filter(m => {
      // 发送者是组织成员（且不是 user 自身）
      const isFromOrgAgent = m.senderId !== 'user' && orgAgentIds.includes(m.senderId);
      // 接收者是组织成员
      const isToOrgAgent = m.receiverId && orgAgentIds.includes(m.receiverId);
      
      return isFromOrgAgent || isToOrgAgent;
    });
  }
  
  return msgs;
});

/**
 * 获取发送者名称
 */
const getSenderName = (msg: any) => {
  if (msg.senderType === 'user') return '我';
  // 先从当前组织成员中找
  const orgAgents = agentStore.agentsMap[props.orgId] || [];
  const agent = orgAgents.find(a => a.id === msg.senderId);
  if (agent) return agent.name;

  // 如果没找到（可能是其他组织的消息，理论上 user 视图已过滤掉，但这里做个保险）
  // 也可以从全局 agent 列表找，或者直接显示 ID
  return msg.senderId;
};

const loadMessages = () => {
  if (activeAgentId.value) {
    chatStore.fetchMessages(activeAgentId.value);
  }
};

let pollingTimer: any = null;

const startPolling = () => {
  stopPolling();
  pollingTimer = setInterval(() => {
    if (activeAgentId.value) {
      chatStore.fetchMessages(activeAgentId.value);
    }
  }, 3000); // 每 3 秒轮询一次
};

const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
};

onMounted(() => {
  loadMessages();
  startPolling();
  if (messageContainer.value) {
    messageContainer.value.addEventListener('scroll', handleScroll);
  }
});

onUnmounted(() => {
  stopPolling();
  if (messageContainer.value) {
    messageContainer.value.removeEventListener('scroll', handleScroll);
  }
});

// 监听 activeAgentId 的变化，重新加载消息并强制滚动到底部
watch(activeAgentId, () => {
  loadMessages();
  startPolling();
  scrollToBottom(true);
});

// 监听 orgId 变化
watch(() => props.orgId, () => {
  loadMessages();
  startPolling();
  scrollToBottom(true);
});

// 自动滚动到底部（仅在靠近底部时）
watch(() => chatStore.chatMessages[activeAgentId.value]?.length, () => {
  scrollToBottom(false);
}, { deep: true });

const sendMessage = async () => {
  if (!message.value.trim() || isSending.value) return;
  const text = message.value;
  chatStore.updateInputValue(activeAgentId.value, ''); // 清空当前对话的输入框
  isSending.value = true;
  
  try {
    // 如果是 user 视图，默认发送给组织的负责人 (orgId)
    const targetId = activeAgentId.value === 'user' ? props.orgId : activeAgentId.value;
    await chatStore.sendMessage(targetId, text, activeAgentId.value);
    
    // 如果是 user 视图，发送后不需要手动加载，乐观更新已经处理了显示
    // 但为了确保服务端状态同步，轮询会自动处理后续刷新
  } catch (error) {
    console.error('发送失败:', error);
    // 如果发送失败，把消息弹回来
    chatStore.updateInputValue(activeAgentId.value, text);
  } finally {
    isSending.value = false;
  }
};

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--bg)]">
    <!-- 聊天头部 -->
    <header class="h-16 border-b border-[var(--border)] flex items-center justify-between px-6 bg-[var(--surface-1)] shrink-0">
      <div class="flex items-center space-x-3 min-w-0">
        <div class="w-10 h-10 rounded-full bg-[var(--primary-weak)] flex items-center justify-center text-[var(--primary)] shrink-0">
          <Bot v-if="activeAgent?.id !== 'user'" class="w-5 h-5" />
          <User v-else class="w-5 h-5" />
        </div>
        <div class="min-w-0">
          <h2 class="font-bold text-[var(--text-1)] truncate">{{ activeAgent?.name || tabTitle }}</h2>
          <div class="flex items-center text-xs text-[var(--text-3)]">
            <span class="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            <span class="truncate">{{ activeAgent?.role || '智能体' }}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <Button icon="pi pi-search" variant="text" rounded class="!text-[var(--text-3)] hover:!bg-[var(--surface-3)]" />
        <Button icon="pi pi-ellipsis-v" variant="text" rounded class="!text-[var(--text-3)] hover:!bg-[var(--surface-3)]" />
      </div>
    </header>

    <!-- 消息流区域 -->
    <div class="flex-grow overflow-hidden relative group/chat">
      <div ref="messageContainer" class="absolute inset-0 overflow-y-auto p-6 space-y-6">
        <!-- 空状态 -->
        <div v-if="currentMessages.length === 0" class="flex flex-col items-center justify-center h-full text-[var(--text-3)] space-y-4 opacity-50">
          <div class="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
            <Sparkles class="w-12 h-12" />
          </div>
          <div class="text-center">
            <p class="text-lg font-medium text-[var(--text-2)]">开始在 {{ tabTitle }} 协作</p>
            <p class="text-sm mt-1">选择一个智能体或直接发送指令</p>
          </div>
        </div>

        <!-- 消息列表 -->
        <div v-else class="max-w-4xl mx-auto space-y-6">
          <div 
            v-for="msg in currentMessages" 
            :key="msg.id"
            class="flex group"
            :class="msg.senderType === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div 
              class="flex max-w-[80%] items-start space-x-3"
              :class="msg.senderType === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'"
            >
              <!-- 头像 -->
              <div class="w-8 h-8 rounded-full bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center shrink-0">
                <User v-if="msg.senderType === 'user'" class="w-4 h-4 text-[var(--text-2)]" />
                <Bot v-else class="w-4 h-4 text-[var(--primary)]" />
              </div>

              <!-- 消息气泡 -->
              <div class="flex flex-col" :class="msg.senderType === 'user' ? 'items-end' : 'items-start'">
                <div class="flex items-center space-x-2 mb-1 px-1">
                  <span class="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider">{{ getSenderName(msg) }}</span>
                  <span class="text-[10px] text-[var(--text-4)]">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div 
                  class="px-4 py-2.5 rounded-2xl text-sm shadow-sm relative group/msg"
                  :class="[
                    msg.senderType === 'user' 
                      ? 'bg-[var(--primary)] text-white rounded-tr-none' 
                      : 'bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--border)] rounded-tl-none',
                    msg.status === 'sending' ? 'opacity-70' : ''
                  ]"
                >
                  <!-- 思考过程 (Reasoning) -->
                  <div v-if="msg.reasoning" class="mb-3 pb-3 border-b border-[var(--border)] opacity-60 text-xs italic flex items-start space-x-2">
                    <Sparkles class="w-3 h-3 mt-0.5 shrink-0" />
                    <div class="whitespace-pre-wrap">{{ msg.reasoning }}</div>
                  </div>

                  <!-- 工具调用 (Tool Call) -->
                  <div v-if="msg.toolCall" class="mb-2">
                    <div 
                      class="flex items-center space-x-2 py-1 px-2 rounded bg-[var(--surface-3)] border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-4)] transition-colors"
                      @click="toggleToolCall(msg.id)"
                    >
                      <Wrench class="w-3 h-3 text-[var(--primary)]" />
                      <span class="text-xs font-mono font-bold">{{ msg.toolCall.name }}</span>
                      <span class="text-[10px] text-[var(--text-3)] flex-grow">工具调用</span>
                      <ChevronDown v-if="!expandedToolCalls[msg.id]" class="w-3 h-3" />
                      <ChevronUp v-else class="w-3 h-3" />
                    </div>
                    
                    <div v-if="expandedToolCalls[msg.id]" class="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div class="p-2 rounded bg-[var(--surface-1)] border border-[var(--border)] text-[10px] font-mono overflow-x-auto">
                        <div class="text-[var(--text-3)] mb-1 uppercase font-bold">参数:</div>
                        <pre>{{ JSON.stringify(msg.toolCall.args, null, 2) }}</pre>
                      </div>
                      <div class="p-2 rounded bg-[var(--surface-1)] border border-[var(--border)] text-[10px] font-mono overflow-x-auto">
                        <div class="text-[var(--text-3)] mb-1 uppercase font-bold">结果:</div>
                        <pre>{{ JSON.stringify(msg.toolCall.result, null, 2) }}</pre>
                      </div>
                    </div>
                  </div>

                  <div v-if="!msg.toolCall" class="whitespace-pre-wrap">{{ msg.content }}</div>
                  
                  <!-- 状态标识 -->
                  <div v-if="msg.status === 'sending'" class="absolute -right-6 top-1/2 -translate-y-1/2">
                    <i class="pi pi-spin pi-spinner text-[10px] text-[var(--primary)]"></i>
                  </div>
                  
                  <!-- Task ID 悬浮提示 (如果是 agent 发送的或者关联了任务) -->
                  <div v-if="msg.taskId" class="hidden group-hover/msg:block absolute -top-8 left-0 bg-[var(--surface-3)] text-[10px] px-2 py-1 rounded border border-[var(--border)] whitespace-nowrap z-20">
                    Task: {{ msg.taskId }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 滚动到底部按钮 -->
      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="transform translate-y-4 opacity-0"
        enter-to-class="transform translate-y-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="transform translate-y-0 opacity-100"
        leave-to-class="transform translate-y-4 opacity-0"
      >
        <button 
          v-if="showScrollBottomButton"
          @click="scrollToBottom(true)"
          class="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-[var(--primary)] text-white shadow-lg flex items-center justify-center hover:bg-[var(--primary-hover)] transition-all z-30 group"
          title="滚动到底部"
        >
          <ArrowDown class="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
        </button>
      </Transition>
    </div>

    <!-- 输入区域 -->
    <div class="p-6 border-t border-[var(--border)] bg-[var(--bg)]">
      <div class="max-w-4xl mx-auto relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-[var(--primary)] to-blue-500 rounded-2xl blur opacity-0 group-focus-within:opacity-20 transition duration-500"></div>
        <div class="relative flex items-center bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-2 pl-4 transition-all duration-300 group-focus-within:border-[var(--primary)] group-focus-within:ring-4 group-focus-within:ring-[var(--primary-weak)]">
          <InputText 
            v-model="message" 
            placeholder="向组织发送指令或询问..." 
            class="flex-grow !bg-transparent !border-none !ring-0 !shadow-none !py-3 text-sm"
            @keyup.enter="sendMessage"
          />
          <Button 
            @click="sendMessage"
            :disabled="!message.trim() || isSending"
            class="!rounded-xl !p-3 transition-all duration-300 min-w-[44px]"
            :class="message.trim() && !isSending ? '!bg-[var(--primary)] !text-white' : '!bg-[var(--surface-3)] !text-[var(--text-3)]'"
          >
            <i v-if="isSending" class="pi pi-spin pi-spinner text-sm"></i>
            <Send v-else class="w-4 h-4" />
          </Button>
        </div>
        <div class="mt-3 flex items-center justify-center space-x-6 text-[10px] text-[var(--text-3)] font-medium uppercase tracking-widest">
          <span class="flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-green-500 mr-2"></span> 系统就绪</span>
          <span class="flex items-center opacity-50 hover:opacity-100 cursor-help transition-opacity">
            <Sparkles class="w-3 h-3 mr-1.5" /> 自动分发模式
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 自定义输入框样式，确保 PrimeVue 默认样式不冲突 */
:deep(.p-inputtext) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
</style>