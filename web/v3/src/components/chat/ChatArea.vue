<script setup lang="ts">
import { Send, Bot, Sparkles, ArrowDown, User, Search, MoreVertical, Loader2, ChevronUp, ChevronDown, X, Trash2 } from 'lucide-vue-next';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Menu from 'primevue/menu';
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';
import { useChatStore } from '../../stores/chat';
import { useAgentStore } from '../../stores/agent';
import { useGuideStore } from '../../stores/guide';
// import { useOrgStore } from '../../stores/org';  // 暂时未使用，保留导入以备后续功能
import { apiService } from '../../services/api';
import ChatMessageList from './ChatMessageList.vue';
import ConfirmDialog from '../common/ConfirmDialog.vue';
import GuideBubble from './GuideBubble.vue';

const props = defineProps<{
  orgId: string;
  tabTitle: string;
}>();

const chatStore = useChatStore();
const agentStore = useAgentStore();
const guideStore = useGuideStore();


// ========== 新手引导相关状态 ==========
// 是否显示引导气泡（JS状态）
const showGuideBubble = computed(() => guideStore.isVisible);

// ====================================

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
const SCROLL_THRESHOLD = 150; // 距离底部小于 150px 视为"在底部"

// 搜索功能相关状态
const isSearchActive = ref(false);
const searchKeyword = ref('');
const searchMatches = ref<{ element: HTMLElement; messageId: string }[]>([]);
const currentMatchIndex = ref(-1);
const searchInputRef = ref<HTMLInputElement | null>(null);

// 下拉菜单相关状态
const moreMenuRef = ref<InstanceType<typeof Menu> | null>(null);
const isDeleting = ref(false);

// 确认删除对话框状态
const showDeleteConfirm = ref(false);
const deleteConfirmMessage = ref('');



/**
 * 更多菜单项
 */
const moreMenuItems = computed(() => [
  {
    label: '删除智能体',
    icon: 'trash-2',
    command: () => openDeleteConfirm(),
    disabled: !activeAgent.value || activeAgent.value.id === 'user' || isDeleting.value
  }
]);

/**
 * 检查滚动位置，决定是否显示"返回底部"按钮
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

/**
 * 滚动到指定消息
 */
const scrollToMessage = (messageId: string) => {
  setTimeout(() => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element && messageContainer.value) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 闪烁提醒
      element.classList.add('animate-pulse-quick');
      setTimeout(() => element.classList.remove('animate-pulse-quick'), 2000);
      // 清除待滚动 ID
      chatStore.pendingScrollMessageId = null;
    }
  }, 100);
};

