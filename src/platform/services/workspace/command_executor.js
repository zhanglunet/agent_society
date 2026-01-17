import { spawn } from "node:child_process";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";

/**
 * 命令执行器
 * 在工作空间内安全执行终端命令
 */
export class CommandExecutor {
  /**
   * @param {{logger?: {trace:(m:string,d?:any)=>Promise<void>, debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}, defaultTimeoutMs?: number}} options
   */
  constructor(options = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60000;
    this.log = options.logger ?? createNoopModuleLogger();
    this._blockedCommands = [
      "rm -rf /",
      "rm -rf /*",
      "sudo",
      "su ",
      "chmod 777",
      "mkfs",
      "dd if=",
      "> /dev/",
      "shutdown",
      "reboot",
      "init 0",
      "init 6",
      ":(){ :|:& };:",  // fork bomb
      "format c:",
      "del /f /s /q c:",
    ];
  }

  /**
   * 检查命令是否被禁止
   * @param {string} command
   * @returns {{blocked: boolean, reason?: string}}
   */
  _checkCommandSafety(command) {
    if (!command || typeof command !== "string") {
      return { blocked: true, reason: "invalid_command" };
    }

    // 规范化命令：转小写，压缩多个空格为单个空格
    const normalizedCommand = command.toLowerCase().trim().replace(/\s+/g, " ");
    
    for (const blocked of this._blockedCommands) {
      const normalizedBlocked = blocked.toLowerCase().replace(/\s+/g, " ");
      if (normalizedCommand.includes(normalizedBlocked)) {
        return { blocked: true, reason: `危险命令被禁止: ${blocked}` };
      }
    }

    return { blocked: false };
  }

  /**
   * 执行命令
   * @param {string} workspacePath - 工作目录
   * @param {string} command - 要执行的命令
   * @param {{timeoutMs?: number}} options
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}|{error: string, timedOut?: boolean, timeoutMs?: number}>}
   */
  async execute(workspacePath, command, options = {}) {
    // 检查命令安全性
    const safetyCheck = this._checkCommandSafety(command);
    if (safetyCheck.blocked) {
      void this.log.warn("危险命令被拦截", { command, reason: safetyCheck.reason });
      return { error: "command_blocked", reason: safetyCheck.reason };
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const startTime = Date.now();

    void this.log.info("开始执行命令", { workspacePath, command, timeoutMs });

    return new Promise((resolve) => {
      // 根据平台选择 shell
      const isWindows = process.platform === "win32";
      const shell = isWindows ? "cmd.exe" : "/bin/sh";
      const shellArgs = isWindows ? ["/c", command] : ["-c", command];

      const child = spawn(shell, shellArgs, {
        cwd: workspacePath,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        // Windows 需要 detached: false 和 windowsHide: true 来正确终止进程树
        detached: false,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let killed = false;
      let timeoutId = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const safeResolve = (result) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      // 设置超时
      timeoutId = setTimeout(() => {
        killed = true;
        void this.log.warn("命令执行超时", { command, timeoutMs });
        
        // 在 Windows 上使用 taskkill 强制终止进程树
        if (isWindows && child.pid) {
          spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else {
          // Unix 系统使用 SIGKILL
          child.kill("SIGKILL");
        }
        
        // 给进程一点时间来终止，然后强制返回
        setTimeout(() => {
          safeResolve({ 
            error: "command_timeout", 
            timedOut: true, 
            timeoutMs 
          });
        }, 100);
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
        void this.log.error("命令执行错误", { command, error: message });
        safeResolve({ error: `command_failed: ${message}` });
      });

      child.on("close", (code) => {
        const duration = Date.now() - startTime;

        if (killed) {
          safeResolve({ 
            error: "command_timeout", 
            timedOut: true, 
            timeoutMs 
          });
          return;
        }

        const exitCode = code ?? 0;
        void this.log.info("命令执行完成", { 
          command, 
          exitCode, 
          duration,
          stdoutLength: stdout.length,
          stderrLength: stderr.length
        });

        safeResolve({ stdout, stderr, exitCode });
      });
    });
  }
}
