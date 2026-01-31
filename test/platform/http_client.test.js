import { describe, it, expect, beforeEach } from "vitest";
import { HttpClient, createHttpClient } from "../../src/platform/services/http/http_client.js";
import { createNoopModuleLogger } from "../../src/platform/utils/logger/logger.js";

describe("HttpClient", () => {
  let client;

  beforeEach(() => {
    client = new HttpClient({ logger: createNoopModuleLogger() });
  });

  describe("URL 验证", () => {
    it("应拒绝 HTTP URL", async () => {
      const result = await client.request("agent-1", {
        url: "http://example.com"
      });
      expect(result.error).toBe("only_https_allowed");
      expect(result.requestLog.success).toBe(false);
      expect(result.requestLog.agentId).toBe("agent-1");
    });

    it("应拒绝无效 URL", async () => {
      const result = await client.request("agent-1", {
        url: "not-a-valid-url"
      });
      expect(result.error).toBe("invalid_url");
      expect(result.requestLog.success).toBe(false);
    });

    it("应接受 HTTPS URL", async () => {
      // 使用一个可靠的公共 API
      const result = await client.request("agent-1", {
        url: "https://httpbin.org/get",
        timeoutMs: 10000
      });
      // 可能成功也可能因网络问题失败，但不应该是 URL 验证错误
      expect(result.error).not.toBe("only_https_allowed");
      expect(result.error).not.toBe("invalid_url");
    });
  });

  describe("HTTP 方法验证", () => {
    it("应拒绝无效的 HTTP 方法", async () => {
      const result = await client.request("agent-1", {
        url: "https://example.com",
        method: "INVALID"
      });
      expect(result.error).toContain("invalid_method");
    });

    it("应接受有效的 HTTP 方法", async () => {
      const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
      for (const method of methods) {
        const result = await client.request("agent-1", {
          url: "https://example.com",
          method,
          timeoutMs: 5000
        });
        // error 可能是 undefined（成功）或其他错误（如网络问题），但不应该是方法验证错误
        if (result.error) {
          expect(result.error).not.toContain("invalid_method");
        }
      }
    });
  });

  describe("请求日志", () => {
    it("应记录请求 ID", async () => {
      const result = await client.request("agent-1", {
        url: "https://example.com",
        timeoutMs: 5000
      });
      expect(result.requestLog.requestId).toMatch(/^req_/);
    });

    it("应记录智能体 ID", async () => {
      const result = await client.request("test-agent-123", {
        url: "https://example.com",
        timeoutMs: 5000
      });
      expect(result.requestLog.agentId).toBe("test-agent-123");
    });

    it("应记录请求方法和 URL", async () => {
      const result = await client.request("agent-1", {
        url: "https://example.com/test",
        method: "POST",
        timeoutMs: 5000
      });
      expect(result.requestLog.method).toBe("POST");
      expect(result.requestLog.url).toBe("https://example.com/test");
    });

    it("应记录请求头", async () => {
      const result = await client.request("agent-1", {
        url: "https://example.com",
        headers: { "X-Custom-Header": "test-value" },
        timeoutMs: 5000
      });
      expect(result.requestLog.requestHeaders["X-Custom-Header"]).toBe("test-value");
    });

    it("应记录请求体", async () => {
      const body = { key: "value" };
      const result = await client.request("agent-1", {
        url: "https://example.com",
        method: "POST",
        body,
        timeoutMs: 5000
      });
      expect(result.requestLog.requestBody).toEqual(body);
    });
  });

  describe("createHttpClient 工厂函数", () => {
    it("应创建 HttpClient 实例", () => {
      const client = createHttpClient();
      expect(client).toBeInstanceOf(HttpClient);
    });
  });
});
