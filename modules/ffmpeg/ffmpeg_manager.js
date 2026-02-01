import { spawn } from "node:child_process";
import { createWriteStream, appendFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function tryLoadFfmpegStaticPath() {
  try {
    const mod = await import("ffmpeg-static");
    const candidate = mod?.default ?? mod;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    return null;
  } catch {
    return null;
  }
}

function pushBoundedLines(target, line, maxLines) {
  target.push(line);
  if (target.length > maxLines) {
    target.splice(0, target.length - maxLines);
  }
}

export class FfmpegManager {
  constructor(runtime, moduleConfig, log) {
    this.runtime = runtime;
    this.moduleConfig = moduleConfig ?? {};
    this.log = log ?? console;
    this.tasks = new Map();
    this.maxStderrLines = 200;
  }

  async run(ctx, input) {
    const taskId = randomUUID();
    const nowIso = new Date().toISOString();

    const task = {
      taskId,
      status: "pending",
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
      exitCode: null,
      error: null,
      pid: null,
      logPaths: [],
      stdoutLogPath: null,
      stderrLogPath: null,
      progress: {
        ratio: null,
        raw: {},
        lastStderrLines: []
      }
    };

    this.tasks.set(taskId, task);

    const fail = (error, message) => {
      task.status = "failed";
      task.error = error;
      task.completedAt = new Date().toISOString();
      if (message) {
        pushBoundedLines(task.progress.lastStderrLines, String(message), this.maxStderrLines);
      }
      return { taskId, status: task.status, error, message, logPaths: task.logPaths };
    };

    const ffmpegPath = await this._resolveFfmpegPath();
    if (!ffmpegPath) {
      return fail("ffmpeg_not_found", "未找到 ffmpeg 可执行文件");
    }

    const command = typeof input?.command === "string" ? input.command : "";
    if (!command.trim()) {
      return fail("invalid_parameter", "command 必须是非空字符串");
    }

    // 获取工作区
    const workspaceId = this.runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return fail("workspace_not_assigned", "当前智能体未分配工作空间");
    }
    const ws = await this.runtime.workspaceManager.getWorkspace(workspaceId);

    // 日志路径也放在工作区内
    const logDir = ".ffmpeg_logs";
    const stdoutLogPath = `${logDir}/${taskId}.stdout.log`;
    const stderrLogPath = `${logDir}/${taskId}.stderr.log`;
    
    const absStdoutLogPath = path.resolve(ws.rootPath, stdoutLogPath);
    const absStderrLogPath = path.resolve(ws.rootPath, stderrLogPath);

    await mkdir(path.dirname(absStdoutLogPath), { recursive: true });
    task.stdoutLogPath = stdoutLogPath;
    task.stderrLogPath = stderrLogPath;
    task.logPaths = [stdoutLogPath, stderrLogPath];

    const stdoutStream = createWriteStream(absStdoutLogPath);
    const stderrStream = createWriteStream(absStderrLogPath);

    task.status = "running";
    task.startedAt = new Date().toISOString();

    // 直接使用 shell 执行，这样就不需要解析参数和处理路径，ffmpeg 会在 cwd 下运行
    const fullCommand = `"${ffmpegPath}" ${command}`;
    
    // 在 stderr 日志中记录调试信息
    const debugInfo = `[FFmpeg Manager Debug]
- Task ID: ${taskId}
- CWD: ${ws.rootPath}
- Command: ${fullCommand}
- FFmpeg Path: ${ffmpegPath}
----------------------------------------\n`;
    appendFileSync(task.stderrLogPath, debugInfo);

    const child = spawn(fullCommand, {
      cwd: ws.rootPath,
      env: { ...process.env },
      windowsHide: true,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    task.pid = child.pid ?? null;

    child.stdout?.on("data", (chunk) => {
      try {
        stdoutStream.write(chunk);
      } catch {}
    });

    let stderrBuffer = "";
    child.stderr?.on("data", (chunk) => {
      try {
        stderrStream.write(chunk);
      } catch {}

      stderrBuffer += chunk.toString("utf8");
      const parts = stderrBuffer.split(/\r?\n/);
      stderrBuffer = parts.pop() ?? "";
      for (const line of parts) {
        this._handleStderrLine(task, line);
      }
    });

    const finalizeStreams = async () => {
      await Promise.allSettled([
        new Promise((resolve) => stdoutStream.end(resolve)),
        new Promise((resolve) => stderrStream.end(resolve))
      ]);
    };

    child.on("error", async (err) => {
      task.status = "failed";
      task.error = err?.message ?? String(err);
      pushBoundedLines(task.progress.lastStderrLines, `spawn_error: ${task.error}`, this.maxStderrLines);
      task.completedAt = new Date().toISOString();
      await finalizeStreams();
    });

    child.on("close", async (code) => {
      task.exitCode = typeof code === "number" ? code : null;
      task.completedAt = new Date().toISOString();
      task.status = code === 0 ? "completed" : "failed";
      if (code !== 0) {
        task.error = task.error || `ffmpeg_exit_${code}`;
        pushBoundedLines(task.progress.lastStderrLines, `exit_code: ${code}`, this.maxStderrLines);
      }
      await finalizeStreams();
    });

    return {
      taskId
    };
  }

  async getStatus(ctx, taskId) {
    const task = this.tasks.get(String(taskId));
    if (!task) return { error: "task_not_found", message: "任务不存在", taskId };

    const response = {
      taskId: task.taskId,
      status: task.status,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      pid: task.pid,
      exitCode: task.exitCode,
      error: task.error,
      progress: task.progress,
      logPaths: task.logPaths
    };

    if (task.status === "failed") {
      response.failure = {
        error: task.error,
        exitCode: task.exitCode,
        stderrTail: Array.isArray(task.progress?.lastStderrLines) ? task.progress.lastStderrLines : []
      };
    }

    return response;
  }

  listTasks() {
    const tasks = [];
    for (const task of this.tasks.values()) {
      tasks.push({
        taskId: task.taskId,
        status: task.status,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        exitCode: task.exitCode,
        error: task.error,
        logPaths: task.logPaths
      });
    }
    tasks.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { ok: true, tasks };
  }

  async _resolveFfmpegPath() {
    const configured = typeof this.moduleConfig.ffmpegPath === "string" ? this.moduleConfig.ffmpegPath.trim() : "";
    if (configured) return configured;

    const staticPath = await tryLoadFfmpegStaticPath();
    if (staticPath) return staticPath;

    return "ffmpeg";
  }

  _handleStderrLine(task, line) {
    const text = String(line ?? "").trimEnd();
    if (!text) return;

    pushBoundedLines(task.progress.lastStderrLines, text, this.maxStderrLines);

    const timeMatch = /time=\s*([0-9:.]+)/.exec(text);
    if (timeMatch?.[1]) {
      task.progress.raw.time = timeMatch[1];
    }

    const frameMatch = /frame=\s*([0-9]+)/.exec(text);
    if (frameMatch?.[1]) {
      task.progress.raw.frame = Number(frameMatch[1]);
    }

    const fpsMatch = /fps=\s*([0-9.]+)/.exec(text);
    if (fpsMatch?.[1]) {
      task.progress.raw.fps = Number(fpsMatch[1]);
    }
  }
}
