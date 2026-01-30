import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Message } from '../types';
import { apiService } from '../services/api';

/**
 * 聊天会话状态管理
 * 负责管理不同组织的聊天消息流
 */
export const useChatStore = defineStore('chat', () => {
  // 使用 Map 存储每个组织的聊天记录，key 为 orgId
  const chatMessages = ref<Record<string, Message[]>>({});
  const loading = ref(false);

  /**
   * 获取指定组织的聊天消息
   * @param orgId 组织 ID
   */
  const fetchMessages = async (orgId: string) => {
    loading.value = true;
    try {
      // 1. 获取针对该组织的对话记录
      // 这里的逻辑改为：每个组织的对话记录独立存储在后端的 [orgId].jsonl 中
      const messages = await apiService.getMessages(orgId);
      chatMessages.value[orgId] = messages;
    } catch (error) {
      console.error(`加载组织 ${orgId} 的消息失败:`, error);
      if (!chatMessages.value[orgId]) {
        chatMessages.value[orgId] = [];
      }
    } finally {
      loading.value = false;
    }
  };

  /**
   * 发送消息
   * @param orgId 组织 ID
   * @param text 消息内容
   */
  const sendMessage = async (orgId: string, text: string) => {
    try {
      // 默认发送给该组织的根节点（即组织 ID 对应的智能体）
      const response = await apiService.sendMessage(orgId, text);
      
      // 乐观更新：先在本地添加用户消息
      const userMsg: Message = {
        id: Date.now().toString(),
        agentId: orgId,
        senderId: 'user',
        senderType: 'user',
        content: text,
        timestamp: Date.now(),
        status: 'sending', // 初始状态为发送中
        taskId: response.taskId
      };
      
      if (!chatMessages.value[orgId]) {
        chatMessages.value[orgId] = [];
      }
      chatMessages.value[orgId].push(userMsg);
      
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
    fetchMessages,
    sendMessage
  };
});
