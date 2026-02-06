/**
 * SSH模块入口
 * 
 * 职责：
 * - 模块初始化和配置
 * - 工具定义导出
 * - 工具调用路由分发
 * - 模块生命周期管理
 * - 子模块实例管理
 * 
 * 设计说明：
 * - 参考chrome模块的系统集成方式
 * - 使用函数式导出而非类实例
 * - 统一错误处理和日志记录
 * - 参数验证在路由层完成
 */

// 导入子模块
import ConnectionManager from './connection_manager.js';
import ShellManager from './shell_manager.js';
import FileTransfer from './file_transfer.js';
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { getToolDefinitions } from './tools.js';

/** @type {any} 运行时实例 */
let runtime = null;

/** @type {any} 日志对象 */
let log = null;

/** @type {object} 模块配置 */
let moduleConfig = {};

/** @type {any} 连接管理器实例 */
let connectionManager = null;

/** @type {any} Shell会话管理器实例 */
let shellManager = null;

/** @type {any} 文件传输管理器实例 */
let fileTransfer = null;

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
        error: 'missing_parameter',
        message: `缺少必需参数：${param}`
      };
    }
  }
  return null;
}

/**
 * SSH模块导出
 */
export default {
  name: 'ssh',
  
  // 工具组标识符
  toolGroupId: 'ssh',
  
  // 工具组描述
  toolGroupDescription: 'SSH远程操作工具，提供SSH连接、Shell会话和文件传输能力',

  getWebComponent() {
    return {
      moduleName: 'ssh',
      displayName: 'SSH 连接与传输管理',
      icon: '🖧',
      panelPath: 'modules/ssh/web/panel.html'
    };
  },

  getHttpHandler() {
    return async (req, res, pathParts, body) => {
      const [resource, id, action] = pathParts;

      try {
        if (!connectionManager || !fileTransfer) {
          return { error: 'module_not_initialized', message: 'SSH模块尚未初始化' };
        }

        if (resource === 'overview') {
          const url = new URL(req.url, 'http://localhost');
          const showCompleted = url.searchParams.get('showCompleted') !== '0';

          const hostsResult = connectionManager.listHosts();
          if (hostsResult?.error) return hostsResult;

          const connectionsResult = connectionManager.listConnections();
          if (connectionsResult?.error) return connectionsResult;

          const transfersResult = fileTransfer.listTransfers({
            includeCompleted: showCompleted,
            includeFailed: showCompleted,
            includeCancelled: showCompleted
          });
          if (transfersResult?.error) return transfersResult;

          const hosts = hostsResult.hosts ?? [];
          const connections = connectionsResult.connections ?? [];
          const transfers = transfersResult.transfers ?? [];
          const activeTransfersCount = transfers.filter(t => t.status === 'pending' || t.status === 'transferring').length;

          return {
            ok: true,
            stats: {
              hostsCount: hosts.length,
              connectionsCount: connections.length,
              transfersCount: transfers.length,
              activeTransfersCount
            },
            hosts,
            connections,
            transfers
          };
        }

        if (resource === 'connections') {
          if (!id) {
            return connectionManager.listConnections();
          }
          if (!action) {
            const connectionsResult = connectionManager.listConnections();
            if (connectionsResult?.error) return connectionsResult;
            const connections = connectionsResult.connections ?? [];
            const found = connections.find(c => String(c.connectionId) === String(id));
            if (!found) {
              return { error: 'connection_not_found', message: `连接不存在：${id}` };
            }
            return { ok: true, connection: found };
          }
          if (action === 'disconnect') {
            return await connectionManager.disconnect(id);
          }
        }

        if (resource === 'transfers') {
          if (!id) {
            const url = new URL(req.url, 'http://localhost');
            const showCompleted = url.searchParams.get('showCompleted') !== '0';
            return fileTransfer.listTransfers({
              includeCompleted: showCompleted,
              includeFailed: showCompleted,
              includeCancelled: showCompleted
            });
          }
          if (!action) {
            return fileTransfer.getTransferStatus(id);
          }
          if (action === 'cancel') {
            return await fileTransfer.cancelTransfer(id);
          }
        }

        if (resource === 'hosts') {
          return connectionManager.listHosts();
        }

        return { error: 'not_found', message: '未知的资源路径' };
      } catch (error) {
        log?.error?.('[SSH] HTTP API 处理失败', {
          pathParts,
          error: error.message,
          stack: error.stack
        });
        return { error: 'http_handler_failed', message: error.message };
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
    moduleConfig = config;
    log = runtime?.log ?? console;
    
    log.info?.('[SSH] 模块初始化开始', { config: moduleConfig });

    // 初始化连接管理器
    connectionManager = new ConnectionManager(moduleConfig, log);
    
    // 初始化Shell会话管理器
    shellManager = new ShellManager(connectionManager, runtime, log);
    
    // 初始化文件传输管理器
    fileTransfer = new FileTransfer(connectionManager, runtime, log);

    log.info?.('[SSH] 模块初始化完成');
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
      log?.debug?.('[SSH] 执行工具调用', { toolName, args });

      // 参数验证和路由到具体的工具实现
      switch (toolName) {
        // 连接管理
        case 'ssh_list_hosts': {
          // 无需参数验证
          return connectionManager.listHosts();
        }
        
        case 'ssh_connect': {
          const validationError = validateParams(args, ['hostName']);
          if (validationError) return validationError;
          return await connectionManager.connect(args.hostName);
        }
        
        case 'ssh_disconnect': {
          const validationError = validateParams(args, ['connectionId']);
          if (validationError) return validationError;
          return await connectionManager.disconnect(args.connectionId);
        }
        
        case 'ssh_list_connections': {
          // 无需参数验证
          return connectionManager.listConnections();
        }

        // 交互式会话
        case 'ssh_shell_create': {
          const validationError = validateParams(args, ['hostName']);
          if (validationError) return validationError;
          return await shellManager.createShellByHost(args.hostName);
        }
        
        case 'ssh_shell_send': {
          const validationError = validateParams(args, ['shellId', 'command']);
          if (validationError) return validationError;
          return await shellManager.sendCommand(args.shellId, args.command);
        }
        
        case 'ssh_shell_read': {
          const validationError = validateParams(args, ['shellId', 'offset']);
          if (validationError) return validationError;
          return await shellManager.readOutput(args.shellId, args.offset);
        }
        
        case 'ssh_shell_close': {
          const validationError = validateParams(args, ['shellId']);
          if (validationError) return validationError;
          return await shellManager.closeShell(args.shellId);
        }

        // 文件传输
        case 'ssh_upload': {
          const validationError = validateParams(args, ['hostName', 'path', 'remotePath']);
          if (validationError) return validationError;
          log?.info?.('[SSH] 执行上传工具', { 
            hostName: args.hostName, 
            path: args.path, 
            remotePath: args.remotePath,
            agentId: ctx?.agent?.id 
          });
          const result = await fileTransfer.uploadByHost(args.hostName, args.path, args.remotePath, ctx);
          log?.info?.('[SSH] 上传工具执行完成', { 
            hostName: args.hostName,
            hasTaskId: !!result?.taskId,
            hasError: !!result?.error,
            error: result?.error 
          });
          return result;
        }
        
        case 'ssh_download': {
          const validationError = validateParams(args, ['hostName', 'remotePath', 'path']);
          if (validationError) return validationError;
          return await fileTransfer.downloadByHost(args.hostName, args.remotePath, args.path, ctx);
        }
        
        case 'ssh_transfer_status': {
          const validationError = validateParams(args, ['taskId']);
          if (validationError) return validationError;
          return fileTransfer.getTransferStatus(args.taskId);
        }
        
        case 'ssh_transfer_cancel': {
          const validationError = validateParams(args, ['taskId']);
          if (validationError) return validationError;
          return await fileTransfer.cancelTransfer(args.taskId);
        }

        default:
          return {
            error: 'unknown_tool',
            message: `未知的工具: ${toolName}`
          };
      }
    } catch (error) {
      // 记录完整的错误堆栈供开发人员调试
      log?.error?.('[SSH] 工具调用失败', {
        toolName,
        args,
        error: error.message,
        stack: error.stack
      });
      
      // 返回友好的错误信息给调用者
      return {
        error: 'execution_error',
        message: `工具执行失败: ${error.message}`
      };
    }
  },

  /**
   * 关闭模块并释放资源
   * @returns {Promise<void>}
   */
  async shutdown() {
    log?.info?.('[SSH] 模块开始关闭');

    try {
      // 按照依赖关系的逆序清理资源
      // 先清理文件传输任务
      if (fileTransfer) {
        await fileTransfer.cleanup();
      }
      
      // 再清理Shell会话
      if (shellManager) {
        await shellManager.cleanup();
      }
      
      // 最后关闭所有连接
      if (connectionManager) {
        await connectionManager.closeAll();
      }
    } catch (error) {
      log?.error?.('[SSH] 模块关闭时发生错误', {
        error: error.message,
        stack: error.stack
      });
    }

    // 清空模块实例引用
    connectionManager = null;
    shellManager = null;
    fileTransfer = null;
    runtime = null;
    
    log?.info?.('[SSH] 模块已关闭');
  }
};
