import { describe, expect, test, mock } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";

describe("Runtime Tool Delegation", () => {
  test("executeToolCall delegates to ToolExecutor", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_tool_delegation_test");
    const workspacesDir = path.resolve(tmpDir, "workspaces");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        workspacesDir,
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
    const agent = { id: "test-agent", roleId: "test-role" };
    runtime._agentMetaById.set(agent.id, { id: agent.id, roleId: agent.roleId, parentAgentId: "root" });
    await runtime.workspaceManager.createWorkspace(agent.id);
    const ctx = runtime._buildAgentContext(agent);

    // Perform the call
    const result = await runtime.executeToolCall(ctx, "write_file", { 
      path: "delegation_test.txt", 
      content: "test", 
      mimeType: "text/plain" 
    });

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
    const workspacesDir = path.resolve(tmpDir, "workspaces");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        workspacesDir,
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

  test("executeToolCall works with read_file tool", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_read_file_test");
    const workspacesDir = path.resolve(tmpDir, "workspaces");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        workspacesDir,
        runtimeDir: tmpDir,
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // Create a proper context with tools
    const agent = { id: "test-agent", roleId: "test-role" };
    runtime._agentMetaById.set(agent.id, { id: agent.id, roleId: agent.roleId, parentAgentId: "root" });
    await runtime.workspaceManager.createWorkspace(agent.id);
    const ctx = runtime._buildAgentContext(agent);

    // First, create a file using write_file
    const writeResult = await runtime.executeToolCall(ctx, "write_file", {
      path: "test.txt",
      content: "Test file content",
      mimeType: "text/plain"
    });

    expect(writeResult).toBeTruthy();
    expect(writeResult.error).toBeUndefined();
    expect(writeResult.ok).toBe(true);

    // Now retrieve it using read_file
    const readResult = await runtime.executeToolCall(ctx, "read_file", {
      path: "test.txt"
    });

    expect(readResult).toBeTruthy();
    expect(readResult.error).toBeUndefined();
    expect(readResult.content).toBe("Test file content");
  });

  test("executeToolCall works with write_file tool", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_write_file_test");
    const workspacesDir = path.resolve(tmpDir, "workspaces");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        workspacesDir,
        runtimeDir: tmpDir,
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // Create a proper context with tools
    const agent = { id: "test-agent", roleId: "test-role" };
    runtime._agentMetaById.set(agent.id, { id: agent.id, roleId: agent.roleId, parentAgentId: "root" });
    await runtime.workspaceManager.createWorkspace(agent.id);
    const ctx = runtime._buildAgentContext(agent);

    // Test write_file
    const result = await runtime.executeToolCall(ctx, "write_file", {
      path: "hello.txt",
      content: "Hello, World!",
      mimeType: "text/plain"
    });

    expect(result).toBeTruthy();
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    
    // Verify the file was actually stored
    const result_read = await runtime.workspaceManager.readFile(agent.id, "hello.txt");
    expect(result_read.content).toBe("Hello, World!");
  });
});
