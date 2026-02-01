/**
 * 智能体管理器模块
 * 
 * 本模块负责智能体的生命周期管理，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 智能体是系统的核心执行单元，需要统一管理其创建、注册、状态跟踪和终止。
 * 将这些功能集中到一个模块，便于维护智能体的一致性和完整性。
 * 
 * 【主要功能】
 * 1. 创建和注册智能体实例
 * 2. 管理智能体的父子关系
 * 3. 跟踪智能体的活动状态
 * 4. 终止智能体（包括级联终止子智能体）
 * 5. 从持久化状态恢复智能体
 * 
 * 【智能体生命周期】
 * 1. 创建：通过 spawnAgent/spawnAgentAs 创建
 * 2. 注册：registerAgentInstance 注册到运行时
 * 3. 活动：处理消息，更新活动时间
 * 4. 终止：terminateAgent 终止并清理资源
 * 
 * 【与其他模块的关系】
 * - 被 ToolExecutor 调用来处理 spawn_agent_with_task、terminate_agent 等工具
 * - 使用 Runtime 的 org 管理组织状态
 * - 使用 Runtime 的 bus 发送消息
 * - 使用 Runtime 的 workspaceManager 管理工作空间
 * 
 * @module runtime/agent_manager
 */

import { Agent } from "../../agents/agent.js";
import { chat as wllamaChat } from "../localllm/wllama_headless_launcher.js";

/**
 * 智能体管理器类
 * 
 * 负责智能体的完整生命周期管理。
 */
export class AgentManager {
  /**
   * 创建智能体管理器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
    this._nameGenerationChain = Promise.resolve();
  }

  /**
   * 创建并注册智能体实例
   * 
   * 【创建流程】
   * 1. 验证 parentAgentId 参数
   * 2. 在组织中创建智能体记录
   * 3. 获取岗位信息和行为工厂
   * 4. 创建 Agent 实例
   * 5. 注册到运行时
   * 6. 为 root 的直接子智能体分配工作空间
   * 
   * @param {object} input - 创建参数
   * @param {string} input.roleId - 岗位ID
   * @param {string} input.parentAgentId - 父智能体ID（必填）
   * @returns {Promise<Agent>} 创建的智能体实例
   * @throws {Error} 如果 parentAgentId 缺失
   */
  async spawnAgent(input) {
    const runtime = this.runtime;
    
    // 验证 parentAgentId
    if (
      !input ||
      typeof input.parentAgentId !== "string" ||
      input.parentAgentId.length === 0 ||
      input.parentAgentId === "null" ||
      input.parentAgentId === "undefined"
    ) {
      throw new Error("parentAgentId_required");
    }

    if (typeof input.roleId !== "string" || !input.roleId.trim()) {
      throw new Error("roleId_required");
    }

    if (!runtime.org?.getRole?.(input.roleId)) {
      throw new Error("role_not_found");
    }
    
    const role = runtime.org.getRole(input.roleId);
    const roleName = role?.name ?? "unknown";
    const name = await this._generateNameForRole({ roleName });
    
    // 在组织中创建智能体记录（包含姓名）
    const meta = await runtime.org.createAgent({ ...input, name });
    
    // 获取行为工厂或使用默认 LLM 行为
    const behaviorFactory = runtime._behaviorRegistry.get(roleName);
    const behavior = behaviorFactory
      ? behaviorFactory(runtime._buildAgentContext())
      : async (ctx, message) => {
          // 默认行为：使用 LLM 处理
          return await runtime._handleWithLlm(ctx, message);
        };
    
    // 创建智能体实例
    const agent = new Agent({
      id: meta.id,
      roleId: meta.roleId,
      roleName,
      rolePrompt: role?.rolePrompt ?? "",
      behavior
    });
    
    // 注册智能体
    this.registerAgentInstance(agent);
    runtime._agentMetaById.set(agent.id, { 
      id: meta.id, 
      roleId: meta.roleId, 
      parentAgentId: meta.parentAgentId ?? null 
    });
    
    if (input?.taskBrief && typeof input.taskBrief === "object") {
      runtime._state?.setAgentTaskBrief?.(agent.id, input.taskBrief);
    }
    
    // 初始化活动时间
    runtime._agentLastActivityTime.set(agent.id, Date.now());
    
    // 工作空间处理：只有 root 的直接子智能体需要分配工作空间
    if (input.parentAgentId === "root") {
      const workspaceId = agent.id;
      // 触发工作空间分配
      await runtime.workspaceManager.getWorkspace(workspaceId);
      void runtime.log?.info?.("为智能体分配工作空间", {
        agentId: agent.id,
        workspaceId
      });
    }
    
    void runtime.log?.info?.("创建智能体实例", {
      id: agent.id,
      roleId: agent.roleId,
      roleName: agent.roleName,
      parentAgentId: meta.parentAgentId ?? null,
      name: meta?.name ?? null
    });
    
    // 记录生命周期事件
    void runtime.loggerRoot?.logAgentLifecycleEvent?.("agent_created", {
      agentId: agent.id,
      roleId: agent.roleId,
      roleName: agent.roleName,
      parentAgentId: meta.parentAgentId ?? null,
      name: meta?.name ?? null
    });
    
    return agent;
  }

