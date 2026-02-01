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
  type?: string; // 消息类型，如 tool_call, text 等
  receiverId?: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'error';
  isThinking?: boolean;
  taskId?: string; // 关联的任务 ID
  reasoning?: string; // 思考过程
  toolCall?: {
    name: string;
    args: any;
    result: any;
  };
}

export interface Tab {
  id: string;
  type: 'org' | 'tool';
  title: string;
  params?: any;
}

/**
 * 组织模板
 * 对应 org 目录下的一个文件夹
 */
export interface OrgTemplate {
  id: string;
  name: string;
  description?: string;
}

/**
 * 模板文件内容
 * 包含 info.md 和 org.md 的内容
 */
export interface TemplateContent {
  /** info.md 文件内容 */
  info: string;
  /** org.md 文件内容 */
  org: string;
}
