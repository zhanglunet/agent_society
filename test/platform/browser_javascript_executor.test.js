/**
 * BrowserJavaScriptExecutor 测试
 * 
 * 测试浏览器 JavaScript 执行器的功能和正确性属性
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { BrowserJavaScriptExecutor } from "../../src/platform/runtime/browser_javascript_executor.js";
import { mkdir, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const TEST_DIR = "./test/.tmp/browser_js_executor_test";
const ARTIFACTS_DIR = path.join(TEST_DIR, "artifacts");

// 模拟 Runtime 对象
function createMockRuntime() {
  return {
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    },
    artifacts: {
      artifactsDir: ARTIFACTS_DIR,
      ensureReady: async () => {
        if (!existsSync(ARTIFACTS_DIR)) {
          await mkdir(ARTIFACTS_DIR, { recursive: true });
        }
      },
      _writeMetadata: async (id, metadata) => {
        const metaPath = path.join(ARTIFACTS_DIR, `${id}.meta.json`);
        const { writeFile } = await import("node:fs/promises");
        await writeFile(metaPath, JSON.stringify(metadata, null, 2));
      }
    },
    _jsExecutor: null // 降级执行器
  };
}

describe("BrowserJavaScriptExecutor", () => {
  let executor;
  let mockRuntime;

  beforeAll(async () => {
    // 创建测试目录
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    
    mockRuntime = createMockRuntime();
    executor = new BrowserJavaScriptExecutor(mockRuntime);
    await executor.init();
  }, 30000); // 增加超时时间，因为浏览器启动可能较慢

  afterAll(async () => {
    if (executor) {
      await executor.shutdown();
    }
    // 清理测试目录
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe("基础功能测试", () => {
    test("应该能执行简单的同步代码", async () => {
      const result = await executor.execute({ code: "return 1 + 2;" });
      expect(result).toBe(3);
    });

    test("应该能访问 input 参数", async () => {
      const result = await executor.execute({
        code: "return input.a + input.b;",
        input: { a: 10, b: 20 }
      });
      expect(result).toBe(30);
    });

    test("应该能执行异步代码", async () => {
      const result = await executor.execute({
        code: "return new Promise(resolve => setTimeout(() => resolve('async done'), 100));"
      });
      expect(result).toBe("async done");
    });

    test("应该能使用 await 关键字", async () => {
      const result = await executor.execute({
        code: `
          const delay = ms => new Promise(r => setTimeout(r, ms));
          await delay(50);
          return 'awaited';
        `
      });
      expect(result).toBe("awaited");
    });

    test("应该捕获执行错误", async () => {
      const result = await executor.execute({
        code: "throw new Error('test error');"
      });
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("test error");
    });

    test("应该拒绝无效的代码参数", async () => {
      const result = await executor.execute({ code: 123 });
      expect(result.error).toBe("invalid_args");
    });
  });


  describe("Canvas 功能测试", () => {
    test("应该能创建 Canvas 并绘图", async () => {
      const result = await executor.execute({
        code: `
          const canvas = getCanvas(200, 100);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'red';
          ctx.fillRect(0, 0, 200, 100);
          return 'drawn';
        `
      });
      
      expect(result.result).toBe("drawn");
      expect(result.images).toBeDefined();
      expect(result.images.length).toBe(1);
      expect(result.images[0]).toMatch(/\.png$/);
    });

    test("Canvas 应该是单例", async () => {
      const result = await executor.execute({
        code: `
          const canvas1 = getCanvas(300, 200);
          const canvas2 = getCanvas(100, 50); // 尺寸应该被忽略
          return {
            same: canvas1 === canvas2,
            width: canvas1.width,
            height: canvas1.height
          };
        `
      });
      
      expect(result.result.same).toBe(true);
      expect(result.result.width).toBe(300);
      expect(result.result.height).toBe(200);
    });

    test("Canvas 图像应该保存到 artifacts 目录", async () => {
      const result = await executor.execute({
        code: `
          const canvas = getCanvas(50, 50);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'blue';
          ctx.fillRect(0, 0, 50, 50);
          return 'saved';
        `
      });
      
      expect(result.images).toBeDefined();
      const imagePath = path.join(ARTIFACTS_DIR, result.images[0]);
      expect(existsSync(imagePath)).toBe(true);
      
      // 验证元数据文件
      const imageId = result.images[0].replace('.png', '');
      const metaPath = path.join(ARTIFACTS_DIR, `${imageId}.meta.json`);
      expect(existsSync(metaPath)).toBe(true);
      
      const metadata = JSON.parse(await readFile(metaPath, 'utf-8'));
      expect(metadata.type).toBe("image");
      expect(metadata.source).toBe("browser-canvas");
      expect(metadata.width).toBe(50);
      expect(metadata.height).toBe(50);
    });
  });

  describe("页面隔离测试", () => {
    test("两次执行之间应该完全隔离", async () => {
      // 第一次执行：设置全局变量
      await executor.execute({
        code: "window.testVar = 'should not persist';"
      });
      
      // 第二次执行：尝试访问全局变量
      const result = await executor.execute({
        code: "return typeof window.testVar;"
      });
      
      expect(result).toBe("undefined");
    });

    test("DOM 元素不应该在执行间持久化", async () => {
      // 第一次执行：创建 DOM 元素
      await executor.execute({
        code: `
          const div = document.createElement('div');
          div.id = 'test-element';
          document.body.appendChild(div);
        `
      });
      
      // 第二次执行：检查元素是否存在
      const result = await executor.execute({
        code: "return document.getElementById('test-element');"
      });
      
      expect(result).toBe(null);
    });
  });


  /**
   * Property 1: Code execution result consistency
   * For any valid JavaScript code with JSON-serializable input and output,
   * executing it in the browser executor SHALL produce the correct result.
   * 
   * Feature: browser-js-executor, Property 1: Code execution result consistency
   * Validates: Requirements 2.1, 2.2, 2.3, 6.2
   */
  describe("Property 1: Code execution result consistency", () => {
    test("算术运算应该产生正确结果", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 1000 }),
          fc.integer({ min: -1000, max: 1000 }),
          async (a, b) => {
            const result = await executor.execute({
              code: "return input.a + input.b;",
              input: { a, b }
            });
            expect(result).toBe(a + b);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("对象操作应该正确处理", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            value: fc.integer()
          }),
          async (obj) => {
            const result = await executor.execute({
              code: "return { name: input.name, doubled: input.value * 2 };",
              input: obj
            });
            expect(result.name).toBe(obj.name);
            expect(result.doubled).toBe(obj.value * 2);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("数组操作应该正确处理", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
          async (arr) => {
            const result = await executor.execute({
              code: "return input.reduce((a, b) => a + b, 0);",
              input: arr
            });
            const expected = arr.reduce((a, b) => a + b, 0);
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Promise resolution
   * For any code that returns a Promise resolving to a JSON-serializable value,
   * the executor SHALL await the Promise and return the resolved value.
   * 
   * Feature: browser-js-executor, Property 2: Promise resolution
   * Validates: Requirements 2.4
   */
  describe("Property 2: Promise resolution", () => {
    test("Promise 应该被正确等待和解析", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 100 }),
          async (value) => {
            const result = await executor.execute({
              code: `return new Promise(resolve => setTimeout(() => resolve(${value}), 10));`
            });
            expect(result).toBe(value);
          }
        ),
        { numRuns: 50 } // 减少次数因为每次都有延迟
      );
    });

    test("嵌套 Promise 应该被正确解析", async () => {
      const result = await executor.execute({
        code: `
          return Promise.resolve(1)
            .then(x => x + 1)
            .then(x => x * 2);
        `
      });
      expect(result).toBe(4);
    });

    test("async/await 应该正确工作", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 10 }),
          async (str) => {
            const result = await executor.execute({
              code: `
                const asyncFn = async () => {
                  await new Promise(r => setTimeout(r, 5));
                  return input;
                };
                return await asyncFn();
              `,
              input: str
            });
            expect(result).toBe(str);
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * Property 3: Timeout enforcement
   * For any code execution that runs longer than the configured timeout,
   * the executor SHALL terminate execution and return a timeout error.
   * 
   * Feature: browser-js-executor, Property 3: Timeout enforcement
   * Validates: Requirements 2.5
   */
  describe("Property 3: Timeout enforcement", () => {
    test("超时的代码应该返回超时错误", async () => {
      // 注意：这个测试需要较长时间，因为要等待超时
      const startTime = Date.now();
      const result = await executor.execute({
        code: "while(true) {}", // 无限循环
        timeout: 1000 // 1秒超时
      });
      const elapsed = Date.now() - startTime;
      
      // 应该在超时时间附近返回
      expect(elapsed).toBeLessThan(3000); // 给一些余量
      expect(result.error).toBeDefined();
    }, 10000);
  });

  /**
   * Property 4: Error capture completeness
   * For any code that throws an exception, the executor SHALL capture the error
   * and return it in a structured format with an error message.
   * 
   * Feature: browser-js-executor, Property 4: Error capture completeness
   * Validates: Requirements 2.6
   */
  describe("Property 4: Error capture completeness", () => {
    test("各种错误类型应该被正确捕获", async () => {
      const errorCases = [
        { code: "throw new Error('test');", expectedContains: "test" },
        { code: "throw new TypeError('type error');", expectedContains: "type error" },
        { code: "throw new RangeError('range error');", expectedContains: "range error" },
        { code: "throw 'string error';", expectedContains: "string error" },
        { code: "undefinedVariable;", expectedContains: "undefinedVariable" },
        { code: "null.property;", expectedContains: "" } // 任何错误消息都可以
      ];

      for (const { code, expectedContains } of errorCases) {
        const result = await executor.execute({ code });
        expect(result.error).toBe("js_execution_failed");
        expect(result.message).toBeDefined();
        if (expectedContains) {
          expect(result.message.toLowerCase()).toContain(expectedContains.toLowerCase());
        }
      }
    });

    test("随机错误消息应该被正确捕获", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes("'") && !s.includes("\\")),
          async (errorMsg) => {
            const result = await executor.execute({
              code: `throw new Error('${errorMsg}');`
            });
            expect(result.error).toBe("js_execution_failed");
            expect(result.message).toContain(errorMsg);
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * Property 5: Canvas creation with dimensions
   * For any valid width and height parameters passed to getCanvas(),
   * the returned Canvas element SHALL have exactly those dimensions.
   * 
   * Feature: browser-js-executor, Property 5: Canvas creation with dimensions
   * Validates: Requirements 3.1
   */
  describe("Property 5: Canvas creation with dimensions", () => {
    test("Canvas 应该具有指定的尺寸", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2000 }),
          fc.integer({ min: 1, max: 2000 }),
          async (width, height) => {
            const result = await executor.execute({
              code: `
                const canvas = getCanvas(${width}, ${height});
                return { width: canvas.width, height: canvas.height };
              `
            });
            expect(result.result.width).toBe(width);
            expect(result.result.height).toBe(height);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("默认尺寸应该是 800x600", async () => {
      const result = await executor.execute({
        code: `
          const canvas = getCanvas();
          return { width: canvas.width, height: canvas.height };
        `
      });
      expect(result.result.width).toBe(800);
      expect(result.result.height).toBe(600);
    });
  });

  /**
   * Property 6: Canvas singleton behavior
   * For any sequence of getCanvas() calls within a single execution,
   * all calls SHALL return the same Canvas instance.
   * 
   * Feature: browser-js-executor, Property 6: Canvas singleton behavior
   * Validates: Requirements 3.5
   */
  describe("Property 6: Canvas singleton behavior", () => {
    test("多次调用 getCanvas 应该返回同一实例", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (callCount) => {
            const code = `
              const canvases = [];
              for (let i = 0; i < ${callCount}; i++) {
                canvases.push(getCanvas(100 + i, 100 + i));
              }
              const allSame = canvases.every(c => c === canvases[0]);
              return { allSame, count: canvases.length };
            `;
            const result = await executor.execute({ code });
            expect(result.result.allSame).toBe(true);
            expect(result.result.count).toBe(callCount);
          }
        ),
        { numRuns: 30 }
      );
    });

    test("第一次调用的尺寸应该被保留", async () => {
      const result = await executor.execute({
        code: `
          const canvas1 = getCanvas(123, 456);
          const canvas2 = getCanvas(999, 888);
          return {
            width: canvas2.width,
            height: canvas2.height
          };
        `
      });
      expect(result.result.width).toBe(123);
      expect(result.result.height).toBe(456);
    });
  });

  /**
   * Property 7: Canvas export with metadata
   * For any code execution that uses Canvas, the executor SHALL export
   * the Canvas as a PNG image with proper metadata.
   * 
   * Feature: browser-js-executor, Property 7: Canvas export with metadata
   * Validates: Requirements 3.3, 3.4
   */
  describe("Property 7: Canvas export with metadata", () => {
    test("Canvas 导出应该包含正确的元数据", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 500 }),
          fc.integer({ min: 50, max: 500 }),
          async (width, height) => {
            const result = await executor.execute({
              code: `
                const canvas = getCanvas(${width}, ${height});
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'green';
                ctx.fillRect(0, 0, ${width}, ${height});
                return 'exported';
              `
            });
            
            expect(result.images).toBeDefined();
            expect(result.images.length).toBe(1);
            
            // 验证元数据
            const imageId = result.images[0].replace('.png', '');
            const metaPath = path.join(ARTIFACTS_DIR, `${imageId}.meta.json`);
            const metadata = JSON.parse(await readFile(metaPath, 'utf-8'));
            
            expect(metadata.width).toBe(width);
            expect(metadata.height).toBe(height);
            expect(metadata.source).toBe("browser-canvas");
            expect(metadata.type).toBe("image");
          }
        ),
        { numRuns: 20 }
      );
    });
  });


  /**
   * Property 9: Page state isolation
   * For any two consecutive code executions, the second execution
   * SHALL NOT be able to access state from the first execution.
   * 
   * Feature: browser-js-executor, Property 9: Page state isolation
   * Validates: Requirements 5.1, 5.2, 5.3
   */
  describe("Property 9: Page state isolation", () => {
    test("全局变量不应该在执行间持久化", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
          fc.integer(),
          async (varName, value) => {
            // 第一次执行：设置全局变量
            await executor.execute({
              code: `window.${varName} = ${value};`
            });
            
            // 第二次执行：检查变量是否存在
            const result = await executor.execute({
              code: `return typeof window.${varName};`
            });
            
            expect(result).toBe("undefined");
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Property 10: Browser instance reuse
   * For any sequence of code executions, the executor SHALL reuse
   * the same browser instance.
   * 
   * Feature: browser-js-executor, Property 10: Browser instance reuse
   * Validates: Requirements 7.1, 7.2
   */
  describe("Property 10: Browser instance reuse", () => {
    test("多次执行应该复用同一浏览器实例", async () => {
      // 获取初始浏览器状态
      const initialAvailable = executor.isBrowserAvailable();
      expect(initialAvailable).toBe(true);
      
      // 执行多次代码
      for (let i = 0; i < 5; i++) {
        const result = await executor.execute({
          code: `return ${i} * 2;`
        });
        expect(result).toBe(i * 2);
        
        // 每次执行后浏览器应该仍然可用
        expect(executor.isBrowserAvailable()).toBe(true);
      }
    });

    test("浏览器实例应该在多次执行间保持稳定", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (value) => {
            const result = await executor.execute({
              code: `return input * 2;`,
              input: value
            });
            expect(result).toBe(value * 2);
            expect(executor.isBrowserAvailable()).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