  /**
   * 生成一个不重名的人名，用于新智能体的元数据初始化。
   * @param {{roleName:string}} input
   * @returns {Promise<string|null>}
   */
  async _generateNameForRole({ roleName }) {
    const runtime = this.runtime;
    const logPrefix = "[NameGeneration]";
    
    void runtime.log?.info?.(`${logPrefix} 开始生成智能体姓名`, {
      roleName,
      timestamp: Date.now()
    });
    
    const buildExistingNamesSnapshot = () => {
      const existing = new Set(["root", "user"]);
      const agents = runtime?.org?.listAgents?.() ?? [];
      void runtime.log?.info?.(`${logPrefix} 获取已存在智能体列表`, {
        totalAgents: agents.length
      });
      
      for (const a of agents) {
        if (!a || typeof a.id !== "string") {
          void runtime.log?.info?.(`${logPrefix} 跳过无效智能体记录`, { agent: a });
          continue;
        }
        if (a.status === "terminated") {
          void runtime.log?.info?.(`${logPrefix} 跳过已终止智能体`, { agentId: a.id });
          continue;
        }
        if (typeof a.name === "string" && a.name.trim()) {
          existing.add(a.name.trim());
        } else {
          void runtime.log?.info?.(`${logPrefix} 智能体缺少姓名，使用ID作为占位`, { 
            agentId: a.id,
            rawName: a.name 
          });
          existing.add(a.id);
        }
      }
      const result = Array.from(existing);
      void runtime.log?.info?.(`${logPrefix} 已存在名字列表构建完成`, {
        count: result.length,
        names: result.slice(0, 20)
      });
      return result;
    };

    const runOnce = async (syncAttempts = 15) => {
      const existingNames = buildExistingNamesSnapshot();
      void runtime.log?.info?.(`${logPrefix} 调用名字生成器`, {
        roleName,
        existingNamesCount: existingNames.length,
        syncAttempts
      });
      const name = await this._generateUniqueHumanName({ roleName, existingNames, maxAttempts: syncAttempts });
      return name;
    };

    const task = this._nameGenerationChain.then(() => runOnce(5), () => runOnce(5));
    this._nameGenerationChain = task.catch(() => {});

    try {
      const name = await task;
      if (name) {
        void runtime.log?.info?.(`${logPrefix} 智能体姓名生成成功`, {
          roleName,
          generatedName: name
        });
        return name;
      }
      
      // 同步尝试失败，启动异步后台重试
      void runtime.log?.warn?.(`${logPrefix} 同步尝试未生成有效名字，启动异步后台重试`, {
        roleName
      });
      
      // 异步重试，不阻塞主流程
      this._asyncRetryNameGeneration({ roleName });
      
      return null;
    } catch (err) {
      void runtime.log?.error?.(`${logPrefix} 智能体姓名生成异常`, {
        roleName,
        error: err?.message ?? String(err),
        stack: err?.stack ?? null,
        errorType: err?.constructor?.name ?? "Unknown"
      });
      return null;
    }
  }

