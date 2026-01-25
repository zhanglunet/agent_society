/**
 * ComputeScheduler - 系统级计算调度器（协程式时间片）
 *
 * 职责：
 * - 从 MessageBus 拉取消息，转换成 TurnEngine 的 Turn 入队；
 * - 用 round-robin 策略调度 agent 的 step（每次最多推进 1 个原子动作）；
 * - 对 LLM/tool 这类长操作采用“启动异步→完成回调入队”的方式，避免 await 占用调度循环。
 *
 * 设计约束：
 * - 不直接解析 LLM/tool 业务数据；由 TurnEngine 决定下一步动作。
 * - 不在调度器中持久占用 CPU：每轮循环需要让出事件循环。
 */
export class ComputeScheduler {
  /**
   * @param {any} runtime
   * @param {any} turnEngine
   */
  constructor(runtime, turnEngine) {
    this.runtime = runtime;
    this.turnEngine = turnEngine;
    this.log = runtime.log;

    this._running = false;
    this._stopRequested = false;
    this._loopPromise = null;

    /** @type {string[]} */
    this._readyQueue = [];
    /** @type {Set<string>} */
    this._readySet = new Set();

    /** @type {Map<string, {kind:'llm'|'tool'|'endpoint', epoch:number, turnId:string|null, stepId:number|null}>} */
    this._inFlight = new Map();

    this._rrCursor = 0;
  }

  /**
   * 启动常驻调度循环（不阻塞调用方）。
   * @returns {Promise<void>}
   */
  async start() {
    if (this._loopPromise) return this._loopPromise;
    this._running = true;
    this._stopRequested = false;
    this._loopPromise = this._loop().finally(() => {
      this._loopPromise = null;
      this._running = false;
    });
    return this._loopPromise;
  }

  /**
   * 请求停止调度循环。
   */
  stop() {
    this._stopRequested = true;
  }

  /**
   * 丢弃某个 agent 的 inFlight 占位（用于 stop 后允许新消息立即恢复处理）。
   * @param {string} agentId
   */
  cancelInFlight(agentId) {
    if (!agentId) return;
    this._inFlight.delete(agentId);
  }

  /**
   * 调度循环主体。
   * @private
   */
  async _loop() {
    void this.log?.info?.("ComputeScheduler 开始运行");

    while (!this._stopRequested) {
      this.runtime.bus.deliverDueMessages();

      this._ingestMessagesToTurns();

      const progressed = this._runOneStep();

      if (!progressed && !this.runtime.bus.hasPending() && this._inFlight.size === 0) {
        await this.runtime.bus.waitForMessage({ timeoutMs: 100 });
      } else if (!progressed) {
        await new Promise((r) => setTimeout(r, 5));
      }

      await new Promise((r) => setImmediate(r));
    }

    this._running = false;
    void this.log?.info?.("ComputeScheduler 已停止");
  }

  /**
   * 从 MessageBus 拉取消息，转换为 Turn 入队，并把 agent 加入 ready 队列。
   * @private
   */
  _ingestMessagesToTurns() {
    const agentIds = [...this.runtime._agents.keys()];
    if (agentIds.length === 0) return;

    for (let i = 0; i < agentIds.length; i += 1) {
      const idx = (this._rrCursor + i) % agentIds.length;
      const agentId = agentIds[idx];

      if (this._stopRequested) break;
      if (this._inFlight.has(agentId)) continue;

      const status = this.runtime._state.getAgentComputeStatus(agentId);
      if (status === "stopping" || status === "terminating") {
        continue;
      }

      const msg = this.runtime.bus.receiveNext(agentId);
      if (!msg) continue;

      const agent = this.runtime._agents.get(agentId);
      if (!agent) continue;

      const ctx = this.runtime._buildAgentContext(agent);
      ctx.currentMessage = msg;
      
      if (agentId === "user" || agent?.roleName === "user" || agent?.roleId === "user") {
        this._dispatchEndpointMessage(agentId, agent, ctx, msg);
      } else {
        if (status === "stopped") {
          this.runtime._state.setAgentComputeStatus(agentId, "idle");
        }
        this.turnEngine.enqueueMessageTurn(agentId, ctx, msg);
        this._markReady(agentId);
      }
    }

    this._rrCursor = (this._rrCursor + 1) % agentIds.length;
  }

  /**
   * 将消息直接投递到 endpoint 智能体（例如 user 端点），不走 LLM/TurnEngine。
   * @param {string} agentId
   * @param {any} agent
   * @param {any} ctx
   * @param {any} msg
   * @private
   */
  _dispatchEndpointMessage(agentId, agent, ctx, msg) {
    const epoch = this.runtime._cancelManager?.getEpoch(agentId) ?? 0;
    this._inFlight.set(agentId, { kind: "endpoint", epoch, turnId: null, stepId: null });

    Promise.resolve()
      .then(async () => {
        if (typeof agent?.onMessage !== "function") return;
        await agent.onMessage(ctx, msg);
      })
      .catch((err) => {
        void this.log?.warn?.("endpoint 消息处理失败", {
          agentId,
          message: err?.message ?? String(err ?? "unknown endpoint error")
        });
      })
      .finally(() => {
        const inflight = this._inFlight.get(agentId);
        if (inflight && inflight.kind === "endpoint" && inflight.epoch === epoch) {
          this._inFlight.delete(agentId);
        }
      });
  }

