import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Message } from '../types';
import { apiService } from '../services/api';

/**
 * 聊天会话状态管理
 * 负责管理不同组织的聊天消息流
 */
export const useChatStore = defineStore('chat', () => {
  // 使用 Map 存储每个会话的聊天记录，key 为 agentId
  const chatMessages = ref<Record<string, Message[]>>({});
  const loading = ref(false);
  const inputValues = ref<Record<string, string>>({}); // 存储每个会话的输入框内容
  
  // 存储每个组织当前选中的智能体 ID，key 为 orgId
  const activeAgentIds = ref<Record<string, string>>({});

  // 待滚动的消息 ID
  const pendingScrollMessageId = ref<string | null>(null);

  // 触发首页聊天对话框展开的信号（通过改变值来触发监听）
  const homeChatOpenTrigger = ref(0);

  // 存储每个会话的起始时间（用于隐藏旧消息），key 为 agentId
  const sessionStartTimes = ref<Record<string, number>>({});

  /**
   * 为 root 开启新会话
   */
  const rootNewSession = async () => {
    await apiService.rootNewSession();
    // 立即刷新消息，并找到“新会话”标记的时刻
    await fetchMessages('root');
    const messages = chatMessages.value['root'] || [];
    const markerMsg = [...messages].reverse().find(m => m.content.includes('--- 新会话 ---'));
    if (markerMsg) {
      sessionStartTimes.value['root'] = markerMsg.timestamp;
    } else {
      sessionStartTimes.value['root'] = Date.now();
    }
  };

  /**
   * 获取当前会话的消息（过滤掉旧消息）
   */
  const getSessionMessages = (agentId: string) => {
    const messages = chatMessages.value[agentId] || [];
    const startTime = sessionStartTimes.value[agentId] || 0;
    return messages.filter(m => m.timestamp >= startTime);
  };

  /**
   * 更新当前组织选中的智能体
   */
  const setActiveAgent = async (orgId: string, agentId: string) => {
    activeAgentIds.value[orgId] = agentId;
    // 切换智能体时自动加载消息
    await fetchMessages(agentId);
  };

  /**
   * 获取当前组织选中的智能体 ID
   */
  const getActiveAgentId = (orgId: string) => {
    return activeAgentIds.value[orgId] || orgId;
  };

  /**
   * 更新输入框内容
   */
  const updateInputValue = (agentId: string, value: string) => {
    inputValues.value[agentId] = value;
  };

  /**
   * 获取指定智能体的聊天消息
   * @param agentId 智能体 ID
   */
  const fetchMessages = async (agentId: string) => {
    loading.value = true;
    try {
      const messages = await apiService.getMessages(agentId);
      chatMessages.value[agentId] = messages;

      // 如果是 root 且没有手动设置过 sessionStartTime，尝试从消息历史中寻找最新的“新会话”标记
      if (agentId === 'root' && !sessionStartTimes.value['root']) {
        const markerMsg = [...messages].reverse().find(m => m.content.includes('--- 新会话 ---'));
        if (markerMsg) {
          sessionStartTimes.value['root'] = markerMsg.timestamp;
        }
      }
    } catch (error) {
      console.error(`加载智能体 ${agentId} 的消息失败:`, error);
      if (!chatMessages.value[agentId]) {
        chatMessages.value[agentId] = [];
      }
    } finally {
      loading.value = false;
    }
  };

  /**
   * 发送消息
   * @param agentId 目标智能体 ID
   * @param text 消息内容
   * @param storeId 消息存储的目标 ID (默认为 agentId，如果是 user 视图则为 'user')
   */
  const sendMessage = async (agentId: string, text: string, storeId?: string) => {
    const targetStoreId = storeId || agentId;
    try {
      const response = await apiService.sendMessage(agentId, text);
      
      // 乐观更新：先在本地添加用户消息
      const userMsg: Message = {
        id: Date.now().toString(),
        agentId: agentId,
        senderId: 'user',
        receiverId: agentId,
        senderType: 'user',
        content: text,
        timestamp: Date.now(),
        status: 'sending',
        taskId: response.taskId
      };
      
      if (!chatMessages.value[targetStoreId]) {
        chatMessages.value[targetStoreId] = [];
      }
      chatMessages.value[targetStoreId].push(userMsg);
      
      // 更新为已发送状态
      userMsg.status = 'sent';
      
      return response.taskId;
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  };

  return {
    chatMessages,
    loading,
    inputValues,
    activeAgentIds,
    setActiveAgent,
    getActiveAgentId,
    updateInputValue,
    fetchMessages,
    sendMessage,
    rootNewSession,
    getSessionMessages,
    sessionStartTimes,
    pendingScrollMessageId,
    homeChatOpenTrigger
  };
});
