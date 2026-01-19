/**
 * 自动压缩管理器
 * 
 * 负责智能体历史消息的自动压缩逻辑。
 * 当上下文使用率达到阈值时，自动触发压缩流程，
 * 通过独立的 LLM 请求生成压缩摘要，直接修改消息数组实现压缩。
 */

import { 
  mergeAutoCompressionConfig, 
  isAutoCompressionAvailable 
} from './auto_compression_config.js';

/**
 * 自动压缩管理器类
 * 
 * 作为 ConversationManager 的子模块，负责所有与自动压缩相关的逻辑。
 * 接收会话消息数组的引用，自己判断、处理、直接修改数据。
 */
export class AutoCompressionManager {
  /**
   * 创建自动压缩管理器实例
   * 
   * @param {Object} configService - 配置服务引用，用于读取自动压缩配置
   * @param {Object} llmClient - LLM 客户端引用，用于生成压缩摘要
   * @param {Object} logger - 日志记录器，用于记录压缩过程和错误信息
   */
  constructor(configService, llmClient, logger) {
    this._configService = configService;
    this._llmClient = llmClient;
    this._logger = logger;
  }

  /**
   * 处理会话的自动压缩
   * 
   * 接收会话消息数组引用，自己判断是否需要压缩，需要则直接修改消息数组。
   * 从消息中提取 token 统计信息，从配置服务读取 contextLimit。
   * 不返回任何值，失败时不修改数据，只打印日志。
   * 
   * @param {Array} messages - 会话消息数组（引用传递），每条消息包含 token 统计信息
   * @returns {Promise<void>}
   */
  async process(messages) {
    try {
      // 处理 null 或无效参数
      if (!Array.isArray(messages)) {
        this._logger?.debug?.('AutoCompressionManager.process: 无效的消息数组', {
          messagesType: typeof messages
        });
        return;
      }

      // 加载配置
      const config = this._loadConfig();
      
      // 检查配置是否可用
      const availability = isAutoCompressionAvailable(config);
      if (!availability.available) {
        this._logger?.debug?.('AutoCompressionManager.process: 自动压缩不可用', {
          reason: availability.reason,
          messageCount: messages.length
        });
        return;
      }

      // 从消息中提取 token 统计信息
      const tokenUsage = this._extractTokenUsageFromMessages(messages);
      
      // 计算 token 使用情况
      const usage = this._calculateTokenUsage(messages, tokenUsage);
      
      this._logger?.debug?.('AutoCompressionManager.process: 计算 token 使用情况', {
        totalTokens: usage.totalTokens,
        usagePercent: (usage.usagePercent * 100).toFixed(1) + '%',
        threshold: (config.threshold * 100).toFixed(1) + '%',
        messageCount: messages.length
      });

      // 检查是否需要压缩
      if (!this._shouldCompress(messages, usage, config)) {
        return;
      }

      this._logger?.info?.('AutoCompressionManager.process: 触发自动压缩', {
        totalTokens: usage.totalTokens,
        usagePercent: (usage.usagePercent * 100).toFixed(1) + '%',
        messageCount: messages.length,
        threshold: (config.threshold * 100).toFixed(1) + '%'
      });

      // 记录压缩前的状态
      const beforeCount = messages.length;

      // 提取需要压缩的消息
      const messagesToCompress = this._extractMessagesToCompress(messages, config);
      
      if (messagesToCompress.length === 0) {
        this._logger?.debug?.('AutoCompressionManager.process: 没有消息需要压缩', {
          messageCount: messages.length
        });
        return;
      }

      // 生成压缩摘要
      const summary = await this._generateSummary(messagesToCompress, config);
      
      if (!summary) {
        this._logger?.warn?.('AutoCompressionManager.process: 摘要生成失败，忽略本次压缩', {
          messageCount: messages.length,
          willWaitForHardLimit: true
        });
        return;
      }

      // 执行压缩操作（直接修改 messages 数组）
      this._performCompression(messages, summary, config);

      // 记录压缩后的状态
      const afterCount = messages.length;
      this._logger?.info?.('AutoCompressionManager.process: 自动压缩完成', {
        beforeCount,
        afterCount,
        compressed: true,
        summaryLength: summary.length,
        removedCount: beforeCount - afterCount
      });

    } catch (error) {
      // 捕获所有异常，确保不影响业务流程
      this._logger?.error?.('AutoCompressionManager.process: 自动压缩异常', {
        error: error.message,
        stack: error.stack,
        messageCount: Array.isArray(messages) ? messages.length : 0
      });
    }
  }

