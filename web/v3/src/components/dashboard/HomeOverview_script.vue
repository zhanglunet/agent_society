<script setup lang="ts">
import { useOrgStore } from '../../stores/org';
import { useAppStore } from '../../stores/app';
import { useChatStore } from '../../stores/chat';
import { useGuideStore } from '../../stores/guide';
import { ref, onMounted, computed, onUnmounted, watch } from 'vue';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { Sparkles, Users, ArrowRight, Send, Loader2, X } from 'lucide-vue-next';
import ChatMessageList from '../chat/ChatMessageList.vue';
import GuideBubble from '../chat/GuideBubble.vue';

const orgStore = useOrgStore();
const appStore = useAppStore();
const chatStore = useChatStore();
const guideStore = useGuideStore();

const newGoal = ref('');
const isCreating = ref(false);
const showChat = ref(false);
const chatContainer = ref<HTMLElement | null>(null);

// ========== 新手引导相关状态 ==========
// 发送按钮引用（用于定位气泡）
const sendButtonRef = ref<InstanceType<typeof Button> | null>(null);
// 是否显示引导气泡（JS状态）
const showGuideBubble = computed(() => guideStore.isVisible && !showChat.value);
// =====================================

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
  
  // 如果聊天已显示，滚动到底部
  if (showChat.value) {
    scrollToBottom();
  }

  // 如果没有组织且引导应该显示，预填输入框
  if (guideStore.shouldShowGuide()) {
    const targetText = '建立一个私人助理';
    newGoal.value = targetText;
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
  
  // 如果正在显示引导，隐藏引导
  if (guideStore.isVisible) {
    guideStore.hideGuide();
  }

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

/**
 * 关闭对话区域
 */
const closeChat = () => {
  showChat.value = false;
  stopPolling();
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    createOrganization();
  }
};

/**
 * 滚动聊天容器到底部
 */
const scrollToBottom = () => {
  if (!chatContainer.value) return;
  setTimeout(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTo({
        top: chatContainer.value.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, 50);
};

/**
 * 监听当前标签变化，切换回首页时滚动到底部
 */
watch(() => appStore.currentTabId, (newTabId, oldTabId) => {
  if (newTabId === 'home' && oldTabId !== 'home' && showChat.value) {
    scrollToBottom();
  }
});

/**
 * 监听消息变化，自动滚动到底部
 */
watch(() => rootMessages.value?.length, (newLen, oldLen) => {
  if (newLen !== undefined && (oldLen === undefined || newLen > oldLen)) {
    scrollToBottom();
  }
}, { deep: true });

/**
 * 监听聊天显示状态变化，显示时滚动到底部
 */
watch(showChat, (newVal) => {
  if (newVal) {
    scrollToBottom();
  }
});

/**
 * 监听触发信号，展开首页聊天对话框
 */
watch(() => chatStore.homeChatOpenTrigger, () => {
  if (!showChat.value) {
    showChat.value = true;
    startPolling();
  }
});

/**
 * 监听引导显示状态
 */
watch(() => guideStore.isVisible, (isVisible) => {
  // 如果引导显示且聊天未打开，预填输入框
  if (isVisible && !showChat.value) {
    const targetText = '建立一个私人助理';
    newGoal.value = targetText;
  }
});
</script>
