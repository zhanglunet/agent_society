/**
 * LLM 处理器模块
 * 
 * 本模块负责与 LLM 的交互，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 智能体的核心能力来自 LLM，需要一个专门的模块来：
 * - 管理与 LLM 的通信
 * - 处理工具调用循环
 * - 处理 LLM 错误和中断
 * 
 * 【主要功能】
 * 1. 处理消息并调用 LLM
 * 2. 管理工具调用循环
 * 3. 处理 LLM 错误和中断
 * 4. 向父智能体发送错误通知
 * 5. 支持多模态消息（图片附件）
 * 
 * 【处理流程】
 * 1. 检查上下文限制
 * 2. 构建系统提示词和格式化消息
 * 3. 调用 LLM 获取响应
 * 4. 处理工具调用
 * 5. 循环直到没有工具调用或达到轮次限制
 * 
 * 【与其他模块的关系】
 * - 使用 ContextBuilder 构建上下文
 * - 使用 ToolExecutor 执行工具调用
 * - 使用 Runtime 的 llm 客户端调用 LLM
 * - 使用 Runtime 的 _conversationManager 管理对话
 * 
 * @module runtime/llm_handler
 */

import { hasImageAttachments, getImageAttachments, hasFileAttachments, getFileAttachments, formatFileAttachmentContent } from "../message_formatter.js";

/**
 * LLM 处理器类
 * 
 * 负责与 LLM 的交互和工具调用循环。
 */
export class LlmHandler {
  /**
   * 创建 LLM 处理器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 获取智能体使用的 LLM 服务 ID
   * 
   * @param {string|null} agentId - 智能体ID
   * @returns {string|null} 服务ID
   * @private
   */
  _getServiceIdForAgent(agentId) {
    const runtime = this.runtime;
    
    if (!agentId) {
      return null;
    }
    
    // 获取智能体的角色信息
    const agentMeta = runtime._agentMetaById?.get(agentId);
    if (!agentMeta?.roleId) {
      return null;
    }
    
    // 从组织原语获取角色的 LLM 服务 ID
    const role = runtime.org?.getRole?.(agentMeta.roleId);
    if (role?.llmServiceId) {
      return role.llmServiceId;
    }
    
    // 如果角色没有指定服务，返回默认服务 ID
    // 检查默认 LLM 客户端的配置
    if (runtime.llm?.config?.serviceId) {
      return runtime.llm.config.serviceId;
    }
    
    return null;
  }

  /**
   * 使用 LLM 处理消息
   * 
   * 【处理流程】
   * 1. 获取智能体应使用的 LLM 客户端
   * 2. 检查上下文是否超过硬性限制
   * 3. 构建系统提示词和会话上下文
   * 4. 执行 LLM 处理循环
   * 5. 持久化对话历史
   * 
   * @param {object} ctx - 智能体上下文
   * @param {object} message - 要处理的消息
   * @returns {Promise<void>}
   */
  async handleWithLlm(ctx, message) {
    const runtime = this.runtime;
    const agentId = ctx.agent?.id ?? null;
    const llmClient = runtime.getLlmClientForAgent?.(agentId) ?? runtime.llm;
    
    if (!llmClient) return;

    // 设置初始状态
    runtime.setAgentComputeStatus?.(agentId, 'processing');

    // 检查上下文限制
    if (agentId && runtime._conversationManager?.isContextExceeded?.(agentId)) {
      const status = runtime._conversationManager.getContextStatus(agentId);
      void runtime.log?.error?.("上下文超过硬性限制，拒绝 LLM 调用", {
        agentId,
        usedTokens: status.usedTokens,
        maxTokens: status.maxTokens,
        usagePercent: (status.usagePercent * 100).toFixed(1) + '%'
      });
      
      // 向父智能体发送错误通知
      const parentAgentId = runtime._agentMetaById.get(agentId)?.parentAgentId ?? null;
      if (parentAgentId && runtime._agents.has(parentAgentId)) {
        runtime.bus.send({
          to: parentAgentId,
          from: agentId,
          taskId: message?.taskId ?? null,
          payload: {
            kind: "error",
            errorType: "context_limit_exceeded",
            message: `智能体 ${agentId} 上下文超过硬性限制 (${(status.usagePercent * 100).toFixed(1)}%)，无法继续处理`,
            agentId,
            usedTokens: status.usedTokens,
            maxTokens: status.maxTokens,
            usagePercent: status.usagePercent,
            originalMessageId: message?.id ?? null
          }
        });
      }
      runtime.setAgentComputeStatus?.(agentId, 'idle');
      return;
    }

    ctx.currentMessage = message;
    const systemPrompt = runtime._buildSystemPromptForAgent(ctx);
    const conv = runtime._ensureConversation(ctx.agent.id, systemPrompt);
    
    try {
      await this.doLlmProcessing(ctx, message, conv, agentId, llmClient);
    } finally {
      // 持久化对话历史
      if (agentId) {
        void runtime._conversationManager?.persistConversation?.(agentId);
      }
    }
  }

