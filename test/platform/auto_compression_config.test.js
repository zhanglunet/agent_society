/**
 * 自动压缩配置测试
 * 
 * 测试自动压缩配置的定义、验证、合并和可用性检查功能�?
 */

import { describe, test, expect } from '@jest/globals';
import {
  DEFAULT_AUTO_COMPRESSION_CONFIG,
  validateAutoCompressionConfig,
  mergeAutoCompressionConfig,
  isAutoCompressionAvailable
} from '../../src/platform/services/conversation/auto_compression_config.js';

describe('AutoCompressionConfig', () => {
  describe('DEFAULT_AUTO_COMPRESSION_CONFIG', () => {
    test('应该包含所有必需的配置项', () => {
      expect(DEFAULT_AUTO_COMPRESSION_CONFIG).toEqual({
        enabled: true,
        threshold: 0.8,
        keepRecentCount: 10,
        summaryMaxTokens: 1000,
        summaryModel: null,
        summaryTimeout: 30000
      });
    });

    test('默认配置应该通过验证', () => {
      const result = validateAutoCompressionConfig(DEFAULT_AUTO_COMPRESSION_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateAutoCompressionConfig', () => {
    test('应该验证有效的配�?, () => {
      const validConfig = {
        enabled: true,
        threshold: 0.8,
        keepRecentCount: 10,
        summaryMaxTokens: 1000,
        summaryModel: 'gpt-4o-mini',
        summaryTimeout: 30000
      };

      const result = validateAutoCompressionConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('应该拒绝非对象配�?, () => {
      const result = validateAutoCompressionConfig(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('配置必须是一个对�?);
    });

    test('应该验证 enabled 字段', () => {
      const config = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, enabled: 'true' };
      const result = validateAutoCompressionConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('enabled 必须是布尔�?);
    });

    test('应该验证 threshold 字段范围', () => {
      const config1 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, threshold: -0.1 };
      const result1 = validateAutoCompressionConfig(config1);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('threshold 必须�?0-1 之间的数�?);

      const config2 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, threshold: 1.1 };
      const result2 = validateAutoCompressionConfig(config2);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('threshold 必须�?0-1 之间的数�?);
    });

    test('应该验证 keepRecentCount 字段', () => {
      const config1 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, keepRecentCount: 0 };
      const result1 = validateAutoCompressionConfig(config1);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('keepRecentCount 必须是大�?的整�?);

      const config2 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, keepRecentCount: 5.5 };
      const result2 = validateAutoCompressionConfig(config2);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('keepRecentCount 必须是大�?的整�?);
    });

    test('应该验证 summaryMaxTokens 字段', () => {
      const config1 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryMaxTokens: 50 };
      const result1 = validateAutoCompressionConfig(config1);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('summaryMaxTokens 必须是大于等�?00的整�?);

      const config2 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryMaxTokens: 500.5 };
      const result2 = validateAutoCompressionConfig(config2);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('summaryMaxTokens 必须是大于等�?00的整�?);
    });

    test('应该验证 summaryModel 字段', () => {
      const config1 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryModel: null };
      const result1 = validateAutoCompressionConfig(config1);
      expect(result1.valid).toBe(true);

      const config2 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryModel: 'gpt-4o-mini' };
      const result2 = validateAutoCompressionConfig(config2);
      expect(result2.valid).toBe(true);

      const config3 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryModel: 123 };
      const result3 = validateAutoCompressionConfig(config3);
      expect(result3.valid).toBe(false);
      expect(result3.errors).toContain('summaryModel 必须是字符串或null');
    });

    test('应该验证 summaryTimeout 字段', () => {
      const config1 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryTimeout: 500 };
      const result1 = validateAutoCompressionConfig(config1);
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain('summaryTimeout 必须是大于等�?000的整数（毫秒�?);

      const config2 = { ...DEFAULT_AUTO_COMPRESSION_CONFIG, summaryTimeout: 5000.5 };
      const result2 = validateAutoCompressionConfig(config2);
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain('summaryTimeout 必须是大于等�?000的整数（毫秒�?);
    });

    test('应该收集多个验证错误', () => {
      const invalidConfig = {
        enabled: 'true',
        threshold: 1.5,
        keepRecentCount: -1,
        summaryMaxTokens: 50,
        summaryModel: 123,
        summaryTimeout: 500
      };

      const result = validateAutoCompressionConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(6);
    });
  });

  describe('mergeAutoCompressionConfig', () => {
    test('应该使用默认配置当用户配置为�?, () => {
      const result = mergeAutoCompressionConfig();
      expect(result).toEqual(DEFAULT_AUTO_COMPRESSION_CONFIG);
    });

    test('应该合并用户配置和默认配�?, () => {
      const userConfig = {
        enabled: false,
        threshold: 0.7,
        summaryModel: 'gpt-4o-mini'
      };

      const result = mergeAutoCompressionConfig(userConfig);
      expect(result).toEqual({
        ...DEFAULT_AUTO_COMPRESSION_CONFIG,
        enabled: false,
        threshold: 0.7,
        summaryModel: 'gpt-4o-mini'
      });
    });

    test('应该覆盖默认配置中的对应�?, () => {
      const userConfig = {
        keepRecentCount: 15,
        summaryTimeout: 45000
      };

      const result = mergeAutoCompressionConfig(userConfig);
      expect(result.keepRecentCount).toBe(15);
      expect(result.summaryTimeout).toBe(45000);
      expect(result.enabled).toBe(DEFAULT_AUTO_COMPRESSION_CONFIG.enabled);
    });
  });

  describe('isAutoCompressionAvailable', () => {
    test('应该返回可用当配置完整且启用', () => {
      const config = {
        ...DEFAULT_AUTO_COMPRESSION_CONFIG,
        summaryModel: 'gpt-4o-mini'
      };

      const result = isAutoCompressionAvailable(config);
      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('应该返回不可用当配置无效', () => {
      const config = {
        ...DEFAULT_AUTO_COMPRESSION_CONFIG,
        threshold: 1.5
      };

      const result = isAutoCompressionAvailable(config);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('配置无效');
    });

    test('应该返回不可用当功能被禁�?, () => {
      const config = {
        ...DEFAULT_AUTO_COMPRESSION_CONFIG,
        enabled: false,
        summaryModel: 'gpt-4o-mini'
      };

      const result = isAutoCompressionAvailable(config);
      expect(result.available).toBe(false);
      expect(result.reason).toBe('自动压缩功能已禁�?);
    });

    test('应该返回不可用当未配置摘要模�?, () => {
      const config = {
        ...DEFAULT_AUTO_COMPRESSION_CONFIG,
        summaryModel: null
      };

      const result = isAutoCompressionAvailable(config);
      expect(result.available).toBe(false);
      expect(result.reason).toBe('未配置摘要生成模�?(summaryModel)');
    });

    test('应该返回不可用当摘要模型为空字符�?, () => {
      const config = {
        ...DEFAULT_AUTO_COMPRESSION_CONFIG,
        summaryModel: ''
      };

      const result = isAutoCompressionAvailable(config);
      expect(result.available).toBe(false);
      expect(result.reason).toBe('未配置摘要生成模�?(summaryModel)');
    });
  });

  describe('边界条件测试', () => {
    test('应该接受边界�?, () => {
      const config = {
        enabled: true,
        threshold: 0.0,
        keepRecentCount: 1,
        summaryMaxTokens: 100,
        summaryModel: 'model',
        summaryTimeout: 1000
      };

      const result = validateAutoCompressionConfig(config);
      expect(result.valid).toBe(true);
    });

    test('应该接受最大边界�?, () => {
      const config = {
        enabled: true,
        threshold: 1.0,
        keepRecentCount: 1000,
        summaryMaxTokens: 10000,
        summaryModel: 'model',
        summaryTimeout: 300000
      };

      const result = validateAutoCompressionConfig(config);
      expect(result.valid).toBe(true);
    });
  });
});
