import { randomUUID } from "node:crypto";

/**
 * TurnEngine - 回合引擎（协程式：显式状态机 + 续跑）
 *
 * 职责：
 * - 将“处理一条入站消息”抽象为 Turn（回合），并以 step 的方式推进；
 * - 一个 step 只返回一个原子动作：need_llm / need_tool / send / done / noop。
 *
 * 设计约束：
 * - 同一 agent 的对话历史（conv）只允许 TurnEngine 写（单写者），避免并发写入导致乱序；
 * - step() 必须无阻塞：不能直接 await LLM/tool；由外部调度器负责启动异步并在完成后回调。
 */
export class TurnEngine {
  /**
   * @param {any} runtime
   */
  constructor(runtime) {
    this.runtime = runtime;
    /** @type {Map<string, {queue: any[], activeTurn: any|null}>} */
    this._byAgentId = new Map();
  }

  /**
   * 为 agent 入队一条消息回合。
   * @param {string} agentId
   * @param {any} ctx
   * @param {any} message
   * @returns {string} turnId
   */
  enqueueMessageTurn(agentId, ctx, message) {
    const entry = this._ensureEntry(agentId);
    const turnId = randomUUID();

    const systemPrompt = this.runtime._buildSystemPromptForAgent(ctx);
    const conv = this.runtime._ensureConversation(agentId, systemPrompt);

    const turn = {
      turnId,
      agentId,
      ctx,
      message,
      conv,
      phase: "init",
      round: 1,
      llmMsg: null,
      pendingToolCalls: [],
      executingToolCall: null,
      lastStepId: 0
    };

    entry.queue.push(turn);
    return turnId;
  }

  /**
   * 判断某个 agent 是否存在可运行的回合（有 activeTurn 或队列非空）。
   * @param {string} agentId
   * @returns {boolean}
   */
  hasRunnable(agentId) {
    const entry = this._byAgentId.get(agentId);
    if (!entry) return false;
    return !!entry.activeTurn || entry.queue.length > 0;
  }

  /**
   * 清理某个 agent 的回合队列与活跃回合（用于终止/删除）。
   * @param {string} agentId
   */
  clearAgent(agentId) {
    if (!agentId) return;
    this._byAgentId.delete(agentId);
  }

  /**
   * 推进某个 agent 的一个 step，返回下一步需要的原子动作。
   * @param {string} agentId
   * @param {{epoch:number, signal:AbortSignal, assertActive:() => void}|null} cancelScope
   * @returns {Promise<any>}
   */
  async step(agentId, cancelScope) {
    const entry = this._ensureEntry(agentId);
    const turn = entry.activeTurn ?? entry.queue.shift() ?? null;
    if (!turn) {
      entry.activeTurn = null;
      return { kind: "noop" };
    }
    entry.activeTurn = turn;

    try {
      cancelScope?.assertActive?.();
    } catch {
      entry.activeTurn = null;
      return { kind: "done" };
    }

    if (turn.phase === "init") {
      turn.lastStepId += 1;

      const contextStatusPrompt = this.runtime._conversationManager.buildContextStatusPrompt(agentId);
      const formatted = await this.runtime._formatMessageForLlm(turn.ctx, turn.message);
      const userContent = formatted + contextStatusPrompt;
      turn.conv.push({ role: "user", content: userContent });

      turn.phase = "need_llm";
    }

    if (turn.phase === "need_llm") {
      turn.lastStepId += 1;

      const interruptions = this.runtime._state?.getAndClearInterruptions?.(agentId) ?? [];
      if (Array.isArray(interruptions) && interruptions.length > 0) {
        const formattedList = [];
        for (const m of interruptions) {
          formattedList.push(await this.runtime._formatMessageForLlm(turn.ctx, m));
        }
        const merged = formattedList
          .filter((t) => typeof t === "string" && t.trim().length > 0)
          .join("\n\n");
        if (merged) {
          turn.conv.push({
            role: "user",
            content: `【插话消息】\n${merged}`
          });
        }
      }

      const tools = this.runtime.getToolDefinitions();
      turn.phase = "waiting_llm";

      const llmMeta = {
        agentId,
        roleId: turn.ctx.agent?.roleId ?? null,
        roleName: turn.ctx.agent?.roleName ?? null,
        messageId: turn.message?.id ?? null,
        messageFrom: turn.message?.from ?? null,
        taskId: turn.message?.taskId ?? null,
        round: turn.round,
        turnId: turn.turnId,
        stepId: turn.lastStepId,
        cancelEpoch: cancelScope?.epoch ?? null
      };

      return {
        kind: "need_llm",
        agentId,
        turnId: turn.turnId,
        stepId: turn.lastStepId,
        request: { messages: turn.conv, tools, meta: llmMeta }
      };
    }

    if (turn.phase === "dispatch_tools") {
      if (turn.executingToolCall) {
        return { kind: "noop" };
      }

      if (!Array.isArray(turn.pendingToolCalls) || turn.pendingToolCalls.length === 0) {
        turn.round += 1;
        turn.phase = "need_llm";
        return { kind: "done" };
      }

      const call = turn.pendingToolCalls.shift();
      const toolName = call?.function?.name ?? null;
      const callId = call?.id ?? null;
      let args = {};

      if (!toolName || !callId) {
        return { kind: "done" };
      }

      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (err) {
        turn.conv.push({
          role: "tool",
          tool_call_id: callId,
          content: JSON.stringify({
            error: "参数解析失败",
            toolName,
            message: err?.message ?? String(err ?? "unknown parse error")
          })
        });
        return { kind: "done" };
      }

      turn.executingToolCall = { toolName, callId, args };
      turn.lastStepId += 1;
      return {
        kind: "need_tool",
        agentId,
        turnId: turn.turnId,
        stepId: turn.lastStepId,
        ctx: turn.ctx,
        call: { toolName, callId, args }
      };
    }

    if (turn.phase === "send_text") {
      const content = turn.llmMsg?.content ?? "";
      if (typeof content === "string" && content.trim().length > 0) {
        turn.lastStepId += 1;
        turn.phase = "finished";
        // 提取 token 使用量
        const usage = turn.llmMsg?._usage ?? null;
        return {
          kind: "send",
          agentId,
          turnId: turn.turnId,
          stepId: turn.lastStepId,
          message: {
            to: "user",
            from: agentId,
            taskId: turn.message?.taskId ?? null,
            payload: { text: content.trim(), usage: usage }
          }
        };
      }
      turn.phase = "finished";
      return { kind: "done" };
    }

    if (turn.phase === "finished") {
      entry.activeTurn = null;
      return { kind: "done" };
    }

    return { kind: "noop" };
  }

