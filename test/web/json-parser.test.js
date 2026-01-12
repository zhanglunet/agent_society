/**
 * JSON内容解析器属性测试
 * 功能: json-artifact-viewer-enhancement
 * 属性1: JSON内容解析正确性
 * 属性2: 双重编码处理
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';

// 导入解析器（模拟浏览器环境）
const { parseJsonContent, formatJsonString, isJsonType } = (() => {
  /**
   * 解析JSON内容，处理双重编码情况
   */
  function parseJsonContent(content, maxDepth = 10) {
    if (maxDepth <= 0) {
      return { 
        data: content, 
        isValid: false, 
        error: "达到最大解析深度",
        wasDoubleEncoded: false 
      };
    }

    if (content === null || content === undefined) {
      return { data: content, isValid: true, wasDoubleEncoded: false };
    }

    if (typeof content === "object") {
      return { data: content, isValid: true, wasDoubleEncoded: false };
    }

    if (typeof content === "string") {
      if (content.trim() === "") {
        return { data: content, isValid: true, wasDoubleEncoded: false };
      }

      try {
        const parsed = JSON.parse(content);
        
        if (typeof parsed === "string") {
          const result = parseJsonContent(parsed, maxDepth - 1);
          return {
            ...result,
            wasDoubleEncoded: true
          };
        }
        
        return { 
          data: parsed, 
          isValid: true, 
          wasDoubleEncoded: false 
        };
      } catch (e) {
        return { 
          data: content, 
          isValid: false, 
          error: e.message,
          wasDoubleEncoded: false 
        };
      }
    }

    return { data: content, isValid: true, wasDoubleEncoded: false };
  }

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

  function isJsonType(extension, mimeType) {
    const jsonExtensions = [".json"];
    const jsonMimeTypes = ["application/json", "text/json"];
    
    const ext = (extension || "").toLowerCase();
    const mime = (mimeType || "").toLowerCase();
    
    return jsonExtensions.includes(ext) || jsonMimeTypes.includes(mime);
  }

  return { parseJsonContent, formatJsonString, isJsonType };
})();

// JSON值生成器（不包含函数和undefined）
const jsonValueArbitrary = fc.letrec(tie => ({
  value: fc.oneof(
    { weight: 3, arbitrary: fc.string() },
    { weight: 2, arbitrary: fc.integer() },
    { weight: 2, arbitrary: fc.double({ noNaN: true, noDefaultInfinity: true }) },
    { weight: 2, arbitrary: fc.boolean() },
    { weight: 1, arbitrary: fc.constant(null) },
    { weight: 1, arbitrary: fc.array(tie('value'), { maxLength: 5 }) },
    { weight: 1, arbitrary: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), tie('value'), { maxKeys: 5 }) }
  )
})).value;

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

// JSON数组生成器
const jsonArrayArbitrary = fc.array(
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    simpleJsonObjectArbitrary
  ),
  { minLength: 1, maxLength: 10 }
);

describe('功能: json-artifact-viewer-enhancement, 属性1: JSON内容解析正确性', () => {
  test('对于任何JSON对象，序列化后解析应返回等价对象', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const stringified = JSON.stringify(obj);
          const result = parseJsonContent(stringified);
          
          expect(result.isValid).toBe(true);
          expect(result.data).toEqual(obj);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('对于任何JSON数组，序列化后解析应返回等价数组', () => {
    fc.assert(
      fc.property(
        jsonArrayArbitrary,
        (arr) => {
          const stringified = JSON.stringify(arr);
          const result = parseJsonContent(stringified);
          
          expect(result.isValid).toBe(true);
          expect(result.data).toEqual(arr);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('已经是对象的内容应直接返回', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const result = parseJsonContent(obj);
          
          expect(result.isValid).toBe(true);
          expect(result.data).toBe(obj); // 应该是同一个引用
          expect(result.wasDoubleEncoded).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('null和undefined应正确处理', () => {
    const nullResult = parseJsonContent(null);
    expect(nullResult.isValid).toBe(true);
    expect(nullResult.data).toBe(null);

    const undefinedResult = parseJsonContent(undefined);
    expect(undefinedResult.isValid).toBe(true);
    expect(undefinedResult.data).toBe(undefined);
  });

  test('无效JSON字符串应返回错误', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => {
          try {
            JSON.parse(s);
            return false; // 如果能解析，跳过
          } catch {
            return s.trim() !== ''; // 非空字符串
          }
        }),
        (invalidJson) => {
          const result = parseJsonContent(invalidJson);
          
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.data).toBe(invalidJson); // 返回原始字符串
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性2: 双重编码处理', () => {
  test('对于任何JSON对象，双重序列化后解析应返回等价对象', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          // 双重序列化
          const singleStringified = JSON.stringify(obj);
          const doubleStringified = JSON.stringify(singleStringified);
          
          const result = parseJsonContent(doubleStringified);
          
          expect(result.isValid).toBe(true);
          expect(result.data).toEqual(obj);
          expect(result.wasDoubleEncoded).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('对于任何JSON数组，双重序列化后解析应返回等价数组', () => {
    fc.assert(
      fc.property(
        jsonArrayArbitrary,
        (arr) => {
          // 双重序列化
          const singleStringified = JSON.stringify(arr);
          const doubleStringified = JSON.stringify(singleStringified);
          
          const result = parseJsonContent(doubleStringified);
          
          expect(result.isValid).toBe(true);
          expect(result.data).toEqual(arr);
          expect(result.wasDoubleEncoded).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('三重序列化也应正确处理', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          // 三重序列化
          const s1 = JSON.stringify(obj);
          const s2 = JSON.stringify(s1);
          const s3 = JSON.stringify(s2);
          
          const result = parseJsonContent(s3);
          
          expect(result.isValid).toBe(true);
          expect(result.data).toEqual(obj);
          expect(result.wasDoubleEncoded).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('单次序列化不应标记为双重编码', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const stringified = JSON.stringify(obj);
          const result = parseJsonContent(stringified);
          
          expect(result.wasDoubleEncoded).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, formatJsonString测试', () => {
  test('格式化JSON对象应返回缩进的字符串', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const formatted = formatJsonString(obj);
          const parsed = JSON.parse(formatted);
          
          expect(parsed).toEqual(obj);
          // 检查是否有缩进（多行）
          if (Object.keys(obj).length > 0) {
            expect(formatted).toContain('\n');
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

describe('功能: json-artifact-viewer-enhancement, isJsonType测试', () => {
  test('.json扩展名应识别为JSON类型', () => {
    expect(isJsonType('.json', '')).toBe(true);
    expect(isJsonType('.JSON', '')).toBe(true);
    expect(isJsonType('.Json', '')).toBe(true);
  });

  test('application/json MIME类型应识别为JSON类型', () => {
    expect(isJsonType('', 'application/json')).toBe(true);
    expect(isJsonType('', 'APPLICATION/JSON')).toBe(true);
    expect(isJsonType('', 'text/json')).toBe(true);
  });

  test('非JSON类型应返回false', () => {
    expect(isJsonType('.txt', '')).toBe(false);
    expect(isJsonType('.xml', '')).toBe(false);
    expect(isJsonType('', 'text/plain')).toBe(false);
    expect(isJsonType('', 'application/xml')).toBe(false);
  });
});