  /**
   * 异步后台重试名字生成
   * 当同步尝试失败后，在后台继续尝试生成名字并更新智能体
   */
  async _asyncRetryNameGeneration({ roleName, maxAsyncAttempts = 20 }) {
    const runtime = this.runtime;
    const logPrefix = "[NameGeneration]";
    
    void runtime.log?.info?.(`${logPrefix} 开始异步后台重试`, {
      roleName,
      maxAsyncAttempts
    });
    
    // 延迟一点时间再开始，避免与当前操作冲突
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const buildExistingNamesSnapshot = () => {
      const existing = new Set(["root", "user"]);
      const agents = runtime?.org?.listAgents?.() ?? [];
      for (const a of agents) {
        if (!a || typeof a.id !== "string") continue;
        if (a.status === "terminated") continue;
        if (typeof a.name === "string" && a.name.trim()) {
          existing.add(a.name.trim());
        } else {
          existing.add(a.id);
        }
      }
      return Array.from(existing);
    };
    
    for (let attempt = 1; attempt <= maxAsyncAttempts; attempt++) {
      void runtime.log?.info?.(`${logPrefix} 异步重试第${attempt}次`, { roleName });
      
      const existingNames = buildExistingNamesSnapshot();
      const name = await this._generateUniqueHumanName({ 
        roleName, 
        existingNames, 
        maxAttempts: 15,
        asyncAttempt: attempt 
      });
      
      if (name) {
        void runtime.log?.info?.(`${logPrefix} 异步重试成功`, {
          roleName,
          generatedName: name,
          asyncAttempt: attempt
        });
        
        // 找到最近创建的需要名字的智能体并更新
        const agents = runtime?.org?.listAgents?.() ?? [];
        const targetAgent = agents
          .filter(a => a.status !== "terminated" && (!a.name || a.name === roleName))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        
        if (targetAgent) {
          try {
            await runtime?.org?.setAgentName?.(targetAgent.id, name);
            void runtime.log?.info?.(`${logPrefix} 已异步更新智能体姓名`, {
              agentId: targetAgent.id,
              name
            });
          } catch (e) {
            void runtime.log?.warn?.(`${logPrefix} 异步更新智能体姓名失败`, {
              agentId: targetAgent.id,
              error: e?.message
            });
          }
        }
        return name;
      }
      
      // 每次重试间隔递增
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
    
    void runtime.log?.warn?.(`${logPrefix} 异步后台重试全部失败`, {
      roleName,
      totalAsyncAttempts: maxAsyncAttempts
    });
    return null;
  }

  async _generateUniqueHumanName({ roleName, existingNames, maxAttempts = 15, asyncAttempt = 0 }) {
    const runtime = this.runtime;
    const logPrefix = "[NameGeneration]";
    
    const used = new Set((existingNames ?? []).map((s) => String(s ?? "").trim()).filter(Boolean));
    void runtime.log?.info?.(`${logPrefix} 开始唯一名字生成`, {
      roleName,
      usedNamesCount: used.size,
      usedNamesSample: Array.from(used).slice(0, 10),
      maxAttempts
    });
    
    // 常见姓氏列表，用于提示词
    const commonSurnames = [
      "王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴",
      "徐", "孙", "马", "朱", "胡", "郭", "林", "何", "高", "罗",
      "郑", "梁", "谢", "宋", "唐", "许", "韩", "冯", "邓", "曹",
      "彭", "曾", "肖", "田", "董", "袁", "潘", "于", "蒋", "蔡"
    ];
    
    // 随机选择一部分姓氏作为推荐
    const shuffledSurnames = [...commonSurnames].sort(() => Math.random() - 0.5);
    const suggestedSurnames = shuffledSurnames.slice(0, 8).join("、");
    
    // 动态生成种子，用于促使生成差异更大的名字
    const dynamicSeed = Date.now() + asyncAttempt * 1000 + Math.floor(Math.random() * 1000);
    
    const baseSystemPrompt =
      `你负责为新创建的智能体生成一个人名。只输出名字本身，不要解释，不要引号，不要标点，不要换行以外的内容。\n\n` +
      `【严格要求】\n` +
      `1. 必须是中文人名，2到4个汉字\n` +
      `2. 不能与已存在名字重复\n` +
      `3. 绝对不能是岗位名称，不要把岗位名称回复回来\n` +
      `4. 必须是真正的人名（姓名），如"张伟"、"李芳"等\n\n` +
      `【推荐姓氏】\n` +
      `推荐使用以下常见姓氏：${suggestedSurnames}\n\n` +
      `【生成策略】\n` +
      `每次尝试使用不同的姓氏和名字组合，确保多样性。\n` +
      `回复格式：直接输出姓名，不要添加任何其他内容。`;

    let lastBad = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 动态变化：每次尝试使用不同的策略提示
      const strategyHints = [
        "尝试使用一个不同的姓氏",
        "尝试使用另一个姓氏组合",
        "尝试使用更常见的名字",
        "尝试使用简洁的两字姓名",
        "尝试使用三字姓名",
        "尝试使用三字姓名和生僻字",
        "尝试使用两字姓名和生僻字",
        "尝试使用三字姓名和叠字"
      ];
      const currentStrategy = strategyHints[attempt % strategyHints.length];
      
      void runtime.log?.info?.(`${logPrefix} 第${attempt + 1}次尝试生成名字`, {
        roleName,
        attempt: attempt + 1,
        maxAttempts,
        lastBadReason: lastBad,
        strategy: currentStrategy,
        dynamicSeed
      });
      
      const userPromptLines = [
        `岗位名称：${String(roleName ?? "").trim() || "未知"}`,
        `已存在名字（禁止重复）：${Array.from(used).slice(0, 200).join("、") || "无"}`,
        `本次生成策略：${currentStrategy}`,
        `推荐可用姓氏：${suggestedSurnames}`,
        lastBad ? `上次输出不合格原因：${lastBad}` : null,
        `随机种子：${dynamicSeed + attempt}`,
        "请生成一个新名字（只需输出姓名本身）："
      ].filter(Boolean);

      const messages = [
        { role: "system", content: baseSystemPrompt },
        { role: "user", content: userPromptLines.join("\n") }
      ];
      
      void runtime.log?.info?.(`${logPrefix} 准备调用模型`, {
        attempt: attempt + 1,
        messagesCount: messages.length,
        strategy: currentStrategy
      });

      let raw = "";
      try {
        const chatFn = runtime?.localLlmChat ?? wllamaChat;
        const callStartTime = Date.now();
        raw = await chatFn(messages, { timeoutMs: 60000 });
        const callDuration = Date.now() - callStartTime;
        void runtime.log?.info?.(`${logPrefix} 模型调用完成`, {
          attempt: attempt + 1,
          durationMs: callDuration,
          rawResponse: raw,
          rawResponseLength: raw?.length ?? 0
        });
      } catch (e) {
        lastBad = `模型调用失败：${e?.message ?? String(e)}`;
        void runtime.log?.warn?.(`${logPrefix} 模型调用异常`, {
          attempt: attempt + 1,
          error: e?.message ?? String(e),
          errorType: e?.constructor?.name ?? "Unknown"
        });
        continue;
      }

      const name = this._sanitizeHumanName(raw);
      void runtime.log?.info?.(`${logPrefix} 名字清理完成`, {
        attempt: attempt + 1,
        rawInput: raw,
        sanitizedOutput: name
      });
      
      if (!name) {
        lastBad = "输出为空或无法解析";
        void runtime.log?.info?.(`${logPrefix} 名字验证失败：输出为空`, {
          attempt: attempt + 1,
          raw: raw
        });
        continue;
      }
      if (name === roleName) {
        lastBad = `输出与岗位名称相同：${name}`;
        void runtime.log?.info?.(`${logPrefix} 名字验证失败：与岗位名称相同`, {
          attempt: attempt + 1,
          generatedName: name,
          roleName
        });
        continue;
      }
      if (!this._isValidChineseHumanName(name)) {
        lastBad = `输出不符合中文人名要求：${name}`;
        void runtime.log?.info?.(`${logPrefix} 名字验证失败：不符合中文人名要求`, {
          attempt: attempt + 1,
          generatedName: name,
          nameLength: name.length,
          isChinese: /^[\u4e00-\u9fff]+$/.test(name)
        });
        continue;
      }
      if (used.has(name)) {
        lastBad = `输出与已存在名字重复：${name}`;
        void runtime.log?.info?.(`${logPrefix} 名字验证失败：与已存在名字重复`, {
          attempt: attempt + 1,
          generatedName: name
        });
        continue;
      }
      
      void runtime.log?.info?.(`${logPrefix} 名字验证通过`, {
        attempt: attempt + 1,
        finalName: name
      });
      return name;
    }
    
    void runtime.log?.warn?.(`${logPrefix} 所有同步尝试均失败，无法生成有效名字`, {
      roleName,
      totalAttempts: maxAttempts,
      lastBadReason: lastBad
    });
    return null;
  }

