/**
 * AutoCompressionManager 单元测试
 * 
 * 测试自动压缩管理器的核心功能，特别是 token 使用情况计算逻辑�?
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AutoCompressionManager } from '../../src/platform/services/conversation/auto_compression_manager.js';

describe('AutoCompressionManager', () => {
  let manager;
  let mockConfigService;
  let mockLlmClient;
  let mockLogger;

  beforeEach(() => {
    // 创建 mock 对象
    mockConfigService = {
      get: jest.fn()
    };
    
    mockLlmClient = {
      chat: jest.fn()
    };
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // 创建管理器实�?
    manager = new AutoCompressionManager(mockConfigService, mockLlmClient, mockLogger);
  });

  describe('构造函�?, () => {
    test('应该正确初始化所有依�?, () => {
      expect(manager._configService).toBe(mockConfigService);
      expect(manager._llmClient).toBe(mockLlmClient);
      expect(manager._logger).toBe(mockLogger);
    });
  });

  describe('_loadConfig', () => {
    test('应该从配置服务读取配�?, () => {
      const userConfig = {
        enabled: true,
        threshold: 0.7,
        summaryModel: 'gpt-4o-mini'
      };
      
      mockConfigService.get.mockReturnValue(userConfig);
      
      const config = manager._loadConfig();
      
      expect(mockConfigService.get).toHaveBeenCalledWith('conversation.autoCompression');
      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe(0.7);
      expect(config.summaryModel).toBe('gpt-4o-mini');
      expect(config.keepRecentCount).toBe(10); // 默认�?
    });

    test('应该使用默认配置当配置服务返回空', () => {
      mockConfigService.get.mockReturnValue({});
      
      const config = manager._loadConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe(0.8);
      expect(config.keepRecentCount).toBe(10);
      expect(config.summaryModel).toBeNull();
    });

    test('应该处理配置读取异常', () => {
      mockConfigService.get.mockImplementation(() => {
        throw new Error('配置读取失败');
      });
      
      const config = manager._loadConfig();
      
      expect(config.enabled).toBe(true); // 使用默认配置
      expect(mockLogger.error).toHaveBeenCalledWith(
        'AutoCompressionManager._loadConfig: 配置读取失败',
        expect.objectContaining({
          error: '配置读取失败'
        })
      );
    });
  });

  describe('_calculateTokenUsage', () => {
    beforeEach(() => {
      // 设置默认配置，包�?contextLimit
      mockConfigService.get.mockReturnValue({
        enabled: true,
        threshold: 0.8,
        keepRecentCount: 10,
        summaryModel: 'gpt-4o-mini',
        contextLimit: { maxTokens: 10000 }
      });
    });

    test('应该使用准确�?token 统计数据', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      
      const tokenUsage = { promptTokens: 8000 };
      
      const result = manager._calculateTokenUsage(messages, tokenUsage);
      
      expect(result.totalTokens).toBe(8000);
      expect(result.usagePercent).toBe(0.8);
    });

    test('应该限制使用率不超过 100%', () => {
      const messages = [];
      const tokenUsage = {
        promptTokens: 15000 // 超过 maxTokens
      };
      
      const result = manager._calculateTokenUsage(messages, tokenUsage);
      
      expect(result.usagePercent).toBe(1.0);
    });

    test('应该在没有统计数据时估算 token 数量', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello world!' },
        { role: 'assistant', content: 'Hi there! How can I help you today?' }
      ];
      
      const result = manager._calculateTokenUsage(messages, null);
      
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.usagePercent).toBeGreaterThan(0);
      expect(result.usagePercent).toBeLessThanOrEqual(1.0);
    });

    test('应该处理空消息数�?, () => {
      const result = manager._calculateTokenUsage([], null);
      
      expect(result.totalTokens).toBe(0);
      expect(result.usagePercent).toBe(0);
    });

    test('应该使用配置中的 maxTokens', () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        contextLimit: { maxTokens: 20000 }
      });
      
      const messages = [{ role: 'user', content: 'test' }];
      const tokenUsage = { promptTokens: 10000 };
      
      const result = manager._calculateTokenUsage(messages, tokenUsage);
      
      expect(result.usagePercent).toBe(0.5); // 10000 / 20000
    });
  });

  describe('_extractTokenUsageFromMessages', () => {
    test('应该从消息中提取 token 统计信息', () => {
      const messages = [
        { role: 'system', content: 'You are helpful', promptTokens: 10 },
        { role: 'user', content: 'Hello', promptTokens: 5 },
        { role: 'assistant', content: 'Hi!', promptTokens: 3 }
      ];
      
      const usage = manager._extractTokenUsageFromMessages(messages);
      
      expect(usage.promptTokens).toBe(18);
    });

    test('应该处理没有 token 统计的消�?, () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' }
      ];
      
      const usage = manager._extractTokenUsageFromMessages(messages);
      
      expect(usage.promptTokens).toBe(0);
    });

    test('应该处理混合的消息（有些有统计，有些没有�?, () => {
      const messages = [
        { role: 'system', content: 'System', promptTokens: 10 },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!', promptTokens: 5 }
      ];
      
      const usage = manager._extractTokenUsageFromMessages(messages);
      
      expect(usage.promptTokens).toBe(15);
    });

    test('应该处理空消息数�?, () => {
      const usage = manager._extractTokenUsageFromMessages([]);
      
      expect(usage.promptTokens).toBe(0);
    });

    test('应该忽略 null 消息', () => {
      const messages = [
        { role: 'user', content: 'Hello', promptTokens: 10 },
        null,
        { role: 'assistant', content: 'Hi!', promptTokens: 5 }
      ];
      
      const usage = manager._extractTokenUsageFromMessages(messages);
      
      expect(usage.promptTokens).toBe(15);
    });
  });

  describe('_estimateTokensFromMessages', () => {
    test('应该估算英文消息�?token 数量', () => {
      const messages = [
        { role: 'user', content: 'Hello world! This is a test message.' }
      ];
      
      const tokens = manager._estimateTokensFromMessages(messages);
      
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100); // 合理的估算范�?
    });

    test('应该估算中文消息�?token 数量', () => {
      const messages = [
        { role: 'user', content: '你好世界！这是一个测试消息�? }
      ];
      
      const tokens = manager._estimateTokensFromMessages(messages);
      
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100);
    });

    test('应该估算混合语言消息�?token 数量', () => {
      const messages = [
        { role: 'user', content: 'Hello 你好! This is 测试 message.' }
      ];
      
      const tokens = manager._estimateTokensFromMessages(messages);
      
      expect(tokens).toBeGreaterThan(0);
    });

    test('应该考虑工具调用的额外开销', () => {
      const messagesWithoutTools = [
        { role: 'assistant', content: 'I will help you.' }
      ];
      
      const messagesWithTools = [
        { 
          role: 'assistant', 
          content: 'I will help you.',
          tool_calls: [
            { id: 'call_1', function: { name: 'test_function', arguments: '{}' } }
          ]
        }
      ];
      
      const tokensWithoutTools = manager._estimateTokensFromMessages(messagesWithoutTools);
      const tokensWithTools = manager._estimateTokensFromMessages(messagesWithTools);
      
      expect(tokensWithTools).toBeGreaterThan(tokensWithoutTools);
    });

    test('应该处理空消息数�?, () => {
      const tokens = manager._estimateTokensFromMessages([]);
      expect(tokens).toBe(0);
    });

    test('应该处理无效消息', () => {
      const messages = [
        null,
        { role: 'user' }, // 没有 content
        { role: 'assistant', content: null },
        { role: 'system', content: 'Valid message' }
      ];
      
      const tokens = manager._estimateTokensFromMessages(messages);
      
      expect(tokens).toBeGreaterThan(0); // 只计算有效消�?
    });
  });

  describe('_shouldCompress', () => {
    const config = {
      threshold: 0.8,
      keepRecentCount: 10
    };

    test('应该在达到阈值时返回 true', () => {
      const messages = new Array(20).fill({ role: 'user', content: 'test' });
      const usage = { totalTokens: 8000, usagePercent: 0.85 };
      
      const result = manager._shouldCompress(messages, usage, config);
      
      expect(result).toBe(true);
    });

    test('应该在未达到阈值时返回 false', () => {
      const messages = new Array(20).fill({ role: 'user', content: 'test' });
      const usage = { totalTokens: 7000, usagePercent: 0.7 };
      
      const result = manager._shouldCompress(messages, usage, config);
      
      expect(result).toBe(false);
    });

    test('应该在消息数量不足时返回 false', () => {
      const messages = new Array(5).fill({ role: 'user', content: 'test' }); // 少于最小要�?
      const usage = { totalTokens: 8000, usagePercent: 0.85 };
      
      const result = manager._shouldCompress(messages, usage, config);
      
      expect(result).toBe(false);
    });

    test('应该在边界条件下正确判断', () => {
      // 刚好达到阈�?
      const messages = new Array(12).fill({ role: 'user', content: 'test' }); // 刚好满足最小要�?
      const usage = { totalTokens: 8000, usagePercent: 0.8 }; // 刚好达到阈�?
      
      const result = manager._shouldCompress(messages, usage, config);
      
      expect(result).toBe(true);
    });
  });

  describe('process', () => {
    beforeEach(() => {
      // 设置默认配置
      mockConfigService.get.mockReturnValue({
        enabled: true,
        threshold: 0.8,
        keepRecentCount: 10,
        summaryModel: 'gpt-4o-mini',
        contextLimit: { maxTokens: 10000 }
      });
    });

    test('应该在配置不可用时跳过压�?, async () => {
      mockConfigService.get.mockReturnValue({ enabled: false });
      
      const messages = [{ role: 'user', content: 'test' }];
      
      await manager.process(messages);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'AutoCompressionManager.process: 自动压缩不可�?,
        expect.objectContaining({
          reason: '自动压缩功能已禁�?
        })
      );
    });

    test('应该在未达到阈值时跳过压缩', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        threshold: 0.8,
        summaryModel: 'gpt-4o-mini',
        contextLimit: { maxTokens: 10000 }
      });
      
      const messages = [{ role: 'user', content: 'test', promptTokens: 1000 }];
      
      await manager.process(messages);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'AutoCompressionManager._shouldCompress: 未达到压缩阈�?,
        expect.any(Object)
      );
    });

    test('应该在达到阈值时触发压缩', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        threshold: 0.8,
        keepRecentCount: 5,
        summaryModel: 'gpt-4o-mini',
        contextLimit: { maxTokens: 10000 }
      });
      
      const messages = new Array(15).fill({ role: 'user', content: 'test message', promptTokens: 600 });
      
      await manager.process(messages);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AutoCompressionManager.process: 触发自动压缩',
        expect.objectContaining({
          totalTokens: 9000,
          usagePercent: '90.0%'
        })
      );
    });

    test('应该捕获并记录异�?, async () => {
      mockConfigService.get.mockImplementation(() => {
        throw new Error('配置服务异常');
      });
      
      const messages = [{ role: 'user', content: 'test' }];
      
      await manager.process(messages);
      
      // 配置读取异常会在 _loadConfig 中被捕获并记�?
      expect(mockLogger.error).toHaveBeenCalledWith(
        'AutoCompressionManager._loadConfig: 配置读取失败',
        expect.objectContaining({
          error: '配置服务异常'
        })
      );
    });
  });

  describe('边界条件和异常处�?, () => {
    test('应该处理 null 参数', async () => {
      mockConfigService.get.mockReturnValue({ enabled: false });
      
      await manager.process(null);
      
      // 不应该抛出异�?
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('应该处理无效�?tokenUsage', () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        contextLimit: { maxTokens: 10000 }
      });
      
      const messages = [{ role: 'user', content: 'test' }];
      const invalidUsage = { promptTokens: 'invalid' };
      
      const result = manager._calculateTokenUsage(messages, invalidUsage);
      
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.usagePercent).toBeGreaterThanOrEqual(0);
    });
  });
});