  /**
   * 接收 LLM 的返回结果并更新回合状态。
   * @param {string} agentId
   * @param {{turnId:string, stepId:number, msg:any}} input
   */
  onLlmResult(agentId, input) {
    const entry = this._byAgentId.get(agentId);
    const turn = entry?.activeTurn ?? null;
    if (!turn) return;
    if (turn.turnId !== input.turnId) return;
    if (turn.phase !== "waiting_llm") return;

    turn.llmMsg = input.msg ?? null;
    if (turn.llmMsg) {
      turn.conv.push(turn.llmMsg);

      // 更新 token 使用统计
      const usage = turn.llmMsg._usage ?? null;
      if (usage && this.runtime._conversationManager) {
        this.runtime._conversationManager.updateTokenUsage(agentId, usage);

        // 调试日志
        if (this.runtime.log) {
          void this.runtime.log.info("更新 token 使用统计", {
            agentId,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens
          });
        }
      }
    }

    const toolCalls = Array.isArray(turn.llmMsg?.tool_calls) ? turn.llmMsg.tool_calls : [];
    if (toolCalls.length > 0) {
      turn.pendingToolCalls = toolCalls.slice(0);
      turn.executingToolCall = null;
      turn.phase = "dispatch_tools";
      return;
    }

    turn.phase = "send_text";
  }

  /**
   * 处理 LLM 错误（最小闭环：直接结束回合）。
   * @param {string} agentId
   * @param {{turnId:string, stepId:number, error:any}} input
   */
  onLlmError(agentId, input) {
    const entry = this._byAgentId.get(agentId);
    const turn = entry?.activeTurn ?? null;
    if (!turn) return;
    if (turn.turnId !== input.turnId) return;
    entry.activeTurn = null;
  }

  /**
   * LLM 请求被取消（通常用于插话场景重试）。
   * 约束：只把 waiting_llm 回退到 need_llm，不清理 turn。
   * @param {string} agentId
   * @param {{turnId:string, stepId:number}} input
   */
  onLlmCancelled(agentId, input) {
    const entry = this._byAgentId.get(agentId);
    const turn = entry?.activeTurn ?? null;
    if (!turn) return;
    if (turn.turnId !== input.turnId) return;
    if (turn.phase !== "waiting_llm") return;
    turn.phase = "need_llm";
  }

  /**
   * 接收工具执行结果并更新回合状态。
   * @param {string} agentId
   * @param {{turnId:string, stepId:number, callId:string, result:any}} input
   */
  onToolResult(agentId, input) {
    const entry = this._byAgentId.get(agentId);
    const turn = entry?.activeTurn ?? null;
    if (!turn) return;
    if (turn.turnId !== input.turnId) return;
    if (turn.phase !== "dispatch_tools") return;

    const executing = turn.executingToolCall;
    if (!executing || executing.callId !== input.callId) return;

    const toolName = executing.toolName;
    const args = executing.args;
    const result = input.result ?? null;

    this.runtime._emitToolCall?.({
      agentId,
      toolName,
      args,
      result,
      taskId: turn.message?.taskId ?? null,
      callId: executing.callId,
      timestamp: new Date().toISOString(),
      reasoningContent: turn.llmMsg?.reasoning_content ?? null,
      usage: turn.llmMsg?._usage ?? null
    });

    turn.conv.push({
      role: "tool",
      tool_call_id: executing.callId,
      content: JSON.stringify(result)
    });

    turn.executingToolCall = null;
  }

  /**
   * 工具执行失败：把错误作为 tool 消息写入 conv，然后继续。
   * @param {string} agentId
   * @param {{turnId:string, stepId:number, callId:string, error:any}} input
   */
  onToolError(agentId, input) {
    const entry = this._byAgentId.get(agentId);
    const turn = entry?.activeTurn ?? null;
    if (!turn) return;
    if (turn.turnId !== input.turnId) return;
    if (turn.phase !== "dispatch_tools") return;

    const executing = turn.executingToolCall;
    if (!executing || executing.callId !== input.callId) return;

    const toolName = executing.toolName;
    const args = executing.args;
    const err = input.error;
    const message = err?.message ?? String(err ?? "unknown tool error");

    const result = { error: "工具执行失败", toolName, message, args };
    this.onToolResult(agentId, { turnId: input.turnId, stepId: input.stepId, callId: input.callId, result });
  }

  /**
   * @param {string} agentId
   * @returns {{queue:any[], activeTurn:any|null}}
   * @private
   */
  _ensureEntry(agentId) {
    if (!this._byAgentId.has(agentId)) {
      this._byAgentId.set(agentId, { queue: [], activeTurn: null });
    }
    return this._byAgentId.get(agentId);
  }
}