  _sanitizeHumanName(raw) {
    const runtime = this.runtime;
    const logPrefix = "[NameGeneration]";
    
    const s = typeof raw === "string" ? raw : String(raw ?? "");
    void runtime?.log?.info?.(`${logPrefix} 开始清理名字`, {
      rawInput: raw,
      rawType: typeof raw
    });
    
    const firstLine = s.split(/\r?\n/)[0] ?? "";
    const trimmed = firstLine.trim();
    const unquoted = trimmed.replace(/^["'""''']+|["'""''']+$/g, "").trim();
    const noPunct = unquoted.replace(/[，。,\.!！?？;；:：\s]/g, "");
    const result = noPunct.trim() || null;
    
    void runtime?.log?.info?.(`${logPrefix} 名字清理步骤`, {
      step1_firstLine: firstLine,
      step2_trimmed: trimmed,
      step3_unquoted: unquoted,
      step4_noPunct: noPunct,
      finalResult: result
    });
    
    return result;
  }

  _isValidChineseHumanName(name) {
    const runtime = this.runtime;
    const logPrefix = "[NameGeneration]";
    
    if (typeof name !== "string") {
      void runtime.log?.info?.(`${logPrefix} 名字验证：类型不符`, {
        name,
        type: typeof name
      });
      return false;
    }
    
    const s = name.trim();
    if (s.length < 2 || s.length > 4) {
      void runtime.log?.info?.(`${logPrefix} 名字验证：长度不符`, {
        name: s,
        length: s.length
      });
      return false;
    }
    
    const isChinese = /^[\u4e00-\u9fff]+$/.test(s);
    if (!isChinese) {
      void runtime.log?.info?.(`${logPrefix} 名字验证：非纯中文字符`, {
        name: s,
        charCodes: s.split("").map(c => c.charCodeAt(0).toString(16))
      });
    }
    
    return isChinese;
  }


