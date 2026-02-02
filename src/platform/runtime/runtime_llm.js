import { randomUUID } from "node:crypto";
import { formatMessageForAgent } from "../utils/message/message_formatter.js";
import { formatTaskBrief } from "../utils/message/task_brief.js";

/**
 * RuntimeLlm: LLM 交互模块
 * 
 * 职责：
 * - LLM 调用 (_handleWithLlm, _doLlmProcessing)
 * - 上下文构建 (_buildSystemPromptForAgent, _formatMessageForLlm, _ensureConversation)
 * - 错误处理 (_sendErrorNotificationToParent)
 * - 发送者信息 (_getSenderInfo)
 * 
 * 设计原则：
 * - 封装所有 LLM 交互相关逻辑
 * - 通过 Runtime 实例访问必要的服务
 * - 保持接口简洁明确
 * 
 * Requirements: 3.2, 7.1, 7.2
 */
export class RuntimeLlm {
  /**
   * @param {any} runtime - Runtime 实例
   */
  constructor(runtime) {
    this.runtime = runtime;
  }

  /**
   * 使用 LLM 处理一条消息，并通过工具调用驱动平台动作。
   * @param {any} ctx - 智能体上下文
   * @param {any} message - 消息对象
   * @returns {Promise<void>}
   */
  async handleWithLlm(ctx, message) {
    const agentId = ctx.agent?.id ?? null;
    if (!agentId) {
      void this.runtime.log.error("智能体ID缺失，无法处理消息");
      return;
    }

    const cancelScope = this.runtime._cancelManager?.newScope(agentId) ?? null;

    // 获取智能体应使用的 LlmClient
    const llmClient = this.runtime.getLlmClientForAgent(agentId);
    if (!llmClient) {
      void this.runtime.log.error("LLM客户端未配置，无法处理消息", { agentId });
      return;
    }

    const systemPrompt = this.buildSystemPromptForAgent(ctx);
    const conv = this.runtime._ensureConversation(agentId, systemPrompt);

    try {
      await this.doLlmProcessing(ctx, message, conv, agentId, llmClient, cancelScope);
    } finally {
      void this.runtime._conversationManager?.persistConversation?.(agentId);
    }
  }

