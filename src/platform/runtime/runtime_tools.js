/**
 * Runtime 工具管理模块
 * 
 * 本模块负责管理 Runtime 的工具相关功能，包括：
 * - 工具定义管理
 * - 工具执行
 * - 工具组管理
 * - 工具权限检查
 * 
 * 【设计目标】
 * 将 Runtime 类中的工具管理职责提取到独立模块，降低 Runtime 类的复杂度。
 * 
 * 【主要功能】
 * 1. 注册内置工具组
 * 2. 获取工具定义（全局和按智能体）
 * 3. 检查工具权限
 * 4. 执行工具调用
 * 
 * 【与其他模块的关系】
 * - 使用 ToolGroupManager 管理工具组
 * - 使用 ModuleLoader 加载模块工具
 * - 使用 ToolExecutor 执行工具调用
 * - 被 Runtime 调用提供工具管理功能
 * 
 * @module runtime/runtime_tools
 */

/**
 * Runtime 工具管理类
 * 
 * 封装 Runtime 的工具管理功能。
 */
export class RuntimeTools {
  /**
   * 创建工具管理实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 注册内置工具组的实际工具定义。
   * 在 Runtime.init() 中调用，用实际的工具定义替换 ToolGroupManager 中的占位符。
   * 
   * 【实现说明】
   * 1. 获取所有内置工具定义
   * 2. 按工具名映射到工具组
   * 3. 更新 ToolGroupManager 中的工具定义
   * 
   * @returns {void}
   */
  registerBuiltinToolGroups() {
    const runtime = this.runtime;
    
    // 获取所有内置工具定义
    const allTools = this.getToolDefinitions();
    
    // 工具名到工具组的映射
    const toolGroupMapping = {
      find_role_by_name: "org_management",
      create_role: "org_management",
      spawn_agent_with_task: "org_management",
      terminate_agent: "org_management",
      send_message: "org_management",
      list_org_template_infos: "org_management",
      get_org_template_org: "org_management",
      put_artifact: "artifact",
      get_artifact: "artifact",
      show_artifacts: "artifact",
      read_file: "workspace",
      write_file: "workspace",
      list_files: "workspace",
      get_workspace_info: "workspace",
      run_javascript: "command",
      http_request: "network",
      compress_context: "context",
      get_context_status: "context"
    };
    
    // 按工具组分类
    const toolsByGroup = {
      org_management: [],
      artifact: [],
      workspace: [],
      command: [],
      network: [],
      context: [],
      console: []
    };
    
    // 分类工具定义（去重）
    const seenTools = new Set();
    for (const tool of allTools) {
      const toolName = tool?.function?.name;
      if (!toolName || seenTools.has(toolName)) continue;
      
      const groupId = toolGroupMapping[toolName];
      if (groupId && toolsByGroup[groupId]) {
        toolsByGroup[groupId].push(tool);
        seenTools.add(toolName);
      }
    }
    
    // 更新每个内置工具组的工具定义
    for (const [groupId, tools] of Object.entries(toolsByGroup)) {
      if (tools.length > 0) {
        runtime.toolGroupManager.updateGroupTools(groupId, tools);
      }
    }
    
    void runtime.log?.debug?.("内置工具组工具定义已更新", {
      groups: Object.keys(toolsByGroup),
      toolCounts: Object.fromEntries(
        Object.entries(toolsByGroup).map(([k, v]) => [k, v.length])
      )
    });
  }

  /**
   * 获取指定智能体可用的工具定义。
   * 根据智能体岗位配置的工具组返回相应的工具定义。
   * 
   * 【权限规则】
   * - root 岗位：只有 org_management 工具组
   * - 其他岗位：根据岗位配置的 toolGroups 返回工具
   * - 未配置 toolGroups：返回所有工具组
   * - 模块工具：对所有非 root 岗位可用
   * 
   * @param {string} agentId - 智能体ID
   * @returns {any[]} 工具定义列表
   */
  getToolDefinitionsForAgent(agentId) {
    const runtime = this.runtime;
    
    // root 岗位硬编码只有 org_management
    if (agentId === "root") {
      return runtime.toolGroupManager.getToolDefinitions(["org_management"]);
    }
    
    // 获取智能体元数据
    const meta = runtime._agentMetaById.get(agentId);
    if (!meta) {
      // 智能体不存在，返回所有工具（向后兼容）
      return this.getToolDefinitions();
    }
    
    // 获取岗位信息
    const role = runtime.org.getRole(meta.roleId);
    if (!role) {
      // 岗位不存在，返回所有工具（向后兼容）
      return this.getToolDefinitions();
    }
    
    // 获取岗位配置的工具组，未配置则使用全部工具组
    const toolGroups = role.toolGroups ?? runtime.toolGroupManager.getAllGroupIds();
    const builtinTools = runtime.toolGroupManager.getToolDefinitions(toolGroups);
    
    // 合并模块提供的工具定义（模块工具暂时对所有非 root 岗位可用）
    return [...builtinTools, ...runtime.moduleLoader.getToolDefinitions()];
  }