  /**
   * 以调用者身份创建子智能体
   * 
   * parentAgentId 由系统自动填充为调用者的 ID。
   * 
   * @param {string} callerAgentId - 调用者智能体ID
   * @param {object} input - 创建参数
   * @param {string} input.roleId - 岗位ID
   * @returns {Promise<Agent>} 创建的智能体实例
   * @throws {Error} 如果 parentAgentId 与调用者不匹配
   */
  async spawnAgentAs(callerAgentId, input) {
    const rawParent = input?.parentAgentId;
    const missingParent = rawParent === null || rawParent === undefined || rawParent === "" || rawParent === "null" || rawParent === "undefined";
    
    if (!missingParent && String(rawParent) !== String(callerAgentId)) {
      throw new Error("invalid_parentAgentId");
    }
    
    return await this.spawnAgent({ 
      roleId: input.roleId, 
      parentAgentId: callerAgentId,
      taskBrief: input?.taskBrief
    });
  }

  /**
   * 注册智能体实例到运行时
   * 
   * @param {Agent} agent - 智能体实例
   */
  registerAgentInstance(agent) {
    this.runtime._agents.set(agent.id, agent);
  }

  /**
   * 列出所有已注册的智能体实例
   * 
   * @returns {{id: string, roleId: string, roleName: string}[]} 智能体信息数组
   */
  listAgentInstances() {
    return Array.from(this.runtime._agents.values()).map((a) => ({
      id: a.id,
      roleId: a.roleId,
      roleName: a.roleName
    }));
  }

