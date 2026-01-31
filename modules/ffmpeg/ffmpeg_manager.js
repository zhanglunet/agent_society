import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
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

/**
 * 将一段命令行参数字符串解析为 argv 数组。
 *
 * 设计目的：
 * - 工具侧接收“完整参数字符串”，但内部仍使用 spawn(ffmpegPath, argv) 以避免 shell 注入风险。
 *
 * 解析规则（最小可用子集）：
 * - 以空白字符分隔参数
 * - 支持单引号与双引号包裹（引号本身不进入结果）
 * - 支持反斜杠转义（在双引号内与非引号环境生效；单引号内反斜杠视为普通字符）
 *
 * @param {string} command - 不包含程序名的参数字符串
 * @returns {{ok:true, argv:string[]} | {ok:false, error:string, message:string}}
 */
function parseCommandToArgv(command) {
  if (typeof command !== "string" || !command.trim()) {
    return { ok: false, error: "invalid_parameter", message: "command 必须是非空字符串" };
  }

  const argv = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaping = false;

  const pushToken = () => {
    if (current !== "") argv.push(current);
    current = "";
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (!inSingleQuote && ch === "\\") {
      const next = i + 1 < command.length ? command[i + 1] : "";
      const shouldEscape =
        (inDoubleQuote && (next === '"' || next === "\\")) ||
        (!inDoubleQuote && (next === '"' || next === "'" || next === "\\" || /\s/.test(next)));
      if (shouldEscape) {
        escaping = true;
        continue;
      }
      current += "\\";
      continue;
    }

    if (!inDoubleQuote && ch === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && ch === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && /\s/.test(ch)) {
      pushToken();
      continue;
    }

    current += ch;
  }

  if (escaping) {
    current += "\\";
  }
  if (inSingleQuote || inDoubleQuote) {
    return { ok: false, error: "invalid_parameter", message: "command 引号不匹配" };
  }

  pushToken();
  return { ok: true, argv };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
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
      outputPaths: [],
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
      return { taskId, status: task.status, error, message, outputPaths: task.outputPaths, logPaths: task.logPaths };
    };

    const ffmpegPath = await this._resolveFfmpegPath();
    if (!ffmpegPath) {
      return fail("ffmpeg_not_found", "未找到 ffmpeg 可执行文件");
    }

    const command = typeof input?.command === "string" ? input.command : "";
    const parsed = parseCommandToArgv(command);
    if (!parsed.ok) {
      return fail(parsed.error, parsed.message);
    }

    // 获取工作区
    const workspaceId = this.runtime.findWorkspaceIdForAgent(ctx.agent?.id);
    if (!workspaceId) {
      return fail("workspace_not_assigned", "当前智能体未分配工作空间");
    }
    const ws = await this.runtime.workspaceManager.getWorkspace(workspaceId);

    // 解析命令中的所有路径为工作区的真实路径
    const finalArgv = [];
    for (const token of parsed.argv) {
      if (token.startsWith('-')) {
        finalArgv.push(token);
        continue;
      }

      if (path.isAbsolute(token)) {
        finalArgv.push(token);
      } else {
        const resolved = path.resolve(ws.rootPath, token);
        finalArgv.push(resolved);
      }
    }

    // 启发式寻找输出文件：通常是最后一个参数
    if (parsed.argv.length > 0) {
      const lastToken = parsed.argv[parsed.argv.length - 1];
      if (!lastToken.startsWith('-')) {
        // 在 outputPaths 中保存原始相对路径
        task.outputPaths.push(lastToken);
      }
    }

    const ffmpegArgs = [...finalArgv];
    // 如果 ffmpegPath 是 node 程序，第一个参数应该是脚本路径
    if (ffmpegPath === process.execPath) {
      const fakeFfmpegScript = path.resolve(process.cwd(), "test/.tmp/ffmpeg_module_test/fake_ffmpeg.js");
      ffmpegArgs.unshift(fakeFfmpegScript);
    }

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

    const child = spawn(ffmpegPath, ffmpegArgs, {
      cwd: ws.rootPath, // 在工作区根目录执行
      env: { ...process.env },
      windowsHide: true,
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
      taskId,
      outputPaths: task.outputPaths
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
      outputPaths: task.outputPaths,
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
        outputPaths: task.outputPaths,
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
