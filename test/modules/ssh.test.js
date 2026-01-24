import { describe, it, expect, afterEach } from "bun:test";
import path from "node:path";

import sshModule from "../../modules/ssh/index.js";
import ConnectionManager from "../../modules/ssh/connection_manager.js";
import { ModuleLoader } from "../../src/platform/extensions/module_loader.js";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..");

describe("SSH Module - Tool Definitions", () => {
  it("getToolDefinitions should use OpenAI function tool schema", () => {
    const tools = sshModule.getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    for (const tool of tools) {
      expect(tool).toHaveProperty("type", "function");
      expect(tool).toHaveProperty("function");
      expect(typeof tool.function?.name).toBe("string");
    }
  });
});

describe("SSH Module - ModuleLoader Integration", () => {
  let loader = null;

  afterEach(async () => {
    if (loader) {
      await loader.shutdown();
      loader = null;
    }
  });

  it("ModuleLoader should register ssh tool names", async () => {
    loader = new ModuleLoader({ modulesDir: path.join(PROJECT_ROOT, "modules") });

    const runtime = {
      log: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
      config: { dataDir: path.join(PROJECT_ROOT, "test", ".tmp", "ssh_bun_test") }
    };

    await loader.loadModules(
      {
        ssh: {
          connectionTimeout: 50,
          hosts: {
            "host-a": {
              description: "A",
              host: "192.0.2.1",
              port: 22,
              username: "user",
              password: "secret"
            }
          }
        }
      },
      runtime
    );

    expect(loader.hasToolName("ssh_list_hosts")).toBe(true);
    expect(loader.hasToolName("ssh_connect")).toBe(true);
  });

  it("ssh_list_hosts should not leak sensitive fields", async () => {
    loader = new ModuleLoader({ modulesDir: path.join(PROJECT_ROOT, "modules") });

    const runtime = {
      log: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
      config: { dataDir: path.join(PROJECT_ROOT, "test", ".tmp", "ssh_bun_test") }
    };

    await loader.loadModules(
      {
        ssh: {
          hosts: {
            "prod": {
              description: "生产",
              host: "10.0.0.1",
              port: 22,
              username: "root",
              password: "secret"
            }
          }
        }
      },
      runtime
    );

    const res = await loader.executeToolCall(null, "ssh_list_hosts", {});
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.hosts)).toBe(true);
    expect(res.hosts[0]).toEqual({ hostName: "prod", description: "生产" });
  });
});

describe("ConnectionManager - Hosts Normalization", () => {
  it("should accept hosts as array and normalize to object", () => {
    const cm = new ConnectionManager(
      {
        hosts: [
          {
            name: "h1",
            description: "H1",
            host: "192.0.2.1",
            port: 22,
            username: "u",
            password: "p"
          }
        ]
      },
      { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    );

    const res = cm.listHosts();
    expect(res.ok).toBe(true);
    expect(res.hosts).toEqual([{ hostName: "h1", description: "H1" }]);
  });
});