  /**
   * 获取智能体状态信息
   * 
   * @param {string} agentId - 智能体ID
   * @returns {object|null} 智能体状态，不存在则返回 null
   */
  getAgentStatus(agentId) {
    const runtime = this.runtime;
    const agent = runtime._agents.get(agentId);
    if (!agent) {
      return null;
    }
    
    const meta = runtime._agentMetaById.get(agentId);
    const queueDepth = runtime.bus.getQueueDepth(agentId);
    const conversation = runtime._conversations.get(agentId);
    const conversationLength = conversation ? conversation.length : 0;
    
    return {
      id: agent.id,
      roleId: agent.roleId,
      roleName: agent.roleName,
      parentAgentId: meta?.parentAgentId ?? null,
      status: "active",
      queueDepth,
      conversationLength
    };
  }

  /**
   * 终止智能体
   * 
   * 【终止流程】
   * 1. 验证调用者权限（只能终止自己的子智能体）
   * 2. 收集所有需要终止的智能体（包括级联终止的后代）
   * 3. 处理待处理消息
   * 4. 清理运行时状态
   * 5. 持久化终止事件
   * 
   * @param {object} ctx - 执行上下文
   * @param {object} args - 终止参数
   * @param {string} args.agentId - 要终止的智能体ID
   * @param {string} [args.reason] - 终止原因
   * @returns {Promise<{ok?: boolean, terminatedAgentId?: string, error?: string}>}
   */
  async terminateAgent(ctx, args) {
    const runtime = this.runtime;
    const callerId = ctx.agent?.id ?? null;
    const targetId = args?.agentId;

    if (!callerId) {
      return { error: "missing_caller_agent" };
    }

    if (!targetId || typeof targetId !== "string") {
      return { error: "missing_agent_id" };
    }

    // 验证目标智能体是否存在
    if (!runtime._agents.has(targetId)) {
      void runtime.log?.warn?.("terminate_agent 目标智能体不存在", { callerId, targetId });
      return { error: "agent_not_found", agentId: targetId };
    }

    // 验证是否为子智能体
    const targetMeta = runtime._agentMetaById.get(targetId);
    if (!targetMeta || targetMeta.parentAgentId !== callerId) {
      void runtime.log?.warn?.("terminate_agent 权限验证失败：非子智能体", {
        callerId,
        targetId,
        targetParentAgentId: targetMeta?.parentAgentId ?? null
      });
      return { error: "not_child_agent", message: "只能终止自己创建的子智能体" };
    }

    void runtime.log?.info?.("开始终止智能体", { callerId, targetId, reason: args.reason ?? null });

    // 收集所有需要终止的智能体
    const agentsToTerminate = this.collectDescendantAgents(targetId);
    agentsToTerminate.unshift(targetId);

    // 处理待处理消息
    for (const agentId of agentsToTerminate) {
      await this._drainAgentQueue(agentId);
    }

    // 清理运行时状态（从子到父的顺序）
    for (const agentId of agentsToTerminate.reverse()) {
      runtime._agents.delete(agentId);
      runtime._conversations.delete(agentId);
      void runtime._conversationManager?.deletePersistedConversation?.(agentId);
      runtime._agentMetaById.delete(agentId);
      runtime._agentTaskBriefs.delete(agentId);
      runtime._agentLastActivityTime.delete(agentId);
      runtime._idleWarningEmitted?.delete(agentId);
    }

    // 持久化终止事件
    await runtime.org.recordTermination(targetId, callerId, args.reason);

    void runtime.log?.info?.("智能体终止完成", { callerId, targetId });
    
    // 记录生命周期事件
    void runtime.loggerRoot?.logAgentLifecycleEvent?.("agent_terminated", {
      agentId: targetId,
      terminatedBy: callerId,
      reason: args.reason ?? null
    });

    return { ok: true, terminatedAgentId: targetId };
  }