  /**
   * 推进一个 agent 的一个 step。
   * @returns {boolean} 是否推进成功
   * @private
   */
  _runOneStep() {
    const agentId = this._takeReady();
    if (!agentId) return false;

    if (!this.runtime._agents.has(agentId)) {
      this._inFlight.delete(agentId);
      this.turnEngine.clearAgent?.(agentId);
      this.runtime._state.unmarkAgentAsActivelyProcessing(agentId);
      this.runtime._state.setAgentComputeStatus(agentId, "idle");
      return false;
    }

    if (this._inFlight.has(agentId)) return false;

    const status = this.runtime._state.getAgentComputeStatus(agentId);
    if (status === "stopped" || status === "stopping" || status === "terminating") {
      return false;
    }

    const cancelScope = this.runtime._cancelManager?.newScope(agentId) ?? null;
    const outcome = this.turnEngine.step(agentId, cancelScope);

    if (!outcome || outcome.kind === "noop") {
      if (this.turnEngine.hasRunnable(agentId)) {
        this._markReady(agentId);
      } else {
        this._maybeSetIdle(agentId);
      }
      return false;
    }

    if (outcome.kind === "done") {
      if (this.turnEngine.hasRunnable(agentId)) {
        this._markReady(agentId);
      } else {
        this._maybeSetIdle(agentId);
      }
      return true;
    }

    if (outcome.kind === "send") {
      this.runtime.bus.send(outcome.message);
      if (this.turnEngine.hasRunnable(agentId)) {
        this._markReady(agentId);
      } else {
        this._maybeSetIdle(agentId);
      }
      return true;
    }

    if (outcome.kind === "need_llm") {
      this._startLlm(agentId, outcome, cancelScope);
      return true;
    }

    if (outcome.kind === "need_tool") {
      this._startTool(agentId, outcome, cancelScope);
      return true;
    }

    return false;
  }

  /**
   * 发起 LLM 请求并注册完成回调。
   * @param {string} agentId
   * @param {any} outcome
   * @param {{epoch:number, signal:AbortSignal, assertActive:() => void}|null} cancelScope
   * @private
   */
  _startLlm(agentId, outcome, cancelScope) {
    const llmClient = this.runtime.getLlmClientForAgent(agentId);
    if (!llmClient) {
      this.turnEngine.onLlmError(agentId, {
        turnId: outcome.turnId,
        stepId: outcome.stepId,
        error: new Error("missing_llm_client")
      });
      this._markReady(agentId);
      return;
    }

    const epoch = cancelScope?.epoch ?? this.runtime._cancelManager?.getEpoch(agentId) ?? 0;
    this._inFlight.set(agentId, {
      kind: "llm",
      epoch,
      turnId: outcome.turnId,
      stepId: outcome.stepId
    });

    this.runtime._state.setAgentComputeStatus(agentId, "waiting_llm");
    this.runtime._state.markAgentAsActivelyProcessing(agentId);

    llmClient
      .chat(outcome.request)
      .then((msg) => {
        const currentEpoch = this.runtime._cancelManager?.getEpoch(agentId) ?? epoch;
        if (currentEpoch !== epoch) {
          const reason = this.runtime._cancelManager?.getLastAbortInfo(agentId)?.reason ?? null;
          if (reason === "message_interruption") {
            this.turnEngine.onLlmCancelled(agentId, { turnId: outcome.turnId, stepId: outcome.stepId });
          } else {
            this.turnEngine.onLlmError(agentId, { turnId: outcome.turnId, stepId: outcome.stepId, error: new Error("llm_result_discarded") });
          }
          return;
        }
        if (!this.runtime._agents.has(agentId)) return;
        this.turnEngine.onLlmResult(agentId, { turnId: outcome.turnId, stepId: outcome.stepId, msg });
        this.runtime._state.setAgentComputeStatus(agentId, "processing");
      })
      .catch((err) => {
        const currentEpoch = this.runtime._cancelManager?.getEpoch(agentId) ?? epoch;
        if (currentEpoch !== epoch) {
          const reason = this.runtime._cancelManager?.getLastAbortInfo(agentId)?.reason ?? null;
          if (reason === "message_interruption") {
            this.turnEngine.onLlmCancelled(agentId, { turnId: outcome.turnId, stepId: outcome.stepId });
          } else {
            this.turnEngine.onLlmError(agentId, { turnId: outcome.turnId, stepId: outcome.stepId, error: err });
          }
          return;
        }
        if (!this.runtime._agents.has(agentId)) return;
        this.turnEngine.onLlmError(agentId, { turnId: outcome.turnId, stepId: outcome.stepId, error: err });
        this.runtime._state.setAgentComputeStatus(agentId, "idle");
      })
      .finally(() => {
        const inflight = this._inFlight.get(agentId);
        if (inflight && inflight.epoch === epoch) {
          this._inFlight.delete(agentId);
        }
        this.runtime._state.unmarkAgentAsActivelyProcessing(agentId);
        if (!this.runtime._agents.has(agentId)) return;
        const status = this.runtime._state.getAgentComputeStatus(agentId);
        if (status === "stopping" || status === "stopped" || status === "terminating") return;
        if (this.turnEngine.hasRunnable(agentId)) {
          this._markReady(agentId);
        } else {
          this._maybeSetIdle(agentId);
        }
      });
  }

