import { describe, expect, test, mock } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../src/platform/core/runtime.js";

describe("Runtime Tool Delegation", () => {
  test("executeToolCall delegates to ToolExecutor", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_tool_delegation_test");
    const artifactsDir = path.resolve(tmpDir, "artifacts");
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

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // Mock the ToolExecutor's executeToolCall method
    const originalExecute = runtime._toolExecutor.executeToolCall.bind(runtime._toolExecutor);
    let delegationCalled = false;
    let capturedArgs = null;

    runtime._toolExecutor.executeToolCall = async (ctx, toolName, args) => {
      delegationCalled = true;
      capturedArgs = { ctx, toolName, args };
      return originalExecute(ctx, toolName, args);
    };

    // Create a proper context
    const agent = { id: "test-agent" };
    const ctx = runtime._buildAgentContext(agent);

    // Verify delegation occurred
    expect(delegationCalled).toBe(true);
    expect(capturedArgs).toBeTruthy();
    
    // Verify the result is valid
    expect(result).toBeTruthy();
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  test("executeToolCall handles errors from ToolExecutor", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_tool_error_test");
    const artifactsDir = path.resolve(tmpDir, "artifacts");
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

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // Mock ToolExecutor to throw an error
    runtime._toolExecutor.executeToolCall = async () => {
      throw new Error("Test error");
    };

    const ctx = {
      agent: { id: "test-agent" },
      runtime
    };

    // Call should handle the error gracefully
    const result = await runtime.executeToolCall(ctx, "any_tool", {});

    expect(result).toBeTruthy();
    expect(result.error).toBe("tool_execution_failed");
    expect(result.toolName).toBe("any_tool");
    expect(result.message).toBe("Test error");
  });

  test("executeToolCall works with get_artifact tool", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_get_artifact_test");
    const artifactsDir = path.resolve(tmpDir, "artifacts");
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

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // Create a proper context with tools
    const agent = { id: "test-agent" };
    const ctx = runtime._buildAgentContext(agent);

    // First, create an artifact using put_artifact
    const putResult = await runtime.executeToolCall(ctx, "put_artifact", {
      type: "text",
      content: "Test artifact content",
      meta: { mimeType: "text/plain" }
    });

    expect(putResult).toBeTruthy();
    expect(putResult.error).toBeUndefined();
    expect(putResult.artifactRef).toBeTruthy();

    // Now retrieve it using get_artifact
    const getResult = await runtime.executeToolCall(ctx, "get_artifact", {
      ref: putResult.artifactRef
    });

    expect(getResult).toBeTruthy();
    expect(getResult.error).toBeUndefined();
    expect(getResult.content).toBe("Test artifact content");
  });

  test("executeToolCall works with put_artifact tool", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_put_artifact_test");
    const artifactsDir = path.resolve(tmpDir, "artifacts");
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

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // Create a proper context with tools
    const agent = { id: "test-agent" };
    const ctx = runtime._buildAgentContext(agent);

    // Test put_artifact
    const result = await runtime.executeToolCall(ctx, "put_artifact", {
      type: "text",
      content: "Hello, World!",
      meta: { mimeType: "text/plain", filename: "test.txt" }
    });

    expect(result).toBeTruthy();
    expect(result.error).toBeUndefined();
    expect(result.artifactRef).toBeTruthy();
    expect(result.artifactRef).toMatch(/^artifact:/);
    
    // Verify the artifact was actually stored
    const artifact = await runtime.artifacts.getArtifact(result.artifactRef);
    expect(artifact).toBeTruthy();
    expect(artifact.content).toBe("Hello, World!");
  });
});