  /**
   * 从组织状态恢复智能体实例
   * 
   * 在服务器重启后调用，确保之前创建的智能体能够继续处理消息。
   * 
   * @returns {Promise<void>}
   */
  async restoreAgentsFromOrg() {
    const runtime = this.runtime;
    const agentMetas = runtime.org.listAgents();
    let restoredCount = 0;
    let skippedCount = 0;

    for (const meta of agentMetas) {
      // 跳过已终止的智能体
      if (meta.status === "terminated") {
        skippedCount++;
        continue;
      }

      // 跳过已经注册的智能体
      if (runtime._agents.has(meta.id)) {
        continue;
      }

      // 获取岗位信息
      const role = runtime.org.getRole(meta.roleId);
      if (!role) {
        void runtime.log?.warn?.("恢复智能体失败：岗位不存在", { agentId: meta.id, roleId: meta.roleId });
        skippedCount++;
        continue;
      }

      // 创建智能体实例
      const roleName = role.name ?? "unknown";
      const behaviorFactory = runtime._behaviorRegistry.get(roleName);
      const behavior = behaviorFactory
        ? behaviorFactory(runtime._buildAgentContext())
        : async () => {};

      const agent = new Agent({
        id: meta.id,
        roleId: meta.roleId,
        roleName,
        rolePrompt: role.rolePrompt ?? "",
        behavior
      });

      this.registerAgentInstance(agent);
      runtime._agentMetaById.set(agent.id, { 
        id: meta.id, 
        roleId: meta.roleId, 
        parentAgentId: meta.parentAgentId ?? null 
      });
      runtime._agentLastActivityTime.set(agent.id, Date.now());
      restoredCount++;

      if (meta.parentAgentId === "root") {
        await runtime.workspaceManager.createWorkspace(agent.id);
        void runtime.log?.info?.("为恢复的智能体分配工作空间", {
          agentId: agent.id,
          workspaceId: agent.id
        });
      }

      void runtime.log?.debug?.("恢复智能体实例", {
        id: agent.id,
        roleId: agent.roleId,
        roleName: agent.roleName,
        parentAgentId: meta.parentAgentId ?? null
      });
    }

    if (restoredCount > 0 || skippedCount > 0) {
      void runtime.log?.info?.("智能体恢复完成", { 
        restored: restoredCount, 
        skipped: skippedCount,
        total: runtime._agents.size 
      });
    }
  }

  /**
   * 通过祖先链查找智能体的工作空间ID
   * 
   * @param {string} agentId - 智能体ID
   * @returns {string|null} 工作空间ID
   */
  findWorkspaceIdForAgent(agentId) {
    const runtime = this.runtime;
    let currentAgentId = agentId;
    
    while (currentAgentId && currentAgentId !== "user") {
      if (runtime.workspaceManager.checkWorkspaceExists(currentAgentId)) {
        return currentAgentId;
      }
      
      const meta = runtime._agentMetaById.get(currentAgentId);
      if (!meta || !meta.parentAgentId) {
        break;
      }
      currentAgentId = meta.parentAgentId;
    }
    
    return null;
  }

  /**
   * 获取智能体所属的 taskId
   * 
   * @param {string} agentId - 智能体ID
   * @returns {string|null} taskId
   */
  getAgentTaskId(agentId) {
    const runtime = this.runtime;
    
    if (agentId === "root" || agentId === "user") {
      return null;
    }
    
    // 查找该智能体是否是某个 task 的入口智能体
    for (const [taskId, agentInfo] of runtime._rootTaskAgentByTaskId.entries()) {
      if (agentInfo.id === agentId) {
        return taskId;
      }
    }
    
    // 追溯父链
    let currentId = agentId;
    const visited = new Set();
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      
      for (const [taskId, agentInfo] of runtime._rootTaskAgentByTaskId.entries()) {
        if (agentInfo.id === currentId) {
          return taskId;
        }
      }
      
      const meta = runtime._agentMetaById.get(currentId);
      if (!meta || !meta.parentAgentId || meta.parentAgentId === "root") {
        break;
      }
      currentId = meta.parentAgentId;
    }
    
