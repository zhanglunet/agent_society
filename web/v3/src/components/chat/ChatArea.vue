<script setup lang="ts">
import { Send, Bot, Sparkles, ArrowDown, User } from 'lucide-vue-next';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useChatStore } from '../../stores/chat';
import { useAgentStore } from '../../stores/agent';
import ChatMessageList from './ChatMessageList.vue';

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

// 计算消息实际发送的目标智能体
const chatTarget = computed(() => {
  const orgAgents = agentStore.agentsMap[props.orgId] || [];
  
  // 1. 如果当前选中的是智能体（不是 user），则发送给该智能体
  if (activeAgentId.value !== 'user') {
    return activeAgent.value;
  }

  // 2. 如果当前选中是 user 视角
  const messages = chatStore.chatMessages['user'] || [];
  
  // a. 如果有对话记录，找到最后一个与 user 对话的智能体
  const lastResponse = [...messages].reverse().find(m => m.senderId !== 'user');
  if (lastResponse) {
    const target = orgAgents.find(a => a.id === lastResponse.senderId);
    if (target) return target;
  }

  // b. 如果没有记录，发给组织里第一个智能体（排除 user）
  return orgAgents.find(a => a.id !== 'user');
});

// 输入框占位符
const placeholder = computed(() => {
  const name = chatTarget.value?.name || '智能体';
  return `向${name}发送信息`;
});

const message = computed({
  get: () => chatStore.inputValues[activeAgentId.value] || '',
  set: (val) => chatStore.updateInputValue(activeAgentId.value, val)
});
const isSending = ref(false);
const messageContainer = ref<HTMLElement | null>(null);
const showScrollBottomButton = ref(false);
const SCROLL_THRESHOLD = 150; // 距离底部小于 150px 视为“在底部”

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
    const targetId = chatTarget.value?.id;
    if (!targetId) {
      console.warn('无法确定消息目标智能体');
      return;
    }
    await chatStore.sendMessage(targetId, text, activeAgentId.value);
  } catch (error) {
    console.error('发送失败:', error);
    // 如果发送失败，把消息弹回来
    chatStore.updateInputValue(activeAgentId.value, text);
  } finally {
    isSending.value = false;
  }
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
        <div v-if="!(chatStore.chatMessages[activeAgentId] || []).length" class="flex flex-col items-center justify-center h-full text-[var(--text-3)] space-y-4 opacity-50">
          <div class="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
            <Sparkles class="w-12 h-12" />
          </div>
          <div class="text-center">
            <p class="text-lg font-medium text-[var(--text-2)]">开始在 {{ tabTitle }} 协作</p>
            <p class="text-sm mt-1">选择一个智能体或直接发送指令</p>
          </div>
        </div>

        <!-- 消息列表 -->
        <div v-else class="max-w-4xl mx-auto">
          <ChatMessageList 
            :agent-id="activeAgentId" 
            :org-id="orgId" 
          />
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
            :placeholder="placeholder" 
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