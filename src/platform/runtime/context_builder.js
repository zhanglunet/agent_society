/**
 * 上下文构建器模块
 * 
 * 本模块负责构建智能体执行所需的各种上下文信息，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 智能体在处理消息时需要各种上下文信息：系统提示词、消息格式化、会话历史等。
 * 将这些上下文构建逻辑集中到一个模块，便于维护和扩展。
 * 
 * 【主要功能】
 * 1. 构建智能体的系统提示词（包含岗位职责、任务委托书、联系人等）
 * 2. 格式化消息为 LLM 可理解的文本
 * 3. 管理会话上下文
 * 4. 构建智能体执行上下文对象
 * 
 * 【使用流程】
 * 1. 智能体收到消息时，LlmHandler 调用 ContextBuilder
 * 2. ContextBuilder 构建系统提示词和格式化消息
 * 3. 将构建好的上下文传递给 LLM 进行处理
 * 
 * 【与其他模块的关系】
 * - 被 LlmHandler 调用来构建 LLM 调用所需的上下文
 * - 使用 Runtime 的 org、contactManager 等获取智能体信息
 * - 使用 PromptLoader 加载提示词模板
 * 
 * @module runtime/context_builder
 */

import { formatTaskBrief } from "../utils/message/task_brief.js";
import { formatMessageForAgent } from "../utils/message/message_formatter.js";

/**
 * 上下文构建器类
 * 
 * 负责构建智能体执行所需的各种上下文信息。
 */
export class ContextBuilder {
  /**
   * 创建上下文构建器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 构建智能体的系统提示词
   * 
   * 【提示词组成】
   * 1. 基础提示词（base.txt）
   * 2. 岗位提示词（rolePrompt）
   * 3. 运行时信息（agentId、parentAgentId）
   * 4. 任务委托书（TaskBrief）
   * 5. 联系人列表
   * 6. 工具调用规则（tool_rules.txt）
   * 
   * 【特殊处理】
   * - root 智能体只使用岗位提示词和运行时信息
   * - 普通智能体使用完整的组合提示词
   * 
   * @param {object} ctx - 智能体上下文
   * @returns {string} 构建好的系统提示词
   */
  buildSystemPromptForAgent(ctx) {
    const toolRules = ctx.systemToolRules ? "\n\n" + ctx.systemToolRules : "";
    const agentId = ctx.agent?.id ?? "";
    const parentAgentId = this.runtime._agentMetaById.get(agentId)?.parentAgentId ?? null;
    const runtimeInfo = `\n\n【运行时信息】\nagentId=${agentId}\nparentAgentId=${parentAgentId ?? ""}`;

    // root 智能体使用简化的提示词
    if (ctx.agent?.id === "root") {
      const rootPrompt = ctx.agent?.rolePrompt ?? "";
      return rootPrompt + runtimeInfo;
    }

    const base = ctx.systemBasePrompt ?? "";
    const role = ctx.agent?.rolePrompt ?? "";
    
    // 获取并格式化 TaskBrief
    const taskBrief = this.runtime._agentTaskBriefs.get(agentId);
    const taskBriefText = taskBrief ? "\n\n" + formatTaskBrief(taskBrief) : "";
    
    // 获取联系人列表信息
    const contacts = this.runtime.contactManager.listContacts(agentId);
    let contactsText = "";
    if (contacts && contacts.length > 0) {
      const contactLines = contacts.map(c => `- ${c.role}（${c.id}）`);
      contactsText = `\n\n【联系人列表】\n${contactLines.join('\n')}`;
    }
    
    // 使用模板组合提示词
    const composed = ctx.tools.composePrompt({
      base,
      composeTemplate: ctx.systemComposeTemplate ?? "{{BASE}}\n{{ROLE}}\n{{TASK}}",
      rolePrompt: role,
      taskText: "",
      workspace: ctx.systemWorkspacePrompt ?? ""
    });
    
    return composed + runtimeInfo + taskBriefText + contactsText + toolRules;
  }