    return null;
  }

  /**
   * 收集指定智能体的所有后代智能体ID
   * 
   * @param {string} parentId - 父智能体ID
   * @returns {string[]} 后代智能体ID数组
   */
  collectDescendantAgents(parentId) {
    const runtime = this.runtime;
    const descendants = [];
    
    for (const [agentId, meta] of runtime._agentMetaById) {
      if (meta.parentAgentId === parentId) {
        descendants.push(agentId);
        const grandchildren = this.collectDescendantAgents(agentId);
        descendants.push(...grandchildren);
      }
    }
    
    return descendants;
  }

  /**
   * 更新智能体的最后活动时间
   * 
   * @param {string} agentId - 智能体ID
   */
  updateAgentActivity(agentId) {
    this.runtime._agentLastActivityTime.set(agentId, Date.now());
    this.runtime._idleWarningEmitted?.delete(agentId);
  }

  /**
   * 获取智能体的最后活动时间
   * 
   * @param {string} agentId - 智能体ID
   * @returns {number|null} 时间戳（毫秒）
   */
  getAgentLastActivityTime(agentId) {
    return this.runtime._agentLastActivityTime.get(agentId) ?? null;
  }

  /**
   * 获取智能体的空闲时长
   * 
   * @param {string} agentId - 智能体ID
   * @returns {number|null} 空闲时长（毫秒）
   */
  getAgentIdleTime(agentId) {
    const lastActivity = this.runtime._agentLastActivityTime.get(agentId);
    if (lastActivity === undefined) {
      return null;
    }
    return Date.now() - lastActivity;
  }

  /**
   * 检查所有智能体的空闲状态
   * 
   * @returns {{agentId: string, idleTimeMs: number}[]} 空闲超时的智能体列表
   */
  checkIdleAgents() {
    const runtime = this.runtime;
    const idleAgents = [];
    const now = Date.now();
    
    for (const agentId of runtime._agents.keys()) {
      const lastActivity = runtime._agentLastActivityTime.get(agentId);
      if (lastActivity === undefined) continue;
      
      const idleTimeMs = now - lastActivity;
      if (idleTimeMs > runtime.idleWarningMs) {
        idleAgents.push({ agentId, idleTimeMs });
        
        if (!runtime._idleWarningEmitted?.has(agentId)) {
          runtime._idleWarningEmitted?.add(agentId);
          void runtime.log?.warn?.("智能体空闲超时", {
            agentId,
            idleTimeMs,
            idleWarningMs: runtime.idleWarningMs
          });
        }
      }
    }
    
    return idleAgents;
  }

  /**
   * 处理智能体队列中的待处理消息（终止前调用）
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Promise<void>}
   * @private
   */
  async _drainAgentQueue(agentId) {
    const runtime = this.runtime;
    const agent = runtime._agents.get(agentId);
    if (!agent) return;

    let processedCount = 0;
    const maxDrainMessages = 100;

    while (processedCount < maxDrainMessages) {
      const msg = runtime.bus.receiveNext(agentId);
      if (!msg) break;

      processedCount += 1;
      void runtime.log?.debug?.("终止前处理消息", {
        agentId,
        messageId: msg.id,
        from: msg.from,
        processedCount
      });

      try {
        await agent.onMessage(runtime._buildAgentContext(agent), msg);
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        void runtime.log?.error?.("终止前消息处理失败", { agentId, messageId: msg.id, message });
      }
    }

    if (processedCount > 0) {
      void runtime.log?.info?.("终止前消息处理完成", { agentId, processedCount });
    }
  }
}
