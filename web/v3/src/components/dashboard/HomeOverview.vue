<script setup lang="ts">
import { useOrgStore } from '../../stores/org';
import { useAppStore } from '../../stores/app';
import { useChatStore } from '../../stores/chat';
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { Sparkles, Users, ArrowRight, Send, Bot, User as UserIcon } from 'lucide-vue-next';

const orgStore = useOrgStore();
const appStore = useAppStore();
const chatStore = useChatStore();

const newGoal = ref('');
const isCreating = ref(false);
const showChat = ref(false);
const chatScrollRef = ref<HTMLElement | null>(null);

// 获取除了首页之外的所有组织
const organizations = computed(() => orgStore.orgs.filter(o => o.id !== 'home'));

// 获取 root 的当前会话消息
const rootMessages = computed(() => chatStore.getSessionMessages('root'));

// 自动滚动到底部
watch(rootMessages, () => {
  if (showChat.value) {
    setTimeout(() => {
      if (chatScrollRef.value) {
        chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight;
      }
    }, 100);
  }
}, { deep: true });

let pollTimer: any = null;
const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    chatStore.fetchMessages('root');
  }, 2000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onUnmounted(() => {
  stopPolling();
});

onMounted(async () => {
  await orgStore.fetchOrgs();
  
  // 检查 root 是否有当前会话的消息，如果有则显示
  await chatStore.fetchMessages('root');
  if (rootMessages.value.length > 0) {
    showChat.value = true;
    startPolling();
  }
});

const handleOrgClick = (org: any) => {
  appStore.openTab({
    id: org.id,
    type: 'org',
    title: org.name
  });
};

const createOrganization = async () => {
  if (!newGoal.value.trim() || isCreating.value) return;
  
  isCreating.value = true;
  try {
    // 1. 开启新会话（清空 root 历史并记录起始时间）
    await chatStore.rootNewSession();
    
    // 2. 显示聊天界面
    showChat.value = true;
    startPolling();
    
    // 3. 发送消息
    await chatStore.sendMessage('root', newGoal.value, 'user');
    
    newGoal.value = '';
  } catch (error) {
    console.error('创建组织失败:', error);
  } finally {
    isCreating.value = false;
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    createOrganization();
  }
};
</script>