  /**
   * 检查工具是否对指定智能体可用。
   * 
   * 【权限规则】
   * - 模块工具：对所有非 root 岗位可用
   * - root 岗位：只能使用 org_management 工具组
   * - 其他岗位：根据岗位配置的 toolGroups 检查
   * 
   * @param {string} agentId - 智能体ID
   * @param {string} toolName - 工具名称
   * @returns {boolean} 是否可用
   */
  isToolAvailableForAgent(agentId, toolName) {
    const runtime = this.runtime;
    
    // 检查是否是模块工具（模块工具对所有非 root 岗位可用）
    if (runtime.moduleLoader.hasToolName(toolName)) {
      return agentId !== "root";
    }
    
    // root 岗位硬编码只有 org_management
    if (agentId === "root") {
      return runtime.toolGroupManager.isToolInGroups(toolName, ["org_management"]);
    }
    
    // 获取智能体元数据
    const meta = runtime._agentMetaById.get(agentId);
    if (!meta) {
      // 智能体不存在，允许所有工具（向后兼容）
      return true;
    }
    
    // 获取岗位信息
    const role = runtime.org.getRole(meta.roleId);
    if (!role) {
      // 岗位不存在，允许所有工具（向后兼容）
      return true;
    }
    
    // 获取岗位配置的工具组，未配置则使用全部工具组
    const toolGroups = role.toolGroups ?? runtime.toolGroupManager.getAllGroupIds();
    return runtime.toolGroupManager.isToolInGroups(toolName, toolGroups);
  }

  /**
   * 生成工具组可选值的描述文本。
   * 从 toolGroupManager 动态获取所有已注册的工具组。
   * 
   * 【用途】
   * 用于 create_role 工具的 toolGroups 参数描述，让 LLM 知道可用的工具组。
   * 
   * @returns {string} 工具组描述文本
   */
  generateToolGroupsDescription() {
    const runtime = this.runtime;
    const groups = runtime.toolGroupManager.listGroups();
    
    if (groups.length === 0) {
      return "工具组标识符列表，限制该岗位可用的工具函数。不指定则使用全部工具组。";
    }
    
    const groupDescriptions = groups
      .map(g => `${g.id}（${g.description}）`)
      .join("、");
    
    return `工具组标识符列表，限制该岗位可用的工具函数。可选值：${groupDescriptions}。不指定则使用全部工具组。`;
  }

  /**
   * 返回可供 LLM 工具调用的工具定义（OpenAI tools schema）。
   * 
   * 【实现说明】
   * 委托给 ToolExecutor 获取工具定义，这里只是提供一个统一的入口。
   * 
   * @returns {any[]} 工具定义数组
   */
  getToolDefinitions() {
    const runtime = this.runtime;
    return runtime._toolExecutor.getToolDefinitions();
  }

  /**
   * 执行一次工具调用并返回可序列化结果。
   * 
   * 【实现说明】
   * 委托给 ToolExecutor 执行工具调用，这里只是提供一个统一的入口并处理错误。
   * 
   * @param {any} ctx - 智能体上下文
   * @param {string} toolName - 工具名称
   * @param {any} args - 工具参数
   * @returns {Promise<any>} 执行结果
   */
  async executeToolCall(ctx, toolName, args) {
    const runtime = this.runtime;
    
    try {
      void runtime.log?.debug?.("执行工具调用", {
        agentId: ctx.agent?.id ?? null,
        toolName,
        args: args ?? null
      });
      
      // 委托给 ToolExecutor 处理所有工具调用
      return await runtime._toolExecutor.executeToolCall(ctx, toolName, args);
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      void runtime.log?.error?.("工具调用执行失败", { toolName, message });
      return { error: "tool_execution_failed", toolName, message };
    }
  }
}
