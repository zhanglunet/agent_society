import { createNoopModuleLogger } from "../utils/logger/logger.js";

/**
 * 内置工具组定义
 * 这些工具组在运行时初始化时自动注册，标识符为保留名称
 */
export const BUILTIN_TOOL_GROUPS = {
  org_management: {
    description: "组织管理工具 - 用于创建岗位、创建智能体实例、发送消息、终止智能体等组织架构管理操作。创建岗位时可通过 toolGroups 参数限制该岗位可用的工具组。",
    tools: ["find_role_by_name", "create_role", "spawn_agent_with_task", "terminate_agent", "send_message"]
  },
  localllm: {
    description: "本地 LLM 工具 - 通过本机 headless Chrome 驱动 wllama 页面进行对话。这个调用的模型只在本地运行，规模小，速度快，不支持复杂的推理任务，不能保证结果正确稳定，适合不重要的、简单的、高速的场景。",
    tools: ["localllm_chat"]
  },
  artifact: {
    description: "工件管理工具 - 用于存储、读取和展示工件（如文件、图片、数据等），工件可在智能体之间共享传递。",
    tools: ["put_artifact", "get_artifact", "show_artifacts"]
  },
  workspace: {
    description: "工作空间工具 - 用于在任务专属工作空间内进行文件读写操作，每个任务有独立的工作空间目录。",
    tools: ["read_file", "write_file", "list_files", "get_workspace_info", "search_text"]
  },
  command: {
    description: "代码执行工具 - 用于执行 JavaScript 代码，支持 Canvas 绘图。",
    tools: ["run_javascript"]
  },
  network: {
    description: "HTTP 请求工具 - 用于调用已知的、确定的 HTTP/HTTPS API 接口（如 REST API、JSON API 等）。仅适用于有明确接口规范的场景。如需模拟人类浏览网页、处理动态渲染页面、执行页面交互操作，请使用 chrome 工具组。",
    tools: ["http_request"]
  },
  context: {
    description: "上下文管理工具 - 用于管理智能体的对话上下文，包括压缩历史记录和查询上下文状态。",
    tools: ["compress_context", "get_context_status"]
  }
};

/**
 * 工具组管理器
 * 负责管理所有工具组的注册、查询和工具定义获取
 */
export class ToolGroupManager {
  /**
   * @param {{logger?: any, registerBuiltins?: boolean}} options
   */
  constructor(options = {}) {
    this.log = options.logger ?? createNoopModuleLogger();
    /** @type {Map<string, {id: string, description: string, tools: Map<string, object>, isReserved: boolean, registeredAt: string}>} */
    this._groups = new Map();
    /** @type {Map<string, string>} toolName -> groupId */
    this._toolToGroup = new Map();
    /** @type {Set<string>} 保留的工具组标识符 */
    this._reservedGroupIds = new Set();
    
    // 默认注册内置工具组
    if (options.registerBuiltins !== false) {
      this._registerBuiltinGroups();
    }
  }

  /**
   * 注册内置工具组
   * @private
   */
  _registerBuiltinGroups() {
    for (const [groupId, groupDef] of Object.entries(BUILTIN_TOOL_GROUPS)) {
      // 将工具名数组转换为空的工具定义（实际定义在 Runtime 中）
      const toolDefs = groupDef.tools.map(name => ({
        type: "function",
        function: { name, description: "", parameters: { type: "object", properties: {} } }
      }));
      
      this._reservedGroupIds.add(groupId);
      this._registerGroupInternal(groupId, {
        description: groupDef.description,
        tools: toolDefs
      }, true);
    }
    
    void this.log.debug("内置工具组注册完成", { 
      count: Object.keys(BUILTIN_TOOL_GROUPS).length,
      groups: Object.keys(BUILTIN_TOOL_GROUPS)
    });
  }


  /**
   * 内部注册工具组方法
   * @param {string} groupId - 工具组标识符
   * @param {{description: string, tools: Array<{type: string, function: {name: string, description?: string, parameters?: object}}>}} groupDef - 工具组定义
   * @param {boolean} isReserved - 是否为保留工具组
   * @private
   */
  _registerGroupInternal(groupId, groupDef, isReserved) {
    const toolsMap = new Map();
    
    for (const tool of groupDef.tools) {
      const toolName = tool?.function?.name;
      if (toolName) {
        toolsMap.set(toolName, tool);
        this._toolToGroup.set(toolName, groupId);
      }
    }
    
    this._groups.set(groupId, {
      id: groupId,
      description: groupDef.description ?? "",
      tools: toolsMap,
      isReserved,
      registeredAt: new Date().toISOString()
    });
  }

  /**
   * 注册工具组
   * @param {string} groupId - 工具组标识符
   * @param {{description: string, tools: Array<{type: string, function: {name: string, description?: string, parameters?: object}}>}} groupDef - 工具组定义
   * @returns {{ok: boolean, error?: string}}
   */
  registerGroup(groupId, groupDef) {
    // 检查是否为保留标识符
    if (this._reservedGroupIds.has(groupId)) {
      void this.log.warn("尝试使用保留的工具组标识符", { groupId });
      return { ok: false, error: "reserved_group_id" };
    }
    
    // 检查工具组定义有效性
    if (!groupDef || typeof groupDef !== "object") {
      return { ok: false, error: "invalid_group_def" };
    }
    
    if (!Array.isArray(groupDef.tools)) {
      return { ok: false, error: "invalid_group_def" };
    }
    
    // 检查是否已存在（覆盖并警告）
    if (this._groups.has(groupId)) {
      void this.log.warn("工具组标识符已存在，将覆盖", { groupId });
      // 先清理旧的工具映射
      const oldGroup = this._groups.get(groupId);
      if (oldGroup) {
        for (const toolName of oldGroup.tools.keys()) {
          if (this._toolToGroup.get(toolName) === groupId) {
            this._toolToGroup.delete(toolName);
          }
        }
      }
    }
    
    this._registerGroupInternal(groupId, groupDef, false);
    
    void this.log.info("注册工具组", { 
      groupId, 
      description: groupDef.description,
      toolCount: groupDef.tools.length 
    });
    
    return { ok: true };
  }

