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

      // GET /api/modules/ffmpeg/panel - 返回管理面板 HTML
      if (resource === "panel" && req.method === "GET") {
        return await this._servePanel(res);
      }

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

  /**
   * 提供管理面板 HTML
   */
  async _servePanel(res) {
    try {
      const panelDir = path.join(__dirname, "web");
      const htmlPath = path.join(panelDir, "panel.html");
      const cssPath = path.join(panelDir, "panel.css");
      const jsPath = path.join(panelDir, "panel.js");

      let html = "", css = "", js = "";

      if (existsSync(htmlPath)) {
        html = await readFile(htmlPath, "utf8");
      }
      if (existsSync(cssPath)) {
        css = await readFile(cssPath, "utf8");
      }
      if (existsSync(jsPath)) {
        js = await readFile(jsPath, "utf8");
      }

      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FFmpeg 任务管理</title>
  <style>${css}</style>
</head>
<body>
  ${html}
  <script>${js}</script>
</body>
</html>`;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fullHtml);
      return { handled: true };
    } catch (err) {
      log?.error?.("读取面板文件失败", { error: err.message });
      return { error: "read_panel_failed", message: err.message };
    }
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
