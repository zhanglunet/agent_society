/**
 * API 调用模块
 * 封装所有与后端服务器的 HTTP 请求
 */

const API = {
  // API 基础路径
  baseUrl: '/api',

  /**
   * 发送 GET 请求
   * @param {string} endpoint - API 端点
   * @returns {Promise<any>} 响应数据
   */
  async get(endpoint) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API GET 请求失败 [${endpoint}]:`, error);
      throw error;
    }
  },

  /**
   * 发送 POST 请求
   * @param {string} endpoint - API 端点
   * @param {object} data - 请求数据
   * @returns {Promise<any>} 响应数据
   */
  async post(endpoint, data) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API POST 请求失败 [${endpoint}]:`, error);
      throw error;
    }
  },

  /**
   * 发送 DELETE 请求
   * @param {string} endpoint - API 端点
   * @param {object} data - 请求数据
   * @returns {Promise<any>} 响应数据
   */
  async delete(endpoint, data = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API DELETE 请求失败 [${endpoint}]:`, error);
      throw error;
    }
  },

  /**
   * 获取所有智能体列表
   * @returns {Promise<{agents: Array}>} 智能体列表
   */
  async getAgents() {
    return this.get('/agents');
  },

  /**
   * 获取所有岗位列表
   * @returns {Promise<{roles: Array}>} 岗位列表
   */
  async getRoles() {
    return this.get('/roles');
  },

  /**
   * 获取指定智能体的消息列表
   * @param {string} agentId - 智能体 ID
   * @returns {Promise<{messages: Array}>} 消息列表
   */
  async getAgentMessages(agentId) {
    return this.get(`/agent-messages/${encodeURIComponent(agentId)}`);
  },

  /**
   * 获取组织树结构
   * @returns {Promise<{tree: object}>} 组织树
   */
  async getOrgTree() {
    return this.get('/org/tree');
  },

  /**
   * 获取岗位从属关系树结构
   * @returns {Promise<{tree: object}>} 岗位树
   */
  async getRoleTree() {
    return this.get('/org/role-tree');
  },

  /**
   * 发送消息给指定智能体
   * @param {string} toAgentId - 目标智能体 ID
   * @param {string} message - 消息内容
   * @returns {Promise<object>} 发送结果
   */
  async sendMessage(toAgentId, message) {
    return this.post('/send', {
      to: toAgentId,
      message: message,
    });
  },

  /**
   * 设置智能体自定义名称
   * @param {string} agentId - 智能体 ID
   * @param {string} customName - 自定义名称（空字符串表示清除）
   * @returns {Promise<object>} 设置结果
   */
  async setAgentCustomName(agentId, customName) {
    return this.post(`/agent/${encodeURIComponent(agentId)}/custom-name`, {
      customName: customName,
    });
  },

  /**
   * 获取所有智能体的自定义名称
   * @returns {Promise<{customNames: object}>} 自定义名称映射
   */
  async getAgentCustomNames() {
    return this.get('/agent-custom-names');
  },

  /**
   * 更新岗位职责提示词
   * @param {string} roleId - 岗位 ID
   * @param {string} rolePrompt - 新的职责提示词
   * @returns {Promise<object>} 更新结果
   */
  async updateRolePrompt(roleId, rolePrompt) {
    return this.post(`/role/${encodeURIComponent(roleId)}/prompt`, {
      rolePrompt: rolePrompt,
    });
  },

  /**
   * 获取所有 LLM 服务列表
   * @returns {Promise<{services: Array, count: number}>} LLM 服务列表
   */
  async getLlmServices() {
    return this.get('/llm-services');
  },

  /**
   * 更新岗位的 LLM 服务
   * @param {string} roleId - 岗位 ID
   * @param {string|null} llmServiceId - LLM 服务 ID（null 表示使用默认服务）
   * @returns {Promise<object>} 更新结果
   */
  async updateRoleLlmService(roleId, llmServiceId) {
    return this.post(`/role/${encodeURIComponent(roleId)}/llm-service`, {
      llmServiceId: llmServiceId,
    });
  },

  /**
   * 获取所有可用工具组列表
   * @returns {Promise<{toolGroups: Array, count: number}>} 工具组列表
   */
  async getToolGroups() {
    return this.get('/tool-groups');
  },

  /**
   * 更新岗位的工具组配置
   * @param {string} roleId - 岗位 ID
   * @param {string[]|null} toolGroups - 工具组列表（null 表示使用默认的全部工具组）
   * @returns {Promise<object>} 更新结果
   */
  async updateRoleToolGroups(roleId, toolGroups) {
    return this.post(`/role/${encodeURIComponent(roleId)}/tool-groups`, {
      toolGroups: toolGroups,
    });
  },

  /**
   * 获取指定智能体的对话历史（包含思考过程）
   * @param {string} agentId - 智能体 ID
   * @returns {Promise<{agentId: string, messages: Array, thinkingMap: object}>} 对话历史
   */
  async getAgentConversation(agentId) {
    return this.get(`/agent-conversation/${encodeURIComponent(agentId)}`);
  },

  /**
   * 获取指定智能体的完整 system prompt
   * @param {string} agentId - 智能体 ID
   * @returns {Promise<{agentId: string, systemPrompt: string, length: number}>} system prompt 信息
   */
  async getAgentSystemPrompt(agentId) {
    return this.get(`/agent/${encodeURIComponent(agentId)}/system-prompt`);
  },

  /**
   * 中断指定智能体的 LLM 调用
   * @param {string} agentId - 智能体 ID
   * @returns {Promise<{ok: boolean, agentId: string, aborted: boolean}>} 中断结果
   */
  async abortAgentLlmCall(agentId) {
    return this.post(`/agent/${encodeURIComponent(agentId)}/abort`, {});
  },

  /**
   * 获取所有已加载模块列表
   * @returns {Promise<{modules: Array}>} 模块列表
   */
  async getModules() {
    return this.get('/modules');
  },

  /**
   * 获取��定模块的 Web 组件
   * @param {string} moduleName - 模块名称
   * @returns {Promise<{html: string, css: string, js: string}>} Web 组件定义
   */
  async getModuleWebComponent(moduleName) {
    return this.get(`/modules/${encodeURIComponent(moduleName)}/web-component`);
  },

  /**
   * 删除智能体（软删除）
   * @param {string} agentId - 智能体 ID
   * @param {string} reason - 删除原因
   * @param {string} deletedBy - 执行删除的用户或智能体ID
   * @returns {Promise<object>} 删除结果
   */
  async deleteAgent(agentId, reason = '用户删除', deletedBy = 'user') {
    return this.delete(`/agent/${encodeURIComponent(agentId)}`, {
      reason: reason,
      deletedBy: deletedBy,
    });
  },

  /**
   * 删除岗位（软删除）
   * @param {string} roleId - 岗位 ID
   * @param {string} reason - 删除原因
   * @param {string} deletedBy - 执行删除的用户或智能体ID
   * @returns {Promise<object>} 删除结果
   */
  async deleteRole(roleId, reason = '用户删除', deletedBy = 'user') {
    return this.delete(`/role/${encodeURIComponent(roleId)}`, {
      reason: reason,
      deletedBy: deletedBy,
    });
  },

  // ==================== Config API ====================

  /**
   * 获取配置状态
   * @returns {Promise<{hasLocalConfig: boolean, llmStatus: string, lastError: string|null}>}
   */
  async getConfigStatus() {
    return this.get('/config/status');
  },

  /**
   * 获取 LLM 配置
   * @returns {Promise<{llm: object, source: string}>}
   */
  async getLlmConfig() {
    return this.get('/config/llm');
  },

  /**
   * 保存 LLM 配置
   * @param {object} config - LLM 配置
   * @returns {Promise<{ok: boolean, llm: object}>}
   */
  async saveLlmConfig(config) {
    return this.post('/config/llm', config);
  },

  /**
   * 获取 LLM 服务列表配置
   * @returns {Promise<{services: Array, source: string}>}
   */
  async getLlmServicesConfig() {
    return this.get('/config/llm-services');
  },

  /**
   * 添加 LLM 服务
   * @param {object} service - 服务配置
   * @returns {Promise<{ok: boolean, service: object}>}
   */
  async addLlmServiceConfig(service) {
    return this.post('/config/llm-services', service);
  },

  /**
   * 更新 LLM 服务
   * @param {string} serviceId - 服务 ID
   * @param {object} service - 服务配置
   * @returns {Promise<{ok: boolean, service: object}>}
   */
  async updateLlmServiceConfig(serviceId, service) {
    return this.post(`/config/llm-services/${encodeURIComponent(serviceId)}`, service);
  },

  /**
   * 删除 LLM 服务
   * @param {string} serviceId - 服务 ID
   * @returns {Promise<{ok: boolean, deletedId: string}>}
   */
  async deleteLlmServiceConfig(serviceId) {
    return this.delete(`/config/llm-services/${encodeURIComponent(serviceId)}`);
  },

  /**
   * 上传文件
   * @param {File|Blob} file - 文件对象
   * @param {string} type - 文件类型 ('image' | 'file')
   * @param {string} filename - 文件名
   * @param {function} [onProgress] - 进度回调 (progress: number) => void
   * @returns {Promise<{ok: boolean, artifactRef?: string, metadata?: object, error?: string}>}
   */
  async uploadFile(file, type, filename, onProgress) {
    // 使用 UploadService 进行上传
    if (window.UploadService) {
      return UploadService.upload(file, { type, filename, onProgress });
    }
    
    // 备用方案：使用 fetch
    const formData = new FormData();
    formData.append('file', file, filename);
    formData.append('type', type);
    formData.append('filename', filename);
    
    try {
      const response = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('文件上传失败:', error);
      return { ok: false, error: 'upload_failed', message: error.message };
    }
  },

  /**
   * 发送带附件的消息
   * @param {string} toAgentId - 目标智能体 ID
   * @param {string} message - 消息内容
   * @param {Array<{type: string, artifactRef: string, filename: string}>} attachments - 附件列表
   * @returns {Promise<object>} 发送结果
   */
  async sendMessageWithAttachments(toAgentId, message, attachments) {
    return this.post('/send', {
      to: toAgentId,
      message: message,
      attachments: attachments
    });
  },

  // ==================== Events API ====================

  /**
   * 获取最近的错误和重试事件
   * @param {string} [since] - 只返回此时间戳之后的事件
   * @returns {Promise<{errors: Array, retries: Array, timestamp: string}>}
   */
  async getEvents(since) {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.get(`/events${params}`);
  },
};

// 导出 API 对象供其他模块使用
window.API = API;
