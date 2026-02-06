/**
 * LocalFile 模块入口
 * 
 * 职责：
 * - 模块初始化和配置
 * - 工具定义导出
 * - 工具调用路由分发
 * - 模块生命周期管理
 * - 提供HTTP API和前端界面
 * 
 * 设计说明：
 * - 模块化设计，各组件职责清晰
 * - 完整的权限控制和审计日志
 * - Web界面用于配置管理
 */

import { ConfigManager } from "./config_manager.js";
import { PermissionManager } from "./permission_manager.js";
import { AccessLogger } from "./access_logger.js";
import { FileService } from "./file_service.js";
import { getToolDefinitions } from "./tools.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {any} 运行时实例 */
let runtime = null;

/** @type {any} 日志对象 */
let log = null;

/** @type {ConfigManager} */
let configManager = null;

/** @type {PermissionManager} */
let permissionManager = null;

/** @type {AccessLogger} */
let accessLogger = null;

/** @type {FileService} */
let fileService = null;

/**
 * 验证必需参数
 * @param {Object} args - 参数对象
 * @param {Array<string>} requiredParams - 必需参数列表
 * @returns {Object|null} 如果验证失败返回错误对象，否则返回null
 */
function validateParams(args, requiredParams) {
  for (const param of requiredParams) {
    if (args[param] === undefined || args[param] === null) {
      return {
        error: "missing_parameter",
        message: `缺少必需参数：${param}`
      };
    }
  }
  return null;
}

/**
 * LocalFile 模块导出
 */