  /**
   * 注销工具组
   * @param {string} groupId - 工具组标识符
   * @returns {{ok: boolean, error?: string}}
   */
  unregisterGroup(groupId) {
    // 不允许注销保留工具组
    if (this._reservedGroupIds.has(groupId)) {
      void this.log.warn("尝试注销保留的工具组", { groupId });
      return { ok: false, error: "cannot_unregister_reserved" };
    }
    
    const group = this._groups.get(groupId);
    if (!group) {
      return { ok: false, error: "group_not_found" };
    }
    
    // 清理工具映射
    for (const toolName of group.tools.keys()) {
      if (this._toolToGroup.get(toolName) === groupId) {
        this._toolToGroup.delete(toolName);
      }
    }
    
    this._groups.delete(groupId);
    
    void this.log.info("注销工具组", { groupId });
    
    return { ok: true };
  }

  /**
   * 更新内置工具组的工具定义
   * 用于在 Runtime 初始化后用实际的工具定义替换占位符
   * @param {string} groupId - 工具组标识符
   * @param {Array<{type: string, function: {name: string, description?: string, parameters?: object}}>} tools - 工具定义列表
   * @returns {{ok: boolean, error?: string}}
   */
  updateGroupTools(groupId, tools) {
    const group = this._groups.get(groupId);
    if (!group) {
      return { ok: false, error: "group_not_found" };
    }
    
    // 清理旧的工具映射
    for (const toolName of group.tools.keys()) {
      if (this._toolToGroup.get(toolName) === groupId) {
        this._toolToGroup.delete(toolName);
      }
    }
    
    // 更新工具定义
    group.tools.clear();
    for (const tool of tools) {
      const toolName = tool?.function?.name;
      if (toolName) {
        group.tools.set(toolName, tool);
        this._toolToGroup.set(toolName, groupId);
      }
    }
    
    void this.log.debug("更新工具组工具定义", { groupId, toolCount: tools.length });
    
    return { ok: true };
  }


  /**
   * 获取指定工具组的工具定义
   * @param {string[]} groupIds - 工具组标识符数组
   * @returns {Array<{type: string, function: object}>} 合并后的工具定义列表（去重）
   */
  getToolDefinitions(groupIds) {
    const toolsMap = new Map(); // 用于去重
    
    for (const groupId of groupIds) {
      const group = this._groups.get(groupId);
      if (!group) {
        void this.log.warn("工具组不存在", { groupId });
        continue;
      }
      
      for (const [toolName, toolDef] of group.tools) {
        if (!toolsMap.has(toolName)) {
          toolsMap.set(toolName, toolDef);
        }
      }
    }
    
    return Array.from(toolsMap.values());
  }

  /**
   * 列出所有工具组
   * @returns {Array<{id: string, description: string, toolCount: number, tools: string[], isReserved: boolean}>}
   */
  listGroups() {
    const result = [];
    
    for (const [groupId, group] of this._groups) {
      result.push({
        id: groupId,
        description: group.description,
        toolCount: group.tools.size,
        tools: Array.from(group.tools.keys()),
        isReserved: group.isReserved
      });
    }
    
    return result;
  }

  /**
   * 获取工具所属的工具组
   * @param {string} toolName - 工具名称
   * @returns {string|null} 工具组标识符
   */
  getToolGroup(toolName) {
    return this._toolToGroup.get(toolName) ?? null;
  }

  /**
   * 检查工具是否在指定工具组中
   * @param {string} toolName - 工具名称
   * @param {string[]} groupIds - 工具组标识符数组
   * @returns {boolean}
   */
  isToolInGroups(toolName, groupIds) {
    const toolGroup = this._toolToGroup.get(toolName);
    if (!toolGroup) {
      return false;
    }
    return groupIds.includes(toolGroup);
  }

  /**
   * 获取所有工具组标识符
   * @returns {string[]}
   */
  getAllGroupIds() {
    return Array.from(this._groups.keys());
  }

  /**
   * 获取指定工具组的信息
   * @param {string} groupId - 工具组标识符
   * @returns {{id: string, description: string, toolCount: number, tools: string[], isReserved: boolean}|null}
   */
  getGroup(groupId) {
    const group = this._groups.get(groupId);
    if (!group) {
      return null;
    }
    
    return {
      id: groupId,
      description: group.description,
      toolCount: group.tools.size,
      tools: Array.from(group.tools.keys()),
      isReserved: group.isReserved
    };
  }

  /**
   * 检查工具组是否存在
   * @param {string} groupId - 工具组标识符
   * @returns {boolean}
   */
  hasGroup(groupId) {
    return this._groups.has(groupId);
  }

  /**
   * 检查是否为保留工具组
   * @param {string} groupId - 工具组标识符
   * @returns {boolean}
   */
  isReservedGroup(groupId) {
    return this._reservedGroupIds.has(groupId);
  }

  /**
   * 获取工具组数量
   * @returns {number}
   */
  getGroupCount() {
    return this._groups.size;
  }

  /**
   * 获取所有工具名称
   * @returns {string[]}
   */
  getAllToolNames() {
    return Array.from(this._toolToGroup.keys());
  }
}
