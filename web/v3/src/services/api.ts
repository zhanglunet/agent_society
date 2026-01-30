import type { Organization, Agent, Message } from '../types';

/**
 * API 调用服务
 * 封装与后端服务器的 HTTP 请求，将后端数据结构映射到前端领域模型
 */

const BASE_URL = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      // 忽略 JSON 解析错误
    }
    const message = detail?.message || detail?.error || `HTTP 错误: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

export const apiService = {
  /**
   * 获取组织列表 (映射自 getOrgTree)
   * 组织定义为：root 直接创建的智能体
   */
  async getOrganizations(): Promise<Organization[]> {
    const data = await request<{ tree: any[] }>('/org/tree');
    
    const orgs: Organization[] = [];
    
    if (Array.isArray(data.tree)) {
      // 1. 找到 root 节点
      const rootNode = data.tree.find(node => node.id === 'root');
      
      if (rootNode && Array.isArray(rootNode.children)) {
        // 2. 将 root 的直接子节点映射为组织
        rootNode.children.forEach((node: any) => {
          const name = node.customName || node.id;
          orgs.push({
            id: node.id,
            name: name,
            role: node.roleName,
            initial: name.substring(0, 1).toUpperCase(),
            description: node.roleName || '组织部门'
          });
        });
      }
    }

    return orgs;
  },

  /**
   * 根据组织 ID 获取智能体列表
   * 组织 ID 实际上是父智能体的 ID
   */
  async getAgents(orgId: string): Promise<Agent[]> {
    const data = await request<{ agents: any[] }>('/agents');
    
    // 1. 如果是 home，返回 root 和 user
    if (orgId === 'home') {
      return data.agents
        .filter(a => a.id === 'root' || a.id === 'user')
        .map(agent => ({
          id: agent.id,
          orgId: 'home',
          name: agent.customName || agent.id,
          role: agent.roleName || '核心',
          status: (agent.status === 'active' ? 'online' : 'offline') as 'online' | 'offline',
          lastSeen: agent.lastActiveAt ? new Date(agent.lastActiveAt).getTime() : 0
        }));
    }

    // 2. 否则，返回 parentAgentId 等于 orgId 的智能体
    const filteredAgents: Agent[] = data.agents
      .filter(agent => agent.parentAgentId === orgId)
      .map(agent => ({
        id: agent.id,
        orgId: orgId,
        name: agent.customName || agent.id,
        role: agent.roleName || '智能体',
        status: (agent.status === 'active' ? 'online' : 'offline') as 'online' | 'offline',
        lastSeen: agent.lastActiveAt ? new Date(agent.lastActiveAt).getTime() : 0
      }));

    // 3. 将 user 加入到每个组织的列表中（作为对话入口）
    const userAgent = data.agents.find(a => a.id === 'user');
    if (userAgent) {
      filteredAgents.unshift({
        id: 'user',
        orgId: orgId,
        name: userAgent.customName || '我 (User)',
        role: '用户',
        status: 'online',
        lastSeen: Date.now()
      });
    }

    return filteredAgents;
  },

  /**
   * 获取消息历史
   */
  async getMessages(agentId: string): Promise<Message[]> {
    const data = await request<{ messages: any[] }>(`/agent-messages/${encodeURIComponent(agentId)}`);
    
    return data.messages.map(msg => ({
      id: msg.id || Math.random().toString(36).substring(7),
      agentId: agentId,
      senderId: msg.from || 'system',
      senderType: msg.from === 'user' ? 'user' : 'agent',
      content: msg.content || msg.message || '',
      timestamp: msg.timestamp || Date.now(),
      status: 'sent'
    }));
  },

  /**
   * 发送消息
   */
  async sendMessage(toAgentId: string, content: string): Promise<any> {
    return request('/send', {
      method: 'POST',
      body: JSON.stringify({
        to: toAgentId,
        message: content,
      }),
    });
  }
};
