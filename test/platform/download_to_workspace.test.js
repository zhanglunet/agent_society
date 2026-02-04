/**
 * downloadToWorkspace 功能测试
 * 
 * 测试 run_javascript 中的 downloadToWorkspace 函数
 * - 支持二进制内容（ArrayBuffer、TypedArray、Blob）
 * - 支持文本内容
 * - 路径安全验证（不能使用 .. 向上遍历）
 * - 结果中包含 downloadPaths 数组
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { Runtime } from "../../src/platform/core/runtime.js";
import { mkdir, rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const TEST_DIR = "./test/.tmp/download_test_runtime";

let sharedRuntime = null;

describe("run_javascript downloadToWorkspace 功能", () => {
  let runtime;

  beforeAll(async () => {
    sharedRuntime = new Runtime({ configPath: "config/app.json" });
    await sharedRuntime.init();
  });

  afterAll(async () => {
    if (sharedRuntime) {
      await sharedRuntime.shutdown();
      sharedRuntime = null;
    }
  });

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    runtime = sharedRuntime;
    // 覆盖 workspaces 目录用于测试
    runtime.workspaceManager.setWorkspacesDir(TEST_DIR);
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("downloadToWorkspace 基础功能", () => {
    test("downloadToWorkspace 函数存在且可调用", async () => {
      const code = `
        return typeof downloadToWorkspace === 'function';
      `;
      const result = await runtime._runJavaScriptTool({ code }, null, "test-agent", null);
      console.log("Test result:", JSON.stringify(result));
      expect(result).toBe(true);
    });

    test("下载文本文件到工作区", async () => {
      const workspaceId = "ws-text-test";
      const code = `
        const content = "Hello, World!";
        await downloadToWorkspace("test.txt", "text/plain", content);
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
      expect(result.files).toBeDefined();
      expect(result.files.some(f => f.path === "test.txt")).toBe(true);

      // 验证文件内容
      const filePath = path.join(TEST_DIR, workspaceId, "test.txt");
      const fileContent = await readFile(filePath, "utf8");
      expect(fileContent).toBe("Hello, World!");
    });

    test("下载 ArrayBuffer 到工作区", async () => {
      const workspaceId = "ws-arraybuffer-test";
      const code = `
        const buffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).buffer;
        await downloadToWorkspace("test.bin", "application/octet-stream", buffer);
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
      expect(result.files.some(f => f.path === "test.bin")).toBe(true);

      // 验证文件内容
      const filePath = path.join(TEST_DIR, workspaceId, "test.bin");
      const content = await readFile(filePath);
      expect(content[0]).toBe(0x89);
      expect(content[1]).toBe(0x50);
      expect(content[2]).toBe(0x4E);
      expect(content[3]).toBe(0x47);
    });

    test("下载 Uint8Array 到工作区", async () => {
      const workspaceId = "ws-uint8-test";
      const code = `
        const arr = new Uint8Array([1, 2, 3, 4, 5]);
        await downloadToWorkspace("data.bin", "application/octet-stream", arr);
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
      expect(result.files.some(f => f.path === "data.bin")).toBe(true);

      // 验证文件内容
      const filePath = path.join(TEST_DIR, workspaceId, "data.bin");
      const content = await readFile(filePath);
      expect(content).toEqual(Buffer.from([1, 2, 3, 4, 5]));
    });

    test("下载 JSON 内容到工作区", async () => {
      const workspaceId = "ws-json-test";
      const code = `
        const data = { name: "test", value: 42, items: [1, 2, 3] };
        await downloadToWorkspace("data.json", "application/json", JSON.stringify(data));
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
      expect(result.files.some(f => f.path === "data.json")).toBe(true);

      // 验证文件内容
      const filePath = path.join(TEST_DIR, workspaceId, "data.json");
      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe("test");
      expect(parsed.value).toBe(42);
      expect(parsed.items).toEqual([1, 2, 3]);
    });

    test("下载到子目录", async () => {
      const workspaceId = "ws-subdir-test";
      const code = `
        await downloadToWorkspace("subdir/nested/file.txt", "text/plain", "nested content");
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
      expect(result.files.some(f => f.path === "subdir/nested/file.txt")).toBe(true);

      // 验证文件内容
      const filePath = path.join(TEST_DIR, workspaceId, "subdir/nested/file.txt");
      const content = await readFile(filePath, "utf8");
      expect(content).toBe("nested content");
    });

    test("多次下载返回多个路径", async () => {
      const workspaceId = "ws-multi-test";
      const code = `
        await downloadToWorkspace("file1.txt", "text/plain", "content 1");
        await downloadToWorkspace("file2.txt", "text/plain", "content 2");
        await downloadToWorkspace("file3.txt", "text/plain", "content 3");
        return "all saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("all saved");
      expect(result.files).toHaveLength(3);
      expect(result.files.some(f => f.path === "file1.txt")).toBe(true);
      expect(result.files.some(f => f.path === "file2.txt")).toBe(true);
      expect(result.files.some(f => f.path === "file3.txt")).toBe(true);
    });
  });

  describe("downloadToWorkspace 路径安全验证", () => {
    test("拒绝绝对路径", async () => {
      const workspaceId = "ws-path-test";
      const code = `
        await downloadToWorkspace("/etc/passwd", "text/plain", "hacked");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      // 错误会被全局捕获，返回 js_execution_failed
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("path traversal not allowed");
    });

    test("拒绝包含 .. 的路径", async () => {
      const workspaceId = "ws-path-test";
      const code = `
        await downloadToWorkspace("../secret.txt", "text/plain", "hacked");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("path traversal not allowed");
    });

    test("拒绝中间包含 .. 的路径", async () => {
      const workspaceId = "ws-path-test";
      const code = `
        await downloadToWorkspace("subdir/../../secret.txt", "text/plain", "hacked");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("path traversal not allowed");
    });

    test("拒绝以 .. 开头的路径", async () => {
      const workspaceId = "ws-path-test";
      const code = `
        await downloadToWorkspace("..\\\\secret.txt", "text/plain", "hacked");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("path traversal not allowed");
    });

    test("允许包含 . 的当前目录路径", async () => {
      const workspaceId = "ws-dot-test";
      const code = `
        await downloadToWorkspace("./file.txt", "text/plain", "content");
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
      expect(result.files.some(f => f.path === "./file.txt")).toBe(true);
    });

    test("允许中间包含 . 的路径", async () => {
      const workspaceId = "ws-dot-test";
      const code = `
        await downloadToWorkspace("./subdir/./file.txt", "text/plain", "content");
        return "saved";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toBe("saved");
    });
  });

  describe("downloadToWorkspace 参数验证", () => {
    test("缺少 filepath 参数报错", async () => {
      const workspaceId = "ws-param-test";
      const code = `
        await downloadToWorkspace(null, "text/plain", "content");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("filepath must be a non-empty string");
    });

    test("缺少 mimeType 参数报错", async () => {
      const workspaceId = "ws-param-test";
      const code = `
        await downloadToWorkspace("file.txt", null, "content");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("mimeType must be a non-empty string");
    });

    test("缺少 content 参数报错", async () => {
      const workspaceId = "ws-param-test";
      const code = `
        await downloadToWorkspace("file.txt", "text/plain", undefined);
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.error).toBe("js_execution_failed");
      expect(result.message).toContain("content is required");
    });

    test("缺少 workspaceId 时报错", async () => {
      const code = `
        await downloadToWorkspace("file.txt", "text/plain", "content");
        return "should not reach here";
      `;
      const result = await runtime._runJavaScriptTool({ code }, null, "test-agent", null);
      
      expect(result.error).toBe("workspace_required");
    });
  });

  describe("downloadToWorkspace 返回值", () => {
    test("返回成功信息和文件路径", async () => {
      const workspaceId = "ws-return-test";
      const code = `
        const result = await downloadToWorkspace("test.txt", "text/plain", "hello");
        return result;
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      expect(result.result).toEqual({
        success: true,
        path: "test.txt",
        size: 5
      });
    });

    test("不使用 downloadToWorkspace 时不包含 downloadPaths", async () => {
      const code = `
        return 1 + 2;
      `;
      const result = await runtime._runJavaScriptTool({ code }, "ws-test", "msg-1", "test-agent");
      
      expect(result).toBe(3);
      expect(result).not.toHaveProperty("downloadPaths");
    });
  });

  describe("downloadToWorkspace 与 getCanvas 同时使用", () => {
    test("同时使用 downloadToWorkspace 和 getCanvas", async () => {
      const workspaceId = "ws-both-test";
      const code = `
        // 下载一个文本文件
        await downloadToWorkspace("notes.txt", "text/plain", "Some notes");
        
        // 创建一个 Canvas
        const canvas = getCanvas('canvas-test.png', 100, 100);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'blue';
        ctx.fillRect(0, 0, 100, 100);
        
        return "both done";
      `;
      const result = await runtime._runJavaScriptTool({ code }, "msg-1", "test-agent", workspaceId);
      
      console.log("Combined result:", JSON.stringify(result, null, 2));
      
      // 优先处理 Canvas，返回 files
      expect(result.result).toBe("both done");
      expect(result.files).toBeDefined();
      expect(result.files.length).toBe(2); // Canvas + download
      expect(result.files.some(f => f.path === "canvas-test.png")).toBe(true);
      expect(result.files.some(f => f.path === "notes.txt")).toBe(true);
      
      // 验证文本文件也被保存
      const textFilePath = path.join(TEST_DIR, workspaceId, "notes.txt");
      const textContent = await readFile(textFilePath, "utf8");
      expect(textContent).toBe("Some notes");
    });
  });
});