export default {
  name: "localfile",
  
  // 工具组标识符
  toolGroupId: "localfile",
  
  // 工具组描述
  toolGroupDescription: "本地文件访问工具 - 提供受控的服务器本地文件系统访问能力，支持读写、目录浏览、工作区交互",

  /**
   * 获取Web组件信息
   * @returns {object}
   */
  getWebComponent() {
    return {
      moduleName: "localfile",
      displayName: "本地文件访问管理",
      icon: "📁",
      panelPath: "modules/localfile/web/panel.html"
    };
  },

  /**
   * 获取HTTP处理器
   * @returns {Function}
   */
  getHttpHandler() {
    return async (req, res, pathParts, body) => {
      const [resource, action, id] = pathParts;

      try {
        if (!configManager || !fileService) {
          return { error: "module_not_initialized", message: "LocalFile模块尚未初始化" };
        }

        // 文件夹管理
        if (resource === "folders") {
          // GET /folders - 获取所有文件夹
          if (req.method === "GET" && !action) {
            return { ok: true, folders: configManager.getFolders() };
          }
          
          // POST /folders - 添加文件夹
          if (req.method === "POST" && !action) {
            const validationError = validateParams(body, ["path"]);
            if (validationError) return validationError;
            return await configManager.addFolder(body);
          }
          
          // PUT /folders/:id - 更新文件夹
          if (req.method === "PUT" && action) {
            return await configManager.updateFolder(action, body);
          }
          
          // DELETE /folders/:id - 删除文件夹
          if (req.method === "DELETE" && action) {
            return await configManager.removeFolder(action);
          }
        }

        // 日志查询
        if (resource === "logs") {
          if (req.method === "GET" && !action) {
            const url = new URL(req.url, "http://localhost");
            const filters = {
              startTime: url.searchParams.get("startTime") || undefined,
              endTime: url.searchParams.get("endTime") || undefined,
              agentId: url.searchParams.get("agentId") || undefined,
              operation: url.searchParams.get("operation") || undefined,
              limit: parseInt(url.searchParams.get("limit") || "100", 10),
              offset: parseInt(url.searchParams.get("offset") || "0", 10)
            };
            return await accessLogger.queryLogs(filters);
          }
        }

        // 日志统计
        if (resource === "stats") {
          if (req.method === "GET" && !action) {
            const url = new URL(req.url, "http://localhost");
            const range = {
              startTime: url.searchParams.get("startTime") || undefined,
              endTime: url.searchParams.get("endTime") || undefined
            };
            return { ok: true, stats: await accessLogger.getStats(range) };
          }
        }

        // 设置
        if (resource === "settings") {
          if (req.method === "GET" && action === "retention") {
            return { ok: true, logRetentionDays: configManager.getLogRetentionDays() };
          }
          if (req.method === "PUT" && action === "retention") {
            return await configManager.setLogRetentionDays(body.days);
          }
        }

        // 测试路径权限
        if (resource === "check-path") {
          if (req.method === "POST") {
            const validationError = validateParams(body, ["path"]);
            if (validationError) return validationError;
            
            const permission = await permissionManager.getPermissionInfo(body.path);
            const exists = await permissionManager.pathExists(body.path);
            const isDirectory = exists ? await permissionManager.isDirectory(body.path) : false;
            
            return {
              ok: true,
              path: body.path,
              exists,
              isDirectory,
              canRead: permission.canRead,
              canWrite: permission.canWrite,
              folder: permission.folder
            };
          }
        }

        return { error: "not_found", message: "未知的资源路径" };
        
      } catch (error) {
        log?.error?.("[LocalFile] HTTP API 处理失败", {
          pathParts,
          error: error.message,
          stack: error.stack
        });
        return { error: "http_handler_failed", message: error.message };
      }
    };
  },

  /**
   * 初始化模块
   * @param {any} rt - 运行时实例
   * @param {object} config - 模块配置
   * @returns {Promise<void>}
   */
  async init(rt, config = {}) {
    runtime = rt;
    log = runtime?.log ?? console;
    
    log.info?.("[LocalFile] 模块初始化开始");

    // 确定配置文件路径
    const configDir = runtime?.config?.configDir ?? "config";
    const configPath = path.join(process.cwd(), configDir, "localfile.local.json");

    // 初始化配置管理器
    configManager = new ConfigManager({
      configPath,
      log
    });
    await configManager.init();

    // 初始化权限管理器
    permissionManager = new PermissionManager({
      configManager,
      log
    });

    // 初始化访问日志记录器
    const logDir = path.join(process.cwd(), "data", "localfile", "logs");
    accessLogger = new AccessLogger({
      logDir,
      configManager,
      log
    });
    await accessLogger.init();

    // 初始化文件服务
    fileService = new FileService({
      permissionManager,
      accessLogger,
      runtime,
      log
    });

    log.info?.("[LocalFile] 模块初始化完成", {
      folderCount: configManager.getFolders().length,
      logDir
    });
  },

  /**
   * 获取工具定义列表
   * @returns {Array<{type: string, function: object}>}
   */
  getToolDefinitions() {
    return getToolDefinitions();
  },

  /**
   * 执行工具调用
   * @param {any} ctx - 调用上下文
   * @param {string} toolName - 工具名称
   * @param {any} args - 工具参数
   * @returns {Promise<any>}
   */
  async executeToolCall(ctx, toolName, args) {
    try {
      log?.debug?.("[LocalFile] 执行工具调用", { toolName, args });

      switch (toolName) {
        // 读取文件
        case "localfile_read": {
          const validationError = validateParams(args, ["path"]);
          if (validationError) return validationError;
          return await fileService.readFile(ctx, args.path, {
            encoding: args.encoding
          });
        }

        // 写入文件
        case "localfile_write": {
          const validationError = validateParams(args, ["path", "content"]);
          if (validationError) return validationError;
          return await fileService.writeFile(ctx, args.path, args.content, {
            encoding: args.encoding
          });
        }

        // 列出目录
        case "localfile_list": {
          const validationError = validateParams(args, ["path"]);
          if (validationError) return validationError;
          return await fileService.listDirectory(ctx, args.path);
        }

        // 复制到工作区
        case "localfile_copy_to_workspace": {
          const validationError = validateParams(args, ["sourcePath", "destPath"]);
          if (validationError) return validationError;
          return await fileService.copyToWorkspace(ctx, args.sourcePath, args.destPath);
        }

        // 从工作区复制
        case "localfile_copy_from_workspace": {
          const validationError = validateParams(args, ["sourcePath", "destPath"]);
          if (validationError) return validationError;
          return await fileService.copyFromWorkspace(ctx, args.sourcePath, args.destPath);
        }

        // 检查权限
        case "localfile_check_permission": {
          const validationError = validateParams(args, ["path"]);
          if (validationError) return validationError;
          return await fileService.checkPermission(ctx, args.path);
        }

        // 列出授权文件夹
        case "localfile_list_authorized_folders": {
          return {
            ok: true,
            folders: fileService.getAuthorizedFolders()
          };
        }

        default:
          return {
            error: "unknown_tool",
            message: `未知的工具: ${toolName}`
          };
      }
    } catch (error) {
      log?.error?.("[LocalFile] 工具调用失败", {
        toolName,
        args,
        error: error.message,
        stack: error.stack
      });
      
      return {
        error: "execution_error",
        message: `工具执行失败: ${error.message}`
      };
    }
  },

  /**
   * 关闭模块并释放资源
   * @returns {Promise<void>}
   */
  async shutdown() {
    log?.info?.("[LocalFile] 模块开始关闭");

    try {
      // 清理资源
      if (accessLogger) {
        await accessLogger.cleanupOldLogs();
      }
    } catch (error) {
      log?.error?.("[LocalFile] 模块关闭时发生错误", {
        error: error.message,
        stack: error.stack
      });
    }

    // 清空模块实例引用
    configManager = null;
    permissionManager = null;
    accessLogger = null;
    fileService = null;
    runtime = null;
    
    log?.info?.("[LocalFile] 模块已关闭");
  }
};
