import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import path from "node:path";
import { rm, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { AgentSociety } from "../../src/platform/agent_society.js";
import { MessageBus } from "../../src/platform/message_bus.js";
import { WorkspaceManager } from "../../src/platform/workspace_manager.js";
import { Config } from "../../src/platform/utils/config/config.js";

describe("AgentSociety", () => {
  /**
   * Property 1: 用户端点输入验证
   * 对于任意用户发送的消息，如果目标智能体ID为"user"，则应被拒绝并返回错误；
   * 如果目标智能体ID为其他有效ID（如"root"或已存在的智能体ID），则应被接受并转发。
   * 
   * **验证: 需求 1.1, 1.4**
   */
  test("Property 1: 用户端点输入验证 - 目标为user时应拒绝", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // 任意非空消息文本
        (text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          // 不需要完整初始化，只需要runtime.bus存在
          society.runtime.bus = new MessageBus();
          
          // 尝试发送消息到"user"
          const result = society.sendTextToAgent("user", text);
          
          // 应该返回错误
          expect(result).toHaveProperty("error");
          expect(result.error).toContain("不能向用户端点发送消息");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 用户端点输入验证 - 目标为有效ID时应接受", () => {
    fc.assert(
      fc.property(
        // 生成非"user"的有效智能体ID
        fc.string({ minLength: 1 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
        fc.string({ minLength: 1 }), // 任意非空消息文本
        (agentId, text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          const bus = new MessageBus();
          society.runtime.bus = bus;
          
          // 发送消息到非"user"的目标
          const result = society.sendTextToAgent(agentId, text);
          
          // 应该成功返回taskId和to
          expect(result).toHaveProperty("taskId");
          expect(result).toHaveProperty("to");
          expect(result.to).toBe(agentId.trim());
          expect(result).not.toHaveProperty("error");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 用户端点输入验证 - 空目标ID应返回错误", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("", "  ", "\t", "\n"), // 空或纯空白字符串
        fc.string({ minLength: 1 }), // 任意非空消息文本
        (agentId, text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          society.runtime.bus = new MessageBus();
          
          const result = society.sendTextToAgent(agentId, text);
          
          // 应该返回错误
          expect(result).toHaveProperty("error");
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 2: 用户端点消息流转正确性
   * 对于任意用户通过User_Endpoint发送的消息，消息总线中不应出现from="user"且to="user"的消息记录；
   * 所有用户发送的消息应直接发送到目标智能体。
   * 
   * **验证: 需求 1.2**
   */
  test("Property 2: 用户端点消息流转正确性 - 消息直接发送到目标智能体", () => {
    fc.assert(
      fc.property(
        // 生成非"user"的有效智能体ID
        fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
        fc.string({ minLength: 1, maxLength: 200 }), // 消息文本
        (agentId, text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          const bus = new MessageBus();
          society.runtime.bus = bus;
          
          // 发送消息
          const result = society.sendTextToAgent(agentId, text);
          
          if (result.error) return; // 跳过无效输入
          
          // 检查消息总线中的消息
          const targetQueue = bus._queues.get(agentId.trim());
          const userQueue = bus._queues.get("user");
          
          // 目标智能体队列应该有消息
          expect(targetQueue).toBeDefined();
          expect(targetQueue.length).toBeGreaterThan(0);
          
          // 消息应该是from="user", to=agentId
          const msg = targetQueue[0];
          expect(msg.from).toBe("user");
          expect(msg.to).toBe(agentId.trim());
          
          // 用户队列不应该有from="user" to="user"的消息
          if (userQueue) {
            for (const m of userQueue) {
              expect(!(m.from === "user" && m.to === "user")).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 2: 用户端点消息流转正确性 - 不存在from=user to=user的消息", () => {
    fc.assert(
      fc.property(
        // 生成多个发送操作
        fc.array(
          fc.record({
            agentId: fc.string({ minLength: 1, maxLength: 20 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
            text: fc.string({ minLength: 1, maxLength: 100 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (sends) => {
          const society = new AgentSociety({ configService: new Config("config") });
          const bus = new MessageBus();
          society.runtime.bus = bus;
          
          // 执行多次发送
          for (const { agentId, text } of sends) {
            society.sendTextToAgent(agentId, text);
          }
          
          // 检查所有队列，确保没有from="user" to="user"的消息
          for (const [queueId, queue] of bus._queues.entries()) {
            for (const msg of queue) {
              const isUserToUser = msg.from === "user" && msg.to === "user";
              expect(isUserToUser).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: 工作空间隔离
   * *For any* 两个不同的 taskId，它们的工作空间应该相互隔离，
   * 一个任务的智能体不能访问另一个任务的文件
   * 
   * **Validates: Requirements 9.2, 9.6**
   */
  test("Property 3: 工作空间隔离", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成两个不同的任务ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        // 生成文件名
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
          !s.includes("\0")
        ),
        // 生成文件内容
        fc.string({ minLength: 1, maxLength: 100 }),
        async (taskId1, taskId2, fileName, content) => {
          // 确保两个taskId不同
          if (taskId1.trim() === taskId2.trim()) return;
          
          const baseDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_isolation_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          const workspace1 = path.join(baseDir, "ws1");
          const workspace2 = path.join(baseDir, "ws2");
          
          await rm(baseDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            
            // 绑定两个不同的工作空间
            await manager.bindWorkspace(taskId1.trim(), workspace1);
            await manager.bindWorkspace(taskId2.trim(), workspace2);
            
            // 在工作空间1中写入文件
            const writeResult = await manager.writeFile(taskId1.trim(), fileName, content);
            expect(writeResult.ok).toBe(true);
            
            // 从工作空间1读取文件应该成功
            const readResult1 = await manager.readFile(taskId1.trim(), fileName);
            expect(readResult1.content).toBe(content);
            
            // 从工作空间2读取同名文件应该失败（文件不存在）
            const readResult2 = await manager.readFile(taskId2.trim(), fileName);
            expect(readResult2.error).toBe("file_not_found");
            
            // 验证两个工作空间路径不同
            const path1 = manager.getWorkspacePath(taskId1.trim());
            const path2 = manager.getWorkspacePath(taskId2.trim());
            expect(path1).not.toBe(path2);
          } finally {
            await rm(baseDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: 工作空间自动创建
   * *For any* 不存在的工作空间路径，bindWorkspace 应自动创建该目录
   * 
   * **Validates: Requirements 11.3**
   */
  test("Property 8: 工作空间自动创建", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成任务ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        // 生成目录名（用于创建不存在的路径）
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
            !s.includes(" ")
          ),
          { minLength: 1, maxLength: 3 }
        ),
        async (taskId, dirParts) => {
          const baseDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_autocreate_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          const workspacePath = path.join(baseDir, ...dirParts);
          
          await rm(baseDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager();
            
            // 绑定一个不存在的工作空间路径
            const bindResult = await manager.bindWorkspace(taskId.trim(), workspacePath);
            
            // 绑定应该成功
            expect(bindResult.ok).toBe(true);
            
            // 验证目录已被自动创建
            const stats = await stat(workspacePath);
            expect(stats.isDirectory()).toBe(true);
            
            // 验证可以在工作空间中写入文件
            const writeResult = await manager.writeFile(taskId.trim(), "test.txt", "test content");
            expect(writeResult.ok).toBe(true);
          } finally {
            await rm(baseDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: 工作空间信息准确性
   * *For any* 工作空间，get_workspace_info 返回的文件数量和目录数量应与实际一致
   * 
   * **Validates: Requirements 11.1, 11.2**
   */
  test("Property 9: 工作空间信息准确性", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成任务ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        // 生成文件名列表
        fc.array(
          fc.string({ minLength: 1, maxLength: 15 }).filter(s => 
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
          { minLength: 0, maxLength: 5 }
        ),
        // 生成目录名列表
        fc.array(
          fc.string({ minLength: 1, maxLength: 15 }).filter(s => 
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
        async (taskId, fileNames, dirNames) => {
          const workspaceDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_info_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          
          await rm(workspaceDir, { recursive: true, force: true });
          
          try {
            // 创建工作空间
            await mkdir(workspaceDir, { recursive: true });
            
            // 去重文件名和目录名，确保不重叠
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
            await manager.bindWorkspace(taskId.trim(), workspaceDir);
            
            // 获取工作空间信息
            const info = await manager.getWorkspaceInfo(taskId.trim());
            
            // 验证没有错误
            expect(info.error).toBeUndefined();
            
            // 验证文件数量准确
            expect(info.fileCount).toBe(uniqueFileNames.length);
            
            // 验证目录数量准确
            expect(info.dirCount).toBe(uniqueDirNames.length);
            
            // 验证总大小合理（每个文件内容是 "test content"，12字节）
            const expectedSize = uniqueFileNames.length * 12;
            expect(info.totalSize).toBe(expectedSize);
            
            // 验证最近修改时间存在且是有效的ISO字符串
            expect(info.lastModified).toBeDefined();
            expect(new Date(info.lastModified).toString()).not.toBe("Invalid Date");
          } finally {
            await rm(workspaceDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
