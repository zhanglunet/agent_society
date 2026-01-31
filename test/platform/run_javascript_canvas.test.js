import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { Runtime } from "../../src/platform/core/runtime.js";
import { mkdir, rm, readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const TEST_DIR = "./test/.tmp/canvas_test_runtime";

// 共享�?runtime 实例，避免每个测试都启动/关闭浏览�?
let sharedRuntime = null;

describe("run_javascript Canvas 功能", () => {
  let runtime;

  beforeAll(async () => {
    // 只初始化一�?runtime
    sharedRuntime = new Runtime({ configPath: "config/app.json" });
    await sharedRuntime.init();
  });

  afterAll(async () => {
    // 测试结束后关�?runtime
    if (sharedRuntime) {
      await sharedRuntime.shutdown();
      sharedRuntime = null;
    }
  });

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    runtime = sharedRuntime;
    // 覆盖 artifacts 目录用于测试
    runtime.artifacts.artifactsDir = TEST_DIR;
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("6.1 getCanvas 基础测试", () => {
    test("getCanvas 函数存在且可调用", async () => {
      const code = `
        return typeof getCanvas === 'function';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      // 如果使用�?getCanvas，结果会是对象；如果只是检查类型，返回布尔�?
      expect(result).toBe(true);
    });

    test("getCanvas 默认尺寸�?800x600", async () => {
      const code = `
        const canvas = getCanvas();
        return { width: canvas.width, height: canvas.height };
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toEqual({ width: 800, height: 600 });
      expect(result.artifactIds).toBeDefined();
      expect(result.artifactIds.length).toBe(1);
    });

    test("getCanvas 支持自定义尺�?, async () => {
      const code = `
        const canvas = getCanvas(400, 300);
        return { width: canvas.width, height: canvas.height };
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toEqual({ width: 400, height: 300 });
    });

    test("getCanvas 多次调用返回不同实例（每次创建新 canvas�?, async () => {
      const code = `
        const canvas1 = getCanvas(200, 200);
        const canvas2 = getCanvas(400, 400); // 第二次调用应返回新实�?
        return {
          sameInstance: canvas1 === canvas2,
          width1: canvas1.width,
          height1: canvas1.height,
          width2: canvas2.width,
          height2: canvas2.height
        };
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result.sameInstance).toBe(false); // 应该是不同实�?
      expect(result.result.width1).toBe(200);
      expect(result.result.height1).toBe(200);
      expect(result.result.width2).toBe(400);
      expect(result.result.height2).toBe(400);
    });

    test("getCanvas 返回�?Canvas 支持 getContext('2d')", async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        return ctx !== null && typeof ctx.fillRect === 'function';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe(true);
    });
  });

  describe("6.2 自动导出测试", () => {
    test("使用 Canvas 后结果包�?artifactIds 数组", async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'blue';
        ctx.fillRect(0, 0, 100, 100);
        return 'done';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result).toHaveProperty('result', 'done');
      expect(result).toHaveProperty('artifactIds');
      expect(Array.isArray(result.artifactIds)).toBe(true);
      expect(result.artifactIds.length).toBe(1);
      expect(result.artifactIds[0]).toMatch(/^[0-9a-f-]+$/); // UUID格式
    });

    test("不使�?Canvas 时保持原有行为（�?artifactIds 字段�?, async () => {
      const code = `
        return 1 + 2;
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result).toBe(3);
      expect(result).not.toHaveProperty('artifactIds');
    });

    test("PNG 文件正确保存�?artifacts 目录", async () => {
      const code = `
        const canvas = getCanvas(50, 50);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'green';
        ctx.fillRect(0, 0, 50, 50);
        return 'saved';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      
      // 验证文件存在
      const artifactId = result.artifactIds[0];
      const fileName = `${artifactId}.png`;
      const filePath = path.join(TEST_DIR, fileName);
      expect(existsSync(filePath)).toBe(true);
      
      // 验证�?PNG 文件（检查魔数）
      const buffer = await readFile(filePath);
      // PNG 魔数: 89 50 4E 47 0D 0A 1A 0A
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4E); // N
      expect(buffer[3]).toBe(0x47); // G
    });

    test("每次执行生成唯一的工件ID", async () => {
      const code = `
        const canvas = getCanvas(10, 10);
        return 'ok';
      `;
      
      const result1 = await runtime._runJavaScriptTool({ code });
      const result2 = await runtime._runJavaScriptTool({ code });
      
      expect(result1.artifactIds[0]).not.toBe(result2.artifactIds[0]);
    });

    test("多次调用 getCanvas 生成多个工件", async () => {
      const code = `
        const canvas1 = getCanvas(100, 100);
        const ctx1 = canvas1.getContext('2d');
        ctx1.fillStyle = 'red';
        ctx1.fillRect(0, 0, 100, 100);
        
        const canvas2 = getCanvas(200, 200);
        const ctx2 = canvas2.getContext('2d');
        ctx2.fillStyle = 'blue';
        ctx2.fillRect(0, 0, 200, 200);
        
        const canvas3 = getCanvas(150, 150);
        const ctx3 = canvas3.getContext('2d');
        ctx3.fillStyle = 'green';
        ctx3.fillRect(0, 0, 150, 150);
        
        return 'three canvases';
      `;
      
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('three canvases');
      expect(result.artifactIds).toBeDefined();
      expect(Array.isArray(result.artifactIds)).toBe(true);
      expect(result.artifactIds.length).toBe(3); // 应该生成 3 个图像文�?
      
      // 验证所有文件都存在
      for (const artifactId of result.artifactIds) {
        const fileName = `${artifactId}.png`;
        const filePath = path.join(TEST_DIR, fileName);
        expect(existsSync(filePath)).toBe(true);
      }
      
      // 验证工件ID都不相同
      const uniqueIds = new Set(result.artifactIds);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe("6.3 绘制图形测试", () => {
    test("绘制矩形（fillRect�?, async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(10, 10, 80, 80);
        return 'rect';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('rect');
      expect(result.artifactIds.length).toBe(1);
      
      // 验证文件存在且大小合�?
      const fileName = `${result.artifactIds[0]}.png`;
      const filePath = path.join(TEST_DIR, fileName);
      const buffer = await readFile(filePath);
      expect(buffer.length).toBeGreaterThan(100); // PNG 文件应该有一定大�?
    });

    test("绘制矩形边框（strokeRect�?, async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, 80, 80);
        return 'strokeRect';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('strokeRect');
      expect(result.artifactIds.length).toBe(1);
    });

    test("绘制圆形（arc + fill�?, async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(50, 50, 40, 0, Math.PI * 2);
        ctx.fill();
        return 'circle';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('circle');
      expect(result.artifactIds.length).toBe(1);
    });

    test("绘制文本（fillText�?, async () => {
      const code = `
        const canvas = getCanvas(200, 100);
        const ctx = canvas.getContext('2d');
        ctx.font = '20px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText('Hello Canvas', 10, 50);
        return 'text';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('text');
      expect(result.artifactIds.length).toBe(1);
    });

    test("绘制路径（moveTo + lineTo + stroke�?, async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(10, 10);
        ctx.lineTo(90, 90);
        ctx.lineTo(90, 10);
        ctx.stroke();
        return 'path';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('path');
      expect(result.artifactIds.length).toBe(1);
    });

    test("复杂图形组合", async () => {
      const code = `
        const canvas = getCanvas(200, 200);
        const ctx = canvas.getContext('2d');
        
        // 背景
        ctx.fillStyle = 'lightgray';
        ctx.fillRect(0, 0, 200, 200);
        
        // 红色矩形
        ctx.fillStyle = 'red';
        ctx.fillRect(20, 20, 60, 60);
        
        // 蓝色圆形
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(150, 50, 30, 0, Math.PI * 2);
        ctx.fill();
        
        // 绿色线条
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(20, 150);
        ctx.lineTo(180, 150);
        ctx.stroke();
        
        // 文本
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.fillText('Complex', 70, 180);
        
        return 'complex';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('complex');
      expect(result.artifactIds.length).toBe(1);
    });

    test("颜色和样式设�?, async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        
        // 半透明红色
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(10, 10, 50, 50);
        
        // 十六进制颜色
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(40, 40, 50, 50);
        
        // 线宽
        ctx.strokeStyle = '#0000FF';
        ctx.lineWidth = 5;
        ctx.strokeRect(5, 5, 90, 90);
        
        return 'styles';
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.result).toBe('styles');
      expect(result.artifactIds.length).toBe(1);
    });
  });

  describe("6.4 错误处理测试", () => {
    test("脚本执行错误保持原有 js_execution_failed 行为", async () => {
      const code = `
        throw new Error('Test error');
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.error).toBe('js_execution_failed');
      expect(result.message).toContain('Test error');
    });

    test("脚本语法错误", async () => {
      const code = `
        const x = {;
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.error).toBe('js_execution_failed');
    });

    test("使用 Canvas 后脚本错误不影响错误报告", async () => {
      const code = `
        const canvas = getCanvas(100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillRect(0, 0, 100, 100);
        throw new Error('Error after canvas');
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.error).toBe('js_execution_failed');
      expect(result.message).toContain('Error after canvas');
    });

    test("不使�?Canvas 的脚本行为与修改前一�?, async () => {
      // 测试各种原有功能
      const tests = [
        { code: 'return 42;', expected: 42 },
        { code: 'return input.x + input.y;', input: { x: 1, y: 2 }, expected: 3 },
        { code: 'return Promise.resolve("async");', expected: 'async' },
        { code: 'return [1, 2, 3];', expected: [1, 2, 3] },
        { code: 'return { a: 1, b: "test" };', expected: { a: 1, b: "test" } },
      ];
      
      for (const t of tests) {
        const result = await runtime._runJavaScriptTool({ code: t.code, input: t.input });
        expect(result).toEqual(t.expected);
      }
    });

    test("blocked_code 错误保持不变", async () => {
      const code = `
        return process.env;
      `;
      const result = await runtime._runJavaScriptTool({ code });
      expect(result.error).toBe('blocked_code');
      expect(result.blocked).toContain('process');
    });
  });
});


// ============================================================================
// 任务 7: 属性测�?
// ============================================================================

import fc from "fast-check";

// 属性测试共享的 runtime 实例
let propTestRuntime = null;

describe("run_javascript Canvas 属性测�?, () => {
  let runtime;

  beforeAll(async () => {
    // 只初始化一�?runtime
    propTestRuntime = new Runtime({ configPath: "config/app.json" });
    await propTestRuntime.init();
  });

  afterAll(async () => {
    // 测试结束后关�?runtime
    if (propTestRuntime) {
      await propTestRuntime.shutdown();
      propTestRuntime = null;
    }
  });

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    runtime = propTestRuntime;
    // 覆盖 artifacts 目录用于测试
    runtime.artifacts.artifactsDir = TEST_DIR;
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("7.1 属�?1: Canvas 尺寸正确�?, () => {
    test("对于任意有效尺寸，Canvas 应具有指定的尺寸", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 2048 }),
          fc.integer({ min: 1, max: 2048 }),
          async (width, height) => {
            const code = `
              const canvas = getCanvas(${width}, ${height});
              return { width: canvas.width, height: canvas.height };
            `;
            const result = await runtime._runJavaScriptTool({ code });
            
            // 验证 Canvas 尺寸正确
            expect(result.result.width).toBe(width);
            expect(result.result.height).toBe(height);
            
            // 验证导出成功
            expect(result.artifactIds).toBeDefined();
            expect(result.artifactIds.length).toBe(1);
          }
        ),
        { numRuns: 20 } // 减少运行次数以加快测�?
      );
    });
  });

  describe("7.2 属�?2: Canvas 多实例�?, () => {
    test("对于任意调用次数，多次调�?getCanvas 应返回不同实�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (callCount) => {
            // 生成多次调用 getCanvas 的代�?
            const calls = Array.from({ length: callCount }, (_, i) => `canvas${i}`);
            const code = `
              ${calls.map((name, i) => `const ${name} = getCanvas(100, 100);`).join('\n')}
              const allDifferent = ${calls.slice(1).map(name => `${calls[0]} !== ${name}`).join(' && ')};
              return { allDifferent, count: ${callCount}, imagesCount: ${callCount} };
            `;
            const result = await runtime._runJavaScriptTool({ code });
            
            // 验证所有调用返回不同实�?
            expect(result.result.allDifferent).toBe(true);
            // 验证生成了对应数量的图像
            expect(result.artifactIds.length).toBe(callCount);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe("7.3 属�?3: 自动导出触发", () => {
    test("调用 getCanvas 的脚本结果应包含 images 数组", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 500 }),
          fc.integer({ min: 10, max: 500 }),
          async (width, height) => {
            const code = `
              const canvas = getCanvas(${width}, ${height});
              const ctx = canvas.getContext('2d');
              ctx.fillRect(0, 0, 10, 10);
              return 'drawn';
            `;
            const result = await runtime._runJavaScriptTool({ code });
            
            // 验证结果包含 artifactIds 数组
            expect(result).toHaveProperty('result', 'drawn');
            expect(result).toHaveProperty('artifactIds');
            expect(Array.isArray(result.artifactIds)).toBe(true);
            expect(result.artifactIds.length).toBe(1);
            expect(result.artifactIds[0]).toMatch(/^[0-9a-f-]+$/); // UUID格式
          }
        ),
        { numRuns: 20 }
      );
    });

    test("未调�?getCanvas 的脚本结果不应包�?images 字段", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -1000, max: 1000 }),
          fc.integer({ min: -1000, max: 1000 }),
          async (a, b) => {
            const code = `return ${a} + ${b};`;
            const result = await runtime._runJavaScriptTool({ code });
            
            // 验证结果是直接的值，不是对象
            expect(result).toBe(a + b);
            // 验证没有 images 字段
            expect(typeof result).not.toBe('object');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("7.4 属�?4: 向后兼容�?, () => {
    test("不使�?getCanvas 的脚本行为应与修改前完全一�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: -100, max: 100 }), { minLength: 1, maxLength: 10 }),
          async (numbers) => {
            // 测试数组操作
            const code = `
              const arr = ${JSON.stringify(numbers)};
              return arr.reduce((a, b) => a + b, 0);
            `;
            const result = await runtime._runJavaScriptTool({ code });
            const expected = numbers.reduce((a, b) => a + b, 0);
            
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("对象和数组返回值保�?JSON 序列化行�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            a: fc.integer(),
            b: fc.string({ minLength: 0, maxLength: 20 }),
            c: fc.array(fc.integer(), { maxLength: 5 })
          }),
          async (obj) => {
            const code = `return ${JSON.stringify(obj)};`;
            const result = await runtime._runJavaScriptTool({ code });
            
            expect(result).toEqual(obj);
          }
        ),
        { numRuns: 30 }
      );
    });

    test("Promise 返回值正确等待解�?, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 100 }),
          async (value) => {
            const code = `return Promise.resolve(${value});`;
            const result = await runtime._runJavaScriptTool({ code });
            
            expect(result).toBe(value);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
