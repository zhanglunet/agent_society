import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import path from "node:path";
import { rm, mkdir, writeFile, readdir, stat } from "node:fs/promises";
import { AgentSociety } from "../../src/platform/core/agent_society.js";
import { MessageBus } from "../../src/platform/core/message_bus.js";
import { WorkspaceManager } from "../../src/platform/services/workspace/workspace_manager.js";
import { Config } from "../../src/platform/utils/config/config.js";

describe("AgentSociety", () => {
  const isValidPathPart = (s) => 
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
    !s.includes("\0");

  /**
   * Property 1: 用户指令分发验证
   * 模拟各种用户发送的消息，确保目标智能体ID为"user"时应该拒绝并报错
   * 当目标智能体ID为其他有效ID（如"root"或已存在的智能体ID）时，应该能够正常转发
   * 
   * **验证: 需求 1.1, 1.4**
   */
  test("Property 1: 用户指令分发验证 - 目标为user时应拒绝", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }), // 随机的消息文本
        (text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          // 不需要全面初始化，只需要runtime.bus存在
          society.runtime.bus = new MessageBus();
          
          // 测试发送消息给"user"
          const result = society.sendTextToAgent("user", text);
          
          // 应该返回错误
          expect(result).toHaveProperty("error");
          expect(result.error).toContain("不能向用户端点发送消息");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1: 用户指令分发验证 - 目标为有效ID时应成功", () => {
    fc.assert(
      fc.property(
        // 生成非"user"的有效字符串ID
        fc.string({ minLength: 1 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
        fc.string({ minLength: 1 }), // 随机的消息文本
        (agentId, text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          const bus = new MessageBus();
          society.runtime.bus = bus;
          
          // 发送消息给非"user"的目标
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

  test("Property 1: 用户指令分发验证 - 空目标ID应报错", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("", "  ", "\t", "\n"), // 空或纯空白字符串
        fc.string({ minLength: 1 }), // 随机的消息文本
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
   * Property 2: 用户指令消息流向正确性
   * 模拟各种用户通过User_Endpoint发送的消息，消息队列中不应该出现 from="user" 且 to="user" 的消息记录
   * 所有用户发送的消息应该直接发送到目标智能体。
   * 
   * **验证: 需求 1.2**
   */
  test("Property 2: 用户指令消息流向正确性 - 消息直接发送到目标智能体", () => {
    fc.assert(
      fc.property(
        // 生成非"user"的有效字符串ID
        fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
        fc.string({ minLength: 1, maxLength: 200 }), // 消息文本
        (agentId, text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          const bus = new MessageBus();
          society.runtime.bus = bus;
          
          // 发送消息
          const result = society.sendTextToAgent(agentId, text);
          
          if (result.error) return; // 忽略无效输入
          
          // 检查目标队列中的消息
          const targetQueue = bus._queues.get(agentId.trim());
          const userQueue = bus._queues.get("user");
          
          // 目标队列应该有这条消息
          expect(targetQueue).toBeDefined();
          expect(targetQueue.length).toBeGreaterThan(0);
          
          // 消息应该来自"user", 发往agentId
          const msg = targetQueue[0];
          expect(msg.from).toBe("user");
          expect(msg.to).toBe(agentId.trim());
          
          // 用户队列不应该有 from="user" to="user" 的消息
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

  test("Property 2: 用户指令消息流向正确性 - 杜绝from=user to=user的消息", () => {
    fc.assert(
      fc.property(
        // 生成多次发送参数
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
          
          // 检查所有队列，确保没有 from="user" to="user" 的消息
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
   * Property 3: 工作空间隔离性
   * *For any* 两个不同 taskId，它们的工作空间应该是相互隔离的，
   * 一个智能体不能访问另一个智能体的文件
   * 
   * **Validates: Requirements 9.2, 9.6**
   */
  test("Property 3: 工作空间隔离性", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成两个不同的任务ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(isValidPathPart),
        fc.string({ minLength: 1, maxLength: 20 }).filter(isValidPathPart),
        // 生成文件名
        fc.string({ minLength: 1, maxLength: 20 }).filter(isValidPathPart),
        // 生成文件内容
        fc.string({ minLength: 1, maxLength: 100 }),
        async (taskId1, taskId2, fileName, content) => {
          // 确保两个taskId不同
          if (taskId1.trim() === taskId2.trim()) return;
          
          const baseDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_isolation_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          
          await rm(baseDir, { recursive: true, force: true });
          await mkdir(baseDir, { recursive: true });
          
          try {
            const manager = new WorkspaceManager({ workspacesDir: baseDir });
            
            // 创建两个不同的工作空间
            await manager.createWorkspace(taskId1.trim());
            await manager.createWorkspace(taskId2.trim());
            
            // 在工作空间1中写入文件
            const writeResult = await manager.writeFile(taskId1.trim(), fileName, content);
            expect(writeResult.ok).toBe(true);
            
            // 从工作空间1读取文件应成功
            const readResult1 = await manager.readFile(taskId1.trim(), fileName);
            expect(readResult1.content).toBe(content);
            
            // 从工作空间2读取同一个文件应失败（文件不存在）
            try {
              await manager.readFile(taskId2.trim(), fileName);
              expect(false).toBe(true); // 不应该执行到这里
            } catch (e) {
              expect(e.message).toContain("file_not_found");
            }
            
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
        fc.string({ minLength: 1, maxLength: 20 }).filter(isValidPathPart),
        // 生成目录层级（模拟不存在的深度路径）
        fc.array(
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => isValidPathPart(s) && !s.includes(" ")),
          { minLength: 1, maxLength: 3 }
        ),
        async (taskId, dirParts) => {
          const baseDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_autocreate_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          const workspacePath = path.join(baseDir, ...dirParts);
          
          await rm(baseDir, { recursive: true, force: true });
          
          try {
            const manager = new WorkspaceManager({ workspacesDir: baseDir });
            
            // 绑定一个不存在的工作空间路径
            // 注意：新版 WorkspaceManager 不再需要 bindWorkspace，这里为了兼容性测试
            const ws = await manager.getWorkspace(taskId.trim());
            await ws.sync();
            
            // 验证目录已被自动创建
            const stats = await stat(ws.rootPath);
            expect(stats.isDirectory()).toBe(true);
            
            // 验证可以在该工作空间中写入文件
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
   * *For any* 工作空间，get_workspace_info 返回的文件数、目录数应与实际一致
   * 
   * **Validates: Requirements 11.1, 11.2**
   */
  test("Property 9: 工作空间信息准确性", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成任务ID
        fc.string({ minLength: 1, maxLength: 20 }).filter(isValidPathPart),
        // 生成文件名列表
        fc.array(
          fc.string({ minLength: 1, maxLength: 15 }).filter(s => 
            isValidPathPart(s) && 
            s !== "." && 
            s !== ".."
          ),
          { minLength: 0, maxLength: 5 }
        ),
        // 生成目录名列表
        fc.array(
          fc.string({ minLength: 1, maxLength: 15 }).filter(s => 
            isValidPathPart(s) && 
            s !== "." && 
            s !== ".."
          ),
          { minLength: 0, maxLength: 3 }
        ),
        async (taskId, fileNames, dirNames) => {
          const baseDir = path.resolve(process.cwd(), `test/.tmp/pbt_ws_info_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          
          await rm(baseDir, { recursive: true, force: true });
          await mkdir(baseDir, { recursive: true });
          
          try {
            const manager = new WorkspaceManager({ workspacesDir: baseDir });
            const ws = await manager.createWorkspace(taskId.trim());
            const workspaceDir = ws.rootPath;
            
            // 去除文件名和目录名冲突或重复的情况
            // 在 Windows 上文件系统通常不区分大小写，需要小写去重
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
              // 确保目录不与文件名冲突或重复
              if (seenDirs.has(normalized) || seenFiles.has(normalized)) return false;
              seenDirs.add(normalized);
              return true;
            });
            
            // 创建文件
            for (const fileName of uniqueFileNames) {
              await manager.writeFile(taskId.trim(), fileName, "test content");
            }
            
            // 创建目录（包含空目录）
            for (const dirName of uniqueDirNames) {
              const fullDirPath = path.join(workspaceDir, dirName);
              await mkdir(fullDirPath, { recursive: true });
              // 在目录下创建一个隐藏的 .gitkeep 样式文件，确保目录被 WorkspaceManager 跟踪
              // 因为当前 WorkspaceManager 的 getInfo 是基于文件的
              await manager.writeFile(taskId.trim(), path.join(dirName, ".keep"), "");
            }
            
            // 获取工作空间信息
            const info = await manager.getWorkspaceInfo(taskId.trim());
            
            // 验证没有错误
            expect(info.error).toBeUndefined();
            
            // 验证文件数准确 (原始文件 + 每个目录下的 .keep 文件)
            expect(info.fileCount).toBe(uniqueFileNames.length + uniqueDirNames.length);
            
            // 验证目录数准确
            expect(info.dirCount).toBe(uniqueDirNames.length);
            
            // 验证总大小准确 (每个文件写入 "test content"，12字节；.keep文件是0字节)
            const expectedSize = uniqueFileNames.length * 12;
            expect(info.totalSize).toBe(expectedSize);
            
            // 验证最后修改时间是有效的ISO字符串
            expect(info.lastModified).toBeDefined();
            expect(new Date(info.lastModified).toString()).not.toBe("Invalid Date");
          } finally {
            await rm(baseDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
