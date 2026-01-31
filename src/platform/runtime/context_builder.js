/**
 * 上下文构建器模块
 * 
 * 本模块负责构建智能体执行所需的各种上下文信息，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * Runtime 在调用智能体行为时，需要为每个智能体提供一致的上下文对象（runtime/org/bus/artifacts/prompts 与工具函数集合等）。
 * 将上下文对象的构建逻辑集中在一个模块，便于维护与演进。
 * 
 * 【主要功能】
 * 1. 构建智能体执行上下文对象
 * 
 * 【使用流程】
 * 1. Runtime 在调用 agent.onMessage 前，构建 ctx 并传入
 * 
 * 【与其他模块的关系】
 * - 被 Runtime 调用构建 agent ctx
 * 
 * @module runtime/context_builder
 */

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
   * 构建智能体执行上下文对象
   * 
   * 【上下文内容】
   * - runtime: Runtime 实例引用
   * - org: 组织原语
   * - bus: 消息总线
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
      composePrompt: (parts) => runtime.prompts.compose(parts),
      consolePrint: (text) => process.stdout.write(String(text ?? ""))
    };

    return {
      runtime,
      org: runtime.org,
      bus: runtime.bus,
      workspaceManager: runtime.workspaceManager,
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