  /**
   * 将消息格式化为 LLM 可理解的文本
   * 
   * 【格式化规则】
   * - root 智能体：显示完整信息（包括 taskId）
   * - 普通智能体：隐藏 taskId，使用友好的消息格式
   * 
   * @param {object} ctx - 智能体上下文
   * @param {object} message - 要格式化的消息
   * @returns {string} 格式化后的消息文本
   */
  formatMessageForLlm(ctx, message) {
    const isRoot = ctx?.agent?.id === "root";
    
    // root 智能体使用原有格式（需要看到 taskId）
    if (isRoot) {
      const payloadText =
        message?.payload?.text ??
        message?.payload?.content ??
        (typeof message?.payload === "string" ? message.payload : null);
      const payload = payloadText ?? JSON.stringify(message?.payload ?? {}, null, 2);
      return `from=${message?.from ?? ""}\nto=${message?.to ?? ""}\ntaskId=${message?.taskId ?? ""}\npayload=${payload}`;
    }
    
    // 非 root 智能体使用新的消息格式化器
    const senderId = message?.from ?? 'unknown';
    const senderInfo = this.getSenderInfo(senderId);
    return formatMessageForAgent(message, senderInfo);
  }

  /**
   * 获取发送者信息
   * 
   * @param {string} senderId - 发送者ID
   * @returns {{role: string}|null} 发送者信息
   */
  getSenderInfo(senderId) {
    if (senderId === 'user') {
      return { role: 'user' };
    }
    if (senderId === 'root') {
      return { role: 'root' };
    }
    
    // 尝试从已注册的智能体获取角色信息
    const agent = this.runtime._agents.get(senderId);
    if (agent) {
      return { role: agent.roleName ?? 'unknown' };
    }
    
    // 尝试从智能体元数据获取
    const meta = this.runtime._agentMetaById.get(senderId);
    if (meta) {
      const role = this.runtime.org.getRole(meta.roleId);
      return { role: role?.name ?? 'unknown' };
    }
    
    return { role: 'unknown' };
  }

  /**
   * 获取或创建智能体的会话上下文
   * 
   * 如果会话不存在，会创建一个新的会话并添加系统提示词。
   * 
   * @param {string} agentId - 智能体ID
   * @param {string} systemPrompt - 系统提示词
   * @returns {object[]} 会话消息数组
   */
  ensureConversation(agentId, systemPrompt) {
    if (!this.runtime._conversations.has(agentId)) {
      this.runtime._conversations.set(agentId, [{ role: "system", content: systemPrompt }]);
    }
    return this.runtime._conversations.get(agentId);
  }

  /**
   * 构建智能体执行上下文对象
   * 
   * 【上下文内容】
   * - runtime: Runtime 实例引用
   * - org: 组织原语
   * - bus: 消息总线
   * - artifacts: 工件存储
   * - prompts: 提示词加载器
   * - systemBasePrompt: 基础系统提示词
   * - systemComposeTemplate: 提示词组合模板
   * - systemToolRules: 工具调用规则
   * - systemWorkspacePrompt: 工作空间提示词
   * - tools: 工具函数集合
   * - agent: 当前智能体实例
   * 
   * @param {object} [agent] - 智能体实例
   * @returns {object} 智能体执行上下文
   */
  buildAgentContext(agent) {
    const runtime = this.runtime;
    
    // 定义工具函数集合
    const tools = {
      findRoleByName: (name) => runtime.org.findRoleByName(name),
      createRole: (input) =>
        runtime.org.createRole({
          ...input,
          createdBy: input?.createdBy ?? (agent?.id ? agent.id : null)
        }),
      spawnAgent: async (input) => {
        const callerId = agent?.id ?? null;
        if (!callerId) throw new Error("missing_creator_agent");
        return await runtime.spawnAgentAs(callerId, input);
      },
      sendMessage: (message) => {
        const to = message?.to ?? null;
        // 允许发送给特殊收件人 (user, root) 或已注册的智能体
        const isSpecialRecipient = to === "user" || to === "root";
        if (!to || (!isSpecialRecipient && !runtime._agents.has(String(to)))) {
          void runtime.log?.warn?.("发送消息收件人不存在（已拦截）", { to: to ?? null, from: message?.from ?? null });
          return null;
        }
        return runtime.bus.send(message);
      },
      putArtifact: (artifact) => runtime.artifacts.putArtifact(artifact),
      getArtifact: (ref) => runtime.artifacts.getArtifact(ref),
      saveImage: (buffer, meta) => runtime.artifacts.saveImage(buffer, meta),
      composePrompt: (parts) => runtime.prompts.compose(parts),
      consolePrint: (text) => process.stdout.write(String(text ?? ""))
    };

    return {
      runtime,
      org: runtime.org,
      bus: runtime.bus,
      artifacts: runtime.artifacts,
      prompts: runtime.prompts,
      systemBasePrompt: runtime.systemBasePrompt,
      systemComposeTemplate: runtime.systemComposeTemplate,
      systemToolRules: runtime.systemToolRules,
      systemWorkspacePrompt: runtime.systemWorkspacePrompt,
      tools,
      agent: agent ?? null
    };
  }
}
