/**
 * JSON文本视图截断属性测试
 * 功能: json-artifact-viewer-enhancement
 * 属性12: 文本视图截断正确性
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';

// 模拟文本视图截断逻辑
function renderJsonTextView(content) {
  const maxLength = 5000;
  let displayContent = content || "";
  let isTruncated = false;
  
  if (displayContent.length > maxLength) {
    displayContent = displayContent.substring(0, maxLength);
    isTruncated = true;
  }
  
  return {
    displayContent,
    isTruncated,
    originalLength: (content || "").length,
    truncatedLength: displayContent.length
  };
}

// 格式化JSON为字符串
function formatJsonString(data, indent = 2) {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, indent);
    } catch {
      return data;
    }
  }
  return JSON.stringify(data, null, indent);
}

// 简单JSON对象生成器
const simpleJsonObjectArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minKeys: 1, maxKeys: 10 }
);

// 大型JSON对象生成器（用于测试截断）
const largeJsonObjectArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.string({ minLength: 50, maxLength: 100 }),
  { minKeys: 100, maxKeys: 200 }
);

describe('功能: json-artifact-viewer-enhancement, 属性12: 文本视图截断正确性', () => {
  test('超过5000字符的内容应被截断到5000字符', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5001, maxLength: 10000 }),
        (content) => {
          const result = renderJsonTextView(content);
          
          expect(result.isTruncated).toBe(true);
          expect(result.truncatedLength).toBe(5000);
          expect(result.displayContent).toBe(content.substring(0, 5000));
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('小于等于5000字符的内容不应被截断', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 5000 }),
        (content) => {
          const result = renderJsonTextView(content);
          
          expect(result.isTruncated).toBe(false);
          expect(result.displayContent).toBe(content);
          expect(result.truncatedLength).toBe(content.length);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('正好5000字符的内容不应被截断', () => {
    const content = "a".repeat(5000);
    const result = renderJsonTextView(content);
    
    expect(result.isTruncated).toBe(false);
    expect(result.displayContent).toBe(content);
    expect(result.truncatedLength).toBe(5000);
  });
  
  test('5001字符的内容应被截断', () => {
    const content = "a".repeat(5001);
    const result = renderJsonTextView(content);
    
    expect(result.isTruncated).toBe(true);
    expect(result.truncatedLength).toBe(5000);
  });
  
  test('空内容应正确处理', () => {
    const result1 = renderJsonTextView("");
    expect(result1.isTruncated).toBe(false);
    expect(result1.displayContent).toBe("");
    
    const result2 = renderJsonTextView(null);
    expect(result2.isTruncated).toBe(false);
    expect(result2.displayContent).toBe("");
    
    const result3 = renderJsonTextView(undefined);
    expect(result3.isTruncated).toBe(false);
    expect(result3.displayContent).toBe("");
  });
  
  test('截断后的内容应是原内容的前缀', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5001, maxLength: 20000 }),
        (content) => {
          const result = renderJsonTextView(content);
          
          // 截断后的内容应该是原内容的前5000个字符
          expect(content.startsWith(result.displayContent)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('大型JSON对象格式化后应正确截断', () => {
    fc.assert(
      fc.property(
        largeJsonObjectArbitrary,
        (obj) => {
          const formatted = formatJsonString(obj);
          const result = renderJsonTextView(formatted);
          
          if (formatted.length > 5000) {
            expect(result.isTruncated).toBe(true);
            expect(result.truncatedLength).toBe(5000);
          } else {
            expect(result.isTruncated).toBe(false);
            expect(result.displayContent).toBe(formatted);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('截断信息应包含正确的原始长度', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5001, maxLength: 10000 }),
        (content) => {
          const result = renderJsonTextView(content);
          
          expect(result.originalLength).toBe(content.length);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, formatJsonString测试', () => {
  test('格式化JSON对象应产生缩进的字符串', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const formatted = formatJsonString(obj);
          
          // 应该是有效的JSON
          const parsed = JSON.parse(formatted);
          expect(parsed).toEqual(obj);
          
          // 如果有多个键，应该有换行
          if (Object.keys(obj).length > 0) {
            expect(formatted).toContain("\n");
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('格式化JSON字符串应先解析再格式化', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const stringified = JSON.stringify(obj);
          const formatted = formatJsonString(stringified);
          const parsed = JSON.parse(formatted);
          
          expect(parsed).toEqual(obj);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