  /**
   * 从配置服务读取自动压缩配置
   * 
   * @returns {AutoCompressionConfig} 合并后的完整配置
   * @private
   */
  _loadConfig() {
    try {
      // 从配置服务读取用户配置
      const userConfig = this._configService?.get?.('conversation.autoCompression') || {};
      
      // 合并用户配置和默认配置
      const config = mergeAutoCompressionConfig(userConfig);
      
      this._logger?.debug?.('AutoCompressionManager._loadConfig: 配置已加载', {
        config
      });
      
      return config;
      
    } catch (error) {
      this._logger?.error?.('AutoCompressionManager._loadConfig: 配置读取失败', {
        error: error.message
      });
      
      // 返回默认配置
      return mergeAutoCompressionConfig({});
    }
  }

  /**
   * 从消息数组中提取 token 使用统计信息
   * 
   * 遍历消息数组，收集每条消息中的 token 统计数据。
   * 
   * @param {Array} messages - 会话消息数组
   * @returns {{promptTokens: number}} token 使用统计
   * @private
   */
  _extractTokenUsageFromMessages(messages) {
    let totalTokens = 0;

    for (const message of messages) {
      if (!message) {
        continue;
      }

      // 如果消息中有 token 统计信息，累加
      if (typeof message.promptTokens === 'number' && message.promptTokens > 0) {
        totalTokens += message.promptTokens;
      }
    }

    return {
      promptTokens: totalTokens
    };
  }

  /**
   * 计算消息数组的 token 使用情况
   * 
   * 根据传入的 token 使用统计和配置中的 contextLimit，计算当前的使用率。
   * 如果没有 token 统计数据，则估算消息的 token 数量。
   * 
   * @param {Array} messages - 会话消息数组
   * @param {Object} tokenUsage - 从消息中提取的 token 使用统计 {promptTokens}
   * @returns {{totalTokens: number, usagePercent: number}} token 使用情况
   * @private
   */
  _calculateTokenUsage(messages, tokenUsage) {
    // 从配置中读取 contextLimit
    const config = this._loadConfig();
    const maxTokens = config.contextLimit?.maxTokens || 128000;
    
    // 如果有准确的 token 统计数据，优先使用
    if (tokenUsage && typeof tokenUsage.promptTokens === 'number' && tokenUsage.promptTokens > 0) {
      const usagePercent = tokenUsage.promptTokens / maxTokens;
      
      return {
        totalTokens: tokenUsage.promptTokens,
        usagePercent: Math.min(usagePercent, 1.0) // 确保不超过 100%
      };
    }

    // 如果没有准确的统计数据，估算 token 数量
    const estimatedTokens = this._estimateTokensFromMessages(messages);
    const usagePercent = estimatedTokens / maxTokens;
    
    this._logger?.debug?.('AutoCompressionManager._calculateTokenUsage: 使用估算的 token 数量', {
      estimatedTokens,
      messageCount: messages.length,
      usagePercent: (usagePercent * 100).toFixed(1) + '%'
    });

    return {
      totalTokens: estimatedTokens,
      usagePercent: Math.min(usagePercent, 1.0)
    };
  }

