import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { ToolExecutor } from "../../src/platform/runtime/tool_executor.js";

// 创建一个最小的 mock runtime 用于测试
const mockRuntime = {};

// 创建 ToolExecutor 实例用于测试验证函数
const toolExecutor = new ToolExecutor(mockRuntime);

describe("QuickReplies Validation", () => {
  /**
   * Property 1: 输入验证完整性
   * *For any* `quickReplies` 输入，如果它不是字符串数组、包含非字符串元素、包含空字符串、或长度超过10，
   * 验证函数应返回错误；否则应返回有效结果。
   * 
   * **Validates: Requirements 1.2, 1.3, 1.5, 1.6**
   * **Feature: quick-reply-options, Property 1: 输入验证完整性**
   */

  test("Property 1: 有效的字符串数组应通过验证", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 1-10 个非空字符串的数组
        fc.array(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          { minLength: 1, maxLength: 10 }
        ),
        async (quickReplies) => {
          const result = toolExecutor._validateQuickReplies(quickReplies);
          
          expect(result.valid).toBe(true);
          expect(result.quickReplies).toEqual(quickReplies);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 超过10个元素的数组应返回错误", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 11-20 个非空字符串的数组
        fc.array(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          { minLength: 11, maxLength: 20 }
        ),
        async (quickReplies) => {
          const result = toolExecutor._validateQuickReplies(quickReplies);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBe("quickReplies_too_many");
          expect(result.message).toContain("10");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 包含非字符串元素的数组应返回错误", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成包含至少一个非字符串元素的数组
        fc.tuple(
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 5 }),
          fc.oneof(fc.integer(), fc.boolean(), fc.object(), fc.constant(null)),
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 4 })
        ).map(([before, nonString, after]) => [...before, nonString, ...after]),
        async (quickReplies) => {
          const result = toolExecutor._validateQuickReplies(quickReplies);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBe("quickReplies_invalid_type");
          expect(result.message).toContain("必须是字符串");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 包含空字符串的数组应返回错误", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成包含至少一个空字符串（或纯空白字符串）的数组
        fc.tuple(
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 5 }),
          fc.oneof(fc.constant(""), fc.constant("   "), fc.constant("\t"), fc.constant("\n")),
          fc.array(fc.string({ minLength: 1 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 4 })
        ).map(([before, emptyStr, after]) => [...before, emptyStr, ...after]),
        async (quickReplies) => {
          const result = toolExecutor._validateQuickReplies(quickReplies);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBe("quickReplies_empty_string");
          expect(result.message).toContain("不能为空");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 空数组应视为未提供（返回 null）", () => {
    const result = toolExecutor._validateQuickReplies([]);
    
    expect(result.valid).toBe(true);
    expect(result.quickReplies).toBeNull();
  });

  test("Property 1: undefined 应视为未提供（返回 null）", () => {
    const result = toolExecutor._validateQuickReplies(undefined);
    
    expect(result.valid).toBe(true);
    expect(result.quickReplies).toBeNull();
  });

  test("Property 1: null 应视为未提供（返回 null）", () => {
    const result = toolExecutor._validateQuickReplies(null);
    
    expect(result.valid).toBe(true);
    expect(result.quickReplies).toBeNull();
  });

  test("Property 1: 非数组类型应视为未提供（返回 null）", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.object()),
        async (nonArray) => {
          const result = toolExecutor._validateQuickReplies(nonArray);
          
          expect(result.valid).toBe(true);
          expect(result.quickReplies).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  test("边界情况: 恰好10个元素应通过验证", () => {
    const quickReplies = Array.from({ length: 10 }, (_, i) => `选项${i + 1}`);
    const result = toolExecutor._validateQuickReplies(quickReplies);
    
    expect(result.valid).toBe(true);
    expect(result.quickReplies).toEqual(quickReplies);
  });

  test("边界情况: 恰好11个元素应返回错误", () => {
    const quickReplies = Array.from({ length: 11 }, (_, i) => `选项${i + 1}`);
    const result = toolExecutor._validateQuickReplies(quickReplies);
    
    expect(result.valid).toBe(false);
    expect(result.error).toBe("quickReplies_too_many");
  });

  test("边界情况: 单个有效元素应通过验证", () => {
    const result = toolExecutor._validateQuickReplies(["唯一选项"]);
    
    expect(result.valid).toBe(true);
    expect(result.quickReplies).toEqual(["唯一选项"]);
  });
});


describe("QuickReplies Message Passing", () => {
  /**
   * Property 2: 消息传递完整性
   * *For any* 包含有效 `quickReplies` 的消息，发送后接收端获取的 `quickReplies` 数组
   * 应与发送时完全相同（内容和顺序）。
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3**
   * **Feature: quick-reply-options, Property 2: 消息传递完整性**
   */

  test("Property 2: quickReplies 应该被正确添加到 payload 中", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 quickReplies 数组
        fc.array(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          { minLength: 1, maxLength: 10 }
        ),
        // 生成原始 payload
        fc.record({
          text: fc.string(),
          content: fc.option(fc.string(), { nil: undefined })
        }),
        async (quickReplies, originalPayload) => {
          // 验证 quickReplies
          const validation = toolExecutor._validateQuickReplies(quickReplies);
          expect(validation.valid).toBe(true);
          
          // 模拟构建最终 payload 的逻辑
          const finalPayload = {
            ...originalPayload,
            quickReplies: validation.quickReplies
          };
          
          // 验证 quickReplies 被正确添加
          expect(finalPayload.quickReplies).toEqual(quickReplies);
          // 验证原始 payload 字段保持不变
          expect(finalPayload.text).toBe(originalPayload.text);
          if (originalPayload.content !== undefined) {
            expect(finalPayload.content).toBe(originalPayload.content);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 2: quickReplies 数组顺序应保持不变", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 quickReplies 数组
        fc.array(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          { minLength: 2, maxLength: 10 }
        ),
        async (quickReplies) => {
          const validation = toolExecutor._validateQuickReplies(quickReplies);
          
          // 验证顺序保持不变
          expect(validation.quickReplies).toEqual(quickReplies);
          
          // 逐个元素验证顺序
          for (let i = 0; i < quickReplies.length; i++) {
            expect(validation.quickReplies[i]).toBe(quickReplies[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 2: 无效的 quickReplies 不应添加到 payload", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成无效的 quickReplies（超过10个元素）
        fc.array(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          { minLength: 11, maxLength: 20 }
        ),
        async (invalidQuickReplies) => {
          const validation = toolExecutor._validateQuickReplies(invalidQuickReplies);
          
          // 验证返回错误
          expect(validation.valid).toBe(false);
          expect(validation.quickReplies).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  test("Property 2: 空 quickReplies 不应添加到 payload", () => {
    const validation = toolExecutor._validateQuickReplies([]);
    
    expect(validation.valid).toBe(true);
    expect(validation.quickReplies).toBeNull();
    
    // 模拟构建 payload 的逻辑
    const originalPayload = { text: "test" };
    let finalPayload = originalPayload;
    if (validation.quickReplies) {
      finalPayload = { ...originalPayload, quickReplies: validation.quickReplies };
    }
    
    // 验证 quickReplies 没有被添加
    expect(finalPayload.quickReplies).toBeUndefined();
  });
});
