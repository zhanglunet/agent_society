/**
 * AutoCompressionManager 单元测试
 * 
 * 测试自动压缩管理器的核心功能：
 * - token 使用情况计算
 * - 压缩判断逻辑
 * - 对话历史完整性验证
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoCompressionManager } from '../../../../src/platform/services/conversation/auto_compression_manager.js';

describe('AutoCompressionManager', () => {
  let manager;
  let mockConfigService;
  let mockLlmClient;
  let mockLogger;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key) => {
        if (key === 'conversation.autoCompression') {
          return {
            enabled: true,
            threshold: 0.8,
            keepRecentCount: 10,
            summaryMaxTokens: 1000,
            summaryModel: 'gpt-4o-mini',
            summaryTimeout: 30000,
            contextLimit: {
              maxTokens: 128000
            }
          };
        }
        return null;
      })
    };

    mockLlmClient = {
      call: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    manager = new AutoCompressionManager(mockConfigService, mockLlmClient, mockLogger);
  });

  describe('_shouldCompress', () => {
    it('达到阈值且消息足够时返回 true', () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        promptTokens: 8000
      }));

      const usage = {
        totalTokens: 102400,
        usagePercent: 102400 / 128000
      };

      const config = manager._loadConfig();
      const result = manager._shouldCompress(messages, usage, config);

      expect(result).toBe(true);
    });

    it('未达到阈值时返回 false', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 5 }
      ];

      const usage = {
        totalTokens: 15,
        usagePercent: 15 / 128000
      };

      const config = manager._loadConfig();
      const result = manager._shouldCompress(messages, usage, config);

      expect(result).toBe(false);
    });

    it('消息数量不足时返回 false', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 5 }
      ];

      const usage = {
        totalTokens: 102400,
        usagePercent: 102400 / 128000
      };

      const config = manager._loadConfig();
      const result = manager._shouldCompress(messages, usage, config);

      expect(result).toBe(false);
    });
  });

  describe('对话历史完整性验证', () => {
    it('未达到阈值时保留完整的对话历史', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'What is 2+2?', promptTokens: 5 },
        { role: 'assistant', content: '2+2 equals 4.', promptTokens: 5 },
        { role: 'user', content: 'What is 3+3?', promptTokens: 5 },
        { role: 'assistant', content: '3+3 equals 6.', promptTokens: 5 }
      ];

      const originalLength = messages.length;
      const originalContent = messages.map(m => m.content);

      await manager.process(messages);

      expect(messages.length).toBe(originalLength);
      expect(messages.map(m => m.content)).toEqual(originalContent);
    });

    it('验证对话历史中的关键信息不丢失', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Task: Implement feature X', promptTokens: 5 },
        { role: 'assistant', content: 'I will implement feature X.', promptTokens: 5 },
        { role: 'user', content: 'Use approach A', promptTokens: 5 },
        { role: 'assistant', content: 'Understood, using approach A.', promptTokens: 5 }
      ];

      await manager.process(messages);

      const taskMessage = messages.find(m => m.content.includes('Task: Implement feature X'));
      const approachMessage = messages.find(m => m.content.includes('Use approach A'));

      expect(taskMessage).toBeDefined();
      expect(approachMessage).toBeDefined();
      expect(taskMessage.role).toBe('user');
      expect(approachMessage.role).toBe('user');
    });

    it('验证对话历史在多轮对话中保持一致', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Round 1: Question 1', promptTokens: 5 },
        { role: 'assistant', content: 'Round 1: Answer 1', promptTokens: 5 },
        { role: 'user', content: 'Round 2: Question 2', promptTokens: 5 },
        { role: 'assistant', content: 'Round 2: Answer 2', promptTokens: 5 },
        { role: 'user', content: 'Round 3: Question 3', promptTokens: 5 },
        { role: 'assistant', content: 'Round 3: Answer 3', promptTokens: 5 }
      ];

      const originalMessages = JSON.parse(JSON.stringify(messages));

      await manager.process(messages);

      expect(messages).toEqual(originalMessages);

      for (let i = 0; i < messages.length; i++) {
        expect(messages[i].role).toBe(originalMessages[i].role);
        expect(messages[i].content).toBe(originalMessages[i].content);
      }
    });

    it('验证对话历史中的上下文信息完整', async () => {
      const messages = [
        { role: 'system', content: 'You are a code review assistant.', promptTokens: 10 },
        { role: 'user', content: 'Review this code: function add(a, b) { return a + b; }', promptTokens: 15 },
        { role: 'assistant', content: 'The code looks good. It correctly adds two numbers.', promptTokens: 12 },
        { role: 'user', content: 'Add error handling for non-numeric inputs', promptTokens: 10 },
        { role: 'assistant', content: 'Here is the improved code with error handling...', promptTokens: 12 }
      ];

      const originalMessages = JSON.parse(JSON.stringify(messages));

      await manager.process(messages);

      expect(messages.length).toBe(originalMessages.length);
      expect(messages[0].content).toContain('code review');
      expect(messages[1].content).toContain('Review this code');
      expect(messages[3].content).toContain('error handling');
      expect(messages[2].content).toContain('looks good');
      expect(messages[4].content).toContain('improved code');
    });

    it('验证消息数组未被修改时保留所有消息', async () => {
      const messages = [
        { role: 'system', content: 'System prompt', promptTokens: 10 },
        { role: 'user', content: 'User message 1', promptTokens: 5 },
        { role: 'assistant', content: 'Assistant response 1', promptTokens: 5 }
      ];

      const messagesCopy = JSON.parse(JSON.stringify(messages));

      await manager.process(messages);

      expect(messages).toEqual(messagesCopy);
    });
  });

  describe('token 使用情况计算', () => {
    it('正确计算 token 使用率', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 5 },
        { role: 'assistant', content: 'Hi there!', promptTokens: 5 }
      ];

      const tokenUsage = { promptTokens: 20 };
      const result = manager._calculateTokenUsage(messages, tokenUsage);

      expect(result.totalTokens).toBe(20);
      expect(result.usagePercent).toBe(20 / 128000);
    });

    it('使用率不超过 100%', () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: 'A'.repeat(10000),
        promptTokens: 10000
      }));

      const tokenUsage = { promptTokens: 1000000 };
      const result = manager._calculateTokenUsage(messages, tokenUsage);

      expect(result.usagePercent).toBeLessThanOrEqual(1.0);
    });
  });

  describe('消息提取', () => {
    it('正确提取消息中的 token 统计', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 5 },
        { role: 'assistant', content: 'Hi there!', promptTokens: 5 }
      ];

      const result = manager._extractTokenUsageFromMessages(messages);

      expect(result.promptTokens).toBe(20);
    });

    it('忽略无效的 token 统计', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 0 },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?', promptTokens: 5 }
      ];

      const result = manager._extractTokenUsageFromMessages(messages);

      expect(result.promptTokens).toBe(15);
    });
  });

  describe('消息提取逻辑', () => {
    it('正确提取需要压缩的消息', () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        promptTokens: 1000
      }));

      const config = manager._loadConfig();
      const result = manager._extractMessagesToCompress(messages, config);

      // 应该提取除了系统提示词和最近 10 条消息之外的所有消息
      // 总共 15 条，系统提示词 1 条，最近 10 条，所以应该提取 4 条
      expect(result.length).toBe(4);
      expect(result[0].content).toBe('Message 1');
      expect(result[result.length - 1].content).toBe('Message 4');
    });

    it('消息不足时返回空数组', () => {
      const messages = [
        { role: 'system', content: 'System', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 5 }
      ];

      const config = manager._loadConfig();
      const result = manager._extractMessagesToCompress(messages, config);

      expect(result.length).toBe(0);
    });

    it('保留系统提示词和最近消息', () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        promptTokens: 1000
      }));

      const config = manager._loadConfig();
      const result = manager._extractMessagesToCompress(messages, config);

      // 验证系统提示词不在提取的消息中
      expect(result.every(m => m.content !== 'Message 0')).toBe(true);
      
      // 验证最近 10 条消息不在提取的消息中
      const recentMessages = messages.slice(-10);
      expect(result.every(m => !recentMessages.includes(m))).toBe(true);
    });
  });

  describe('摘要生成', () => {
    it('构建正确的摘要提示词', () => {
      const messages = [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '2+2 equals 4.' }
      ];

      const prompt = manager._buildSummaryPrompt(messages);

      expect(prompt).toContain('对话历史');
      expect(prompt).toContain('用户');
      expect(prompt).toContain('助手');
      expect(prompt).toContain('What is 2+2?');
      expect(prompt).toContain('2+2 equals 4.');
      expect(prompt).toContain('摘要应该');
    });

    it('摘要生成失败时返回 null', async () => {
      const messages = [
        { role: 'user', content: 'Test' }
      ];

      // 模拟 LLM 调用失败
      mockLlmClient.call = vi.fn().mockRejectedValue(new Error('LLM error'));

      const config = manager._loadConfig();
      const result = await manager._generateSummary(messages, config);

      expect(result).toBeNull();
    });

    it('未配置摘要模型时返回 null', async () => {
      const messages = [
        { role: 'user', content: 'Test' }
      ];

      // 模拟配置中没有摘要模型
      mockConfigService.get = vi.fn((key) => {
        if (key === 'conversation.autoCompression') {
          return {
            enabled: true,
            threshold: 0.8,
            keepRecentCount: 10,
            summaryMaxTokens: 1000,
            summaryModel: null,  // 未配置
            summaryTimeout: 30000,
            contextLimit: { maxTokens: 128000 }
          };
        }
        return null;
      });

      const config = manager._loadConfig();
      const result = await manager._generateSummary(messages, config);

      expect(result).toBeNull();
    });
  });

  describe('压缩执行', () => {
    it('正确执行压缩操作', () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        promptTokens: 1000
      }));

      const config = manager._loadConfig();
      const summary = '这是一个压缩摘要';

      const beforeCount = messages.length;
      manager._performCompression(messages, summary, config);
      const afterCount = messages.length;

      // 验证消息数量减少
      expect(afterCount).toBeLessThan(beforeCount);

      // 验证系统提示词保留
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('Message 0');

      // 验证摘要消息被添加
      const summaryMessage = messages.find(m => m.isCompressed);
      expect(summaryMessage).toBeDefined();
      expect(summaryMessage.content).toContain('压缩摘要');
      expect(summaryMessage.content).toContain(summary);

      // 验证最近的消息被保留
      const recentMessages = messages.slice(-config.keepRecentCount);
      expect(recentMessages.length).toBeLessThanOrEqual(config.keepRecentCount);
    });

    it('压缩后消息数组结构正确', () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        promptTokens: 1000
      }));

      const config = manager._loadConfig();
      const summary = '压缩摘要内容';

      manager._performCompression(messages, summary, config);

      // 验证消息数组结构
      // [系统提示词, 摘要消息, ...最近的消息]
      expect(messages[0].role).toBe('system');
      expect(messages[1].isCompressed).toBe(true);
      expect(messages.length).toBeLessThanOrEqual(2 + config.keepRecentCount);
    });

    it('压缩后保留最近的消息', () => {
      const messages = Array.from({ length: 25 }, (_, i) => ({
        role: i === 0 ? 'system' : i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        promptTokens: 1000
      }));

      const config = manager._loadConfig();
      const summary = '压缩摘要';

      const lastMessages = messages.slice(-config.keepRecentCount).map(m => m.content);

      manager._performCompression(messages, summary, config);

      // 验证最近的消息被保留
      const compressedMessages = messages.map(m => m.content);
      for (const msg of lastMessages) {
        expect(compressedMessages).toContain(msg);
      }
    });
  });
});