  /**
   * 执行 LLM 处理循环（内部方法）。
   * @param {any} ctx - 智能体上下文
   * @param {any} message - 消息对象
   * @param {any[]} conv - 对话历史
   * @param {string|null} agentId - 智能体ID
   * @param {any} llmClient - 要使用的 LLM 客户端
   * @returns {Promise<void>}
   * @private
   */
  async doLlmProcessing(ctx, message, conv, agentId, llmClient, cancelScope) {
    if (cancelScope) {
      try {
        cancelScope.assertActive();
      } catch {
        this.runtime._state.setAgentComputeStatus(agentId, 'idle');
        return;
      }
    }

    // 在用户消息中注入上下文状态提示
    const contextStatusPrompt = this.runtime._conversationManager.buildContextStatusPrompt(agentId);
    const formattedMessage = await this.formatMessageForLlm(ctx, message);
    
    // 处理多模态内容（Requirements 10.6）
    let userContent;
    if (typeof formattedMessage === 'string') {
      userContent = formattedMessage + contextStatusPrompt;
    } else if (Array.isArray(formattedMessage)) {
      // 如果是多模态内容数组，将状态提示添加到最后一个文本部分，或者新增一个文本部分
      userContent = [...formattedMessage];
      const lastPart = userContent[userContent.length - 1];
      if (lastPart && lastPart.type === 'text') {
        lastPart.text += contextStatusPrompt;
      } else {
        userContent.push({ type: 'text', text: contextStatusPrompt });
      }
    } else {
      userContent = String(formattedMessage) + contextStatusPrompt;
    }
    
    conv.push({ role: "user", content: userContent });

    // 检查上下文长度并在超限时发出警告
    this.checkContextAndWarn(agentId);

    const tools = this.runtime.getToolDefinitions();
    for (let i = 0; i < this.runtime.maxToolRounds; i += 1) {
      if (cancelScope) {
        try {
          cancelScope.assertActive();
        } catch {
          this.runtime._state.setAgentComputeStatus(agentId, 'idle');
          return;
        }
      }

      let msg = null;
      let slideAttempted = false;
      while (true) {
        if (cancelScope) {
          try {
            cancelScope.assertActive();
          } catch {
            this.runtime._state.setAgentComputeStatus(agentId, 'idle');
            return;
          }
        }

        const llmMeta = {
          agentId: ctx.agent?.id ?? null,
          roleId: ctx.agent?.roleId ?? null,
          roleName: ctx.agent?.roleName ?? null,
          messageId: message?.id ?? null,
          messageFrom: message?.from ?? null,
          taskId: message?.taskId ?? null,
          round: i + 1,
          cancelEpoch: cancelScope?.epoch ?? null
        };

        try {
          if (agentId) {
            const preSlideResult = this.runtime._conversationManager.slideWindowIfNeededByEstimate(agentId, { keepRatio: 0.7, maxLoops: 3 });
            if (preSlideResult.ok && preSlideResult.slid) {
              void this.runtime.log.warn("检测到上下文接近/超过硬性阈值，已在调用前自动滑动窗口", {
                agentId,
                round: i + 1,
                preSlideResult
              });
            }
          }

          void this.runtime.log.info("请求 LLM", llmMeta);
          this.runtime._state.setAgentComputeStatus(agentId, 'waiting_llm');
          const convSnapshot = conv.slice();
          msg = await llmClient.chat({ messages: conv, tools, meta: llmMeta });

          if (agentId && msg?._usage?.promptTokens) {
            const estimatorResult = this.runtime._conversationManager.updatePromptTokenEstimator(agentId, convSnapshot, msg._usage.promptTokens);
            void this.runtime.log.debug("已更新 prompt token 估算器", { agentId, estimatorResult });
          }

          if (cancelScope && this.runtime._cancelManager.getEpoch(agentId) !== cancelScope.epoch) {
            void this.runtime.log.info("检测到取消 epoch 变化，丢弃 LLM 响应", {
              agentId,
              expectedEpoch: cancelScope.epoch,
              currentEpoch: this.runtime._cancelManager.getEpoch(agentId),
              messageId: message?.id ?? null
            });
            this.runtime._state.setAgentComputeStatus(agentId, 'idle');
            return;
          }
          
          // 检查智能体状态：如果已被停止或正在停止，丢弃响应
          const statusAfterLlm = this.runtime._state.getAgentComputeStatus(agentId);
          if (statusAfterLlm === 'stopped' || statusAfterLlm === 'stopping' || statusAfterLlm === 'terminating') {
            void this.runtime.log.info("智能体已停止，丢弃 LLM 响应", {
              agentId,
              status: statusAfterLlm,
              messageId: message?.id ?? null
            });
            return;
          }
          
          this.runtime._state.setAgentComputeStatus(agentId, 'processing');
          break;
        } catch (err) {
          this.runtime._state.setAgentComputeStatus(agentId, 'idle');

          if (!slideAttempted && this.isContextLengthExceededError(err) && agentId) {
            slideAttempted = true;
            const slideResult = this.runtime._conversationManager.slideWindowByEstimatedTokens(agentId, 0.7);
            void this.runtime.log.warn("LLM 调用疑似 token/context 超限，已滑动上下文窗口并重试", {
              agentId,
              round: i + 1,
              slideResult,
              errorMessage: err?.message ?? String(err ?? "unknown error")
            });
            continue;
          }

          void this.runtime.log.error("LLM 调用失败", { 
            agentId: ctx.agent?.id ?? null, 
            messageId: message?.id ?? null, 
            taskId: message?.taskId ?? null,
            round: i + 1,
            error: err
          });
          
          const text = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
          const errorType = err?.name ?? "UnknownError";

          if (i === 0 && conv.length > 0 && conv[conv.length - 1].role === "user") {
            conv.pop();
            void this.runtime.log.info("已从对话历史中移除导致失败的用户消息", {
              agentId: ctx.agent?.id ?? null,
              messageId: message?.id ?? null
            });
          }

          if (errorType === "AbortError") {
            void this.runtime.log.info("LLM 调用被用户中断，智能体将继续处理其他消息", { 
              agentId: ctx.agent?.id ?? null,
              messageId: message?.id ?? null,
              taskId: message?.taskId ?? null
            });
            return;
          }

          void this.runtime.log.error("LLM 调用遇到非中断错误", {
            agentId: ctx.agent?.id ?? null,
            messageId: message?.id ?? null,
            taskId: message?.taskId ?? null,
            errorType,
            errorMessage: text,
            willContinueProcessing: true
          });
          
          await this.sendErrorNotificationToParent(agentId, message, {
            errorType: "llm_call_failed",
            message: `LLM 调用失败: ${text}`,
            originalError: text,
            errorName: errorType
          });
          
          return;
        }
      }
      if (!msg) {
        this.runtime._state.setAgentComputeStatus(agentId, 'idle');
        return;
      }
      
      // 更新 token 使用统计（基于 LLM 返回的实际值）
      if (agentId && msg._usage) {
        this.runtime._conversationManager.updateTokenUsage(agentId, msg._usage);
        const status = this.runtime._conversationManager.getContextStatus(agentId);
        void this.runtime.log.debug("更新上下文 token 使用统计", {
          agentId,
          promptTokens: msg._usage.promptTokens,
          completionTokens: msg._usage.completionTokens,
          totalTokens: msg._usage.totalTokens,
          usagePercent: (status.usagePercent * 100).toFixed(1) + '%',
          status: status.status
        });
        
        // 如果更新后超过硬性限制，记录警告（下次调用时会被拒绝）
        if (status.status === 'exceeded') {
          void this.runtime.log.warn("上下文已超过硬性限制，将在下一次调用前自动滑动窗口", {
            agentId,
            usedTokens: status.usedTokens,
            maxTokens: status.maxTokens,
            usagePercent: (status.usagePercent * 100).toFixed(1) + '%'
          });
        }
      }
      
      conv.push(msg);

      const toolCalls = msg.tool_calls ?? [];
      if (!toolCalls || toolCalls.length === 0) {
        // 检测 LLM 是否在文本中描述了工具调用意图但没有实际调用
        const content = msg.content ?? "";
        const toolIntentPatterns = [
          /我将.*创建/,
          /让我.*创建/,
          /我需要.*创建/,
          /我会.*创建/,
          /首先.*创建/,
          /create_role/i,
          /spawn_agent_with_task/i,
          /send_message/i,
          /我将.*调用/,
          /让我.*调用/,
          /我要.*调用/
        ];
        const hasToolIntent = toolIntentPatterns.some(pattern => pattern.test(content));
        
        if (hasToolIntent && i < this.runtime.maxToolRounds - 1) {
          // LLM 描述了工具调用意图但没有实际调用，添加提示并重试
          void this.runtime.log.warn("检测到 LLM 描述了工具调用意图但未实际调用，添加提示重试", {
            agentId: ctx.agent?.id ?? null,
            round: i + 1,
            contentPreview: content.substring(0, 200)
          });
          
          conv.push({
            role: "user",
            content: "【系统提示】你刚才描述了想要执行的操作，但没有实际调用工具函数。请注意：你必须通过 tool_calls 调用工具函数来执行操作，而不是在文本中描述。例如，如果你想创建岗位，请直接调用 create_role 工具；如果你想创建智能体，请直接调用 spawn_agent_with_task 工具。请立即调用相应的工具函数来执行你描述的操作。"
          });
          continue; // 继续下一轮，让 LLM 重新生成带 tool_calls 的响应
        }
        
        // 没有工具调用但有文本内容，自动发送给 user
        if (content.trim()) {
          if (cancelScope && this.runtime._cancelManager.getEpoch(agentId) !== cancelScope.epoch) {
            this.runtime._state.setAgentComputeStatus(agentId, 'idle');
            return;
          }
          const currentAgentId = ctx.agent?.id ?? "unknown";
          // 没有调用 send_message 的回复默认发给 user
          const targetId = "user";
          const currentTaskId = ctx.currentMessage?.taskId ?? null;
          
          void this.runtime.log.info("LLM 返回纯文本无 tool_calls，自动发送消息", {
            agentId: currentAgentId,
            targetId,
            contentPreview: content.substring(0, 100)
          });
          
          const sendResult = ctx.tools.sendMessage({
            to: targetId,
            from: currentAgentId,
            taskId: currentTaskId,
            payload: { text: content.trim(), usage: msg._usage ?? null }
          });
          
          // 记录智能体发送消息的生命周期事件
          void this.runtime.loggerRoot.logAgentLifecycleEvent("agent_message_sent", {
            agentId: currentAgentId,
            messageId: sendResult?.messageId ?? null,
            to: targetId,
            taskId: currentTaskId,
            autoSent: true
          });
        }
        
        // 没有工具调用，处理完成，重置为空闲状态
        this.runtime._state.setAgentComputeStatus(agentId, 'idle');
        return;
      }

      const toolNames = toolCalls.map((c) => c?.function?.name).filter(Boolean);
      void this.runtime.log.info("LLM 返回工具调用", {
        agentId: ctx.agent?.id ?? null,
        count: toolCalls.length,
        toolNames
      });

      for (const call of toolCalls) {
        if (cancelScope && this.runtime._cancelManager.getEpoch(agentId) !== cancelScope.epoch) {
          this.runtime._state.setAgentComputeStatus(agentId, 'idle');
          return;
        }

        // 在执行每个工具调用前检查智能体状态
        const statusBeforeTool = this.runtime._state.getAgentComputeStatus(agentId);
        if (statusBeforeTool === 'stopped' || statusBeforeTool === 'stopping' || statusBeforeTool === 'terminating') {
          void this.runtime.log.info("智能体已停止，跳过剩余工具调用", {
            agentId,
            status: statusBeforeTool,
            toolName: call.function?.name ?? "unknown",
            remainingCalls: toolCalls.length
          });
          // 立即返回，不执行任何工具调用
          return;
        }
        
        let args = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch (parseErr) {
          // 工具参数解析失败 - 打印完整的原始错误信息
          void this.runtime.log.error("工具调用参数解析失败", { 
            agentId: ctx.agent?.id ?? null,
            toolName: call.function?.name ?? "unknown",
            arguments: call.function?.arguments ?? "null",
            callId: call.id,
            error: parseErr // 直接传递原始错误对象
          });
          
          const parseError = parseErr && typeof parseErr.message === "string" ? parseErr.message : String(parseErr ?? "unknown parse error");
          
          // 返回解析错误结果，继续处理其他工具调用
          conv.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              error: "参数解析失败",
              details: parseError,
              toolName: call.function?.name ?? "unknown"
            })
          });
          continue;
        }
        
        const toolName = call.function?.name ?? null;
        void this.runtime.log.debug("解析工具调用参数", { name: toolName });
        
        let result = null;
        try {
          result = await this.runtime.executeToolCall(ctx, toolName, args);
        } catch (toolErr) {
          // 工具执行失败 - 打印完整的原始错误信息
          void this.runtime.log.error("工具执行失败", {
            agentId: ctx.agent?.id ?? null,
            toolName,
            args,
            callId: call.id,
            error: toolErr // 直接传递原始错误对象
          });
          
          const toolError = toolErr && typeof toolErr.message === "string" ? toolErr.message : String(toolErr ?? "unknown tool error");
          
          // 返回工具执行错误结果，继续处理其他工具调用
          result = {
            error: "工具执行失败",
            details: toolError,
            toolName,
            args
          };
        }
        
        if (cancelScope && this.runtime._cancelManager.getEpoch(agentId) !== cancelScope.epoch) {
          this.runtime._state.setAgentComputeStatus(agentId, 'idle');
          return;
        }

        // 在工具执行后再次检查状态
        const statusAfterTool = this.runtime._state.getAgentComputeStatus(agentId);
        if (statusAfterTool === 'stopped' || statusAfterTool === 'stopping' || statusAfterTool === 'terminating') {
          void this.runtime.log.info("智能体在工具执行后已停止，跳过剩余工具调用", {
            agentId,
            status: statusAfterTool,
            executedTool: toolName
          });
          // 立即返回，不继续处理
          return;
        }
        
        // 触发工具调用事件
        this.runtime._emitToolCall({
          agentId: ctx.agent?.id ?? null,
          toolName,
          args,
          result,
          taskId: message?.taskId ?? null,
          callId: call.id,
          timestamp: new Date().toISOString(),
          reasoningContent: msg.reasoning_content ?? null,
          usage: msg._usage ?? null
        });
        
        conv.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result ?? null)
        });
      }
      if (ctx.yieldRequested) {
        ctx.yieldRequested = false;
        this.runtime._state.setAgentComputeStatus(agentId, 'idle');
        return;
      }
    }
    // 工具调用轮次达到上限，重置为空闲状态
    this.runtime._state.setAgentComputeStatus(agentId, 'idle');
    void this.runtime.log.warn("工具调用轮次达到上限，强制停止本次处理", {
      agentId: ctx.agent?.id ?? null,
      messageId: message?.id ?? null,
      maxToolRounds: this.runtime.maxToolRounds
    });

    // 向父智能体发送错误通知（需求 5.3）
    if (agentId) {
      await this.sendErrorNotificationToParent(agentId, message, {
        errorType: "max_tool_rounds_exceeded",
        message: `智能体 ${agentId} 超过最大工具调用轮次限制 (${this.runtime.maxToolRounds})`,
        maxToolRounds: this.runtime.maxToolRounds
      });
    }
  }

  /**
   * 向父智能体发送错误通知的统一方法，同时触发全局错误事件。
   * @param {string} agentId - 当前智能体ID
   * @param {any} originalMessage - 原始消息
   * @param {{errorType: string, message: string, [key: string]: any}} errorInfo - 错误信息
   * @returns {Promise<void>}
   */
  async sendErrorNotificationToParent(agentId, originalMessage, errorInfo) {
    if (!agentId) return;
    
    const timestamp = new Date().toISOString();
    const errorPayload = {
      kind: "error",
      errorType: errorInfo.errorType,
      message: errorInfo.message,
      agentId,
      originalMessageId: originalMessage?.id ?? null,
      taskId: originalMessage?.taskId ?? null,
      timestamp,
      ...errorInfo
    };
    
    // 触发全局错误事件（用于前端显示）
    this.runtime._emitError({
      agentId,
      errorType: errorInfo.errorType,
      message: errorInfo.message,
      originalMessageId: originalMessage?.id ?? null,
      taskId: originalMessage?.taskId ?? null,
      timestamp,
      ...errorInfo
    });

    // 1. 直接存储错误消息到聊天记录（不通过 bus.send，避免触发消息处理）
    const errorMessageId = randomUUID();
    const errorMessage = {
      id: errorMessageId,
      from: agentId,
      to: agentId,
      taskId: originalMessage?.taskId ?? null,
      payload: errorPayload,
      createdAt: timestamp
    };
    
    if (typeof this.runtime._storeErrorMessageCallback === 'function') {
      try {
        this.runtime._storeErrorMessageCallback(errorMessage);
        void this.runtime.log.info("已保存错误消息到智能体聊天记录", {
          agentId,
          errorType: errorInfo.errorType,
          messageId: errorMessageId
        });
      } catch (storeErr) {
        void this.runtime.log.error("保存错误消息到聊天记录失败", {
          agentId,
          errorType: errorInfo.errorType,
          error: storeErr?.message ?? String(storeErr)
        });
      }
    }
    
    // 2. 向父智能体发送错误通知（通过 bus.send，让父智能体知道子智能体出错了）
    const parentAgentId = this.runtime._agentMetaById.get(agentId)?.parentAgentId ?? null;
    if (!parentAgentId || !this.runtime._agents.has(parentAgentId)) {
      void this.runtime.log.debug("未找到父智能体，跳过向父智能体发送错误通知", { 
        agentId, 
        parentAgentId,
        errorType: errorInfo.errorType 
      });
      return;
    }

    try {
      this.runtime.bus.send({
        to: parentAgentId,
        from: agentId,
        taskId: originalMessage?.taskId ?? null,
        payload: errorPayload
      });
      
      void this.runtime.log.info("已向父智能体发送错误通知", {
        agentId,
        parentAgentId,
        errorType: errorInfo.errorType,
        taskId: originalMessage?.taskId ?? null
      });
    } catch (notifyErr) {
      void this.runtime.log.error("发送错误通知失败", {
        agentId,
        parentAgentId,
        errorType: errorInfo.errorType,
        notifyError: notifyErr?.message ?? String(notifyErr)
      });
    }
  }

  /**
   * 生成当前智能体的 system prompt（包含工具调用规则）。
   * @param {any} ctx - 智能体上下文
   * @returns {string}
   */
  buildSystemPromptForAgent(ctx) {
    const toolRules = ctx.systemToolRules ? "\n\n" + ctx.systemToolRules : "";
    const agentId = ctx.agent?.id ?? "";
    const parentAgentId = this.runtime._agentMetaById.get(agentId)?.parentAgentId ?? null;
    const runtimeInfo = `\n\n【运行时信息】\nagentId=${agentId}\nparentAgentId=${parentAgentId ?? ""}`;

    if (ctx.agent?.id === "root") {
      const rootPrompt = ctx.agent?.rolePrompt ?? "";
      // 动态注入可用工具组列表
      const toolGroupsInfo = this.formatToolGroupsInfo();
      return rootPrompt + runtimeInfo + toolGroupsInfo;
    }

    const base = ctx.systemBasePrompt ?? "";
    const roleRecord = ctx.agent?.roleId ? this.runtime.org.getRole(ctx.agent.roleId) : null;
    const orgPromptRaw = roleRecord?.orgPrompt ?? null;
    const orgPromptSection =
      typeof orgPromptRaw === "string" && orgPromptRaw.trim()
        ? `【组织架构】\n${orgPromptRaw}`
        : "";
    const role = ctx.agent?.rolePrompt ?? "";
    const roleWithOrg = orgPromptSection ? `${orgPromptSection}\n\n${role}` : role;
    
    // 获取并格式化 TaskBrief（Requirements 1.5）
    const taskBrief = this.runtime._agentTaskBriefs.get(agentId);
    const taskBriefText = taskBrief ? "\n\n" + formatTaskBrief(taskBrief) : "";
    
    // 获取联系人列表信息
    const contacts = this.runtime.contactManager.listContacts(agentId);
    let contactsText = "";
    if (contacts && contacts.length > 0) {
      const contactLines = contacts.map(c => `- ${c.role}（${c.id}）`);
      contactsText = `\n\n【联系人列表】\n${contactLines.join('\n')}`;
    }
    
    const composed = ctx.tools.composePrompt({
      base,
      composeTemplate: ctx.systemComposeTemplate ?? "{{BASE}}\n{{ROLE}}\n{{TASK}}",
      rolePrompt: roleWithOrg,
      taskText: "",
      workspace: ctx.systemWorkspacePrompt ?? ""
    });
    return composed + runtimeInfo + taskBriefText + contactsText + toolRules;
  }

  /**
   * 中断指定智能体的 LLM 调用。
   * @param {string} agentId - 智能体 ID
   * @returns {boolean} 是否成功中断
   */
  abort(agentId) {
    const llmClient = this.runtime.getLlmClientForAgent(agentId);
    if (!llmClient) {
      return false;
    }
    return llmClient.abort(agentId);
  }

  /**
   * 将运行时消息格式化为 LLM 可理解的文本输入。
   * 对于非 root 智能体，隐藏 taskId 以降低心智负担。
   * @param {any} ctx - 智能体上下文
   * @param {any} message - 消息对象
   * @returns {string}
   */
  /**
   * 格式化消息以供 LLM 使用。
   * 支持多模态路由（Requirements 10.6）。
   * @param {any} ctx - 智能体上下文
   * @param {any} message - 消息对象
   * @returns {Promise<string|any[]>}
   */
  async formatMessageForLlm(ctx, message) {
    const isRoot = ctx?.agent?.id === "root";
    
    // root 智能体使用原有格式（需要看到 taskId）
    if (isRoot) {
      const payloadRaw = message?.payload;
      let payloadText =
        payloadRaw?.text ??
        payloadRaw?.content ??
        (typeof payloadRaw === "string" ? payloadRaw : null);
      
      // 等待 Promise
      if (payloadText && typeof payloadText === 'object' && typeof payloadText.then === 'function') {
        payloadText = await payloadText;
      }

      const payload = payloadText ?? JSON.stringify(payloadRaw ?? {}, null, 2);
      
      return `from=${message?.from ?? ""}\nto=${message?.to ?? ""}\ntaskId=${message?.taskId ?? ""}\npayload=${payload}`;
    }
    
    // 非 root 智能体使用新的消息格式化器
    const senderId = message?.from ?? 'unknown';
    const senderInfo = this.getSenderInfo(senderId);
    let textContent = formatMessageForAgent(message, senderInfo);

    // 等待 Promise
    if (textContent && typeof textContent === 'object' && typeof textContent.then === 'function') {
      textContent = await textContent;
    }

    // 如果没有附件，直接返回文本内容
    const attachments = message?.payload?.attachments;
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      return textContent;
    }

    // 尝试通过内容路由器处理多模态内容
    try {
      const parts = [{ type: 'text', text: textContent }];
      let hasMultimodal = false;
      const agentId = ctx?.agent?.id;
      
      // 获取智能体关联的 LLM 服务 ID 和工作区 ID
      const llmClient = agentId ? this.runtime.getLlmClientForAgent(agentId) : null;
      const serviceId = llmClient?.serviceId || null;
      const workspaceId = agentId ? this.runtime._agentManager.findWorkspaceIdForAgent(agentId) : null;

      for (const att of attachments) {
        if (att.path) {
          const routed = await this.runtime.contentRouter.routeFileContent(att.path, serviceId, workspaceId);
          if (routed.contentType === 'multimodal' && Array.isArray(routed.content)) {
            // 提取多模态部分（如 image_url）
            const multimodalParts = routed.content.filter(p => p.type !== 'text');
            if (multimodalParts.length > 0) {
              parts.push(...multimodalParts);
              hasMultimodal = true;
            }
          }
        }
      }

      return hasMultimodal ? parts : textContent;
    } catch (error) {
      void this.runtime.log.error("格式化多模态消息时出错", { error: error.message, messageId: message?.id });
      return textContent;
    }
  }

  /**
   * 获取发送者信息（用于消息格式化）
   * @param {string} senderId - 发送者ID
   * @returns {{role: string}|null}
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
   * 格式化工具组信息，用于注入到系统提示词中。
   * @returns {string}
   * @private
   */
  formatToolGroupsInfo() {
    const groups = this.runtime.toolGroupManager.listGroups();
    if (!groups || groups.length === 0) {
      return "";
    }
    
    const lines = groups.map(g => `- ${g.id}：${g.description}（${g.tools.join("、")}）`);
    return `\n\n【可用工具组列表】\n${lines.join("\n")}`;
  }

  /**
   * 检查智能体上下文长度并在超限时发出警告。
   * @param {string} agentId - 智能体ID
   * @returns {{warning:boolean, currentCount?:number, maxCount?:number}}
   */
  checkContextAndWarn(agentId) {
    const result = this.runtime._conversationManager.checkAndWarn(agentId);
    
    if (result.warning) {
      void this.runtime.log.warn("智能体上下文超过限制", {
        agentId,
        currentCount: result.currentCount,
        maxCount: result.maxCount
      });
    }

    return result;
  }

  /**
   * 判断错误是否可能是“上下文长度/token 超限”。\n   *
   * 说明：不同 OpenAI 兼容服务的错误结构并不一致，这里采用“结构字段 + 文本关键词”混合判断。\n   *
   * @param {any} err
   * @returns {boolean}
   */
  isContextLengthExceededError(err) {
    const status = err?.status ?? err?.response?.status ?? null;
    const code = err?.error?.code ?? err?.code ?? null;
    const type = err?.error?.type ?? err?.type ?? null;
    const message = err && typeof err.message === "string" ? err.message : String(err ?? "");
    const messageLower = message.toLowerCase();

    if (code === "context_length_exceeded") {
      return true;
    }
    if (type === "context_length_exceeded") {
      return true;
    }
    if (status === 400 && (messageLower.includes("context length") || messageLower.includes("maximum context") || messageLower.includes("too many tokens"))) {
      return true;
    }
    if (messageLower.includes("context_length_exceeded") || messageLower.includes("maximum context length")) {
      return true;
    }
    if (message.includes("上下文") && (message.includes("超限") || message.includes("超过") || message.includes("太长"))) {
      return true;
    }
    if (message.includes("token") && (message.includes("超限") || messageLower.includes("exceed") || messageLower.includes("limit"))) {
      return true;
    }
    return false;
  }
}
