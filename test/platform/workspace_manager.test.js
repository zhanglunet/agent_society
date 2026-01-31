import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import path from "node:path";
import { rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WorkspaceManager } from "../../src/platform/services/workspace/workspace_manager.js";

describe("WorkspaceManager", () => {
  const TEST_WORKSPACES_DIR = path.resolve(process.cwd(), `test/.tmp/workspaces_${Math.random().toString(36).slice(2)}`);

  beforeEach(async () => {
    await rm(TEST_WORKSPACES_DIR, { recursive: true, force: true });
    await mkdir(TEST_WORKSPACES_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_WORKSPACES_DIR, { recursive: true, force: true });
  });

  /**
   * Property 1: 路径安全验证
   */
  test("Property 1: 路径安全验证", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constantFrom("..", "../", "../secret", "../..", "../../etc/passwd", "../../../root"),
          fc.stringMatching(/^[a-zA-Z0-9_]+$/).map(s => "/" + s),
          fc.stringMatching(/^[a-zA-Z0-9_]+$/).map(s => "C:\\" + s),
          fc.stringMatching(/^[a-zA-Z0-9_]+$/).map(s => "D:\\" + s)
        ),
        async (dangerousPath) => {
          const manager = new WorkspaceManager({ workspacesDir: TEST_WORKSPACES_DIR });
          const workspaceId = "test-ws-safe";
          
          // 验证 readFile 抛出错误
          await expect(manager.readFile(workspaceId, dangerousPath))
            .rejects.toThrow("path_traversal_blocked");
          
          // 验证 writeFile 抛出错误
          await expect(manager.writeFile(workspaceId, dangerousPath, "test content"))
            .rejects.toThrow("path_traversal_blocked");
          
          // 验证 deleteFile 抛出错误
          await expect(manager.deleteFile(workspaceId, dangerousPath))
            .rejects.toThrow("path_traversal_blocked");
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 2: 文件操作 Round-Trip
   */
  test("Property 2: 文件操作 Round-Trip", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.trim().length > 0 && !/[\\/:*?"<>|]/.test(s) && s !== "." && s !== ".."
          ),
          { minLength: 1, maxLength: 3 }
        ).map(parts => parts.join("/")),
        fc.string({ minLength: 0, maxLength: 1000 }),
        async (relativePath, content) => {
          const manager = new WorkspaceManager({ workspacesDir: TEST_WORKSPACES_DIR });
          const workspaceId = `ws-${Math.random().toString(36).slice(2)}`;
          
          // 写入文件
          const writeResult = await manager.writeFile(workspaceId, relativePath, content);
          expect(writeResult.ok).toBe(true);
          
          // 读取文件
          const readResult = await manager.readFile(workspaceId, relativePath);
          expect(readResult.content).toBe(content);
        }
      ),
      { numRuns: 20 }
    );
  });

  test("hasWorkspace checks directory existence", async () => {
    const manager = new WorkspaceManager({ workspacesDir: TEST_WORKSPACES_DIR });
    const wsId = `test-exists-${Math.random().toString(36).slice(2)}`;
    console.log(`Calling hasWorkspace for ${wsId}`);
    const result = manager.hasWorkspace(wsId);
    console.log(`Result: ${result}`);
    expect(result).toBe(false);
    
    await manager.writeFile(wsId, "test.txt", "hello");
    expect(manager.hasWorkspace(wsId)).toBe(true);
    
    await manager.deleteWorkspace(wsId);
    expect(manager.hasWorkspace(wsId)).toBe(false);
  });

  test("getFileInfo returns correct metadata", async () => {
    const manager = new WorkspaceManager({ workspacesDir: TEST_WORKSPACES_DIR });
    const wsId = "test-info";
    const filePath = "test.txt";
    const content = "hello world";
    
    await manager.writeFile(wsId, filePath, content);
    const info = await manager.getFileInfo(wsId, filePath);
    
    expect(info).not.toBeNull();
    expect(info.path).toBe(filePath);
    expect(info.size).toBe(content.length);
    expect(info.isBinary).toBe(false);
  });

  test("listFiles returns current directory files", async () => {
    const manager = new WorkspaceManager({ workspacesDir: TEST_WORKSPACES_DIR });
    const wsId = "test-list";
    
    await manager.writeFile(wsId, "a.txt", "content");
    await manager.writeFile(wsId, "sub/b.txt", "content");
    
    const files = await manager.listFiles(wsId, ".");
    const names = files.map(f => f.name);
    
    expect(names).toContain("a.txt");
    expect(names).not.toContain("b.txt"); // b.txt is in sub/
  });
});
