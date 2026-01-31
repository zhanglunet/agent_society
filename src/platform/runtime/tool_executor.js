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
 * - 文件操作：write_file、read_file、list_files、delete_file
 * - 智能体生命周期：spawn_agent_with_task
 * - 组织原语：create_role
 * - 消息通信：send_message
 * 
 * 【与其他模块的关系】
 * - 被 LlmHandler 调用来执行工具
 * - 使用 JavaScriptExecutor 执行 run_javascript
 * - 使用 AgentManager 处理智能体相关工具
 * - 使用 Runtime 的各种服务（org、bus、workspaceManager 等）
 * 
 * @module runtime/tool_executor
 */

import { validateTaskBrief } from "../utils/message/task_brief.js";
import { validateMessageFormat } from "../utils/message/message_validator.js";
import { chat as localllmChat, launchWllamaHeadless } from "../localllm/wllama_headless_launcher.js";

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
              orgPrompt: {
                type: "string",
                description: "可选：用于描述组织架构的提示词。若传入，将被记录在该岗位上；后续由该岗位创建的下级岗位，在未显式传入 orgPrompt 时会默认继承该值。"
              },
              toolGroups: { 
                type: "array", 
                items: { type: "string" },
                description: runtime._generateToolGroupsDescription?.() ?? "工具组标识符列表，限制该岗位可用的工具函数。不指定则使用全部工具组。"
              }
            },
            required: ["name", "rolePrompt"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_org_template_infos",
          description: "列出所有组织架构模板的简介（org/[orgName]/info.md）。只读取 info.md，不读取 org.md。",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function",
        function: {
          name: "get_org_template_org",
          description: "按 orgName 读取组织架构模板的完整内容（org/[orgName]/org.md）。",
          parameters: {
            type: "object",
            properties: {
              orgName: { type: "string", description: "模板目录名（org/[orgName]/）" }
            },
            required: ["orgName"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_org_structure",
          description: "获取组织结构摘要（按工作空间组织区分自己与其他组织）：返回 self（当前智能体信息）、selfOrg（自己组织的岗位与智能体列表）、otherOrgs（其他组织）。每个 role 仅返回 agents[{id,name}]。默认只包含未终止的智能体。",
          parameters: {
            type: "object",
            properties: {
              includeTerminated: {
                type: "boolean",
                description: "是否包含已终止的智能体，默认 false。",
                default: false
              }
            }
          }
        }
      },

      // 创建智能体并发送任务
      {
        type: "function",
        function: {
          name: "spawn_agent_with_task",
          description: "创建智能体实例并立即发送任务消息（二合一接口）。相当于创建智能体 + 发送消息，省去一次工具调用。推荐在需要立即分配任务时使用。",
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
              },
              quickReplies: {
                type: "array",
                items: { type: "string" },
                maxItems: 10,
                description: "可选的快速回复建议列表。这些只是建议选项，收件方可以从中选择一个快速回复，也可以完全忽略这些建议自行编写回复内容。最多10个选项。"
              }
            },
            required: ["to", "payload"]
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
          description: "在浏览器环境中运行 JavaScript 代码。支持异步代码（可使用 await 和返回 Promise）。涉及严格计算/精确数值/统计/日期时间/格式转换等必须可复现的结果时，优先调用本工具用代码计算。每次调用都是全新执行环境（新标签页）。参数 input 会作为变量 input 传入代码。code 必须是函数体形式的代码，需要显式 return 一个可 JSON 序列化的值。支持 Canvas 绘图功能：调用 getCanvas(name, width, height) 获取 Canvas 元素，绘图后图像会自动导出保存为工件，不必再次保存工件。name 参数必选，用于指定工件名称（不是文件名）。",
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
      // 本地 LLM 对话
      {
        type: "function",
        function: {
          name: "localllm_chat",
          description: "通过本机 wllama headless 页面进行对话，返回生成文本字符串。",
          parameters: {
            type: "object",
            properties: {
              messages: {
                type: "array",
                description: "LLM 聊天消息列表（role/content）。",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["system", "user", "assistant"] },
                    content: { type: "string" }
                  },
                  required: ["role", "content"]
                }
              },
              timeoutMs: { type: "number", description: "可选：超时时间（毫秒）。" }
            },
            required: ["messages"]
          }
        }
      },
      // 文件操作
      {
        type: "function",
        function: {
          name: "read_file",
          description: "读取工作空间内的文件内容。支持分段读取大文件。",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string", description: "文件的相对路径" },
              offset: { type: "number", description: "读取起始位置（字节/字符），默认为 0" },
              length: { type: "number", description: "读取长度，默认为 5000。文本文件受字符数限制，二进制受字节数限制。" }
            },
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
              content: { type: "string", description: "文件内容。如果是二进制数据，请提供 Base64 编码字符串。" },
              mimeType: { 
                type: "string", 
                description: "文件的 MIME 类型，如 'text/javascript', 'application/json' 等。" 
              }
            },
            required: ["path", "content","mimeType"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_files",
          description: "列出工作空间内指定目录的文件和子目录信息。",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "目录的相对路径，默认为根目录 '.'" } }
          }
        }
      },
      // 工作空间信息
      {
        type: "function",
        function: {
          name: "get_workspace_info",
          description: "获取当前工作空间的磁盘占用和文件统计信息。",
          parameters: { type: "object", properties: {} }
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
        case "list_org_template_infos":
          return await this._executeListOrgTemplateInfos(ctx);
        case "get_org_template_org":
          return await this._executeGetOrgTemplateOrg(ctx, args);
        case "get_org_structure":
          return this._executeGetOrgStructure(ctx, args);
        case "spawn_agent_with_task":
          return await this._executeSpawnAgentWithTask(ctx, args);
        case "send_message":
          return this._executeSendMessage(ctx, args);
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
        case "localllm_chat":
          return await this._executeLocalllmChat(ctx, args);
        case "read_file":
          return await this._executeReadFile(ctx, args);
        case "write_file":
          return await this._executeWriteFile(ctx, args);
        case "list_files":
          return await this._executeListFiles(ctx, args);
        case "get_workspace_info":
          return await this._executeGetWorkspaceInfo(ctx, args);
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

  _executeGetOrgStructure(ctx, args) {
    const runtime = this.runtime;
    const org = ctx.org;
    const includeTerminated = Boolean(args?.includeTerminated);
    const persistedRoles = org ? org.listRoles() : [];
    const persistedAgents = org ? org.listAgents() : [];
    const agentMetaById = new Map();
    agentMetaById.set("root", { id: "root", name: null });
    agentMetaById.set("user", { id: "user", name: null });

    for (const a of persistedAgents) {
      if (!a || typeof a.id !== "string" || typeof a.roleId !== "string") continue;
      const status = a.status ?? "active";
      if (!includeTerminated && status === "terminated") continue;
      agentMetaById.set(a.id, { id: a.id, name: a.name ?? null });
    }

    const selfAgentId = ctx.agent?.id ?? null;
    const self = selfAgentId
      ? {
          agentId: selfAgentId,
          roleId: ctx.agent?.roleId ?? null,
          roleName: ctx.agent?.roleName ?? null,
          agentName: agentMetaById.get(selfAgentId)?.name ?? null
        }
      : null;

    const workspaceKeyOf = (agentId) => {
      const ws = runtime.findWorkspaceIdForAgent(agentId);
      return ws ?? "null";
    };

    const roleNameByRoleId = new Map(persistedRoles.map((r) => [r.id, r.name]));
    const pushOrgRoleAgentId = (orgKey, roleId, agentId) => {
      let byRole = orgRoleAgentIdsByOrgKey.get(orgKey);
      if (!byRole) {
        byRole = new Map();
        orgRoleAgentIdsByOrgKey.set(orgKey, byRole);
      }
      const list = byRole.get(roleId);
      if (list) list.push(agentId);
      else byRole.set(roleId, [agentId]);
    };

    const orgRoleAgentIdsByOrgKey = new Map();
    pushOrgRoleAgentId(workspaceKeyOf("root"), "root", "root");
    pushOrgRoleAgentId(workspaceKeyOf("user"), "user", "user");
    for (const a of persistedAgents) {
      if (!a || typeof a.id !== "string" || typeof a.roleId !== "string") continue;
      const status = a.status ?? "active";
      if (!includeTerminated && status === "terminated") continue;
      pushOrgRoleAgentId(workspaceKeyOf(a.id), a.roleId, a.id);
    }

    const buildOrg = (orgKey) => {
      const byRole = orgRoleAgentIdsByOrgKey.get(orgKey) ?? new Map();
      const orgRoleIds = Array.from(byRole.keys());
      const outRoles = orgRoleIds.map((roleId) => {
        const ids = byRole.get(roleId) ?? [];
        const name = roleId === "root" || roleId === "user" ? roleId : (roleNameByRoleId.get(roleId) ?? roleId);
        return {
          id: roleId,
          name,
          agents: ids.map((id) => ({ id, name: agentMetaById.get(id)?.name ?? null }))
        };
      });
      const agentIds = [];
      for (const ids of byRole.values()) {
        agentIds.push(...ids);
      }
      return {
        workspaceId: orgKey === "null" ? null : orgKey,
        agentCount: agentIds.length,
        roles: outRoles
      };
    };

    const selfOrgKey = selfAgentId ? workspaceKeyOf(selfAgentId) : "null";
    const selfOrg = buildOrg(selfOrgKey);
    const otherOrgs = Array.from(orgRoleAgentIdsByOrgKey.keys())
      .filter((k) => k !== selfOrgKey)
      .map((k) => buildOrg(k));

    void this.runtime.log?.debug?.("工具调用完成", {
      toolName: "get_org_structure",
      ok: true,
      orgCount: 1 + otherOrgs.length,
      selfAgentId
    });

    return { self, selfOrg, otherOrgs };
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

    const callerRoleId = ctx.agent?.roleId ?? null;
    const callerRole = callerRoleId ? runtime.org.getRole(callerRoleId) : null;
    const inheritedOrgPrompt = callerRole?.orgPrompt ?? null;
    const explicitOrgPrompt =
      typeof args.orgPrompt === "string"
        ? (args.orgPrompt.trim() ? args.orgPrompt : null)
        : undefined;
    const effectiveOrgPrompt = explicitOrgPrompt === undefined ? inheritedOrgPrompt : explicitOrgPrompt;

    const result = await ctx.tools.createRole({ 
      name: args.name, 
      rolePrompt: args.rolePrompt,
      orgPrompt: effectiveOrgPrompt,
      llmServiceId,
      toolGroups: args.toolGroups
    });
    
    if (isRoot && isFromUser && taskId) {
      runtime._rootTaskRoleByTaskId.set(taskId, result.id);
    }
    
    void runtime.log?.debug?.("工具调用完成", { toolName: "create_role", ok: true, roleId: result?.id ?? null });
    return result;
  }



  async _executeSpawnAgentWithTask(ctx, args) {
    const runtime = this.runtime;
    const creatorId = ctx.agent?.id ?? null;
    
    if (!creatorId) return { error: "missing_creator_agent" };
    if (!args.initialMessage) {
      return { error: "missing_initial_message" };
    }
    
    const normalizedInitialMessage =
      typeof args.initialMessage === "string"
        ? { message_type: "task_assignment", text: args.initialMessage }
        : args.initialMessage;
    
    if (!normalizedInitialMessage || typeof normalizedInitialMessage !== "object") {
      return { error: "missing_initial_message" };
    }
    if (typeof args.roleId !== "string" || !args.roleId.trim()) {
      return { error: "roleId_required" };
    }
    if (!runtime.org?.getRole?.(args.roleId)) {
      return { error: "role_not_found" };
    }

    // 验证 taskBrief 参数
    const taskBriefValidation = validateTaskBrief(args.taskBrief);
    if (!taskBriefValidation.valid) {
      return { error: "invalid_task_brief", details: taskBriefValidation.errors };
    }

    // 直接使用底层的 spawnAgentAs 方法创建智能体
    try {
      const agent = await runtime.spawnAgentAs(creatorId, {
        roleId: args.roleId,
        taskBrief: args.taskBrief
      });

      const newAgentId = agent.id;
      const taskId = ctx.currentMessage?.taskId ?? null;

      // 发送任务消息
      const messagePayload = {
        message_type: normalizedInitialMessage.message_type ?? "task_assignment",
        ...normalizedInitialMessage
      };
      
      const createdMeta = runtime.org?.getAgent?.(newAgentId) ?? null;
      const createdName = createdMeta && typeof createdMeta.name === "string" && createdMeta.name.trim() ? createdMeta.name.trim() : null;
      if (createdName && typeof messagePayload.text === "string") {
        messagePayload.text = `${messagePayload.text}\n\n【你的姓名】${createdName}`;
      }

      const sendResult = runtime.bus.send({
        to: newAgentId,
        from: creatorId,
        taskId,
        payload: messagePayload
      });

      void runtime.log?.info?.("spawn_agent_with_task 完成", {
        creatorId,
        newAgentId,
        roleId: agent.roleId,
        messageId: sendResult.messageId,
        taskId
      });

      return {
        id: newAgentId,
        roleId: agent.roleId,
        roleName: agent.roleName,
        messageId: sendResult.messageId
      };
    } catch (error) {
      void runtime.log?.error?.("spawn_agent_with_task 失败", {
        creatorId,
        roleId: args.roleId,
        error: error.message
      });
      return { error: "spawn_failed", message: error.message };
    }
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

    // 验证 quickReplies 参数
    const quickRepliesValidation = this._validateQuickReplies(args.quickReplies);
    if (!quickRepliesValidation.valid) {
      return { 
        error: quickRepliesValidation.error, 
        message: quickRepliesValidation.message 
      };
    }

    // 构建最终的 payload，如果有有效的 quickReplies 则添加到 payload 中
    let finalPayload = args.payload;
    if (quickRepliesValidation.quickReplies) {
      finalPayload = {
        ...args.payload,
        quickReplies: quickRepliesValidation.quickReplies
      };
    }

    const currentTaskId = ctx.currentMessage?.taskId ?? null;
    const result = ctx.tools.sendMessage({
      to: recipientId,
      from: senderId,
      taskId: currentTaskId,
      payload: finalPayload,
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

  /**
   * 验证 quickReplies 参数
   * 
   * @param {any} quickReplies - 快速回复选项
   * @returns {{valid: boolean, quickReplies?: string[], error?: string, message?: string}}
   */
  _validateQuickReplies(quickReplies) {
    // 未提供或空数组，视为有效但忽略
    if (!quickReplies || !Array.isArray(quickReplies) || quickReplies.length === 0) {
      return { valid: true, quickReplies: null };
    }
    
    // 长度检查
    if (quickReplies.length > 10) {
      return { 
        valid: false, 
        error: "quickReplies_too_many", 
        message: "快速回复选项不能超过10个" 
      };
    }
    
    // 元素类型检查
    for (let i = 0; i < quickReplies.length; i++) {
      const item = quickReplies[i];
      if (typeof item !== "string") {
        return { 
          valid: false, 
          error: "quickReplies_invalid_type", 
          message: `快速回复选项[${i}]必须是字符串` 
        };
      }
      if (item.trim() === "") {
        return { 
          valid: false, 
          error: "quickReplies_empty_string", 
          message: `快速回复选项[${i}]不能为空` 
        };
      }
    }
    
    return { valid: true, quickReplies };
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

  async _executeListOrgTemplateInfos(ctx) {
    const runtime = this.runtime;
    if (!runtime.orgTemplates) return { error: "org_templates_not_initialized" };
    const templates = await runtime.orgTemplates.listTemplateInfos();
    return { templates };
  }

  async _executeGetOrgTemplateOrg(ctx, args) {
    const runtime = this.runtime;
    if (!runtime.orgTemplates) return { error: "org_templates_not_initialized" };
    const orgName = args?.orgName;
    if (!orgName || typeof orgName !== "string") {
      return { error: "missing_org_name", message: "必须提供 orgName 参数" };
    }
    try {
      const orgMd = await runtime.orgTemplates.readOrg(orgName);
      return { orgName, orgMd };
    } catch (err) {
      if (err && (err.code === "INVALID_ORG_NAME" || err.code === "ENOENT")) {
        return { error: "org_template_not_found", orgName };
      }
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      return { error: "org_template_read_failed", orgName, message };
    }
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
      timeoutMs: args.timeoutMs,
      signal: runtime._cancelManager?.getSignal(agentId) ?? null
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

  async _executeLocalllmChat(ctx, args) {
    const runtime = this.runtime;
    const messages = args?.messages;
    const timeoutMs = args?.timeoutMs;

    if (!Array.isArray(messages)) {
      return { error: "missing_messages", message: "必须提供 messages 数组" };
    }

    try {
      const startResult = await launchWllamaHeadless({
        port: runtime.config?.httpPort ?? 3000,
        headless: true,
        logger: runtime.loggerRoot?.forModule?.("localllm") ?? null
      });

      if (!startResult?.ok) {
        return { error: "localllm_not_ready", message: startResult?.error ?? "wllama headless 启动失败" };
      }

      if (startResult?.skipped) {
        return { error: "localllm_not_ready", message: "wllama headless 启动被禁用" };
      }

      const text = await localllmChat(messages, { timeoutMs });
      return String(text ?? "");
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      return { error: "localllm_chat_failed", message };
    }
  }

  async _executeReadFile(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    const ws = await runtime.workspaceManager.getWorkspace(workspaceId);
    return await ws.readFile(args.path, { offset: args.offset, length: args.length });
  }

  async _executeWriteFile(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    
    const ws = await runtime.workspaceManager.getWorkspace(workspaceId);
    const result = await ws.writeFile(args.path, args.content, { 
      mimeType: args.mimeType,
      agentId: ctx.agent?.id,
      messageId: ctx.currentMessage?.id
    });
    
    return { 
      ok: true, 
      path: args.path,
      size: result.size,
      mimeType: result.mimeType
    };
  }

  async _executeListFiles(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    const ws = await runtime.workspaceManager.getWorkspace(workspaceId);
    return await ws.listFiles(args.path ?? ".");
  }

  async _executeGetWorkspaceInfo(ctx, args) {
    const runtime = this.runtime;
    const workspaceId = runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return { error: "workspace_not_assigned", message: "当前智能体未分配工作空间" };
    }
    const ws = await runtime.workspaceManager.getWorkspace(workspaceId);
    return await ws.getDiskUsage();
  }
}