  /**
   * 估算消息数组的 token 数量
   * 
   * 使用简单的启发式方法估算 token 数量：
   * - 英文：约 4 个字符 = 1 个 token
   * - 中文：约 1.5 个字符 = 1 个 token
   * - 考虑消息结构的额外开销
   * 
   * @param {Array} messages - 会话消息数组
   * @returns {number} 估算的 token 数量
   * @private
   */
  _estimateTokensFromMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 0;
    }

    let totalChars = 0;
    let structureOverhead = 0;
    let allContent = ''; // 用于统计中文字符

    for (const message of messages) {
      if (!message || typeof message.content !== 'string') {
        continue;
      }

      // 计算消息内容的字符数
      const content = message.content;
      totalChars += content.length;
      allContent += content;

      // 消息结构的额外开销（role、metadata 等）
      structureOverhead += 20; // 每条消息约 20 个 token 的结构开销

      // 如果有工具调用，增加额外开销
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        structureOverhead += message.tool_calls.length * 50; // 每个工具调用约 50 token
      }
    }

    // 估算 token 数量
    // 中文字符较多时使用较小的比例，英文字符较多时使用较大的比例
    const chineseCharCount = (allContent.match(/[\u4e00-\u9fff]/g) || []).length;
    const chineseRatio = totalChars > 0 ? chineseCharCount / totalChars : 0;
    
    // 混合比例：中文 1.5 字符/token，英文 4 字符/token
    const avgCharsPerToken = 4 - (chineseRatio * 2.5); // 1.5 到 4 之间
    const contentTokens = totalChars > 0 ? Math.ceil(totalChars / avgCharsPerToken) : 0;
    
    const estimatedTokens = contentTokens + structureOverhead;
    
    this._logger?.debug?.('AutoCompressionManager._estimateTokensFromMessages: token 估算详情', {
      totalChars,
      chineseCharCount,
      chineseRatio: (chineseRatio * 100).toFixed(1) + '%',
      avgCharsPerToken: avgCharsPerToken.toFixed(1),
      contentTokens,
      structureOverhead,
      estimatedTokens
    });

    return estimatedTokens;
  }

  /**
   * 检查是否需要执行自动压缩
   * 
   * 基于以下条件判断：
   * 1. token 使用率是否达到配置的阈值
   * 2. 消息数量是否足够进行压缩（至少需要保留系统提示词和最近消息）
   * 
   * @param {Array} messages - 会话消息数组
   * @param {{totalTokens: number, usagePercent: number}} usage - token 使用情况
   * @param {Object} config - 自动压缩配置
   * @returns {boolean} 是否需要压缩
   * @private
   */
  _shouldCompress(messages, usage, config) {
    // 检查 token 使用率是否达到阈值
    if (usage.usagePercent < config.threshold) {
      this._logger?.debug?.('AutoCompressionManager._shouldCompress: 未达到压缩阈值', {
        usagePercent: (usage.usagePercent * 100).toFixed(1) + '%',
        threshold: (config.threshold * 100).toFixed(1) + '%'
      });
      return false;
    }

    // 检查消息数量是否足够压缩
    // 需要至少有：系统提示词(1) + 要保留的消息(keepRecentCount) + 至少1条要压缩的消息
    const minRequiredMessages = 1 + config.keepRecentCount + 1;
    if (messages.length < minRequiredMessages) {
      this._logger?.debug?.('AutoCompressionManager._shouldCompress: 消息数量不足，无法压缩', {
        messageCount: messages.length,
        minRequired: minRequiredMessages,
        keepRecentCount: config.keepRecentCount
      });
      return false;
    }

    return true;
  }

  /**
   * 提取需要压缩的消息
   * 
   * 保留系统提示词（第一条消息）和最近的 N 条消息，
   * 其余消息作为需要压缩的消息返回。
   * 
   * @param {Array} messages - 会话消息数组
   * @param {Object} config - 自动压缩配置
   * @returns {Array} 需要压缩的消息数组
   * @private
   */
  _extractMessagesToCompress(messages, config) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    // 系统提示词始终保留（第一条消息）
    // 最近的 N 条消息也要保留
    // 其余消息作为需要压缩的消息
    
    const keepRecentCount = config.keepRecentCount;
    const totalMessages = messages.length;
    
    // 计算需要压缩的消息范围
    // 从第二条消息开始，到倒数第 keepRecentCount 条消息为止
    const compressEndIndex = totalMessages - keepRecentCount;
    
    if (compressEndIndex <= 1) {
      // 没有足够的消息可以压缩
      return [];
    }

    // 提取需要压缩的消息（从索引 1 到 compressEndIndex）
    const messagesToCompress = messages.slice(1, compressEndIndex);

    this._logger?.debug?.('AutoCompressionManager._extractMessagesToCompress: 消息提取完成', {
      totalMessages,
      keepRecentCount,
      compressCount: messagesToCompress.length,
      compressStartIndex: 1,
      compressEndIndex
    });

    return messagesToCompress;
  }

  /**
   * 生成压缩摘要
   * 
   * 调用 LLM 生成需要压缩的消息的摘要。
   * 如果生成失败或超时，返回 null。
   * 
   * @param {Array} messagesToCompress - 需要压缩的消息数组
   * @param {Object} config - 自动压缩配置
   * @returns {Promise<string|null>} 生成的摘要，失败时返回 null
   * @private
   */
  async _generateSummary(messagesToCompress, config) {
    try {
      // 检查是否配置了摘要模型
      if (!config.summaryModel) {
        this._logger?.warn?.('AutoCompressionManager._generateSummary: 未配置摘要模型', {
          messageCount: messagesToCompress.length
        });
        return null;
      }

      // 构建摘要生成提示词
      const prompt = this._buildSummaryPrompt(messagesToCompress);

      this._logger?.debug?.('AutoCompressionManager._generateSummary: 开始生成摘要', {
        messageCount: messagesToCompress.length,
        model: config.summaryModel,
        timeout: config.summaryTimeout
      });

      // 调用 LLM 生成摘要
      const startTime = Date.now();
      
      const response = await Promise.race([
        this._llmClient.call({
          model: config.summaryModel,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: config.summaryMaxTokens,
          temperature: 0.3  // 使用较低的温度以获得更稳定的摘要
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('摘要生成超时')), config.summaryTimeout)
        )
      ]);

      const elapsedTime = Date.now() - startTime;

      // 提取摘要内容
      const summary = response?.choices?.[0]?.message?.content ?? null;

      if (!summary) {
        this._logger?.warn?.('AutoCompressionManager._generateSummary: LLM 返回空摘要', {
          messageCount: messagesToCompress.length,
          elapsedTime
        });
        return null;
      }

      this._logger?.info?.('AutoCompressionManager._generateSummary: 摘要生成成功', {
        messageCount: messagesToCompress.length,
        summaryLength: summary.length,
        elapsedTime
      });

      return summary;

    } catch (error) {
      this._logger?.warn?.('AutoCompressionManager._generateSummary: 摘要生成失败', {
        error: error.message,
        messageCount: messagesToCompress.length
      });
      return null;
    }
  }

  /**
   * 构建摘要生成提示词
   * 
   * 将需要压缩的消息格式化为提示词，指导 LLM 生成高质量的摘要。
   * 
   * @param {Array} messagesToCompress - 需要压缩的消息数组
   * @returns {string} 格式化的提示词
   * @private
   */
  _buildSummaryPrompt(messagesToCompress) {
    // 格式化消息历史
    const formattedMessages = messagesToCompress
      .map((msg, index) => {
        const role = msg.role === 'assistant' ? '助手' : msg.role === 'user' ? '用户' : msg.role;
        return `[${index + 1}] ${role}: ${msg.content}`;
      })
      .join('\n\n');

    // 构建提示词
    const prompt = `请为以下对话历史生成一个简洁的摘要。摘要应该：
1. 保留关键信息和重要决策
2. 记录已完成的工作和待办事项
3. 保留任务目标和上下文
4. 长度控制在 500-1000 字符之间
5. 使用清晰、结构化的格式

对话历史：
${formattedMessages}

请生成摘要：`;

    return prompt;
  }

  /**
   * 执行压缩操作
   * 
   * 直接修改消息数组，实现压缩效果：
   * 1. 保留系统提示词（第一条消息）
   * 2. 添加压缩摘要作为新的消息
   * 3. 保留最近的 N 条消息
   * 
   * @param {Array} messages - 会话消息数组（直接修改）
   * @param {string} summary - 压缩摘要
   * @param {Object} config - 自动压缩配置
   * @private
   */
  _performCompression(messages, summary, config) {
    try {
      // 保留系统提示词（第一条消息）
      const systemMessage = messages[0];
      
      // 保留最近的 N 条消息
      const keepRecentCount = config.keepRecentCount;
      const recentMessages = messages.slice(-keepRecentCount);

      // 创建摘要消息
      const summaryMessage = {
        role: 'assistant',
        content: `[压缩摘要]\n${summary}`,
        isCompressed: true,
        compressedAt: new Date().toISOString()
      };

      // 重新构建消息数组
      // 结构：[系统提示词, 摘要消息, ...最近的消息]
      const newMessages = [systemMessage, summaryMessage, ...recentMessages];

      // 清空原数组并填充新消息
      messages.length = 0;
      messages.push(...newMessages);

      this._logger?.debug?.('AutoCompressionManager._performCompression: 压缩执行完成', {
        beforeCount: messages.length + (config.keepRecentCount + 1),
        afterCount: messages.length,
        summaryLength: summary.length
      });

    } catch (error) {
      this._logger?.error?.('AutoCompressionManager._performCompression: 压缩执行失败', {
        error: error.message,
        messageCount: messages.length
      });
      throw error;
    }
  }
}