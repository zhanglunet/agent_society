import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import path from "node:path";
import { rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { WorkspaceManager } from "../../src/platform/workspace_manager.js";

describe("WorkspaceManager", () => {
  /**
   * Property 1: 路径安全验证
   * *For any* 工作空间路径和任意相对路径输入，如果相对路径包含 `..` 或绝对路径前缀，
   * 则文件操作应被拒绝并返回错误
   * 
   * **Validates: Requirements 9.6, 9.8**
   */
  test("Property 1: 路径安全验证", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成真正危险的路径 - 这些路径会逃逸出工作空间
        fc.oneof(
          // 以 .. 开头的路径（直接尝试逃逸到父目录）
          fc.constantFrom(
            "..",
            "../",
            "../secret",
            "../..",
            "../../etc/passwd",
            "../../../root"
          ),
          // 绝对路径 (Unix风格) - 确保以 / 开头且不含空格
          fc.stringMatching(/^[a-zA-Z0-9_]+$/).map(s => "/" + s),
          // 绝对路径 (Windows风格)
          fc.stringMatching(/^[a-zA-Z0-9_]+$/).map(s => "C:\\" + s),
          fc.stringMatching(/^[a-zA-Z0-9_]+$/).map(s => "D:\\" + s)
        ),
        async (dangerousPath) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_safe_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            const taskId = "test-task-1";
            
            await manager.bindWorkspace(taskId, workspaceDir);
            
            // 验证 _isPathSafe 拒绝危险路径
            const isSafe = manager._isPathSafe(workspaceDir, dangerousPath);
            expect(isSafe).toBe(false);
            
            // 验证 readFile 拒绝危险路径
            const readResult = await manager.readFile(taskId, dangerousPath);
            expect(readResult.error).toBe("path_traversal_blocked");
            
            // 验证 writeFile 拒绝危险路径
            const writeResult = await manager.writeFile(taskId, dangerousPath, "test content");
            expect(writeResult.error).toBe("path_traversal_blocked");
            
            // 验证 listFiles 拒绝危险路径
            const listResult = await manager.listFiles(taskId, dangerousPath);
            expect(listResult.error).toBe("path_traversal_blocked");
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: 文件操作 Round-Trip
   * *For any* 有效的文件路径和内容，write_file 写入后 read_file 读取应返回相同的内容
   * 
   * **Validates: Requirements 9.3, 9.4**
   */
  test("Property 2: 文件操作 Round-Trip", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的相对路径（不含危险字符）
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.trim().length > 0 && 
            !s.includes("..") && 
            !s.includes("/") && 
            !s.includes("\\") &&
            !s.includes(":") &&
            !s.includes("*") &&
            !s.includes("?") &&
            !s.includes("\"") &&
            !s.includes("<") &&
            !s.includes(">") &&
            !s.includes("|") &&
            !s.includes("\0") &&
            s !== "." &&
            s !== ".."
          ),
          { minLength: 1, maxLength: 3 }
        ).map(parts => parts.join("/")),
        // 生成任意文件内容
        fc.string({ minLength: 0, maxLength: 1000 }),
        async (relativePath, content) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_roundtrip_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            const taskId = "test-task-roundtrip";
            
            await manager.bindWorkspace(taskId, workspaceDir);
            
            // 写入文件
            const writeResult = await manager.writeFile(taskId, relativePath, content);
            expect(writeResult.ok).toBe(true);
            
            // 读取文件
            const readResult = await manager.readFile(taskId, relativePath);
            expect(readResult.error).toBeUndefined();
            expect(readResult.content).toBe(content);
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 目录列表完整性
   * *For any* 工作空间，list_files 返回的文件列表应包含该目录下所有实际存在的文件和子目录
   * 
   * **Validates: Requirements 9.5**
   */
  test("Property 4: 目录列表完整性", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成文件名列表
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.trim().length > 0 && 
            !s.includes("..") && 
            !s.includes("/") && 
            !s.includes("\\") &&
            !s.includes(":") &&
            !s.includes("*") &&
            !s.includes("?") &&
            !s.includes("\"") &&
            !s.includes("<") &&
            !s.includes(">") &&
            !s.includes("|") &&
            !s.includes("\0") &&
            s !== "." &&
            s !== ".."
          ),
          { minLength: 1, maxLength: 5 }
        ),
        // 生成目录名列表
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.trim().length > 0 && 
            !s.includes("..") && 
            !s.includes("/") && 
            !s.includes("\\") &&
            !s.includes(":") &&
            !s.includes("*") &&
            !s.includes("?") &&
            !s.includes("\"") &&
            !s.includes("<") &&
            !s.includes(">") &&
            !s.includes("|") &&
            !s.includes("\0") &&
            s !== "." &&
            s !== ".."
          ),
          { minLength: 0, maxLength: 3 }
        ),
        async (fileNames, dirNames) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_list_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            // 创建工作空间
            await mkdir(workspaceDir, { recursive: true });
            
            // 去重文件名和目录名
            // 在 Windows 上文件系统不区分大小写，所以需要按小写去重
            const isWindows = process.platform === "win32";
            const normalizeForDedup = (s) => isWindows ? s.toLowerCase() : s;
            
            const seenFiles = new Set();
            const uniqueFileNames = fileNames.filter(f => {
              const normalized = normalizeForDedup(f);
              if (seenFiles.has(normalized)) return false;
              seenFiles.add(normalized);
              return true;
            });
            
            const seenDirs = new Set();
            const uniqueDirNames = dirNames.filter(d => {
              const normalized = normalizeForDedup(d);
              // 确保目录名不与文件名重叠
              if (seenDirs.has(normalized) || seenFiles.has(normalized)) return false;
              seenDirs.add(normalized);
              return true;
            });
            
            // 创建文件
            for (const fileName of uniqueFileNames) {
              await writeFile(path.join(workspaceDir, fileName), "test content", "utf8");
            }
            
            // 创建目录
            for (const dirName of uniqueDirNames) {
              await mkdir(path.join(workspaceDir, dirName), { recursive: true });
            }
            
            const manager = new WorkspaceManager();
            const taskId = "test-task-list";
            
            await manager.bindWorkspace(taskId, workspaceDir);
            
            // 列出目录
            const listResult = await manager.listFiles(taskId, ".");
            expect(listResult.error).toBeUndefined();
            expect(listResult.files).toBeDefined();
            
            // 验证所有文件都在列表中
            const listedNames = listResult.files.map(f => f.name);
            for (const fileName of uniqueFileNames) {
              expect(listedNames).toContain(fileName);
            }
            
            // 验证所有目录都在列表中
            for (const dirName of uniqueDirNames) {
              expect(listedNames).toContain(dirName);
            }
            
            // 验证文件类型正确
            for (const file of listResult.files) {
              if (uniqueFileNames.includes(file.name)) {
                expect(file.type).toBe("file");
              } else if (uniqueDirNames.includes(file.name)) {
                expect(file.type).toBe("directory");
              }
            }
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // 基础单元测试
  test("bindWorkspace creates directory if not exists", async () => {
    const workspaceDir = path.resolve(process.cwd(), "test/.tmp/ws_bind_test");
    await rm(workspaceDir, { recursive: true, force: true });

    const manager = new WorkspaceManager();
    const result = await manager.bindWorkspace("task-1", workspaceDir);
    
    expect(result.ok).toBe(true);
    expect(manager.getWorkspacePath("task-1")).toBe(workspaceDir);
    
    // 验证目录已创建
    const entries = await readdir(workspaceDir);
    expect(Array.isArray(entries)).toBe(true);
    
    await rm(workspaceDir, { recursive: true, force: true });
  });

  test("readFile returns error for unbound workspace", async () => {
    const manager = new WorkspaceManager();
    const result = await manager.readFile("nonexistent-task", "file.txt");
    expect(result.error).toBe("workspace_not_bound");
  });

  test("writeFile returns error for unbound workspace", async () => {
    const manager = new WorkspaceManager();
    const result = await manager.writeFile("nonexistent-task", "file.txt", "content");
    expect(result.error).toBe("workspace_not_bound");
  });

  test("getWorkspaceInfo returns correct counts", async () => {
    const workspaceDir = path.resolve(process.cwd(), "test/.tmp/ws_info_test");
    await rm(workspaceDir, { recursive: true, force: true });
    await mkdir(workspaceDir, { recursive: true });
    
    // 创建一些文件和目录
    await writeFile(path.join(workspaceDir, "file1.txt"), "content1", "utf8");
    await writeFile(path.join(workspaceDir, "file2.txt"), "content2", "utf8");
    await mkdir(path.join(workspaceDir, "subdir"), { recursive: true });
    await writeFile(path.join(workspaceDir, "subdir", "file3.txt"), "content3", "utf8");

    const manager = new WorkspaceManager();
    await manager.bindWorkspace("task-info", workspaceDir);
    
    const info = await manager.getWorkspaceInfo("task-info");
    
    expect(info.error).toBeUndefined();
    expect(info.fileCount).toBe(3);
    expect(info.dirCount).toBe(1);
    expect(info.totalSize).toBeGreaterThan(0);
    expect(info.lastModified).toBeDefined();
    
    await rm(workspaceDir, { recursive: true, force: true });
  });

  /**
   * Property 5: 懒加载创建
   * *For any* 工作空间，在分配后且未写入任何文件之前，对应的文件夹不应存在于文件系统中
   * 
   * **Validates: Requirements 1.3, 2.1, 2.4**
   */
  test("Property 5: 懒加载创建", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机工作空间ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
          s.trim().length > 0 && 
          !s.includes("/") && 
          !s.includes("\\") &&
          !s.includes(":") &&
          !s.includes("*") &&
          !s.includes("?") &&
          !s.includes("\"") &&
          !s.includes("<") &&
          !s.includes(">") &&
          !s.includes("|") &&
          !s.includes("\0")
        ),
        async (workspaceId) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_lazy_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            
            // 使用 assignWorkspace（懒加载）而不是 bindWorkspace
            const assignResult = await manager.assignWorkspace(workspaceId, workspaceDir);
            expect(assignResult.ok).toBe(true);
            
            // 验证工作空间已分配
            expect(manager.hasWorkspace(workspaceId)).toBe(true);
            
            // 验证文件夹不存在（懒加载）
            let folderExists = false;
            try {
              await readdir(workspaceDir);
              folderExists = true;
            } catch (err) {
              if (err.code !== "ENOENT") throw err;
            }
            expect(folderExists).toBe(false);
            
            // 验证 listFiles 返回空列表而不是错误
            const listResult = await manager.listFiles(workspaceId, ".");
            expect(listResult.error).toBeUndefined();
            expect(listResult.files).toEqual([]);
            
            // 验证 getWorkspaceInfo 返回空统计信息
            const infoResult = await manager.getWorkspaceInfo(workspaceId);
            expect(infoResult.error).toBeUndefined();
            expect(infoResult.fileCount).toBe(0);
            expect(infoResult.dirCount).toBe(0);
            expect(infoResult.totalSize).toBe(0);
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: 写入触发创建
   * *For any* 工作空间和任意有效的相对路径，当首次写入文件时，工作空间文件夹应被自动创建
   * 
   * **Validates: Requirements 2.2**
   */
  test("Property 6: 写入触发创建", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机工作空间ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
          s.trim().length > 0 && 
          !s.includes("/") && 
          !s.includes("\\") &&
          !s.includes(":") &&
          !s.includes("*") &&
          !s.includes("?") &&
          !s.includes("\"") &&
          !s.includes("<") &&
          !s.includes(">") &&
          !s.includes("|") &&
          !s.includes("\0")
        ),
        // 生成有效的相对路径
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
            s.trim().length > 0 && 
            !s.includes("..") && 
            !s.includes("/") && 
            !s.includes("\\") &&
            !s.includes(":") &&
            !s.includes("*") &&
            !s.includes("?") &&
            !s.includes("\"") &&
            !s.includes("<") &&
            !s.includes(">") &&
            !s.includes("|") &&
            !s.includes("\0") &&
            s !== "." &&
            s !== ".."
          ),
          { minLength: 1, maxLength: 3 }
        ).map(parts => parts.join("/")),
        // 生成任意文件内容
        fc.string({ minLength: 0, maxLength: 100 }),
        async (workspaceId, relativePath, content) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_write_trigger_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            
            // 使用 assignWorkspace（懒加载）
            await manager.assignWorkspace(workspaceId, workspaceDir);
            
            // 验证文件夹不存在
            let folderExistsBefore = false;
            try {
              await readdir(workspaceDir);
              folderExistsBefore = true;
            } catch (err) {
              if (err.code !== "ENOENT") throw err;
            }
            expect(folderExistsBefore).toBe(false);
            
            // 写入文件
            const writeResult = await manager.writeFile(workspaceId, relativePath, content);
            expect(writeResult.ok).toBe(true);
            
            // 验证文件夹已创建
            const entries = await readdir(workspaceDir);
            expect(Array.isArray(entries)).toBe(true);
            
            // 验证文件可以读取
            const readResult = await manager.readFile(workspaceId, relativePath);
            expect(readResult.error).toBeUndefined();
            expect(readResult.content).toBe(content);
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe("WorkspaceManager Additional Properties", () => {
  /**
   * Property 7: 空工作空间列出
   * *For any* 未写入过文件的工作空间，调用 list_files 应返回空列表而不是错误。
   * 
   * **Validates: Requirements 2.3**
   */
  test("Property 7: 空工作空间列出", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成随机工作空间ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
          s.trim().length > 0 && 
          !s.includes("/") && 
          !s.includes("\\") &&
          !s.includes(":") &&
          !s.includes("*") &&
          !s.includes("?") &&
          !s.includes("\"") &&
          !s.includes("<") &&
          !s.includes(">") &&
          !s.includes("|") &&
          !s.includes("\0")
        ),
        async (workspaceId) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_empty_list_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            
            // 使用 assignWorkspace（懒加载）
            await manager.assignWorkspace(workspaceId, workspaceDir);
            
            // 验证 listFiles 返回空列表而不是错误
            const listResult = await manager.listFiles(workspaceId, ".");
            expect(listResult.error).toBeUndefined();
            expect(listResult.files).toEqual([]);
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: 自动创建父目录
   * *For any* 嵌套路径（如 "a/b/c.txt"），写入文件时应自动创建所有父目录。
   * 
   * **Validates: Requirements 3.5**
   */
  test("Property 8: 自动创建父目录", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成嵌套路径（2-4层目录）
        fc.array(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => 
            s.trim().length > 0 && 
            !s.includes("..") && 
            !s.includes("/") && 
            !s.includes("\\") &&
            !s.includes(":") &&
            !s.includes("*") &&
            !s.includes("?") &&
            !s.includes("\"") &&
            !s.includes("<") &&
            !s.includes(">") &&
            !s.includes("|") &&
            !s.includes("\0") &&
            s !== "." &&
            s !== ".."
          ),
          { minLength: 2, maxLength: 4 }
        ).map(parts => parts.join("/")),
        // 生成任意文件内容
        fc.string({ minLength: 1, maxLength: 100 }),
        async (nestedPath, content) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_nested_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            const workspaceId = "test-nested";
            
            // 使用 assignWorkspace（懒加载）
            await manager.assignWorkspace(workspaceId, workspaceDir);
            
            // 写入嵌套路径的文件
            const writeResult = await manager.writeFile(workspaceId, nestedPath, content);
            expect(writeResult.ok).toBe(true);
            
            // 验证文件可以读取
            const readResult = await manager.readFile(workspaceId, nestedPath);
            expect(readResult.error).toBeUndefined();
            expect(readResult.content).toBe(content);
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: 工作空间信息准确性
   * *For any* 工作空间，get_workspace_info 返回的文件数量应等于工作空间中实际的文件数量。
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */
  test("Property 9: 工作空间信息准确性", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成文件数量
        fc.integer({ min: 0, max: 5 }),
        async (fileCount) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_info_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            const workspaceId = "test-info";
            
            // 使用 assignWorkspace（懒加载）
            await manager.assignWorkspace(workspaceId, workspaceDir);
            
            // 写入指定数量的文件
            for (let i = 0; i < fileCount; i++) {
              await manager.writeFile(workspaceId, `file${i}.txt`, `content${i}`);
            }
            
            // 获取工作空间信息
            const info = await manager.getWorkspaceInfo(workspaceId);
            
            if (fileCount === 0) {
              // 未写入文件时，返回空统计信息
              expect(info.fileCount).toBe(0);
            } else {
              // 写入文件后，文件数量应该匹配
              expect(info.fileCount).toBe(fileCount);
            }
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
