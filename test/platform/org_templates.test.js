import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { OrgTemplateRepository } from "../../src/platform/services/org_templates/org_template_repository.js";
import { HTTPServer } from "../../src/platform/services/http/http_server.js";
import { createDefaultTestRuntime } from "../helpers/test_runtime.js";

function createMockRes() {
  const state = {
    statusCode: null,
    headers: {},
    body: "",
    headersSent: false,
    done: null
  };

  let resolveDone = null;
  state.done = new Promise((resolve) => {
    resolveDone = resolve;
  });

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
      resolveDone?.();
    }
  };

  return { res, state };
}

function createMockJsonRequest(url, method, body) {
  const bodyStr = JSON.stringify(body ?? {});
  let dataCallback = null;
  let endCallback = null;

  return {
    method,
    url,
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(bodyStr).toString()
    },
    on: (event, callback) => {
      if (event === "data") dataCallback = callback;
      if (event === "end") endCallback = callback;
    },
    _emit: () => {
      if (dataCallback) dataCallback(Buffer.from(bodyStr));
      if (endCallback) endCallback();
    }
  };
}

describe("OrgTemplateRepository", () => {
  test("listTemplateInfos 只读取 info.md 且跳过缺失文件的模板", async () => {
    const baseDir = path.resolve(process.cwd(), `test/.tmp/org_templates_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(baseDir, { recursive: true });

    try {
      await mkdir(path.join(baseDir, "teamA"), { recursive: true });
      await writeFile(path.join(baseDir, "teamA", "info.md"), "A info", "utf8");
      await writeFile(path.join(baseDir, "teamA", "org.md"), "A org", "utf8");

      await mkdir(path.join(baseDir, "teamB"), { recursive: true });
      await writeFile(path.join(baseDir, "teamB", "org.md"), "B org only", "utf8");

      const repo = new OrgTemplateRepository({ baseDir });
      const list = await repo.listTemplateInfos();

      expect(list.length).toBe(1);
      expect(list[0].orgName).toBe("teamA");
      expect(list[0].infoMd).toBe("A info");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});

describe("Org template tools", () => {
  test("root 可见并可执行 list_org_template_infos / get_org_template_org", async () => {
    const baseDir = path.resolve(process.cwd(), `test/.tmp/org_templates_tools_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(path.join(baseDir, "t1"), { recursive: true });
    await writeFile(path.join(baseDir, "t1", "info.md"), "t1 info", "utf8");
    await writeFile(path.join(baseDir, "t1", "org.md"), "t1 org", "utf8");

    const runtime = createDefaultTestRuntime();
    try {
      await runtime.init();
      runtime.orgTemplates = new OrgTemplateRepository({ baseDir });

      const rootTools = runtime._tools.getToolDefinitionsForAgent("root");
      const toolNames = rootTools.map(t => t?.function?.name).filter(Boolean);
      expect(toolNames).toContain("list_org_template_infos");
      expect(toolNames).toContain("get_org_template_org");

      const ctx = { agent: { id: "root" } };

      const listResult = await runtime._toolExecutor.executeToolCall(ctx, "list_org_template_infos", {});
      expect(Array.isArray(listResult.templates)).toBe(true);
      expect(listResult.templates.length).toBe(1);
      expect(listResult.templates[0].orgName).toBe("t1");

      const orgResult = await runtime._toolExecutor.executeToolCall(ctx, "get_org_template_org", { orgName: "t1" });
      expect(orgResult.orgName).toBe("t1");
      expect(orgResult.orgMd).toBe("t1 org");
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});

describe("HTTP org templates endpoints", () => {
  test("create/update/get/delete 基本流程", async () => {
    const baseDir = path.resolve(process.cwd(), `test/.tmp/org_templates_http_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(baseDir, { recursive: true, force: true });

    const repo = new OrgTemplateRepository({ baseDir });
    const server = new HTTPServer({ port: 0 });
    server.setSociety({
      runtime: { orgTemplates: repo },
      onUserMessage: () => {},
      onAllMessages: () => {}
    });

    const orgName = "myOrg";
    const orgName2 = "myOrg2";

    {
      const { res, state } = createMockRes();
      const req = createMockJsonRequest("/api/org-templates", "POST", { orgName });
      server._handleCreateOrgTemplate(req, res);
      req._emit();
      await state.done;
      expect(state.statusCode).toBe(200);
    }

    {
      const { res, state } = createMockRes();
      const req = createMockJsonRequest(`/api/org-templates/${orgName}/rename`, "POST", { newOrgName: orgName2 });
      server._handleRenameOrgTemplate(req, orgName, res);
      req._emit();
      await state.done;
      expect(state.statusCode).toBe(200);
    }

    {
      const { res, state } = createMockRes();
      const req = createMockJsonRequest(`/api/org-templates/${orgName2}/info`, "PUT", { content: "hello info" });
      server._handleUpdateOrgTemplateInfo(req, orgName2, res);
      req._emit();
      await state.done;
      expect(state.statusCode).toBe(200);
    }

    {
      const { res, state } = createMockRes();
      const req = createMockJsonRequest(`/api/org-templates/${orgName2}/org`, "PUT", { content: "hello org" });
      server._handleUpdateOrgTemplateOrg(req, orgName2, res);
      req._emit();
      await state.done;
      expect(state.statusCode).toBe(200);
    }

    {
      const { res, state } = createMockRes();
      await server._handleGetOrgTemplateInfo(orgName2, res);
      expect(state.statusCode).toBe(200);
      const payload = JSON.parse(state.body);
      expect(payload.orgName).toBe(orgName2);
      expect(payload.infoMd).toBe("hello info");
    }

    {
      const { res, state } = createMockRes();
      await server._handleGetOrgTemplateOrg(orgName2, res);
      expect(state.statusCode).toBe(200);
      const payload = JSON.parse(state.body);
      expect(payload.orgName).toBe(orgName2);
      expect(payload.orgMd).toBe("hello org");
    }

    {
      const { res, state } = createMockRes();
      await server._handleDeleteOrgTemplate(orgName2, res);
      expect(state.statusCode).toBe(200);
    }

    await rm(baseDir, { recursive: true, force: true });
  });
});