<template>
  <div class="h-full overflow-y-auto bg-[var(--bg)] p-8">
    <div class="max-w-6xl mx-auto space-y-12">
      <!-- 欢迎区域 -->
      <section class="text-center space-y-4">
        <h1 class="text-3xl font-bold text-[var(--text-1)] tracking-tight">智能体社会化系统</h1>
        <p class="text-[var(--text-3)] max-w-2xl mx-auto">
          欢迎回到 Agent Society。在这里，智能体像人类一样形成自组织的社会性团体，协助您完成复杂任务。
        </p>
      </section>

      <!-- 创建新组织区域 -->
      <section class="space-y-6">
        <div class="flex items-center space-x-2 px-2">
          <Sparkles class="w-5 h-5 text-[var(--primary)]" />
          <h2 class="text-lg font-bold text-[var(--text-1)]">创建新组织</h2>
        </div>
        
        <Card class="!bg-[var(--surface-1)] !border-[var(--border)] overflow-hidden">
          <template #content>
            <div class="space-y-4">
              <!-- 嵌入式聊天区域 -->
              <div v-if="showChat" 
                class="chat-expand-animation border border-[var(--border)] rounded-xl bg-[var(--surface-2)] overflow-hidden mb-4"
              >
                <div 
                  ref="chatScrollRef"
                  class="p-4 space-y-4 overflow-y-auto"
                  style="max-height: 50vh; min-height: 100px;"
                >
                  <div v-for="msg in rootMessages" :key="msg.id" 
                    :class="['flex items-start space-x-3', msg.senderType === 'user' ? 'flex-row-reverse space-x-reverse' : '']"
                  >
                    <div :class="['w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', 
                      msg.senderType === 'user' ? 'bg-[var(--primary)]' : 'bg-[var(--surface-3)] border border-[var(--border)]']"
                    >
                      <UserIcon v-if="msg.senderType === 'user'" class="w-4 h-4 text-white" />
                      <Bot v-else class="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <div :class="['max-w-[85%] px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm', 
                      msg.senderType === 'user' ? 'bg-[var(--primary)] text-white rounded-tr-none' : 'bg-[var(--surface-1)] text-[var(--text-1)] border border-[var(--border)] rounded-tl-none']"
                    >
                      <div class="whitespace-pre-wrap">{{ msg.content }}</div>
                    </div>
                  </div>
                  
                  <!-- 初始占位/加载状态 -->
                  <div v-if="rootMessages.length === 0" class="flex justify-center py-8">
                    <div class="flex items-center space-x-2 text-[var(--text-3)] text-sm">
                      <div class="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce"></div>
                      <div class="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div class="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      <span>正在规划您的团队...</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex items-center space-x-3">
                <div class="relative flex-grow">
                  <Textarea 
                    v-model="newGoal" 
                    autoResize 
                    rows="1"
                    placeholder="输入一个目标或者任务，我为你创造一个团队" 
                    class="w-full !bg-[var(--surface-2)] !border-[var(--border)] focus:!border-[var(--primary)] !pl-4 !pr-14 !py-3 !rounded-xl !resize-none min-h-[52px]"
                    @keydown="handleKeyDown"
                  />
                  <div class="absolute right-3 bottom-2.5 flex items-center">
                    <Button 
                      icon="pi pi-arrow-right" 
                      @click="createOrganization"
                      :loading="isCreating"
                      class="!w-9 !h-9 !rounded-lg !bg-[var(--primary)] !border-none !text-white hover:!bg-[var(--primary-hover)] transition-colors shadow-sm"
                    >
                      <template #icon>
                        <Send v-if="!isCreating" class="w-4 h-4" />
                      </template>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </section>

      <!-- 组织平铺区域 -->
      <section class="space-y-6">
        <div class="flex items-center space-x-2 px-2">
          <Users class="w-5 h-5 text-[var(--primary)]" />
          <h2 class="text-lg font-bold text-[var(--text-1)]">所有组织</h2>
        </div>
        
        <div v-if="orgStore.loading" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <div v-for="i in 4" :key="i" class="h-32 rounded-2xl bg-[var(--surface-2)] animate-pulse"></div>
        </div>

        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <Card 
            v-for="org in organizations" 
            :key="org.id"
            class="!bg-[var(--surface-1)] !border-[var(--border)] hover:!border-[var(--primary)] hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
            @click="handleOrgClick(org)"
          >
            <template #content>
              <div class="flex flex-col items-start text-left space-y-4 pt-2">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary-weak)] to-[var(--surface-3)] flex items-center justify-center text-2xl font-bold text-[var(--primary)] group-hover:rotate-6 transition-transform">
                  {{ org.initial }}
                </div>
                <div class="flex-grow min-w-0 w-full">
                  <div class="flex items-center justify-between">
                    <h3 class="font-bold text-[var(--text-1)] truncate group-hover:text-[var(--primary)] transition-colors">{{ org.name }}</h3>
                  </div>
                  <p class="text-xs text-[var(--text-3)] mt-1 line-clamp-1">{{ org.role }}</p>
                </div>
                <div class="pt-2">
                  <Button size="small" variant="text" class="!text-[var(--primary)] !p-0">
                    <span class="text-xs font-bold mr-1">进入组织</span>
                    <ArrowRight class="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            </template>
          </Card>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
:deep(.p-card) {
  border-radius: 1.25rem;
}
:deep(.p-card-body) {
  padding: 1.5rem;
}

.chat-expand-animation {
  animation: expandDown 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top;
}

@keyframes expandDown {
  from {
    opacity: 0;
    transform: scaleY(0);
    max-height: 0;
  }
  to {
    opacity: 1;
    transform: scaleY(1);
    max-height: 50vh;
  }
}
</style>
