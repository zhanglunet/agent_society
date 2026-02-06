/**
 * 访问日志记录器
 * 
 * 职责：
 * - 记录所有文件访问操作
 * - 支持按时间查询日志
 * - 自动清理过期日志
 * - 提供日志统计分析
 */

import { readFile, writeFile, access, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * 访问日志记录器类
 */
export class AccessLogger {
  /**
   * @param {{logDir?: string, configManager?: object, log?: any}} options
   */
  constructor(options = {}) {
    this.logDir = options.logDir ?? "data/localfile/logs";
    this.configManager = options.configManager;
    this._logger = options.log ?? console;
    
    /** @type {Array<object>} 内存中的最近日志 */
    this.recentLogs = [];
    
    /** @type {number} 内存中保留的最大日志数 */
    this.maxRecentLogs = 1000;
    
    /** @type {boolean} */
    this._initialized = false;
  }

  /**
   * 初始化日志记录器
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;
    
    // 确保日志目录存在
    try {
      await access(this.logDir);
    } catch {
      await mkdir(this.logDir, { recursive: true });
    }
    
    this._initialized = true;
    
    this._logger.info?.("[LocalFile] 访问日志记录器初始化完成", { 
      logDir: this.logDir 
    });
    
    // 启动时清理过期日志
    await this.cleanupOldLogs();
  }

  /**
   * 记录文件访问
   * @param {{
   *   agentId: string,
   *   agentName: string,
   *   operation: 'read' | 'write' | 'list' | 'copy_to_workspace' | 'copy_from_workspace' | 'check_permission',
   *   path: string,
   *   success: boolean,
   *   error?: string,
   *   details?: object
   * }} entry
   * @returns {Promise<void>}
   */
  async log(entry) {
    try {
      const logEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        agentId: entry.agentId ?? "unknown",
        agentName: entry.agentName ?? "unknown",
        operation: entry.operation,
        path: entry.path,
        success: Boolean(entry.success),
        error: entry.error ?? null,
        details: entry.details ?? {}
      };

      // 添加到内存
      this.recentLogs.unshift(logEntry);
      if (this.recentLogs.length > this.maxRecentLogs) {
        this.recentLogs.pop();
      }

      // 写入文件
      await this._appendToLogFile(logEntry);

    } catch (error) {
      this._logger.error?.("[LocalFile] 记录访问日志失败", { 
        error: error.message,
        entry 
      });
    }
  }

  /**
   * 记录读取操作
   * @param {object} ctx - 智能体上下文
   * @param {string} filePath
   * @param {boolean} success
   * @param {string} [error]
   */
  async logRead(ctx, filePath, success, error = null) {
    await this.log({
      agentId: ctx?.agent?.id ?? "unknown",
      agentName: ctx?.agent?.roleName ?? ctx?.agent?.id ?? "unknown",
      operation: "read",
      path: filePath,
      success,
      error
    });
  }

  /**
   * 记录写入操作
   * @param {object} ctx - 智能体上下文
   * @param {string} filePath
   * @param {boolean} success
   * @param {string} [error]
   * @param {object} [details]
   */
  async logWrite(ctx, filePath, success, error = null, details = {}) {
    await this.log({
      agentId: ctx?.agent?.id ?? "unknown",
      agentName: ctx?.agent?.roleName ?? ctx?.agent?.id ?? "unknown",
      operation: "write",
      path: filePath,
      success,
      error,
      details
    });
  }

  /**
   * 记录列目录操作
   * @param {object} ctx - 智能体上下文
   * @param {string} dirPath
   * @param {boolean} success
   * @param {string} [error]
   */
  async logList(ctx, dirPath, success, error = null) {
    await this.log({
      agentId: ctx?.agent?.id ?? "unknown",
      agentName: ctx?.agent?.roleName ?? ctx?.agent?.id ?? "unknown",
      operation: "list",
      path: dirPath,
      success,
      error
    });
  }

  /**
   * 记录复制到工作区操作
   * @param {object} ctx - 智能体上下文
   * @param {string} sourcePath
   * @param {string} destPath
   * @param {boolean} success
   * @param {string} [error]
   */
  async logCopyToWorkspace(ctx, sourcePath, destPath, success, error = null) {
    await this.log({
      agentId: ctx?.agent?.id ?? "unknown",
      agentName: ctx?.agent?.roleName ?? ctx?.agent?.id ?? "unknown",
      operation: "copy_to_workspace",
      path: sourcePath,
      success,
      error,
      details: { destination: destPath }
    });
  }

  /**
   * 记录从工作区复制操作
   * @param {object} ctx - 智能体上下文
   * @param {string} sourcePath
   * @param {string} destPath
   * @param {boolean} success
   * @param {string} [error]
   */
  async logCopyFromWorkspace(ctx, sourcePath, destPath, success, error = null) {
    await this.log({
      agentId: ctx?.agent?.id ?? "unknown",
      agentName: ctx?.agent?.roleName ?? ctx?.agent?.id ?? "unknown",
      operation: "copy_from_workspace",
      path: destPath,
      success,
      error,
      details: { source: sourcePath }
    });
  }

  /**
   * 记录权限检查操作
   * @param {object} ctx - 智能体上下文
   * @param {string} filePath
   * @param {boolean} canRead
   * @param {boolean} canWrite
   */
  async logCheckPermission(ctx, filePath, canRead, canWrite) {
    await this.log({
      agentId: ctx?.agent?.id ?? "unknown",
      agentName: ctx?.agent?.roleName ?? ctx?.agent?.id ?? "unknown",
      operation: "check_permission",
      path: filePath,
      success: true,
      details: { canRead, canWrite }
    });
  }

  /**
   * 追加到日志文件
   * @private
   * @param {object} entry
   */
  async _appendToLogFile(entry) {
    const date = new Date();
    const filename = `access-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.log`;
    const filepath = path.join(this.logDir, filename);

    const line = JSON.stringify(entry) + "\n";
    await appendFile(filepath, line, "utf8");
  }

  /**
   * 查询日志
   * @param {{
   *   startTime?: string,
   *   endTime?: string,
   *   agentId?: string,
   *   operation?: string,
   *   limit?: number,
   *   offset?: number
   * }} filters
   * @returns {Promise<{logs: Array<object>, total: number}>}
   */
  async queryLogs(filters = {}) {
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    
    // 先从内存中加载最近的日志
    let allLogs = [...this.recentLogs];
    
    // 然后从文件加载更多（如果需要）
    if (allLogs.length < limit + offset) {
      const fileLogs = await this._loadLogsFromFiles(filters);
      // 合并并去重（基于ID）
      const seenIds = new Set(allLogs.map(l => l.id));
      for (const log of fileLogs) {
        if (!seenIds.has(log.id)) {
          allLogs.push(log);
          seenIds.add(log.id);
        }
      }
      // 按时间排序（最新的在前）
      allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    // 应用过滤器
    let filtered = allLogs;
    
    if (filters.startTime) {
      const start = new Date(filters.startTime);
      filtered = filtered.filter(l => new Date(l.timestamp) >= start);
    }
    
    if (filters.endTime) {
      const end = new Date(filters.endTime);
      filtered = filtered.filter(l => new Date(l.timestamp) <= end);
    }
    
    if (filters.agentId) {
      filtered = filtered.filter(l => l.agentId === filters.agentId);
    }
    
    if (filters.operation) {
      filtered = filtered.filter(l => l.operation === filters.operation);
    }
    
    const total = filtered.length;
    const logs = filtered.slice(offset, offset + limit);
    
    return { logs, total };
  }

  /**
   * 从日志文件加载日志
   * @private
   * @param {{startTime?: string, endTime?: string}} filters
   * @returns {Promise<Array<object>>}
   */
  async _loadLogsFromFiles(filters) {
    const logs = [];
    
    try {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(this.logDir);
      
      // 只处理 .log 文件
      const logFiles = files.filter(f => f.endsWith(".log"));
      
      // 根据时间过滤器确定需要读取的文件
      const startDate = filters.startTime ? new Date(filters.startTime) : null;
      const endDate = filters.endTime ? new Date(filters.endTime) : null;
      
      for (const filename of logFiles) {
        // 解析文件名中的日期
        const match = filename.match(/access-(\d{4})-(\d{2})-(\d{2})\.log/);
        if (!match) continue;
        
        const fileDate = new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3])
        );
        
        // 如果文件日期在范围外，跳过
        if (startDate && fileDate < new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) {
          continue;
        }
        if (endDate && fileDate > new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())) {
          continue;
        }
        
        // 读取文件
        const filepath = path.join(this.logDir, filename);
        try {
          const content = await readFile(filepath, "utf8");
          const lines = content.trim().split("\n").filter(Boolean);
          
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              logs.push(entry);
            } catch {
              // 忽略解析失败的行
            }
          }
        } catch (error) {
          this._logger.error?.("[LocalFile] 读取日志文件失败", { 
            file: filename, 
            error: error.message 
          });
        }
      }
      
    } catch (error) {
      this._logger.error?.("[LocalFile] 加载日志文件失败", { error: error.message });
    }
    
    return logs;
  }

  /**
   * 清理过期日志
   * @returns {Promise<{deleted: number}>}
   */
  async cleanupOldLogs() {
    const retentionDays = this.configManager?.getLogRetentionDays() ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    let deleted = 0;
    
    try {
      const { readdir, unlink } = await import("node:fs/promises");
      const files = await readdir(this.logDir);
      const logFiles = files.filter(f => f.endsWith(".log"));
      
      for (const filename of logFiles) {
        const match = filename.match(/access-(\d{4})-(\d{2})-(\d{2})\.log/);
        if (!match) continue;
        
        const fileDate = new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3])
        );
        
        if (fileDate < cutoffDate) {
          const filepath = path.join(this.logDir, filename);
          await unlink(filepath);
          deleted++;
        }
      }
      
      this._logger.info?.("[LocalFile] 清理过期日志完成", { 
        deleted, 
        retentionDays 
      });
      
    } catch (error) {
      this._logger.error?.("[LocalFile] 清理过期日志失败", { error: error.message });
    }
    
    return { deleted };
  }

  /**
   * 获取访问统计
   * @param {{startTime?: string, endTime?: string}} range
   * @returns {Promise<object>}
   */
  async getStats(range = {}) {
    const { logs } = await this.queryLogs({ 
      startTime: range.startTime, 
      endTime: range.endTime,
      limit: 10000 
    });
    
    const stats = {
      total: logs.length,
      byOperation: {},
      byAgent: {},
      success: 0,
      failed: 0
    };
    
    for (const log of logs) {
      // 按操作统计
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
      
      // 按智能体统计
      stats.byAgent[log.agentName] = (stats.byAgent[log.agentName] || 0) + 1;
      
      // 成功/失败统计
      if (log.success) {
        stats.success++;
      } else {
        stats.failed++;
      }
    }
    
    return stats;
  }
}

export default AccessLogger;
