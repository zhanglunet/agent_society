import type { Organization, Agent, Message } from '../types';

/**
 * API 调用服务
 * 封装与后端服务器的 HTTP 请求，将后端数据结构映射到前端领域模型
 */

const BASE_URL = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  console.log('API request:', url, options); // 添加调试日志

  const response = await fetch(url, {
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
   * 递归获取某个智能体下的所有后代智能体
   * @param agents 所有智能体列表
   * @param parentAgentId 父智能体 ID
   * @returns 后代智能体 ID 集合
   */
  getDescendantIds(agents: any[], parentAgentId: string): Set<string> {
    const descendants = new Set<string>();
    const queue = [parentAgentId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      // 查找所有以 currentId 为父节点的智能体
      for (const agent of agents) {
        if (agent.parentAgentId === currentId && !descendants.has(agent.id)) {
          descendants.add(agent.id);
          queue.push(agent.id);
        }
      }
    }

    return descendants;
  },

  /**
   * 根据组织 ID 获取智能体列表
   * 组织 ID 实际上是父智能体的 ID
   */
  async getAgents(orgId: string): Promise<Agent[]> {
    const data = await request<{ agents: any[] }>('/agents');

    // 0. 如果是 all，返回所有智能体，不进行组织过滤
    if (orgId === 'all') {
      return data.agents.map(agent => ({
        id: agent.id,
        orgId: agent.parentAgentId || 'home',
        name: agent.customName || agent.id,
        role: agent.roleName || '智能体',
        status: this.mapStatus(agent.computeStatus, agent.status),
        lastSeen: agent.lastActiveAt ? new Date(agent.lastActiveAt).getTime() : 0
      }));
    }

    // 1. 如果是 home，返回 root 和 user
    if (orgId === 'home') {
      return data.agents
        .filter(a => a.id === 'root' || a.id === 'user')
        .map(agent => ({
          id: agent.id,
          orgId: 'home',
          name: agent.customName || agent.id,
          role: agent.roleName || '核心',
          status: this.mapStatus(agent.computeStatus, agent.status),
          lastSeen: agent.lastActiveAt ? new Date(agent.lastActiveAt).getTime() : 0
        }));
    }

    // 2. 否则，返回该组织根智能体（id 等于 orgId）以及其所有后代智能体
    // 使用递归查找获取所有后代
    const descendantIds = this.getDescendantIds(data.agents, orgId);

    const filteredAgents: Agent[] = data.agents
      .filter(agent => agent.id === orgId || descendantIds.has(agent.id))
      .map(agent => ({
        id: agent.id,
        orgId: orgId,
        name: agent.customName || agent.id,
        role: agent.roleName || (agent.id === orgId ? '组织主管' : '智能体'),
        status: this.mapStatus(agent.computeStatus, agent.status),
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
   * 获取所有岗位列表
   */
  async getRoles(): Promise<any[]> {
    const data = await request<{ roles: any[] }>('/roles');
    return data.roles || [];
  },

  /**
   * 获取所有智能体原始数据
   */
  async getAllAgentsRaw(): Promise<any[]> {
    const data = await request<{ agents: any[] }>('/agents');
    return data.agents || [];
  },

  /**
   * 删除岗位
   */
  async deleteRole(roleId: string, options: { reason: string, deletedBy: string }): Promise<any> {
    return request(`/role/${encodeURIComponent(roleId)}`, {
      method: 'DELETE',
      body: JSON.stringify(options)
    });
  },

  /**
   * 获取单个岗位详情
   */
  async getRole(roleId: string): Promise<any> {
    const data = await request<{ role: any }>(`/role/${encodeURIComponent(roleId)}`);
    return data.role;
  },

  /**
   * 更新岗位职责提示词
   */
  async updateRolePrompt(roleId: string, rolePrompt: string): Promise<any> {
    return request(`/role/${encodeURIComponent(roleId)}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ rolePrompt })
    });
  },

  /**
   * 更新岗位 LLM 服务
   */
  async updateRoleLlmService(roleId: string, llmServiceId: string | null): Promise<any> {
    return request(`/role/${encodeURIComponent(roleId)}/llm-service`, {
      method: 'POST',
      body: JSON.stringify({ llmServiceId })
    });
  },

  /**
   * 更新岗位工具组
   */
  async updateRoleToolGroups(roleId: string, toolGroups: string[] | null): Promise<any> {
    return request(`/role/${encodeURIComponent(roleId)}/tool-groups`, {
      method: 'POST',
      body: JSON.stringify({ toolGroups })
    });
  },

  /**
   * 获取工具组列表
   */
  async getToolGroups(): Promise<any[]> {
    const data = await request<{ toolGroups: any[] }>('/tool-groups');
    return data.toolGroups || [];
  },

  /**
   * 状态映射逻辑
   */
  mapStatus(computeStatus?: string, agentStatus?: string): 'online' | 'offline' | 'busy' {
    if (computeStatus === 'waiting_llm' || computeStatus === 'computing' || computeStatus === 'processing') {
      return 'busy';
    }
    return agentStatus === 'active' ? 'online' : 'offline';
  },

  /**
   * 为 root 开启新会话
   */
  async rootNewSession(): Promise<void> {
    await request('/root/new-session', { method: 'POST', body: JSON.stringify({}) });
  },

  /**
   * 获取消息历史
   */
  async getMessages(agentId: string): Promise<Message[]> {
    const data = await request<{ messages: any[] }>(`/agent-messages/${encodeURIComponent(agentId)}`);
    
    return data.messages.map(msg => {
      // 处理 payload 中的内容
      let content = '';
      let toolCall = undefined;
      let usage = undefined;
      
      // 尝试解析 payload (如果是字符串)
      let payload = msg.payload;
      if (typeof payload === 'string' && payload.trim().startsWith('{')) {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          // 解析失败，保持原样
        }
      }

      if (msg.type === 'tool_call') {
        toolCall = {
          name: payload?.toolName || 'unknown',
          args: payload?.args,
          result: payload?.result
        };
        content = `调用工具: ${toolCall.name}`;
        // 工具调用消息也可能包含 token 使用量
        if (payload?.usage) {
          usage = {
            promptTokens: payload.usage.promptTokens ?? 0,
            completionTokens: payload.usage.completionTokens ?? 0,
            totalTokens: payload.usage.totalTokens ?? 0
          };
        }
      } else if (payload) {
        // 如果 payload 是对象，且包含 text 或 content 字段
        const rawContent = payload.text || payload.content || payload;
        content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
        // 提取 token 使用量
        if (payload.usage) {
          usage = {
            promptTokens: payload.usage.promptTokens ?? 0,
            completionTokens: payload.usage.completionTokens ?? 0,
            totalTokens: payload.usage.totalTokens ?? 0
          };
        }
      } else {
        const rawContent = msg.content || msg.message || '';
        content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
      }

      return {
        id: msg.id || Math.random().toString(36).substring(7),
        agentId: agentId,
        senderId: msg.from || 'system',
        receiverId: msg.to,
        senderType: msg.from === 'user' ? 'user' : 'agent',
        type: msg.type, // 保留原始类型
        content: content,
        timestamp: msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now(),
        status: 'sent',
        reasoning: typeof msg.reasoning_content === 'string' 
          ? msg.reasoning_content 
          : (msg.reasoning_content ? JSON.stringify(msg.reasoning_content, null, 2) : undefined),
        toolCall: toolCall,
        taskId: msg.taskId,
        usage: usage
      };
    });
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
  },

  /**
   * 中断指定智能体的 LLM 调用
   */
  async abortAgentLlmCall(agentId: string): Promise<{ ok: boolean; aborted: boolean; stopped?: boolean }> {
    return request<{ ok: boolean; aborted: boolean; stopped?: boolean }>(`/agent/${encodeURIComponent(agentId)}/abort`, {
      method: 'POST'
    });
  },

  /**
   * 获取所有智能体
   */
  async getAllAgents(): Promise<any[]> {
    const data = await request<{ agents: any[] }>('/agents');
    return data.agents;
  },

  /**
   * 获取最近的事件（错误和重试）
   * @param since 可选的时间戳，只返回此时间之后的事件
   */
  async getRecentEvents(since?: string): Promise<{ errors: ErrorEvent[], retries: RetryEvent[] }> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return request<{ errors: ErrorEvent[], retries: RetryEvent[] }>(`/events${query}`);
  },

  /**
   * 获取所有已加载模块列表
   */
  async getModules(): Promise<ModuleInfo[]> {
    const data = await request<{ ok: boolean; modules: ModuleInfo[]; count: number }>('/modules');
    return data.modules || [];
  },

  /**
   * 获取指定模块的 Web 组件定义
   * @param moduleName 模块名称
   */
  async getModuleWebComponent(moduleName: string): Promise<ModuleWebComponent | null> {
    try {
      const data = await request<{
        ok: boolean;
        component?: ModuleWebComponent;
        html?: string;
        css?: string;
        js?: string;
        moduleName?: string;
        displayName?: string;
        icon?: string;
      }>(`/modules/${encodeURIComponent(moduleName)}/web-component`);

      // 如果有 component 字段，直接返回
      if (data.component) {
        return data.component;
      }

      // 如果有 html 字段，构造组件对象（有 panelPath 的情况）
      if (data.html !== undefined) {
        return {
          moduleName: data.moduleName || moduleName,
          displayName: data.displayName || moduleName,
          icon: data.icon || '📦',
          html: data.html,
          css: data.css,
          js: data.js
        };
      }

      return null;
    } catch {
      return null;
    }
  },
};

/**
 * 错误事件类型
 */
export interface ErrorEvent {
  agentId: string;
  errorType: string;
  errorCategory: 'network' | 'auth' | 'rate_limit' | 'context_length' | 'server' | 'unknown';
  timestamp: string;
  userMessage: string;
  technicalInfo: {
    detailedMessage: string;
    originalError: string;
    errorName: string;
    technicalDetails: {
      status?: number;
      code?: string;
      type?: string;
      stack?: string;
    };
    originalMessageId: string | null;
    taskId: string | null;
  };
  agentContext: {
    agentName: string;
    roleId: string | null;
  };
}

/**
 * 重试事件类型
 */
export interface RetryEvent {
  agentId: string;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  errorMessage: string;
  timestamp: string;
}

/**
 * 模块信息
 */
export interface ModuleInfo {
  name: string;
  toolGroupId: string;
  toolGroupDescription: string;
  hasWebComponent: boolean;
  hasHttpHandler: boolean;
}

/**
 * 模块 Web 组件定义
 */
export interface ModuleWebComponent {
  moduleName: string;
  displayName: string;
  icon: string;
  html: string;
  css?: string;
  js?: string;
}
