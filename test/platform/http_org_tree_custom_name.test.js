import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";
import { HTTPServer } from "../../src/platform/services/http/http_server.js";

describe("HTTPServer org tree customName", () => {
  let runtime;
  let tmpDir;
  let artifactsDir;

  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), `test/.tmp/http_org_tree_custom_name_${Date.now()}`);
    artifactsDir = path.resolve(tmpDir, "artifacts");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir,
        runtimeDir: tmpDir,
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    runtime = new Runtime({ configPath });
    await runtime.init();
    runtime.localLlmChat = async () => "张三";
  });

  test("_handleGetOrgTree includes customName from org agent.name", async () => {
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test prompt",
      createdBy: "root"
    });
    const agent = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });

    const http = new HTTPServer();
    http.setSociety({
      runtime,
      onUserMessage() {},
      onAgentMessage() {}
    });

    let body = null;
    const res = {
      headersSent: false,
      setHeader() {},
      writeHead(code) {
        this.statusCode = code;
      },
      end(text) {
        body = text;
      }
    };

    http._handleGetOrgTree(res);
    expect(res.statusCode).toBe(200);

    const payload = JSON.parse(body);
    const findNode = (nodes, id) => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const child = Array.isArray(n.children) ? findNode(n.children, id) : null;
        if (child) return child;
      }
      return null;
    };

    const node = findNode(payload.tree, agent.id);
    expect(node).toBeTruthy();
    expect(node.customName).toBe("张三");
  });
});
