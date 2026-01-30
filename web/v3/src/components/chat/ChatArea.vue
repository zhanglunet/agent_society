<script setup lang="ts">
import { Send, Paperclip, Sparkles, User, Bot } from 'lucide-vue-next';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { ref, onMounted, watch, computed } from 'vue';
import { useChatStore } from '../../stores/chat';

const props = defineProps<{
  orgId: string;
  tabTitle: string;
}>();

const chatStore = useChatStore();
const message = ref('');
const messageContainer = ref<HTMLElement | null>(null);

const currentMessages = computed(() => chatStore.chatMessages[props.orgId] || []);

const loadMessages = () => {
  if (props.orgId) {
    chatStore.fetchMessages(props.orgId);
  }
};

onMounted(loadMessages);
watch(() => props.orgId, loadMessages);

// 自动滚动到底部
watch(() => chatStore.chatMessages[props.orgId]?.length, () => {
  setTimeout(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  }, 100);
}, { deep: true });

const sendMessage = async () => {
  if (!message.value.trim()) return;
  const text = message.value;
  message.value = '';
  
  try {
    await chatStore.sendMessage(props.orgId, text);
  } catch (error) {
    console.error('发送失败:', error);
  }
};

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--bg)]">
    <!-- 头部信息 -->
    <div class="h-14 px-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg)]/80 backdrop-blur-md sticky top-0 z-10">
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-lg bg-[var(--primary-weak)] flex items-center justify-center text-[var(--primary)]">
          <Sparkles class="w-4 h-4" />
        </div>
        <div>
          <h2 class="text-sm font-bold text-[var(--text-1)]">{{ tabTitle }}</h2>
          <p class="text-[10px] text-[var(--text-3)] uppercase tracking-tighter">智能体协同会话</p>
        </div>
      </div>
      
      <div class="flex items-center space-x-2">
        <Button variant="text" rounded size="small" class="!p-2">
          <Paperclip class="w-4 h-4 text-[var(--text-3)]" />
        </Button>
      </div>
    </div>

    <!-- 消息流区域 -->
    <div ref="messageContainer" class="flex-grow overflow-y-auto p-6 space-y-6">
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
                <span class="text-[10px] font-bold text-[var(--text-3)] uppercase tracking-wider">{{ msg.senderType }}</span>
                <span class="text-[10px] text-[var(--text-4)]">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div 
                class="px-4 py-2.5 rounded-2xl text-sm shadow-sm"
                :class="msg.senderType === 'user' 
                  ? 'bg-[var(--primary)] text-white rounded-tr-none' 
                  : 'bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--border)] rounded-tl-none'"
              >
                {{ msg.content }}
              </div>
            </div>
          </div>
        </div>
      </div>
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
            :disabled="!message.trim()"
            class="!rounded-xl !p-3 transition-all duration-300"
            :class="message.trim() ? '!bg-[var(--primary)] !text-white' : '!bg-[var(--surface-3)] !text-[var(--text-3)]'"
          >
            <Send class="w-4 h-4" />
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
