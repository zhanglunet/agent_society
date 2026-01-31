import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { HTTPServer } from "../../src/platform/services/http/http_server.js";

function createMockRes() {
  const state = {
    statusCode: null,
    headers: {},
    body: "",
    headersSent: false
  };

  const res = {
    headersSent: false,
    setHeader(name, value) {
      state.headers[String(name).toLowerCase()] = String(value);
    },
    writeHead(statusCode) {
      state.statusCode = statusCode;
      this.headersSent = true;
      state.headersSent = true;
    },
    end(body = "") {
      state.body = String(body);
    }
  };

  return { res, state };
}

describe("HTTPServer workspace endpoints", () => {
  const BASE_DIR = path.resolve(process.cwd(), "test/.tmp/http_workspace_test");

  test("GET /api/workspaces/:workspaceId 返回文件列表", async () => {
    await rm(BASE_DIR, { recursive: true, force: true });
    await mkdir(BASE_DIR, { recursive: true });

    try {
      const workspacesDir = path.join(BASE_DIR, "workspaces");
      const server = new HTTPServer({ workspacesDir });
      
      const workspaceId = "ws-test-1";
      const filePath = "dir/sub.txt";
      
      // 使用 WorkspaceManager 写入文件，这会自动创建元数据
      await server._workspaceManager.writeFile(workspaceId, filePath, "hello world", {
        operator: "test-user",
        messageId: "msg-123"
      });

      const { res, state } = createMockRes();
      await server._handleGetWorkspaceFiles(workspaceId, res);

      expect(state.statusCode).toBe(200);
      const payload = JSON.parse(state.body);
      expect(payload.workspaceId).toBe(workspaceId);
      expect(Array.isArray(payload.files)).toBe(true);
      expect(payload.files.length).toBe(1);
      expect(payload.files[0].path).toBe(filePath);
      expect(payload.files[0].mimeType).toBe("text/plain");
    } finally {
      await rm(BASE_DIR, { recursive: true, force: true });
    }
  });

  test("GET /api/workspaces/:workspaceId/file 获取文件内容", async () => {
    await rm(BASE_DIR, { recursive: true, force: true });
    await mkdir(BASE_DIR, { recursive: true });

    try {
      const workspacesDir = path.join(BASE_DIR, "workspaces");
      const server = new HTTPServer({ workspacesDir });
      
      const workspaceId = "ws-test-2";
      const filePath = "test.txt";
      const content = "hello workspace";
      
      await server._workspaceManager.writeFile(workspaceId, filePath, content);

      const { res, state } = createMockRes();
      // 模拟查询参数 ?path=test.txt
      await server._handleGetWorkspaceFile(workspaceId, filePath, 0, 5000, res);

      expect(state.statusCode).toBe(200);
      const payload = JSON.parse(state.body);
      expect(payload.workspaceId).toBe(workspaceId);
      expect(payload.path).toBe(filePath);
      expect(payload.content).toBe(content);
    } finally {
      await rm(BASE_DIR, { recursive: true, force: true });
    }
  });

  test("DELETE /api/workspaces/:workspaceId/file 删除文件", async () => {
    await rm(BASE_DIR, { recursive: true, force: true });
    await mkdir(BASE_DIR, { recursive: true });

    try {
      const workspacesDir = path.join(BASE_DIR, "workspaces");
      const server = new HTTPServer({ workspacesDir });
      
      const workspaceId = "ws-test-3";
      const filePath = "to-delete.txt";
      
      await server._workspaceManager.writeFile(workspaceId, filePath, "content");
      expect(server._workspaceManager.checkWorkspaceExists(workspaceId)).toBe(true);

      const { res, state } = createMockRes();
      await server._handleDeleteWorkspaceFile(workspaceId, filePath, res);

      expect(state.statusCode).toBe(200);
      
      // 验证文件已删除
      const ws = await server._workspaceManager.getWorkspace(workspaceId);
      const meta = await ws._readGlobalMeta();
      expect(meta.files[filePath]).toBeUndefined();
    } finally {
      await rm(BASE_DIR, { recursive: true, force: true });
    }
  });
});
