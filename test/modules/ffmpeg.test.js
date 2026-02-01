import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import { rm, mkdir, writeFile, readFile } from "node:fs/promises";

import { Runtime } from "../../src/platform/core/runtime.js";
import { Config } from "../../src/platform/utils/config/config.js";
import { ModuleLoader } from "../../src/platform/extensions/module_loader.js";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..");
const TEST_DIR = path.resolve(process.cwd(), "test/.tmp/ffmpeg_module_test");

describe("FFmpeg Module - Run and Status", () => {
  let runtime;
  let loader;
  let fakeFfmpegScript;

  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });

    const configPath = path.resolve(TEST_DIR, "app.json");
    const workspacesDir = path.resolve(TEST_DIR, "workspaces");
    await mkdir(workspacesDir, { recursive: true });

    await writeFile(
      configPath,
      JSON.stringify(
        {
          promptsDir: "config/prompts",
          artifactsDir: path.resolve(TEST_DIR, "artifacts"),
          runtimeDir: path.resolve(TEST_DIR, "state"),
          workspacesDir: workspacesDir,
          maxSteps: 10,
          modules: {}
        },
        null,
        2
      ),
      "utf8"
    );

    fakeFfmpegScript = path.join(TEST_DIR, "fake_ffmpeg.js");
    await writeFile(
      fakeFfmpegScript,
      [
        'import { writeFile } from "node:fs/promises";',
        "const args = process.argv.slice(2);",
        "if (args.includes(\"--fail\")) {",
        "  console.error(\"intentional_fail\");",
        "  process.exit(1);",
        "}",
        'const idx = args.indexOf("--write");',
        "if (idx >= 0 && args[idx + 1]) {",
        '  await writeFile(args[idx + 1], "hello", "utf8");',
        "}",
        'console.error("frame=1 fps=1 time=00:00:00.01");',
        'console.log("done");'
      ].join("\n"),
      "utf8"
    );

    const wrapperPath = path.join(TEST_DIR, "ffmpeg_wrapper.bat");
    await writeFile(wrapperPath, `@echo off\n"${process.execPath}" "${fakeFfmpegScript}" %*`, "utf8");

    const config = new Config(TEST_DIR);
    runtime = new Runtime({ configService: config });
    await runtime.init();

    loader = new ModuleLoader({ modulesDir: path.join(PROJECT_ROOT, "modules") });
    await loader.loadModules(
      {
        ffmpeg: {
          ffmpegPath: wrapperPath
        }
      },
      runtime
    );
  });

  afterEach(async () => {
    if (loader) {
      await loader.shutdown();
      loader = null;
    }
    if (runtime) {
      await runtime.shutdown();
      runtime = null;
    }
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("ffmpeg_run should return taskId immediately, and output becomes complete after completed", async () => {
    // 为 root 智能体创建工作空间
    await runtime.workspaceManager.createWorkspace("root");

    const ctx = runtime._buildAgentContext({ id: "root" });
    ctx.currentMessage = { id: "m1", taskId: "t1" };

    const runRes = await loader.executeToolCall(ctx, "ffmpeg_run", {
      command: `--write output.txt`
    });

    if (!runRes.taskId) {
      console.error("FFmpeg run failed:", JSON.stringify(runRes, null, 2));
    }

    expect(runRes.taskId).toBeDefined();

    const taskId = runRes.taskId;
    let status = null;
    let attempts = 0;
    while (attempts < 20) {
      status = await loader.executeToolCall(ctx, "ffmpeg_task_status", { taskId });
      if (status.status === "completed" || status.status === "failed") break;
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    if (status.status !== "completed") {
      console.error("Task Status:", JSON.stringify(status, null, 2));
    }

    expect(status.status).toBe("completed");
    expect(status.exitCode).toBe(0);
    expect(Array.isArray(status.logPaths)).toBe(true);
    expect(status.logPaths.length).toBeGreaterThan(0);

    const ws = await runtime.workspaceManager.getWorkspace("root");
    const resolvedPath = path.join(ws.rootPath, "output.txt");
    const content = await readFile(resolvedPath, "utf8");
    expect(content).toBe("hello");
  });

  it("ffmpeg_run failure should still return taskId and be queryable by ffmpeg_task_status", async () => {
    await runtime.workspaceManager.createWorkspace("root");
    const ctx = runtime._buildAgentContext({ id: "root" });
    ctx.currentMessage = { id: "m2", taskId: "t2" };

    const runRes = await loader.executeToolCall(ctx, "ffmpeg_run", { command: " " });
    expect(typeof runRes.taskId).toBe("string");
    expect(runRes.status).toBe("failed");
    expect(runRes.error).toBe("invalid_parameter");

    const status = await loader.executeToolCall(ctx, "ffmpeg_task_status", { taskId: runRes.taskId });
    expect(status.status).toBe("failed");
    expect(status.error).toBe("invalid_parameter");
  });

  it("ffmpeg_task_status should expose exitCode and stderrTail on process failure", async () => {
    await runtime.workspaceManager.createWorkspace("root");
    const ctx = runtime._buildAgentContext({ id: "root" });
    ctx.currentMessage = { id: "m3", taskId: "t3" };

    const runRes = await loader.executeToolCall(ctx, "ffmpeg_run", {
      command: `--fail output.txt`
    });
    expect(typeof runRes.taskId).toBe("string");

    let status;
    const start = Date.now();
    while (true) {
      status = await loader.executeToolCall(ctx, "ffmpeg_task_status", { taskId: runRes.taskId });
      if (status.status === "completed" || status.status === "failed") break;
      if (Date.now() - start > 10000) break;
      await new Promise(r => setTimeout(r, 200));
    }

    if (status.status !== "failed") {
      console.error("Failure Test Status:", JSON.stringify(status, null, 2));
    }

    expect(status.status).toBe("failed");
    expect(status.exitCode).toBe(1);
    expect(status.progress?.lastStderrLines?.some((l) => String(l).includes("intentional_fail"))).toBe(true);
  });
});
