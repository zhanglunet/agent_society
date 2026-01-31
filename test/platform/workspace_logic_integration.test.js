import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import { rm, mkdir, readFile, existsSync } from "node:fs/promises";
import { existsSync as existsSyncSync } from "node:fs";
import { Workspace } from "../../src/platform/services/workspace/workspace.js";

describe("Workspace Logic Integration", () => {
  let testDataDir;
  let workspace;
  const workspaceId = "test-ws-" + Date.now();

  beforeEach(async () => {
    testDataDir = path.resolve(process.cwd(), `test/.tmp/ws_logic_test_${Date.now()}`);
    await rm(testDataDir, { recursive: true, force: true });
    await mkdir(testDataDir, { recursive: true });
    workspace = new Workspace(workspaceId, testDataDir);
  });

  afterEach(async () => {
    await rm(testDataDir, { recursive: true, force: true });
  });

  test("writeFile should retain complete metadata and history", async () => {
    const relativePath = "test/hello.txt";
    const content = "hello world";
    const operator = "agent-1";
    const messageId = "msg-1";

    // 1. 第一次写入
    await workspace.writeFile(relativePath, content, {
      operator,
      messageId,
      mimeType: "text/plain"
    });

    const metaPath = path.join(workspace.metaDir, relativePath);
    expect(existsSyncSyncSync(metaPath)).toBe(true);

    let metaContent = JSON.parse(await readFile(metaPath, "utf8"));
    expect(metaContent.history.length).toBe(1);
    expect(metaContent.history[0].operator).toBe(operator);
    expect(metaContent.mimeType).toBe("text/plain");

    // 2. 第二次写入（验证历史累加和字段保留）
    const operator2 = "agent-2";
    const messageId2 = "msg-2";
    await workspace.writeFile(relativePath, "updated content", {
      operator: operator2,
      messageId: messageId2
    });

    metaContent = JSON.parse(await readFile(metaPath, "utf8"));
    expect(metaContent.history.length).toBe(2);
    expect(metaContent.history[1].operator).toBe(operator2);
    expect(metaContent.history[1].action).toBe('write');
    expect(metaContent.mimeType).toBe("text/plain"); // 字段应保留
    expect(metaContent.deleted).toBe(false);
  });

  test("deleteFile should record history and not delete meta file", async () => {
    const relativePath = "to-delete.txt";
    await workspace.writeFile(relativePath, "temp", {
      operator: "agent-1",
      messageId: "msg-1"
    });

    const metaPath = path.join(workspace.metaDir, relativePath);
    const fullPath = path.join(workspace.rootPath, relativePath);

    // 执行删除
    await workspace.deleteFile(relativePath, {
      operator: "agent-2",
      messageId: "msg-2"
    });

    // 验证物理文件删除
    expect(existsSyncSyncSync(fullPath)).toBe(false);
    // 验证元数据文件保留
    expect(existsSyncSyncSync(metaPath)).toBe(true);

    const metaContent = JSON.parse(await readFile(metaPath, "utf8"));
    expect(metaContent.history.length).toBe(2);
    expect(metaContent.history[1].action).toBe('delete');
    expect(metaContent.history[1].operator).toBe("agent-2");
    expect(metaContent.deleted).toBe(true);
    
    // 验证全局索引已移除
    const globalMeta = await workspace._readGlobalMeta();
    expect(globalMeta.files[relativePath]).toBeUndefined();
  });

  test("path normalization and getTree", async () => {
    // 模拟 Windows 风格路径写入
    await workspace.writeFile("docs\\readme.md", "content", {
      operator: "agent-1",
      messageId: "msg-1"
    });
    
    await workspace.writeFile("src/main.js", "code", {
      operator: "agent-1",
      messageId: "msg-1"
    });

    const globalMeta = await workspace._readGlobalMeta();
    // 验证所有 key 都是正斜杠
    Object.keys(globalMeta.files).forEach(k => {
      expect(k).not.toContain("\\");
    });

    const tree = await workspace.getTree();
    expect(tree).toContain("docs");
    expect(tree).toContain("src");
    
    const files = await workspace.listFiles("docs");
    expect(files.length).toBe(1);
    expect(files[0].name).toBe("readme.md");
  });

  test("sync should recover operator information from file meta", async () => {
    const relativePath = "manual.txt";
    const fullPath = path.join(workspace.rootPath, relativePath);
    const metaPath = path.join(workspace.metaDir, relativePath);

    // 1. 正常写入产生元数据
    await workspace.writeFile(relativePath, "content", {
      operator: "agent-real",
      messageId: "msg-real"
    });

    // 2. 模拟丢失全局索引但保留文件级元数据
    await rm(workspace.globalMetaFile, { force: true });
    
    // 3. 执行同步
    const syncedMeta = await workspace.sync();
    const fileInfo = syncedMeta.files[relativePath];
    
    expect(fileInfo).toBeDefined();
    expect(fileInfo.lastOperator).toBe("agent-real");
    expect(fileInfo.lastMessageId).toBe("msg-real");
  });

  test("readFile with FileHandle should work", async () => {
    const relativePath = "large.txt";
    const content = "A".repeat(10000);
    await workspace.writeFile(relativePath, content, {
      operator: "agent-1",
      messageId: "msg-1"
    });

    const result = await workspace.readFile(relativePath, { offset: 5000, length: 10 });
    expect(result.content).toBe("A".repeat(10));
    expect(result.start).toBe(5000);
    expect(result.readLength).toBe(10);
  });
});
