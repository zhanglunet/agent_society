import { describe, it, expect } from "vitest";
import { buildWllamaHeadlessUrl, findChromeExecutablePath, chat } from "../../../src/platform/localllm/wllama_headless_launcher.js";

describe("localllm/wllama_headless_launcher", () => {
  describe("buildWllamaHeadlessUrl", () => {
    it("should build default URL with port", () => {
      const url = buildWllamaHeadlessUrl({ port: 4321 });
      expect(url).toContain("http://localhost:4321/web/wllama/dist/index.html?");
      expect(url).toContain("ctx=4096");
      expect(url).toContain("model=../models/LFM2-700M-Q4_K_M.gguf");
      expect(url).toContain("autoload=1");
    });

    it("should allow overriding query", () => {
      const url = buildWllamaHeadlessUrl({ port: 3000, query: "a=1&b=2" });
      expect(url).toBe("http://localhost:3000/web/wllama/dist/index.html?a=1&b=2");
    });
  });

  describe("findChromeExecutablePath", () => {
    it("should prefer CHROME_EXECUTABLE_PATH when exists", () => {
      const exists = (p) => p === "C:\\x\\chrome.exe";
      const found = findChromeExecutablePath({
        platform: "win32",
        env: { CHROME_EXECUTABLE_PATH: "C:\\x\\chrome.exe" },
        existsSyncFn: exists
      });
      expect(found).toBe("C:\\x\\chrome.exe");
    });

    it("should search common Windows locations", () => {
      const p1 = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
      const exists = (p) => p === p1;
      const found = findChromeExecutablePath({
        platform: "win32",
        env: { PROGRAMFILES: "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
        existsSyncFn: exists
      });
      expect(found).toBe(p1);
    });

    it("should return null when not found", () => {
      const exists = () => false;
      const found = findChromeExecutablePath({ platform: "linux", env: {}, existsSyncFn: exists });
      expect(found).toBeNull();
    });
  });

  describe("chat", () => {
    it("should throw when wllama is not launched", async () => {
      await expect(chat([{ role: "user", content: "hi" }])).rejects.toThrow();
    });
  });
});
