/**
 * 工具执行器模块
 * 
 * 本模块负责定义和执行所有工具，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 智能体通过工具与外部世界交互，需要一个统一的模块来：
 * - 定义所有可用工具的 schema
 * - 执行工具调用
 * - 处理工具执行错误
 * 
 * 【主要功能】
 * 1. 定义工具 schema（OpenAI tools 格式）
 * 2. 执行工具调用
 * 3. 处理特殊工具（spawn_agent_with_task、compress_context 等）
 * 
 * 【工具分类】
 * - 岗位管理：find_role_by_name、create_role
 * - 智能体管理：spawn_agent、spawn_agent_with_task、terminate_agent
 * - 消息通信：send_message
 * - 工件操作：put_artifact、get_artifact
 * - 代码执行：run_javascript
 * - 上下文管理：compress_context、get_context_status
 * - HTTP 请求：http_request
 * - 文件操作：read_file、write_file、list_files
 * - 工作空间：get_workspace_info
 * - 命令执行：run_command
 * 
 * 【与其他模块的关系】
 * - 被 LlmHandler 调用来执行工具
 * - 使用 JavaScriptExecutor 执行 run_javascript
 * - 使用 AgentManager 处理智能体相关工具
 * - 使用 Runtime 的各种服务（org、bus、artifacts 等）
 * 
 * @module runtime/tool_executor
 */

import { validateTaskBrief } from "../task_brief.js";
import { validateMessageFormat } from "../message_validator.js";

/**
 * 工具执行器类
 * 
 * 负责定义和执行所有工具。
 */
