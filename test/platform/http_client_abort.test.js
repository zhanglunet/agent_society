import { describe, test, expect } from "bun:test";
import { HttpClient } from "../../src/platform/services/http/http_client.js";

describe("HttpClient - external abort signal", () => {
  test("should return request_aborted when external signal aborts", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (url, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            },
            { once: true }
          );
        });
      };

      const client = new HttpClient({ logger: { info: async () => {}, warn: async () => {}, error: async () => {}, debug: async () => {} } });
      const controller = new AbortController();

      const promise = client.request("a1", {
        url: "https://example.com",
        method: "GET",
        timeoutMs: 10000,
        signal: controller.signal
      });

      await Promise.resolve();
      controller.abort();

      const result = await promise;
      expect(result.error).toBe("request_aborted");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
