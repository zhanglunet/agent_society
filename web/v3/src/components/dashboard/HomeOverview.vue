<script setup lang="ts">
import { useOrgStore } from '../../stores/org';
import { useAppStore } from '../../stores/app';
import { useChatStore } from '../../stores/chat';
import { ref, onMounted, computed, onUnmounted } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { Sparkles, Users, ArrowRight, Send, Loader2 } from 'lucide-vue-next';
import ChatMessageList from '../chat/ChatMessageList.vue';

const orgStore = useOrgStore();
const appStore = useAppStore();
const chatStore = useChatStore();

const newGoal = ref('');
const isCreating = ref(false);
const showChat = ref(false);

// 获取除了首页之外的所有组织
const organizations = computed(() => orgStore.orgs.filter(o => o.id !== 'home'));

// 获取 root 的当前会话消息
const rootMessages = computed(() => chatStore.getSessionMessages('root'));

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
  
  // 仅加载消息，但不自动显示对话框
  await chatStore.fetchMessages('root');
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
    // 只有在对话框未显示（即开启新对话）时，才开启新会话
    if (!showChat.value) {
      await chatStore.rootNewSession();
      showChat.value = true;
      startPolling();
    }
    
    // 发送消息到当前会话
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
          *~欢迎回到 Agent Society!~*<br/><br/>在这里，智能体像人类一样形成自组织的社会性团体，协助您完成复杂任务。
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
                  class="p-4 overflow-y-auto"
                  style="max-height: 50vh; min-height: 100px;"
                >
                  <ChatMessageList agent-id="root" only-current-session />
                  
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
                      @click="createOrganization"
                      :loading="isCreating"
                      class="!w-9 !h-9 !rounded-lg !bg-[var(--primary)] !border-none !text-white hover:!bg-[var(--primary-hover)] transition-colors shadow-sm"
                    >
                      <template #loadingicon>
                        <Loader2 class="w-4 h-4 animate-spin" />
                      </template>
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