  /**
   * 执行 LLM 处理循环
   * 
   * @param {object} ctx - 智能体上下文
   * @param {object} message - 消息
   * @param {object[]} conv - 会话历史
   * @param {string|null} agentId - 智能体ID
   * @param {object} llmClient - LLM 客户端
   * @returns {Promise<void>}
   */
  async doLlmProcessing(ctx, message, conv, agentId, llmClient) {
    const runtime = this.runtime;
    
    // 注入上下文状态提示
    const contextStatusPrompt = runtime._conversationManager?.buildContextStatusPrompt?.(agentId) ?? "";
    let userTextContent = runtime._formatMessageForLlm(ctx, message) + contextStatusPrompt;
    
    // 检查是否有附件
    const hasImages = hasImageAttachments(message);
    const hasFiles = hasFileAttachments(message);
    void runtime.log?.info?.("检查消息附件", {
      agentId,
      hasImages,
      hasFiles,
      payloadType: typeof message?.payload,
      attachmentsCount: message?.payload?.attachments?.length ?? 0
    });
    
    // 获取当前智能体使用的 LLM 服务 ID
    const serviceId = this._getServiceIdForAgent(agentId);
    
    // 创建获取文件内容的函数
    const getFileContent = async (artifactRef) => {
      void runtime.log?.debug?.("获取文件内容", { artifactRef });
      try {
        if (runtime.artifacts && typeof runtime.artifacts.getUploadedFile === 'function') {
          const fileData = await runtime.artifacts.getUploadedFile(artifactRef);
          if (fileData && fileData.buffer) {
            const content = fileData.buffer.toString('utf-8');
            void runtime.log?.debug?.("文件内容获取成功", { 
              artifactRef, 
              contentLength: content.length,
              mimeType: fileData.metadata?.mimeType 
            });
            return {
              content,
              metadata: fileData.metadata
            };
          }
        }
        void runtime.log?.warn?.("获取文件内容失败: 文件不存在或格式错误", { artifactRef });
        return null;
      } catch (err) {
        void runtime.log?.error?.("获取文件内容异常", { artifactRef, error: err?.message, stack: err?.stack });
        return null;
      }
    };
    
    // 创建获取图片 base64 数据的函数
    const getImageBase64 = async (artifactRef) => {
      void runtime.log?.debug?.("获取图片 base64 数据", { artifactRef });
      try {
        if (runtime.artifacts && typeof runtime.artifacts.getUploadedFile === 'function') {
          const fileData = await runtime.artifacts.getUploadedFile(artifactRef);
          if (fileData && fileData.buffer) {
            void runtime.log?.debug?.("图片数据获取成功", { 
              artifactRef, 
              bufferSize: fileData.buffer.length,
              mimeType: fileData.metadata?.mimeType 
            });
            return {
              data: fileData.buffer.toString('base64'),
              mimeType: fileData.metadata?.mimeType || 'image/jpeg'
            };
          }
        }
        void runtime.log?.warn?.("获取图片数据失败: 文件不存在或格式错误", { artifactRef });
        return null;
      } catch (err) {
        void runtime.log?.error?.("获取图片数据异常", { artifactRef, error: err?.message, stack: err?.stack });
        return null;
      }
    };
    
    // 使用能力路由器处理消息内容
    let userContent = userTextContent;
    const attachments = message?.payload?.attachments ?? [];
    
    if (attachments.length > 0 && runtime.capabilityRouter && serviceId) {
      // 使用能力路由器根据模型能力处理附件
      try {
        const routeResult = await runtime.capabilityRouter.routeContent(message, serviceId, {
          getImageBase64,
          getFileContent,
          formattedTextContent: userTextContent  // 传入已格式化的文本内容
        });
        
        // 使用路由结果的内容
        if (typeof routeResult.processedContent === 'string') {
          userContent = routeResult.processedContent;
        } else if (Array.isArray(routeResult.processedContent)) {
          userContent = routeResult.processedContent;
        } else {
          userContent = userTextContent;
        }
        
        void runtime.log?.info?.("能力路由处理完成", {
          agentId,
          serviceId,
          canProcess: routeResult.canProcess,
          unsupportedCount: routeResult.unsupportedAttachments?.length ?? 0,
          isMultimodal: Array.isArray(userContent),
          contentType: Array.isArray(userContent) ? 'array' : typeof userContent
        });
        
        // 如果有不支持的附件，记录警告
        if (routeResult.unsupportedAttachments?.length > 0) {
          void runtime.log?.warn?.("部分附件类型不被当前模型支持，已转换为文本描述", {
            agentId,
            serviceId,
            unsupportedAttachments: routeResult.unsupportedAttachments.map(a => ({
              type: a.type,
              filename: a.filename,
              artifactRef: a.artifactRef
            }))
          });
        }
      } catch (err) {
        void runtime.log?.error?.("能力路由处理失败，回退到基础处理", { 
          error: err?.message, 
          stack: err?.stack 
        });
        // 回退到基础处理：只处理文件附件
        if (hasFiles) {
          try {
            userContent = await formatFileAttachmentContent(userTextContent, attachments, getFileContent);
          } catch (fileErr) {
            void runtime.log?.error?.("处理文件附件失败", { error: fileErr?.message });
          }
        }
      }
    } else if (hasFiles || hasImages) {
      // 没有能力路由器或服务ID，使用旧的处理逻辑
      void runtime.log?.warn?.("能力路由器不可用，使用基础附件处理", {
        agentId,
        hasCapabilityRouter: !!runtime.capabilityRouter,
        hasServiceId: !!serviceId
      });
      
      // 处理文件附件
      if (hasFiles) {
        try {
          userContent = await formatFileAttachmentContent(userTextContent, attachments, getFileContent);
          void runtime.log?.info?.("文件附件内容已添加到消息", {
            agentId,
            fileCount: getFileAttachments(message).length
          });
        } catch (err) {
          void runtime.log?.error?.("处理文件附件失败", { error: err?.message, stack: err?.stack });
        }
      }
      
      // 处理图片附件（仅当没有能力路由器时才直接处理，可能导致错误）
      if (hasImages) {
        void runtime.log?.warn?.("无法检查模型视觉能力，图片附件将被转换为文本描述", { agentId });
        // 将图片附件转换为文本描述，而不是直接发送
        const imageAttachments = getImageAttachments(message);
        const imageDescriptions = imageAttachments.map(att => {
          return `\n\n【图片附件: ${att.filename || '未命名图片'}】\n工件ID: ${att.artifactRef}\n[需要新的智能体配合视觉理解任务]`;
        }).join('');
        
        if (typeof userContent === 'string') {
          userContent = userContent + imageDescriptions;
        }
      }
    }
    
    conv.push({ role: "user", content: userContent });

    // 检查上下文长度
    runtime._checkContextAndWarn?.(ctx.agent.id);

    const tools = runtime.getToolDefinitions();
    
    for (let i = 0; i < runtime.maxToolRounds; i += 1) {
      // 检查是否被用户中断（状态被设置为 idle）
      const currentStatus = runtime.getAgentComputeStatus?.(agentId);
      if (currentStatus === 'idle') {
        void runtime.log?.info?.("检测到用户中断，停止处理", {
          agentId: ctx.agent?.id ?? null,
          round: i + 1
        });
        return;
      }
      
      let msg = null;
      try {
        const llmMeta = {
          agentId: ctx.agent?.id ?? null,
          roleId: ctx.agent?.roleId ?? null,
          roleName: ctx.agent?.roleName ?? null,
          messageId: message?.id ?? null,
          messageFrom: message?.from ?? null,
          taskId: message?.taskId ?? null,
          round: i + 1
        };
        void runtime.log?.info?.("请求 LLM", llmMeta);
        runtime.setAgentComputeStatus?.(agentId, 'waiting_llm');
        msg = await llmClient.chat({ messages: conv, tools, meta: llmMeta });
        runtime.setAgentComputeStatus?.(agentId, 'processing');
      } catch (err) {
        runtime.setAgentComputeStatus?.(agentId, 'idle');
        const text = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        const errorType = err?.name ?? "UnknownError";
        
        void runtime.log?.error?.("LLM 调用失败", { 
          agentId: ctx.agent?.id ?? null, 
          messageId: message?.id ?? null, 
          taskId: message?.taskId ?? null,
          errorType,
          message: text,
          round: i + 1,
          stack: err?.stack ?? null
        });

        // 从对话历史中移除导致失败的用户消息，避免下次调用时再次发送
        if (i === 0 && conv.length > 0 && conv[conv.length - 1].role === "user") {
          conv.pop();
          void runtime.log?.info?.("已从对话历史中移除导致失败的用户消息", {
            agentId: ctx.agent?.id ?? null,
            messageId: message?.id ?? null
          });
        }

        if (errorType === "AbortError") {
          void runtime.log?.info?.("LLM 调用被用户中断", { 
            agentId: ctx.agent?.id ?? null,
            messageId: message?.id ?? null,
            taskId: message?.taskId ?? null
          });
          
          // 用户中断不是错误，不向父智能体发送错误通知
          // 只记录一条简单的中断消息到当前智能体的聊天记录
          const timestamp = new Date().toISOString();
          const abortMessageId = runtime._generateUUID?.() ?? Date.now().toString();
          const abortMessage = {
            id: abortMessageId,
            from: agentId,
            to: agentId,
            taskId: message?.taskId ?? null,
            payload: {
              kind: "abort",
              errorType: "llm_call_aborted",
              message: "LLM 调用被用户中断"
            },
            createdAt: timestamp
          };
          
          if (typeof runtime._storeErrorMessageCallback === 'function') {
            try {
              runtime._storeErrorMessageCallback(abortMessage);
            } catch (storeErr) {
              void runtime.log?.error?.("保存中断消息失败", {
                agentId,
                error: storeErr?.message ?? String(storeErr)
              });
            }
          }
          
          return;
        } else {
          void runtime.log?.error?.("LLM 调用遇到非中断错误", {
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
        runtime.setAgentComputeStatus?.(agentId, 'idle');
        return;
      }
      
      // 更新 token 使用统计
      if (agentId && msg._usage) {
        runtime._conversationManager?.updateTokenUsage?.(agentId, msg._usage);
        const status = runtime._conversationManager?.getContextStatus?.(agentId);
        void runtime.log?.debug?.("更新上下文 token 使用统计", {
          agentId,
          promptTokens: msg._usage.promptTokens,
          completionTokens: msg._usage.completionTokens,
          totalTokens: msg._usage.totalTokens,
          usagePercent: status ? (status.usagePercent * 100).toFixed(1) + '%' : 'N/A',
          status: status?.status ?? 'N/A'
        });
        
        if (status?.status === 'exceeded') {
          void runtime.log?.warn?.("上下文已超过硬性限制", {
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
        // 检测工具调用意图
        const content = msg.content ?? "";
        const hasToolIntent = this._detectToolIntent(content);
        
        if (hasToolIntent && i < runtime.maxToolRounds - 1) {
          void runtime.log?.warn?.("检测到 LLM 描述了工具调用意图但未实际调用", {
            agentId: ctx.agent?.id ?? null,
            round: i + 1,
            contentPreview: content.substring(0, 200)
          });
          
          conv.push({
            role: "user",
            content: "【系统提示】你刚才描述了想要执行的操作，但没有实际调用工具函数。请注意：你必须通过 tool_calls 调用工具函数来执行操作，而不是在文本中描述。请立即调用相应的工具函数来执行你描述的操作。"
          });
          continue;
        }
        
        // 自动发送纯文本回复
        if (content.trim()) {
          const currentAgentId = ctx.agent?.id ?? "unknown";
          const targetId = "user";
          const currentTaskId = ctx.currentMessage?.taskId ?? null;
          
          void runtime.log?.info?.("LLM 返回纯文本，自动发送消息", {
            agentId: currentAgentId,
            targetId,
            contentPreview: content.substring(0, 100)
          });
          
          const sendResult = ctx.tools.sendMessage({
            to: targetId,
            from: currentAgentId,
            taskId: currentTaskId,
            payload: { text: content.trim() }
          });
          
          void runtime.loggerRoot?.logAgentLifecycleEvent?.("agent_message_sent", {
            agentId: currentAgentId,
            messageId: sendResult?.messageId ?? null,
            to: targetId,
            taskId: currentTaskId,
            autoSent: true
          });
        }
        
        runtime.setAgentComputeStatus?.(agentId, 'idle');
        return;
      }

      // 处理工具调用
      const toolNames = toolCalls.map((c) => c?.function?.name).filter(Boolean);
      void runtime.log?.debug?.("LLM 返回工具调用", {
        agentId: ctx.agent?.id ?? null,
        count: toolCalls.length,
        toolNames
      });

      for (const call of toolCalls) {
        // 在每个工具调用前检查是否被用户中断
        const statusBeforeTool = runtime.getAgentComputeStatus?.(agentId);
        if (statusBeforeTool === 'idle') {
          void runtime.log?.info?.("检测到用户中断，停止工具调用处理", {
            agentId: ctx.agent?.id ?? null,
            toolName: call?.function?.name ?? 'unknown'
          });
          return;
        }
        await this._processToolCall(ctx, call, conv, msg, message);
      }
      
      if (ctx.yieldRequested) {
        ctx.yieldRequested = false;
        runtime.setAgentComputeStatus?.(agentId, 'idle');
        return;
      }
    }
    
    // 达到轮次上限
    runtime.setAgentComputeStatus?.(agentId, 'idle');
    void runtime.log?.warn?.("工具调用轮次达到上限", {
      agentId: ctx.agent?.id ?? null,
      messageId: message?.id ?? null,
      maxToolRounds: runtime.maxToolRounds
    });

    if (agentId) {
      await this.sendErrorNotificationToParent(agentId, message, {
        errorType: "max_tool_rounds_exceeded",
        message: `智能体 ${agentId} 超过最大工具调用轮次限制 (${runtime.maxToolRounds})`,
        maxToolRounds: runtime.maxToolRounds
      });
    }
  }

  /**
   * 检测文本中是否有工具调用意图
   * 
   * @param {string} content - 文本内容
   * @returns {boolean}
   * @private
   */
  _detectToolIntent(content) {
    const toolIntentPatterns = [
      /我将.*创建/,
      /让我.*创建/,
      /我需要.*创建/,
      /我会.*创建/,
      /首先.*创建/,
      /create_role/i,
      /spawn_agent/i,
      /send_message/i,
      /我将.*调用/,
      /让我.*调用/,
      /我要.*调用/
    ];
    return toolIntentPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 处理单个工具调用
   * 
   * @param {object} ctx - 上下文
   * @param {object} call - 工具调用
   * @param {object[]} conv - 会话历史
   * @param {object} msg - LLM 响应消息
   * @param {object} message - 原始消息
   * @returns {Promise<void>}
   * @private
   */
  async _processToolCall(ctx, call, conv, msg, message) {
    const runtime = this.runtime;
    let args = {};
    
    try {
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch (parseErr) {
      const parseError = parseErr && typeof parseErr.message === "string" ? parseErr.message : String(parseErr ?? "unknown parse error");
      void runtime.log?.error?.("工具调用参数解析失败", { 
        agentId: ctx.agent?.id ?? null,
        toolName: call.function?.name ?? "unknown",
        arguments: call.function?.arguments ?? "null",
        parseError,
        callId: call.id
      });
      
      conv.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          error: "参数解析失败",
          details: parseError,
          toolName: call.function?.name ?? "unknown"
        })
      });
      return;
    }
    
    const toolName = call.function?.name ?? null;
    void runtime.log?.debug?.("解析工具调用参数", { name: toolName });
    
    let result = null;
    try {
      result = await runtime.executeToolCall(ctx, toolName, args);
    } catch (toolErr) {
      const toolError = toolErr && typeof toolErr.message === "string" ? toolErr.message : String(toolErr ?? "unknown tool error");
      void runtime.log?.error?.("工具执行失败", {
        agentId: ctx.agent?.id ?? null,
        toolName,
        args,
        toolError,
        callId: call.id,
        stack: toolErr?.stack ?? null
      });
      
      result = {
        error: "工具执行失败",
        details: toolError,
        toolName,
        args
      };
    }
    
    // 触发工具调用事件
    runtime._emitToolCall?.({
      agentId: ctx.agent?.id ?? null,
      toolName,
      args,
      result,
      taskId: message?.taskId ?? null,
      callId: call.id,
      timestamp: new Date().toISOString(),
      reasoningContent: msg.reasoning_content ?? null
    });
    
    // Special handling for get_artifact with routing field
    if (toolName === "get_artifact" && result && result.routing) {
      const toolResponse = this._formatArtifactToolResponse(result);
      conv.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResponse.content,
        // If multimodal content, add to content array
        ...(toolResponse.multimodal && { content: toolResponse.multimodalContent })
      });
      return;
    }
    
    conv.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result ?? null)
    });
  }

  /**
   * Format get_artifact tool response based on routing type
   * 
   * @param {Object} result - Route result from ArtifactContentRouter
   * @returns {Object} Formatted response
   * @private
   */
  _formatArtifactToolResponse(result) {
    switch (result.routing) {
      case "image_url":
        return {
          multimodal: true,
          multimodalContent: [
            { 
              type: "text", 
              text: `Artifact content (${result.metadata?.filename || result.metadata?.id}):` 
            },
            result.imageUrl
          ],
          content: JSON.stringify({ 
            status: "success", 
            contentType: result.contentType,
            routing: result.routing,
            metadata: result.metadata 
          })
        };
      
      case "file":
        return {
          multimodal: true,
          multimodalContent: [
            { 
              type: "text", 
              text: `Artifact content (${result.metadata?.filename || result.metadata?.id}):` 
            },
            result.file
          ],
          content: JSON.stringify({ 
            status: "success", 
            contentType: result.contentType,
            routing: result.routing,
            metadata: result.metadata 
          })
        };
      
      case "text":
      default:
        return {
          multimodal: false,
          content: JSON.stringify({
            status: "success",
            contentType: result.contentType,
            routing: result.routing,
            content: result.content,
            metadata: result.metadata
          })
        };
    }
  }

  /**
   * 向父智能体发送错误通知
   * 
   * @param {string} agentId - 当前智能体ID
   * @param {object} originalMessage - 原始消息
   * @param {object} errorInfo - 错误信息
   * @returns {Promise<void>}
   */
  async sendErrorNotificationToParent(agentId, originalMessage, errorInfo) {
    const runtime = this.runtime;
    
    if (!agentId) return;
    
    const timestamp = new Date().toISOString();
    
    // 构建错误消息 payload
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

    // 1. 直接存储错误消息到聊天记录（不通过 bus.send，避免触发消息处理）
    const errorMessageId = runtime._generateUUID?.() ?? Date.now().toString();
    const errorMessage = {
      id: errorMessageId,
      from: agentId,
      to: agentId,
      taskId: originalMessage?.taskId ?? null,
      payload: errorPayload,
      createdAt: timestamp
    };
    
    if (typeof runtime._storeErrorMessageCallback === 'function') {
      try {
        runtime._storeErrorMessageCallback(errorMessage);
        void runtime.log?.info?.("已保存错误消息到智能体聊天记录", {
          agentId,
          errorType: errorInfo.errorType,
          messageId: errorMessageId
        });
      } catch (storeErr) {
        void runtime.log?.error?.("保存错误消息到聊天记录失败", {
          agentId,
          errorType: errorInfo.errorType,
          error: storeErr?.message ?? String(storeErr)
        });
      }
    }

    // 2. 向父智能体发送错误通知（通过 bus.send，让父智能体知道子智能体出错了）
    const parentAgentId = runtime._agentMetaById.get(agentId)?.parentAgentId ?? null;
    if (!parentAgentId || !runtime._agents.has(parentAgentId)) {
      void runtime.log?.debug?.("未找到父智能体，跳过向父智能体发送错误通知", { 
        agentId, 
        parentAgentId,
        errorType: errorInfo.errorType 
      });
      return;
    }

    try {
      runtime.bus.send({
        to: parentAgentId,
        from: agentId,
        taskId: originalMessage?.taskId ?? null,
        payload: errorPayload
      });
      
      void runtime.log?.info?.("已向父智能体发送错误通知", {
        agentId,
        parentAgentId,
        errorType: errorInfo.errorType,
        taskId: originalMessage?.taskId ?? null
      });
    } catch (notifyErr) {
      void runtime.log?.error?.("发送错误通知失败", {
        agentId,
        parentAgentId,
        errorType: errorInfo.errorType,
        notifyError: notifyErr?.message ?? String(notifyErr)
      });
    }
  }
}
