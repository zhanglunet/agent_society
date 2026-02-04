import { getToolDefinitions } from "./tools.js";
import { FfmpegManager } from "./ffmpeg_manager.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let runtime = null;
let log = null;
let moduleConfig = {};
let ffmpegManager = null;

function validateObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export default {
  name: "ffmpeg",
  toolGroupId: "ffmpeg",
  toolGroupDescription: "FFmpeg 工具：执行音视频处理命令，并以任务方式查询进度与结果工件",

  getWebComponent() {
    return {
      moduleName: "ffmpeg",
      displayName: "FFmpeg 任务管理",
      icon: "🎞️",
      panelPath: "modules/ffmpeg/web/panel.html"
    };
  },

  getHttpHandler() {
    return async (req, res, pathParts, body) => {
      const [resource, id] = pathParts;
      if (!ffmpegManager) return { error: "module_not_initialized", message: "FFmpeg 模块尚未初始化" };

      const rootAgent = runtime?._agents?.get?.("root") ?? null;
      const ctx = runtime?._buildAgentContext?.(rootAgent);
      if (!ctx) return { error: "runtime_not_ready", message: "运行时尚未就绪" };
      ctx.currentMessage = null;

      if (resource === "overview" && req.method === "GET") {
        return ffmpegManager.listTasks();
      }

      if (resource === "tasks" && req.method === "POST") {
        if (!validateObject(body)) return { error: "invalid_body", message: "请求体必须是对象" };
        return await ffmpegManager.run(ctx, body);
      }

      if (resource === "tasks" && id && req.method === "GET") {
        return await ffmpegManager.getStatus(ctx, id);
      }

      return { error: "not_found", message: "未知接口" };
    };
  },

  async init(rt, config = {}) {
    runtime = rt;
    moduleConfig = config ?? {};
    log = runtime?.log ?? console;
    ffmpegManager = new FfmpegManager(runtime, moduleConfig, log);
  },

  getToolDefinitions() {
    return getToolDefinitions();
  },

  async executeToolCall(ctx, toolName, args) {
    if (!ffmpegManager) return { error: "module_not_initialized", message: "FFmpeg 模块尚未初始化" };
    const safeArgs = validateObject(args) ? args : {};

    switch (toolName) {
      case "ffmpeg_run": {
        return await ffmpegManager.run(ctx, safeArgs);
      }
      case "ffmpeg_task_status": {
        const taskId = typeof safeArgs.taskId === "string" ? safeArgs.taskId : "";
        if (!taskId) return { error: "missing_parameter", message: "缺少必需参数：taskId" };
        return await ffmpegManager.getStatus(ctx, taskId);
      }
      default:
        return { error: "unknown_tool", message: `未知工具: ${toolName}` };
    }
  },

  async shutdown() {
    ffmpegManager = null;
  }
};
