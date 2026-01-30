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

  /**
   * 更新当前组织选中的智能体
   */
  const setActiveAgent = (orgId: string, agentId: string) => {
    activeAgentIds.value[orgId] = agentId;
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
   */
  const sendMessage = async (agentId: string, text: string) => {
    try {
      const response = await apiService.sendMessage(agentId, text);
      
      // 乐观更新：先在本地添加用户消息
      const userMsg: Message = {
        id: Date.now().toString(),
        agentId: agentId,
        senderId: 'user',
        senderType: 'user',
        content: text,
        timestamp: Date.now(),
        status: 'sending',
        taskId: response.taskId
      };
      
      if (!chatMessages.value[agentId]) {
        chatMessages.value[agentId] = [];
      }
      chatMessages.value[agentId].push(userMsg);
      
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
    sendMessage
  };
});