const loadMessages = async () => {
  if (activeAgentId.value) {
    await chatStore.fetchMessages(activeAgentId.value);
    // 如果有待滚动的消息，加载完后执行滚动
    if (chatStore.pendingScrollMessageId) {
      scrollToMessage(chatStore.pendingScrollMessageId);
    }
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

onMounted(async () => {
  await loadMessages();
  startPolling();
  if (messageContainer.value) {
    messageContainer.value.addEventListener('scroll', handleScroll);
  }
  // 初始加载完成后强制滚动到底部
  scrollToBottom(true);
});

onUnmounted(() => {
  stopPolling();
  if (messageContainer.value) {
    messageContainer.value.removeEventListener('scroll', handleScroll);
  }
});

// 监听 activeAgentId 的变化，重新加载消息
watch(activeAgentId, async () => {
  await loadMessages();
  startPolling();
  // 只有在没有待滚动消息时，才默认滚动到底部
  if (!chatStore.pendingScrollMessageId) {
    scrollToBottom(true);
  }
});

// 监听 orgId 变化
watch(() => props.orgId, async () => {
  await loadMessages();
  startPolling();
  if (!chatStore.pendingScrollMessageId) {
    scrollToBottom(true);
  }
});

// 监听待滚动消息 ID，实现同页面跳转
watch(() => chatStore.pendingScrollMessageId, (newId) => {
  if (newId) {
    scrollToMessage(newId);
  }
});

// 自动滚动到底部（仅在靠近底部且消息增加时）
watch(() => chatStore.chatMessages[activeAgentId.value]?.length, (newLen, oldLen) => {
  // 只有当消息数量真正增加时（比如收到新消息或发送消息），才触发自动滚动
  if (newLen !== undefined && (oldLen === undefined || newLen > oldLen)) {
    scrollToBottom(false);
  }
}, { deep: true });

const sendMessage = async () => {
  if (!message.value.trim() || isSending.value) return;
  const text = message.value;
  chatStore.updateInputValue(activeAgentId.value, ''); // 清空当前对话的输入框
  
  // 如果正在显示引导，隐藏引导（JS逻辑）
  if (guideStore.isVisible) {
    guideStore.hideGuide();
  }
  
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

/**
 * 切换搜索框显示状态
 */
const toggleSearch = () => {
  isSearchActive.value = !isSearchActive.value;
  if (isSearchActive.value) {
    // 激活搜索框后自动聚焦
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  } else {
    // 关闭搜索时清空搜索状态
    clearSearch();
  }
};

/**
 * 清空搜索状态
 */
const clearSearch = () => {
  searchKeyword.value = '';
  searchMatches.value = [];
  currentMatchIndex.value = -1;
};

/**
 * 关闭搜索
 */
const closeSearch = () => {
  isSearchActive.value = false;
  clearSearch();
};

/**
 * 处理搜索输入变化
 */
const handleSearchInput = () => {
  // 使用 nextTick 等待 DOM 更新后执行搜索
  nextTick(() => {
    performSearch();
  });
};

/**
 * 执行搜索
 */
const performSearch = () => {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    searchMatches.value = [];
    currentMatchIndex.value = -1;
    return;
  }

  // 查找所有高亮的元素
  const highlights = messageContainer.value?.querySelectorAll('.search-highlight');
  if (!highlights || highlights.length === 0) {
    searchMatches.value = [];
    currentMatchIndex.value = -1;
    return;
  }

  searchMatches.value = Array.from(highlights).map((el) => ({
    element: el as HTMLElement,
    messageId: (el as HTMLElement).dataset.messageId || ''
  }));

  // 如果有匹配结果，定位到第一个
  if (searchMatches.value.length > 0) {
    currentMatchIndex.value = 0;
    scrollToMatch(0);
  }
};

/**
 * 滚动到指定匹配项
 */
const scrollToMatch = (index: number) => {
  if (index < 0 || index >= searchMatches.value.length) return;
  
  const match = searchMatches.value[index];
  if (!match || !match.element) return;

  // 移除之前的当前高亮
  searchMatches.value.forEach((m, i) => {
    if (i === currentMatchIndex.value) {
      m.element.classList.remove('search-highlight-current');
    }
  });

  // 添加当前高亮
  currentMatchIndex.value = index;
  match.element.classList.add('search-highlight-current');

  // 滚动到元素
  match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/**
 * 跳转到上一个匹配项
 */
const goToPrevMatch = () => {
  if (searchMatches.value.length === 0) return;
  const newIndex = currentMatchIndex.value <= 0 
    ? searchMatches.value.length - 1 
    : currentMatchIndex.value - 1;
  scrollToMatch(newIndex);
};

/**
 * 跳转到下一个匹配项
 */
const goToNextMatch = () => {
  if (searchMatches.value.length === 0) return;
  const newIndex = currentMatchIndex.value >= searchMatches.value.length - 1 
    ? 0 
    : currentMatchIndex.value + 1;
  scrollToMatch(newIndex);
};

/**
 * 键盘事件处理
 */
const handleSearchKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeSearch();
  } else if (e.key === 'Enter') {
    if (e.shiftKey) {
      goToPrevMatch();
    } else {
      goToNextMatch();
    }
  }
};

/**
 * 切换更多菜单
 */
const toggleMoreMenu = (event: Event) => {
  moreMenuRef.value?.toggle(event);
};

/**
 * 打开删除确认对话框
 */
const openDeleteConfirm = () => {
  const agent = activeAgent.value;
  if (!agent || agent.id === 'user') return;
  
  deleteConfirmMessage.value = `确定要删除智能体 "${agent.name}" 吗？删除后，该智能体将被终止且无法恢复。`;
  showDeleteConfirm.value = true;
};

/**
 * 处理删除智能体
 */
const handleDeleteAgent = async () => {
  const agent = activeAgent.value;
  if (!agent || agent.id === 'user') return;

  isDeleting.value = true;
  try {
    await apiService.deleteAgent(agent.id, {
      reason: '用户手动删除',
      deletedBy: 'user'
    });
    
    // 关闭确认对话框
    showDeleteConfirm.value = false;
    
    // 删除成功后，刷新智能体列表
    await agentStore.fetchAgentsByOrg(props.orgId);
    await agentStore.fetchAllAgents(true);
    
    // 如果删除的是当前对话的智能体，切换到 user
    if (chatStore.activeAgentIds[props.orgId] === agent.id) {
      chatStore.setActiveAgent(props.orgId, 'user');
    }
  } catch (error: any) {
    console.error('删除智能体失败:', error);
    const message = error?.message || '删除失败，请重试';
    alert(message);
  } finally {
    isDeleting.value = false;
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
      <div class="flex items-center space-x-1">
        <Button 
          variant="text" 
          rounded 
          class="!p-2 !text-[var(--text-3)] hover:!bg-[var(--surface-3)]"
          :class="{ '!text-[var(--primary)] !bg-[var(--primary-weak)]': isSearchActive }"
          @click="toggleSearch"
          title="搜索对话内容"
        >
          <Search class="w-4 h-4" />
        </Button>
        <Button 
          variant="text" 
          rounded 
          class="!p-2 !text-[var(--text-3)] hover:!bg-[var(--surface-3)]"
          @click="toggleMoreMenu"
          :disabled="isDeleting"
        >
          <MoreVertical class="w-4 h-4" />
        </Button>
        <Menu ref="moreMenuRef" :model="moreMenuItems" popup>
          <template #item="{ item }">
            <div class="flex items-center px-3 py-2" :class="{ 'opacity-50 cursor-not-allowed': item.disabled }">
              <Trash2 v-if="item.icon === 'trash-2'" class="w-4 h-4 mr-2 text-red-500" />
              <span class="text-sm" :class="item.icon === 'trash-2' ? 'text-red-500' : 'text-[var(--text-1)]'">
                {{ item.label }}
              </span>
            </div>
          </template>
        </Menu>
      </div>
    </header>

    <!-- 搜索栏 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-2 opacity-0"
    >
      <div v-if="isSearchActive" class="border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 shrink-0">
        <div class="flex items-center space-x-3 max-w-4xl mx-auto">
          <div class="flex-1 relative">
            <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              ref="searchInputRef"
              v-model="searchKeyword"
              type="text"
              placeholder="搜索消息内容..."
              class="w-full pl-9 pr-4 py-1.5 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
              @input="handleSearchInput"
              @keydown="handleSearchKeydown"
            />
          </div>
          <div v-if="searchMatches.length > 0" class="flex items-center space-x-2 text-sm text-[var(--text-2)] shrink-0">
            <span class="font-medium">{{ currentMatchIndex + 1 }} / {{ searchMatches.length }}</span>
            <div class="flex items-center space-x-1">
              <Button 
                variant="text" 
                rounded 
                class="!p-1.5 !text-[var(--text-3)] hover:!bg-[var(--surface-3)]"
                @click="goToPrevMatch"
                title="上一个匹配 (Shift+Enter)"
              >
                <ChevronUp class="w-4 h-4" />
              </Button>
              <Button 
                variant="text" 
                rounded 
                class="!p-1.5 !text-[var(--text-3)] hover:!bg-[var(--surface-3)]"
                @click="goToNextMatch"
                title="下一个匹配 (Enter)"
              >
                <ChevronDown class="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div v-else-if="searchKeyword.trim()" class="text-sm text-[var(--text-3)] shrink-0">
            无匹配结果
          </div>
          <Button 
            variant="text" 
            rounded 
            class="!p-1.5 !text-[var(--text-3)] hover:!bg-[var(--surface-3)] shrink-0"
            @click="closeSearch"
            title="关闭搜索 (Esc)"
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Transition>

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
            :search-keyword="searchKeyword"
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
        <!-- 非阻塞设计：输入区域容器 -->
        <div class="input-area-container relative group">
          <div class="absolute -inset-0.5 bg-gradient-to-r from-[var(--primary)] to-blue-500 rounded-2xl blur opacity-0 group-focus-within:opacity-20 transition duration-500"></div>
          <div class="input-area relative flex items-center bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-2 pl-4 transition-all duration-300 group-focus-within:border-[var(--primary)] group-focus-within:ring-4 group-focus-within:ring-[var(--primary-weak)]">
            <InputText 
              v-model="message" 
              :placeholder="placeholder" 
              class="flex-grow !bg-transparent !border-none !ring-0 !shadow-none !py-3 text-sm"
              @keyup.enter="sendMessage"
            />
            <Button 
              ref="sendButtonRef"
              @click="sendMessage"
              :disabled="!message.trim() || isSending"
              class="!rounded-xl !p-3 transition-all duration-200 min-w-[44px]"
              :class="message.trim() && !isSending 
                ? '!bg-[var(--primary)] !text-white hover:!brightness-110 hover:!shadow-md' 
                : '!bg-[var(--surface-3)] !text-[var(--text-3)]'"
            >
              <Loader2 v-if="isSending" class="w-4 h-4 animate-spin" />
              <Send v-else class="w-4 h-4" />
            </Button>

            <!-- 发送按钮引导气泡容器 -->
            <div class="guide-bubble-container guide-bubble-container--send">
              <GuideBubble
                v-if="showGuideBubble"
                :visible="showGuideBubble"
                position="bottom"
                :offset="{ x: 0, y: 0 }"
                title="开始使用"
                :text="'我已经在输入框里为您准备好了创建私人助理的命令，点击发送按钮即可开始。'"
                :hint="'您也可以修改文字内容，或者关闭此提示。'"
                icon="rocket"
                :show-close-button="true"
                @close="guideStore.hideGuide()"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 删除确认对话框 -->
  <ConfirmDialog
    v-model:visible="showDeleteConfirm"
    title="删除智能体"
    :message="deleteConfirmMessage"
    confirm-label="删除"
    cancel-label="取消"
    confirm-severity="danger"
    :loading="isDeleting"
    @confirm="handleDeleteAgent"
  />
</template>

<style scoped>
/* ============================================
   Non-Blocking Design
   非阻塞设计：确保输入框和按钮始终可交互
   基于docs/新手引导功能用户体验设计方案_v4.md
   ============================================ */

/* 输入区域容器 */
.input-area-container {
  position: relative;
  z-index: 101;  /* 高于气泡（z-index: 100），确保可点击 */
  pointer-events: auto;  /* 始终可交互 */
}

.input-area {
  position: relative;
  z-index: 101;  /* 高于气泡 */
  pointer-events: auto;  /* 始终可交互 */
}

/* 输入框和发送按钮保持最高优先级 */
.input-area > :deep(.p-inputtext),
.input-area > button {
  position: relative;
  z-index: 101;  /* 高于气泡 */
  pointer-events: auto;  /* 始终可交互 */
}

/* 气泡容器 */
.guide-bubble-container {
  position: absolute;
  top: -100%;  /* 输入框上方 */
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;  /* 容器不拦截事件 */
  z-index: 100;  /* 低于输入区域 */
  margin-bottom: 24px;  /* 确保不遮挡输入框 */
}

.guide-bubble-container--send {
  /* 指向发送按钮的引导 */
}

/* 确保气泡不遮挡输入框 */
.guide-bubble-container :deep(.guide-bubble) {
  position: absolute;
  bottom: 24px;  /* 输入框上方24px */
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  pointer-events: auto;  /* 气泡自身可交互 */
}

/* ============================================
   自定义输入框样式，确保 PrimeVue 默认样式不冲突
   ============================================ */

:deep(.p-inputtext) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* ============================================
   搜索高亮样式
   ============================================ */

:deep(.search-highlight) {
  background-color: rgba(250, 204, 21, 0.4);
  border-radius: 2px;
  padding: 0 2px;
  color: inherit;
}

:deep(.search-highlight-current) {
  background-color: rgba(250, 204, 21, 0.8);
  box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.5);
  animation: searchPulse 1.5s ease-in-out infinite;
}

@keyframes searchPulse {
  0%, 100% {
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.5);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.3);
  }
}

/* 深色模式适配 */
.my-app-dark :deep(.search-highlight) {
  background-color: rgba(234, 179, 8, 0.3);
}

.my-app-dark :deep(.search-highlight-current) {
  background-color: rgba(234, 179, 8, 0.7);
  box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.4);
}

.my-app-dark {
  @keyframes searchPulse {
    0%, 100% {
      box-shadow: 0 0 0 2px rgba(234, 179, 8, 0.4);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(234, 179, 8, 0.2);
    }
  }
}

/* ============================================
   Responsive Design
   响应式适配
   ============================================ */

/* 移动端 */
@media (max-width: 768px) {
  .guide-bubble-container {
    margin-bottom: 12px;  /* 紧凑但仍不遮挡 */
  }
  
  .guide-bubble-container :deep(.guide-bubble) {
    bottom: 12px;
  }
}

/* 小屏手机 */
@media (max-width: 480px) {
  .guide-bubble-container {
    margin-bottom: 8px;
  }
  
  .guide-bubble-container :deep(.guide-bubble) {
    bottom: 8px;
  }
}

/* ============================================
   Accessibility
   可访问性
   ============================================ */

/* 确保焦点样式正确 */
.input-area > :deep(.p-inputtext:focus),
.input-area > button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
