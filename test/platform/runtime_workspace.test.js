import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import fc from "fast-check";
import path from "node:path";
import { rm, mkdir, readdir } from "node:fs/promises";
import { Runtime } from "../../src/platform/runtime.js";

describe("Runtime Workspace", () => {
  let runtime;
  let testDataDir;

  beforeEach(async () => {
    testDataDir = path.resolve(process.cwd(), `test/.tmp/runtime_ws_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(testDataDir, { recursive: true, force: true });
    await mkdir(testDataDir, { recursive: true });
    
    runtime = new Runtime({
      configPath: "config/app.json",
      dataDir: testDataDir
    });
    await runtime.init();
    
    // 创建测试用岗位
    await runtime.org.createRole({
      name: "test-worker",
      rolePrompt: "测试工作者"
    });
  });

  afterEach(async () => {
    if (runtime) {
      runtime._stopRequested = true;
    }
    await rm(testDataDir, { recursive: true, force: true });
  });

  /**
   * Property 7: 工作空间继承（通过祖先链查找）
   * *For any* 智能体，调用工作空间相关 API 时，应通过祖先链向上查找，
   * 使用第一个具有工作空间的祖先的工作空间。
   * 
   * **Validates: Requirements 1.4, 5.2, 7.1, 7.2**
   */
  test("Property 7: 工作空间继承（通过祖先链查找）", async () => {
    // 获取测试岗位
    const role = runtime.org.findRoleByName("test-worker");
    expect(role).toBeDefined();

    // 创建 root 的直接子智能体（应该获得新工作空间）
    const agent1 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    // 验证 agent1 有工作空间
    expect(runtime.workspaceManager.hasWorkspace(agent1.id)).toBe(true);
    
    // 创建 agent1 的子智能体
    const agent2 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: agent1.id
    });
    
    // 验证 agent2 没有自己的工作空间
    expect(runtime.workspaceManager.hasWorkspace(agent2.id)).toBe(false);
    
    // 验证 agent2 通过祖先链查找可以找到 agent1 的工作空间
    const workspaceId = runtime.findWorkspaceIdForAgent(agent2.id);
    expect(workspaceId).toBe(agent1.id);
    
    // 创建 agent2 的子智能体（孙智能体）
    const agent3 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: agent2.id
    });
    
    // 验证 agent3 也能通过祖先链找到 agent1 的工作空间
    const workspaceId3 = runtime.findWorkspaceIdForAgent(agent3.id);
    expect(workspaceId3).toBe(agent1.id);
  });

  /**
   * Property 8: 新工作空间分配
   * *For any* 由 root 直接创建的智能体，其 workspaceId 应等于自己的 agentId。
   * 
   * **Validates: Requirements 7.3**
   */
  test("Property 8: 新工作空间分配", async () => {
    const role = runtime.org.findRoleByName("test-worker");
    expect(role).toBeDefined();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (count) => {
          const agents = [];
          
          // 创建多个 root 的直接子智能体
          for (let i = 0; i < count; i++) {
            const agent = await runtime.spawnAgent({
              roleId: role.id,
              parentAgentId: "root"
            });
            agents.push(agent);
          }
          
          // 验证每个智能体都有自己的工作空间，且 workspaceId 等于 agentId
          for (const agent of agents) {
            expect(runtime.workspaceManager.hasWorkspace(agent.id)).toBe(true);
            const workspaceId = runtime.findWorkspaceIdForAgent(agent.id);
            expect(workspaceId).toBe(agent.id);
          }
          
          // 验证所有工作空间路径都不同
          const workspacePaths = agents.map(a => 
            runtime.workspaceManager.getWorkspacePath(a.id)
          );
          const uniquePaths = new Set(workspacePaths);
          expect(uniquePaths.size).toBe(agents.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 9: 工作空间隔离
   * *For any* 两个由 root 直接创建的不同智能体，它们的工作空间路径应该不同。
   * 
   * **Validates: Requirements 5.1**
   */
  test("Property 9: 工作空间隔离", async () => {
    const role = runtime.org.findRoleByName("test-worker");
    expect(role).toBeDefined();

    // 创建两个 root 的直接子智能体
    const agent1 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    const agent2 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    // 验证两个智能体的工作空间路径不同
    const path1 = runtime.workspaceManager.getWorkspacePath(agent1.id);
    const path2 = runtime.workspaceManager.getWorkspacePath(agent2.id);
    
    expect(path1).not.toBe(path2);
    expect(path1).toContain(agent1.id);
    expect(path2).toContain(agent2.id);
  });

  /**
   * 测试 findWorkspaceIdForAgent 对于没有工作空间的智能体返回 null
   */
  test("findWorkspaceIdForAgent returns null for agents without workspace", () => {
    // root 和 user 没有工作空间
    expect(runtime.findWorkspaceIdForAgent("root")).toBe(null);
    expect(runtime.findWorkspaceIdForAgent("user")).toBe(null);
    
    // 不存在的智能体也返回 null
    expect(runtime.findWorkspaceIdForAgent("nonexistent")).toBe(null);
  });

  /**
   * 测试工作空间懒加载：分配后文件夹不存在
   */
  test("workspace folder not created on assignment", async () => {
    const role = runtime.org.findRoleByName("test-worker");
    const agent = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    const workspacePath = runtime.workspaceManager.getWorkspacePath(agent.id);
    
    // 验证工作空间文件夹不存在（懒加载）
    let folderExists = false;
    try {
      await readdir(workspacePath);
      folderExists = true;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    expect(folderExists).toBe(false);
  });
});


describe("Runtime Workspace Integration", () => {
  let runtime;
  let testDataDir;

  beforeEach(async () => {
    testDataDir = path.resolve(process.cwd(), `test/.tmp/runtime_ws_int_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(testDataDir, { recursive: true, force: true });
    await mkdir(testDataDir, { recursive: true });
    
    runtime = new Runtime({
      configPath: "config/app.json",
      dataDir: testDataDir
    });
    await runtime.init();
    
    // 创建测试用岗位
    await runtime.org.createRole({
      name: "test-worker",
      rolePrompt: "测试工作者"
    });
  });

  afterEach(async () => {
    if (runtime) {
      runtime._stopRequested = true;
    }
    await rm(testDataDir, { recursive: true, force: true });
  });

  /**
   * 端到端集成测试：root 创建子智能体 → 子智能体写入文件 → 孙智能体读取文件
   * 
   * **Validates: Requirements 1.4, 5.3, 7.1**
   */
  test("E2E: workspace file operations across agent hierarchy", async () => {
    const role = runtime.org.findRoleByName("test-worker");
    
    // 创建 root 的直接子智能体（获得新工作空间）
    const agent1 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    // 创建 agent1 的子智能体（继承工作空间）
    const agent2 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: agent1.id
    });
    
    // 创建 agent2 的子智能体（孙智能体，也继承工作空间）
    const agent3 = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: agent2.id
    });
    
    // 验证所有智能体使用同一个工作空间
    const ws1 = runtime.findWorkspaceIdForAgent(agent1.id);
    const ws2 = runtime.findWorkspaceIdForAgent(agent2.id);
    const ws3 = runtime.findWorkspaceIdForAgent(agent3.id);
    
    expect(ws1).toBe(agent1.id);
    expect(ws2).toBe(agent1.id);
    expect(ws3).toBe(agent1.id);
    
    // agent1 写入文件
    const writeResult = await runtime.workspaceManager.writeFile(ws1, "test.txt", "hello from agent1");
    expect(writeResult.ok).toBe(true);
    
    // agent2 读取文件（通过继承的工作空间）
    const readResult2 = await runtime.workspaceManager.readFile(ws2, "test.txt");
    expect(readResult2.content).toBe("hello from agent1");
    
    // agent3 读取文件（通过继承的工作空间）
    const readResult3 = await runtime.workspaceManager.readFile(ws3, "test.txt");
    expect(readResult3.content).toBe("hello from agent1");
    
    // agent3 写入新文件
    const writeResult3 = await runtime.workspaceManager.writeFile(ws3, "from_agent3.txt", "hello from agent3");
    expect(writeResult3.ok).toBe(true);
    
    // agent1 可以读取 agent3 写入的文件
    const readResult1 = await runtime.workspaceManager.readFile(ws1, "from_agent3.txt");
    expect(readResult1.content).toBe("hello from agent3");
  });

  /**
   * 测试不同任务的工作空间隔离
   * 
   * **Validates: Requirements 5.1, 5.3**
   */
  test("workspace isolation between different tasks", async () => {
    const role = runtime.org.findRoleByName("test-worker");
    
    // 创建两个不同的任务（root 的直接子智能体）
    const task1Agent = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    const task2Agent = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    // 验证两个任务有不同的工作空间
    const ws1 = runtime.findWorkspaceIdForAgent(task1Agent.id);
    const ws2 = runtime.findWorkspaceIdForAgent(task2Agent.id);
    
    expect(ws1).not.toBe(ws2);
    
    // task1 写入文件
    await runtime.workspaceManager.writeFile(ws1, "task1.txt", "task1 content");
    
    // task2 写入同名文件
    await runtime.workspaceManager.writeFile(ws2, "task1.txt", "task2 content");
    
    // 验证两个文件内容不同（隔离）
    const read1 = await runtime.workspaceManager.readFile(ws1, "task1.txt");
    const read2 = await runtime.workspaceManager.readFile(ws2, "task1.txt");
    
    expect(read1.content).toBe("task1 content");
    expect(read2.content).toBe("task2 content");
  });
});