  /**
   * 发起工具执行并注册完成回调。
   * @param {string} agentId
   * @param {any} outcome
   * @param {{epoch:number, signal:AbortSignal, assertActive:() => void}|null} cancelScope
   * @private
   */
  _startTool(agentId, outcome, cancelScope) {
    const epoch = cancelScope?.epoch ?? this.runtime._cancelManager?.getEpoch(agentId) ?? 0;
    this._inFlight.set(agentId, {
      kind: "tool",
      epoch,
      turnId: outcome.turnId,
      stepId: outcome.stepId
    });

    this.runtime._state.setAgentComputeStatus(agentId, "processing");
    this.runtime._state.markAgentAsActivelyProcessing(agentId);

    Promise.resolve()
      .then(async () => {
        const toolName = outcome?.call?.toolName ?? null;
        const callId = outcome?.call?.callId ?? null;
        const args = outcome?.call?.args ?? {};
        if (!toolName || !callId) {
          throw new Error("invalid_tool_call");
        }
        return await this.runtime.executeToolCall(outcome.ctx, toolName, args);
      })
      .then((result) => {
        const currentEpoch = this.runtime._cancelManager?.getEpoch(agentId) ?? epoch;
        if (currentEpoch !== epoch) return;
        if (!this.runtime._agents.has(agentId)) return;
        this.turnEngine.onToolResult(agentId, {
          turnId: outcome.turnId,
          stepId: outcome.stepId,
          callId: outcome.call.callId,
          result
        });
      })
      .catch((err) => {
        const currentEpoch = this.runtime._cancelManager?.getEpoch(agentId) ?? epoch;
        if (currentEpoch !== epoch) return;
        if (!this.runtime._agents.has(agentId)) return;
        this.turnEngine.onToolError(agentId, {
          turnId: outcome.turnId,
          stepId: outcome.stepId,
          callId: outcome?.call?.callId ?? "",
          error: err
        });
        this.runtime._state.setAgentComputeStatus(agentId, "idle");
      })
      .finally(() => {
        const inflight = this._inFlight.get(agentId);
        if (inflight && inflight.epoch === epoch) {
          this._inFlight.delete(agentId);
        }
        this.runtime._state.unmarkAgentAsActivelyProcessing(agentId);
        if (!this.runtime._agents.has(agentId)) return;
        const status = this.runtime._state.getAgentComputeStatus(agentId);
        if (status === "stopping" || status === "stopped" || status === "terminating") return;
        if (this.turnEngine.hasRunnable(agentId)) {
          this._markReady(agentId);
        } else {
          this._maybeSetIdle(agentId);
        }
      });
  }

  /**
   * 将空闲智能体的 computeStatus 收敛为 idle，避免 UI 长期显示“处理中/等待”。
   * @param {string} agentId
   * @private
   */
  _maybeSetIdle(agentId) {
    if (!agentId) return;
    if (this._inFlight.has(agentId)) return;
    if (this.turnEngine.hasRunnable(agentId)) return;
    const queueDepth = this.runtime.bus?.getQueueDepth?.(agentId) ?? 0;
    if (queueDepth > 0) return;

    const status = this.runtime._state.getAgentComputeStatus(agentId);
    if (status === "stopping" || status === "stopped" || status === "terminating") return;
    if (!status || status === "idle") return;
    this.runtime._state.setAgentComputeStatus(agentId, "idle");
  }

  /**
   * 将 agent 标记为可运行（加入 ready 队列，去重）。
   * @param {string} agentId
   * @private
   */
  _markReady(agentId) {
    if (!agentId) return;
    if (this._readySet.has(agentId)) return;
    this._readySet.add(agentId);
    this._readyQueue.push(agentId);
  }

  /**
   * 取出一个 ready agent。
   * @returns {string|null}
   * @private
   */
  _takeReady() {
    while (this._readyQueue.length > 0) {
      const agentId = this._readyQueue.shift();
      this._readySet.delete(agentId);
      if (!agentId) continue;
      return agentId;
    }
    return null;
  }
}