export class ToolExecutor {
  /**
   * 创建工具执行器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 获取所有工具定义
   * 
   * 返回 OpenAI tools schema 格式的工具定义数组。
   * 
   * @returns {object[]} 工具定义数组
   */
  getToolDefinitions() {
    const runtime = this.runtime;
    
    return [
      // 岗位查找
      {
        type: "function",
        function: {
          name: "find_role_by_name",
          description: "按岗位名查找岗位，返回 role 或 null。",
          parameters: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"]
          }
        }
      },
      // 岗位创建
      {
        type: "function",
        function: {
          name: "create_role",
          description: "创建岗位（Role），必须提供岗位名与岗位提示词。可选指定工具组列表，限制该岗位可用的工具函数。",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              rolePrompt: { type: "string" },
              toolGroups: { 
                type: "array", 
                items: { type: "string" },
                description: "工具组标识符列表，限制该岗位可用的工具函数。不指定则使用全部工具组。"
              }
            },
            required: ["name", "rolePrompt"]
          }
        }
      },
      // 创建智能体
      {
        type: "function",
        function: {
          name: "spawn_agent",
          description: "在指定岗位上创建智能体实例（Agent Instance），必须提供任务委托书（Task Brief）。注意：spawn_agent 只创建智能体，不会自动发送任务消息！创建后必须用 send_message 向新智能体发送具体任务。如需创建并立即发送任务，请使用 spawn_agent_with_task。",
          parameters: {
            type: "object",
            properties: {
              roleId: { type: "string", description: "岗位ID" },
              taskBrief: {
                type: "object",
                description: "任务委托书，包含任务的完整说明",
                properties: {
                  objective: { type: "string", description: "目标描述" },
                  constraints: { type: "array", items: { type: "string" }, description: "技术约束" },
                  inputs: { type: "string", description: "输入说明" },
                  outputs: { type: "string", description: "输出要求" },
                  completion_criteria: { type: "string", description: "完成标准" },
                  collaborators: { type: "array", items: { type: "object" }, description: "预设协作联系人" },
                  references: { type: "array", items: { type: "string" }, description: "参考资料" },
                  priority: { type: "string", description: "优先级" }
                },
                required: ["objective", "constraints", "inputs", "outputs", "completion_criteria"]
              }
            },
            required: ["roleId", "taskBrief"]
          }
        }
      },
      // 创建智能体并发送任务
      {
        type: "function",
        function: {
          name: "spawn_agent_with_task",
          description: "创建智能体实例并立即发送任务消息（二合一接口）。相当于 spawn_agent + send_message，省去一次工具调用。推荐在需要立即分配任务时使用。",
          parameters: {
            type: "object",
            properties: {
              roleId: { type: "string", description: "岗位ID" },
              taskBrief: {
                type: "object",
                description: "任务委托书",
                properties: {
                  objective: { type: "string" },
                  constraints: { type: "array", items: { type: "string" } },
                  inputs: { type: "string" },
                  outputs: { type: "string" },
                  completion_criteria: { type: "string" },
                  collaborators: { type: "array", items: { type: "object" } },
                  references: { type: "array", items: { type: "string" } },
                  priority: { type: "string" }
                },
                required: ["objective", "constraints", "inputs", "outputs", "completion_criteria"]
              },
              initialMessage: {
                type: "object",
                description: "创建后立即发送给新智能体的任务消息内容",
                properties: {
                  message_type: { type: "string" },
                  task: { type: "string" },
                  interfaces: { type: "object" },
                  deliverable: { type: "string" },
                  dependencies: { type: "array", items: { type: "string" } }
                }
              }
            },
            required: ["roleId", "taskBrief", "initialMessage"]
          }
        }
      },
      // 发送消息
      {
        type: "function",
        function: {
          name: "send_message",
          description: "发送异步消息。from 默认使用当前智能体 id。",
          parameters: {
            type: "object",
            properties: {
              to: { type: "string" },
              payload: { type: "object" },
              delayMs: { 
                type: "number", 
                description: "延迟投递时间（毫秒），消息将在指定时间后才进入收件人队列。不指定或为0则立即投递。可以用于一段时间之后的提醒，比如闹钟、计划任务等。" 
              }
            },
            required: ["to", "payload"]
          }
        }
      },
      // 工件操作
      {
        type: "function",
        function: {
          name: "put_artifact",
          description: "写入工件并返回 artifactRef。",
          parameters: {
            type: "object",
            properties: {
              type: { type: "string" },
              content: {},
              meta: { type: "object" }
            },
            required: ["type", "content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_artifact",
          description: "读取工件引用并返回工件内容。",
          parameters: {
            type: "object",
            properties: { ref: { type: "string" } },
            required: ["ref"]
          }
        }
      },
      // 控制台输出
      {
        type: "function",
        function: {
          name: "console_print",
          description: "向控制台输出文本。",
          parameters: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"]
          }
        }
      },
      // 终止智能体
      {
        type: "function",
        function: {
          name: "terminate_agent",
          description: "终止指定的子智能体实例并回收资源。只能终止自己创建的子智能体。",
          parameters: {
            type: "object",
            properties: {
              agentId: { type: "string", description: "要终止的智能体ID" },
              reason: { type: "string", description: "终止原因（可选）" }
            },
            required: ["agentId"]
          }
        }
      },
      // JavaScript 执行
      {
        type: "function",
        function: {
          name: "run_javascript",
          description: "在浏览器环境中运行 JavaScript 代码。支持异步代码（可使用 await 和返回 Promise）。涉及严格计算/精确数值/统计/日期时间/格式转换等必须可复现的结果时，优先调用本工具用代码计算。每次调用都是全新执行环境（新标签页）。参数 input 会作为变量 input 传入代码。code 必须是函数体形式的代码，需要显式 return 一个可 JSON 序列化的值。支持 Canvas 绘图功能：调用 getCanvas(width, height) 获取 Canvas 元素，绘图后图像会自动导出保存。",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "要执行的 JavaScript 代码（函数体形式）" },
              input: { description: "传入代码的输入参数，在代码中通过 input 变量访问" }
            },
            required: ["code"]
          }
        }
      },
      // 上下文压缩
      {
        type: "function",
        function: {
          name: "compress_context",
          description: "【强制要求】压缩会话历史，保留系统提示词、最近消息和指定的重要内容摘要。当上下文使用率达到警告阈值(70%)或更高时必须调用。",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "对被压缩历史的重要内容摘要" },
              keepRecentCount: { type: "number", description: "保留最近多少条消息，默认10" }
            },
            required: ["summary"]
          }
        }
      },
      // 上下文状态
      {
        type: "function",
        function: {
          name: "get_context_status",
          description: "查询当前智能体的上下文使用状态。",
          parameters: { type: "object", properties: {} }
        }
      },
      // HTTP 请求
      {
        type: "function",
        function: {
          name: "http_request",
          description: "发起 HTTPS 请求访问外部 API 或网页。仅支持 HTTPS 协议。",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "请求 URL，必须是 HTTPS 协议" },
              method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] },
              headers: { type: "object" },
              body: {},
              timeoutMs: { type: "number" }
            },
            required: ["url"]
          }
        }
      },
      // 文件操作
      {
        type: "function",
        function: {
          name: "read_file",
          description: "读取工作空间内的文件内容。",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "文件的相对路径" } },
            required: ["path"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "write_file",
          description: "在工作空间内创建或修改文件。",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "文件的相对路径" },
              content: { type: "string", description: "文件内容" }
            },
            required: ["path", "content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_files",
          description: "列出工作空间内指定目录的文件和子目录。",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "目录的相对路径" } }
          }
        }
      },
      // 工作空间信息
      {
        type: "function",
        function: {
          name: "get_workspace_info",
          description: "获取当前工作空间的状态信息。",
          parameters: { type: "object", properties: {} }
        }
      },
      // 命令执行
      {
        type: "function",
        function: {
          name: "run_command",
          description: "在工作空间内执行终端命令。危险命令会被拦截。",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string", description: "要执行的命令" },
              timeoutMs: { type: "number", description: "超时时间（毫秒）" }
            },
            required: ["command"]
          }
        }
      },
      // 合并模块提供的工具定义
      ...runtime.moduleLoader.getToolDefinitions()
    ];
  }

  /**
   * 执行工具调用
   * 
   * @param {object} ctx - 智能体上下文
   * @param {string} toolName - 工具名称
   * @param {object} args - 工具参数
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
      
      // 检查模块工具
      if (runtime.moduleLoader.hasToolName(toolName)) {
        const result = await runtime.moduleLoader.executeToolCall(ctx, toolName, args);
        void runtime.log?.debug?.("模块工具调用完成", { toolName, ok: !result?.error });
        return result;
      }
      
      // 分发到具体的工具处理方法
      switch (toolName) {
        case "find_role_by_name":
          return this._executeFindRoleByName(ctx, args);
        case "create_role":
          return await this._executeCreateRole(ctx, args);
        case "spawn_agent":
          return await this._executeSpawnAgent(ctx, args);
        case "spawn_agent_with_task":
          return await this._executeSpawnAgentWithTask(ctx, args);
        case "send_message":
          return this._executeSendMessage(ctx, args);
        case "put_artifact":
          return await this._executePutArtifact(ctx, args);
        case "get_artifact":
          return await this._executeGetArtifact(ctx, args);
        case "console_print":
          return this._executeConsolePrint(ctx, args);
        case "terminate_agent":
          return await this._executeTerminateAgent(ctx, args);
        case "run_javascript":
          return await this._executeRunJavaScript(ctx, args);
        case "compress_context":
          return this._executeCompressContext(ctx, args);
        case "get_context_status":
          return this._executeGetContextStatus(ctx, args);
        case "http_request":
          return await this._executeHttpRequest(ctx, args);
        case "read_file":
          return await this._executeReadFile(ctx, args);
        case "write_file":
          return await this._executeWriteFile(ctx, args);
        case "list_files":
          return await this._executeListFiles(ctx, args);
        case "get_workspace_info":
          return await this._executeGetWorkspaceInfo(ctx, args);
        case "run_command":
          return await this._executeRunCommand(ctx, args);
        default:
          void runtime.log?.warn?.("未知工具调用", { toolName });
          return { error: `unknown_tool:${toolName}` };
      }
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      void runtime.log?.error?.("工具调用执行失败", { toolName, message });
      return { error: "tool_execution_failed", toolName, message };
    }
  }

  // ========== 工具执行方法 ==========

  _executeFindRoleByName(ctx, args) {
    const result = ctx.tools.findRoleByName(args.name);
    void this.runtime.log?.debug?.("工具调用完成", { toolName: "find_role_by_name", ok: true });
    return result;
  }

  async _executeCreateRole(ctx, args) {
    const runtime = this.runtime;
    const isRoot = ctx.agent?.id === "root";
    const taskId = ctx.currentMessage?.taskId ?? null;
    const isFromUser = ctx.currentMessage?.from === "user";

    // 复用逻辑
    if (isRoot && isFromUser && taskId) {
      const existingRoleId = runtime._rootTaskRoleByTaskId.get(taskId);
      if (existingRoleId) {
        const existing = runtime.org.getRole(existingRoleId);
        if (existing) {
          void runtime.log?.debug?.("根智能体复用岗位（按 taskId）", { taskId, roleId: existingRoleId });
          return existing;
        }
      }
    }

    const existing = ctx.tools.findRoleByName(args.name);
    if (existing) {
      if (isRoot && isFromUser && taskId) {
        runtime._rootTaskRoleByTaskId.set(taskId, existing.id);
      }
      void runtime.log?.debug?.("工具调用完成", { toolName: "create_role", ok: true, reused: true });
      return existing;
    }

    // 模型选择
    let llmServiceId = null;
    if (runtime.modelSelector && runtime.serviceRegistry?.hasServices()) {
      try {
        const selectionResult = await runtime.modelSelector.selectService(args.rolePrompt);
        llmServiceId = selectionResult?.serviceId ?? null;
        if (llmServiceId) {
          void runtime.log?.info?.("模型选择器选择了 LLM 服务", {
            roleName: args.name,
            llmServiceId,
            reason: selectionResult?.reason ?? null
          });
        }
      } catch (err) {
        void runtime.log?.warn?.("模型选择失败，使用默认 LLM", { roleName: args.name });
      }
    }

    const result = await ctx.tools.createRole({ 
      name: args.name, 
      rolePrompt: args.rolePrompt,
      llmServiceId,
      toolGroups: args.toolGroups
    });
    
    if (isRoot && isFromUser && taskId) {
      runtime._rootTaskRoleByTaskId.set(taskId, result.id);
    }
    
    void runtime.log?.debug?.("工具调用完成", { toolName: "create_role", ok: true, roleId: result?.id ?? null });
    return result;
  }

  async _executeSpawnAgent(ctx, args) {
    const runtime = this.runtime;
    const taskId = ctx.currentMessage?.taskId ?? null;
    const isRoot = ctx.agent?.id === "root";
    const isFromUser = ctx.currentMessage?.from === "user";
    const creatorId = ctx.agent?.id ?? null;

    if (!creatorId) return { error: "missing_creator_agent" };

    // 检查调用者是否已终止
    if (creatorId !== "root") {
      const creatorMeta = runtime.org?.getAgent?.(creatorId);
      if (creatorMeta && creatorMeta.status === "terminated") {
        return { error: "caller_terminated", message: "调用者智能体已被终止" };
      }
    }

    // 验证 TaskBrief
    const taskBrief = args?.taskBrief;
    const taskBriefValidation = validateTaskBrief(taskBrief);
    if (!taskBriefValidation.valid) {
      return { error: "invalid_task_brief", missing_fields: taskBriefValidation.errors };
    }

    // 验证目标岗位
    const targetRoleId = args?.roleId ?? null;
    const targetRole = targetRoleId ? runtime.org.getRole(String(targetRoleId)) : null;
    if (!targetRole) {
      return { error: "unknown_role", roleId: targetRoleId ?? null };
    }

    // 验证子岗位关系
    const currentRoleId = ctx.agent?.roleId ?? null;
    const isChildRole = String(targetRole.createdBy ?? "") === String(creatorId) && 
                        String(targetRole.id) !== String(currentRoleId ?? "");
    if (!isChildRole) {
      return { error: "not_child_role", roleId: targetRole.id };
    }

    // 验证 parentAgentId
    const rawParent = args.parentAgentId;
    const missingParent = rawParent === null || rawParent === undefined || rawParent === "" || 
                          rawParent === "null" || rawParent === "undefined";
    if (!missingParent && String(rawParent) !== String(creatorId)) {
      return { error: "invalid_parentAgentId", expected: creatorId, got: rawParent };
    }
    const parentAgentId = missingParent ? creatorId : rawParent;

    // 复用逻辑
    if (isRoot && taskId) {
      const existing = runtime._rootTaskAgentByTaskId.get(taskId);
      if (existing) {
        const result = { id: existing.id, roleId: existing.roleId, roleName: existing.roleName };
        if (isFromUser && !runtime._rootTaskEntryAgentAnnouncedByTaskId.has(taskId)) {
          runtime.bus.send({ to: "user", from: "root", taskId, payload: { agentId: existing.id } });
          runtime._rootTaskEntryAgentAnnouncedByTaskId.add(taskId);
        }
        return result;
      }
    }

    // 创建智能体
    const agent = await ctx.tools.spawnAgent({ roleId: args.roleId, parentAgentId, taskBrief });
    const result = { id: agent.id, roleId: agent.roleId, roleName: agent.roleName };
    
    // 存储 TaskBrief
    runtime._agentTaskBriefs.set(agent.id, taskBrief);
    
    // 初始化联系人
    const collaborators = taskBrief?.collaborators ?? [];
    runtime.contactManager.initRegistry(agent.id, parentAgentId, collaborators);
    runtime.contactManager.addContact(parentAgentId, { id: agent.id, role: agent.roleName, source: 'child' });
    
    if (isRoot && taskId) {
      runtime._rootTaskAgentByTaskId.set(taskId, result);
      if (isFromUser && !runtime._rootTaskEntryAgentAnnouncedByTaskId.has(taskId)) {
        runtime.bus.send({ to: "user", from: "root", taskId, payload: { agentId: agent.id } });
        runtime._rootTaskEntryAgentAnnouncedByTaskId.add(taskId);
      }
    }
    
    void runtime.log?.debug?.("工具调用完成", { toolName: "spawn_agent", ok: true, agentId: agent.id });
    return result;
  }

  async _executeSpawnAgentWithTask(ctx, args) {
    const runtime = this.runtime;
    const creatorId = ctx.agent?.id ?? null;
    
    if (!creatorId) return { error: "missing_creator_agent" };
    if (!args.initialMessage || typeof args.initialMessage !== "object") {
      return { error: "missing_initial_message" };
    }

    // 复用 spawn_agent 逻辑
    const spawnResult = await this.executeToolCall(ctx, "spawn_agent", {
      roleId: args.roleId,
      taskBrief: args.taskBrief
    });

    if (spawnResult.error) return spawnResult;

    const newAgentId = spawnResult.id;
    const taskId = ctx.currentMessage?.taskId ?? null;

    // 发送任务消息
    const messagePayload = {
      message_type: args.initialMessage.message_type ?? "task_assignment",
      ...args.initialMessage
    };

    const sendResult = runtime.bus.send({
      to: newAgentId,
      from: creatorId,
      taskId,
      payload: messagePayload
    });

    void runtime.log?.info?.("spawn_agent_with_task 完成", {
      creatorId,
      newAgentId,
      roleId: spawnResult.roleId,
      messageId: sendResult.messageId,
      taskId
    });

    return {
      id: newAgentId,
      roleId: spawnResult.roleId,
      roleName: spawnResult.roleName,
      messageId: sendResult.messageId
    };
  }

  _executeSendMessage(ctx, args) {
    const runtime = this.runtime;
    const senderId = ctx.agent?.id ?? "unknown";
    const recipientId = String(args?.to ?? "");

    // 检查发送者是否已终止
    if (senderId !== "root" && senderId !== "user" && senderId !== "unknown") {
      const senderMeta = runtime.org?.getAgent?.(senderId);
      if (senderMeta && senderMeta.status === "terminated") {
        return { error: "sender_terminated" };
      }
    }

    // 验证收件人
    const isRecipientSpecial = recipientId === "root" || recipientId === "user";
    if (!recipientId || (!isRecipientSpecial && !runtime._agents.has(recipientId))) {
      return { error: "unknown_recipient", to: recipientId };
    }

    // 跨任务通信验证
    const isRootOrUser = senderId === "root" || senderId === "user";
    if (!isRootOrUser && !isRecipientSpecial) {
      const senderTaskId = runtime._getAgentTaskId(senderId);
      const recipientTaskId = runtime._getAgentTaskId(recipientId);
      if (senderTaskId !== recipientTaskId) {
        return { error: "cross_task_communication_denied" };
      }
    }

    // 自动添加联系人
    if (runtime.contactManager.hasRegistry(recipientId)) {
      const recipientContact = runtime.contactManager.getContact(recipientId, senderId);
      if (!recipientContact) {
        runtime.contactManager.addContact(recipientId, {
          id: senderId,
          role: ctx.agent?.roleName ?? 'unknown',
          source: 'first_message'
        });
      }
    }

    // 消息验证
    const messageValidation = validateMessageFormat(args.payload);
    if (!messageValidation.valid) {
      void runtime.log?.warn?.("send_message 消息格式验证警告", {
        from: senderId,
        to: recipientId,
        errors: messageValidation.errors
      });
    }

    const currentTaskId = ctx.currentMessage?.taskId ?? null;
    const result = ctx.tools.sendMessage({
      to: recipientId,
      from: senderId,
      taskId: currentTaskId,
      payload: args.payload,
      delayMs: args.delayMs  // 传递延迟参数
    });

    void runtime.loggerRoot?.logAgentLifecycleEvent?.("agent_message_sent", {
      agentId: senderId,
      messageId: result.messageId,
      to: recipientId,
      taskId: currentTaskId,
      delayMs: args.delayMs ?? null
    });

    return result;
  }

  async _executePutArtifact(ctx, args) {
    const messageId = ctx.currentMessage?.id ?? null;
    const ref = await ctx.tools.putArtifact({ 
      type: args.type, 
      content: args.content, 
      meta: args.meta, 
      messageId 
    });
    return { artifactRef: ref };
  }

  async _executeGetArtifact(ctx, args) {
    return await ctx.tools.getArtifact(args.ref);
  }

  _executeConsolePrint(ctx, args) {
    process.stdout.write(String(args.text ?? ""));
    return { ok: true };
  }

  async _executeTerminateAgent(ctx, args) {
    const result = await this.runtime._executeTerminateAgent(ctx, args);
    void this.runtime.log?.debug?.("工具调用完成", { toolName: "terminate_agent", ok: !result.error });
    return result;
  }

  async _executeRunJavaScript(ctx, args) {
    const messageId = ctx.currentMessage?.id ?? null;
    const agentId = ctx.agent?.id ?? null;
    const result = await this.runtime._runJavaScriptTool(args, messageId, agentId);
    void this.runtime.log?.debug?.("工具调用完成", { toolName: "run_javascript", ok: true });
    return result;
  }

  _executeCompressContext(ctx, args) {
    const result = this.runtime._executeCompressContext(ctx, args);
    void this.runtime.log?.debug?.("工具调用完成", { toolName: "compress_context", ok: !result.error });
    return result;
  }

  _executeGetContextStatus(ctx, args) {
    const runtime = this.runtime;
    const agentId = ctx.agent?.id ?? null;
    if (!agentId) return { error: "missing_agent_id" };
    
    const status = runtime._conversationManager.getContextStatus(agentId);
    return {
      usedTokens: status.usedTokens,
      maxTokens: status.maxTokens,
      usagePercent: status.usagePercent,
      usagePercentStr: (status.usagePercent * 100).toFixed(1) + '%',
      status: status.status,
      thresholds: {
        warning: runtime._conversationManager.contextLimit.warningThreshold,
        critical: runtime._conversationManager.contextLimit.criticalThreshold,
        hardLimit: runtime._conversationManager.contextLimit.hardLimitThreshold
      }
    };
  }

  async _executeHttpRequest(ctx, args) {
    const runtime = this.runtime;
    const agentId = ctx.agent?.id ?? null;
    if (!agentId) return { error: "missing_agent_id" };
    
    const { response, error, requestLog } = await runtime.httpClient.request(agentId, {
      url: args.url,
      method: args.method,
      headers: args.headers,
      body: args.body,
      timeoutMs: args.timeoutMs
    });
    
    if (error) {
      return { error, requestId: requestLog.requestId, latencyMs: requestLog.latencyMs ?? null };
    }
    
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body,
      latencyMs: response.latencyMs,
      requestId: requestLog.requestId
    };
  }

  async _executeReadFile(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    return await runtime.workspaceManager.readFile(workspaceId, args.path);
  }

  async _executeWriteFile(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    return await runtime.workspaceManager.writeFile(workspaceId, args.path, args.content);
  }

  async _executeListFiles(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    return await runtime.workspaceManager.listFiles(workspaceId, args.path ?? ".");
  }

  async _executeGetWorkspaceInfo(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    return await runtime.workspaceManager.getWorkspaceInfo(workspaceId);
  }

  async _executeRunCommand(ctx, args) {
    const runtime = this.runtime;
    const taskId = runtime._getTaskIdForAgent(ctx.agent?.id);
    if (!taskId) {
      return { error: "workspace_not_bound", message: "当前智能体未绑定工作空间" };
    }
    const workspacePath = runtime.workspaceManager.getWorkspacePath(taskId);
    if (!workspacePath) {
      return { error: "workspace_not_bound", message: "工作空间路径未找到" };
    }
    return await runtime.commandExecutor.execute(workspacePath, args.command, {
      timeoutMs: args.timeoutMs
    });
  }
}
