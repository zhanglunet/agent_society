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
      // 注意：这里的 API 路径和逻辑需要根据后端实际情况调整
      // 目前后端 apiService.getMessages 接受的是 agentId
      // 这里为了演示，暂时传入 orgId 作为 agentId 的代理
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
      // 默认发送给 root 智能体
      const response = await apiService.sendMessage('root', text);
      
      // 乐观更新：先在本地添加用户消息
      const userMsg: Message = {
        id: Date.now().toString(),
        agentId: 'root',
        senderId: 'user',
        senderType: 'user',
        content: text,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      if (!chatMessages.value[orgId]) {
        chatMessages.value[orgId] = [];
      }
      chatMessages.value[orgId].push(userMsg);
      
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
