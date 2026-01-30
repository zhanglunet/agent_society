/**
 * 核心领域模型类型定义
 */

export interface User {
  id: string;
  name: string;
  avatar?: string;
}

export interface Organization {
  id: string;
  name: string;
  initial: string;
  role?: string; // 岗位名称
  description?: string;
}

export interface Agent {
  id: string;
  orgId: string;
  name: string;
  avatar?: string;
  role: string;
  status: 'online' | 'offline' | 'busy';
  lastSeen?: number;
}

export interface Message {
  id: string;
  agentId: string;
  senderId: string; // User ID or Agent ID
  senderType: 'user' | 'agent';
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'error';
  isThinking?: boolean;
}

export interface Tab {
  id: string;
  type: 'org' | 'tool';
  title: string;
  params?: any;
}
