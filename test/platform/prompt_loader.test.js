import { describe, expect, test } from "bun:test";
import { PromptLoader } from "../../src/platform/prompt_loader.js";
import path from "node:path";
import { readFile } from "node:fs/promises";

describe("PromptLoader", () => {
  test("compose replaces placeholders", async () => {
    const loader = new PromptLoader({ promptsDir: path.resolve(process.cwd(), "config/prompts") });
    const template = "A={{BASE}} B={{ROLE}} C={{TASK}}";
    const out = loader.compose({ base: "b", composeTemplate: template, rolePrompt: "r", taskText: "t" });
    expect(out).toBe("A=b B=r C=t");
  });

  test("root prompt requires concise rolePrompt and clarified task message", async () => {
    const rootPath = path.resolve(process.cwd(), "config/prompts/root.txt");
    const content = await readFile(rootPath, "utf8");
    expect(content).toContain("rolePrompt 必须保持简�?);
    expect(content).toContain("send_message");
    expect(content).toContain("澄清后的任务说明");
    expect(content).toContain("to=user");
  });

  test("tool rules require stopping after delivery", async () => {
    const toolRulesPath = path.resolve(process.cwd(), "config/prompts/tool_rules.txt");
    const content = await readFile(toolRulesPath, "utf8");
    expect(content).toContain("【防重复执行（提示词规则）�?);
    expect(content).toContain("停止调用工具");
  });
});
