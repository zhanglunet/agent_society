/**
 * 文件服务
 * 
 * 职责：
 * - 执行实际的文件操作（读、写、列目录）
 * - 与工作区交互（复制文件）
 * - 错误处理和结果格式化
 * - 调用日志记录器记录操作
 */

import { readFile, writeFile, readdir, mkdir, copyFile, access, constants } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 文件服务类
 */
export class FileService {
  /**
   * @param {{permissionManager: PermissionManager, accessLogger: AccessLogger, runtime?: any, log?: any}} options
   */
  constructor(options) {
    this.permissionManager = options.permissionManager;
    this.accessLogger = options.accessLogger;
    this.runtime = options.runtime;
    this.log = options.log ?? console;
  }

  /**
   * 读取文件
   * @param {object} ctx - 智能体上下文
   * @param {string} filePath - 文件路径
   * @param {object} options - 读取选项
   * @returns {Promise<{ok: boolean, content?: string, error?: string}>}
   */
  async readFile(ctx, filePath, options = {}) {
    try {
      // 检查权限
      const permission = await this.permissionManager.checkReadPermission(filePath);
      if (!permission.allowed) {
        await this.accessLogger.logRead(ctx, filePath, false, "access_denied");
        return { ok: false, error: "access_denied", message: "没有权限读取此文件" };
      }

      // 检查路径是否存在
      if (!existsSync(filePath)) {
        await this.accessLogger.logRead(ctx, filePath, false, "file_not_found");
        return { ok: false, error: "file_not_found", message: "文件不存在" };
      }

      // 检查是否是目录
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        await this.accessLogger.logRead(ctx, filePath, false, "is_directory");
        return { ok: false, error: "is_directory", message: "路径是目录，不是文件" };
      }

      // 读取文件
      const encoding = options.encoding ?? "utf8";
      const content = await readFile(filePath, encoding);
      
      await this.accessLogger.logRead(ctx, filePath, true);
      
      return { 
        ok: true, 
        content,
        path: filePath,
        size: stats.size
      };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 读取文件失败", { 
        path: filePath, 
        error: error.message 
      });
      await this.accessLogger.logRead(ctx, filePath, false, error.message);
      return { ok: false, error: "read_failed", message: error.message };
    }
  }

  /**
   * 写入文件
   * @param {object} ctx - 智能体上下文
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @param {object} options - 写入选项
   * @returns {Promise<{ok: boolean, path?: string, error?: string}>}
   */
  async writeFile(ctx, filePath, content, options = {}) {
    try {
      // 检查权限
      const permission = await this.permissionManager.checkWritePermission(filePath);
      if (!permission.allowed) {
        await this.accessLogger.logWrite(ctx, filePath, false, "access_denied");
        return { ok: false, error: "access_denied", message: "没有权限写入此文件" };
      }

      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!existsSync(dir)) {
        // 检查是否有权限创建目录
        const dirPermission = await this.permissionManager.checkWritePermission(dir);
        if (!dirPermission.allowed) {
          await this.accessLogger.logWrite(ctx, filePath, false, "cannot_create_dir");
          return { ok: false, error: "cannot_create_dir", message: "无法创建目录，超出授权范围" };
        }
        await mkdir(dir, { recursive: true });
      }

      // 写入文件
      const encoding = options.encoding ?? "utf8";
      await writeFile(filePath, content, encoding);
      
      const isNew = !existsSync(filePath);
      await this.accessLogger.logWrite(ctx, filePath, true, null, { 
        isNew,
        size: Buffer.byteLength(content, encoding)
      });
      
      return { 
        ok: true, 
        path: filePath,
        isNew
      };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 写入文件失败", { 
        path: filePath, 
        error: error.message 
      });
      await this.accessLogger.logWrite(ctx, filePath, false, error.message);
      return { ok: false, error: "write_failed", message: error.message };
    }
  }

  /**
   * 列出目录内容
   * @param {object} ctx - 智能体上下文
   * @param {string} dirPath - 目录路径
   * @returns {Promise<{ok: boolean, entries?: Array<object>, error?: string}>}
   */
  async listDirectory(ctx, dirPath) {
    try {
      // 检查权限
      const permission = await this.permissionManager.checkListPermission(dirPath);
      if (!permission.allowed) {
        await this.accessLogger.logList(ctx, dirPath, false, "access_denied");
        return { ok: false, error: "access_denied", message: "没有权限访问此目录" };
      }

      // 检查路径是否存在
      if (!existsSync(dirPath)) {
        await this.accessLogger.logList(ctx, dirPath, false, "directory_not_found");
        return { ok: false, error: "directory_not_found", message: "目录不存在" };
      }

      // 检查是否是文件
      const stats = statSync(dirPath);
      if (!stats.isDirectory()) {
        await this.accessLogger.logList(ctx, dirPath, false, "is_file");
        return { ok: false, error: "is_file", message: "路径是文件，不是目录" };
      }

      // 读取目录
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      const formattedEntries = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        path: path.join(dirPath, entry.name)
      }));

      await this.accessLogger.logList(ctx, dirPath, true);
      
      return { 
        ok: true, 
        entries: formattedEntries,
        path: dirPath
      };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 列出目录失败", { 
        path: dirPath, 
        error: error.message 
      });
      await this.accessLogger.logList(ctx, dirPath, false, error.message);
      return { ok: false, error: "list_failed", message: error.message };
    }
  }

  /**
   * 复制文件到工作区
   * @param {object} ctx - 智能体上下文
   * @param {string} sourcePath - 源文件路径（本地文件系统）
   * @param {string} destRelativePath - 目标相对路径（工作区内）
   * @returns {Promise<{ok: boolean, path?: string, error?: string}>}
   */
  async copyToWorkspace(ctx, sourcePath, destRelativePath) {
    try {
      // 检查源文件读取权限
      const permission = await this.permissionManager.checkReadPermission(sourcePath);
      if (!permission.allowed) {
        await this.accessLogger.logCopyToWorkspace(ctx, sourcePath, destRelativePath, false, "access_denied");
        return { ok: false, error: "access_denied", message: "没有权限读取源文件" };
      }

      // 检查源文件是否存在
      if (!existsSync(sourcePath)) {
        await this.accessLogger.logCopyToWorkspace(ctx, sourcePath, destRelativePath, false, "source_not_found");
        return { ok: false, error: "source_not_found", message: "源文件不存在" };
      }

      // 获取工作区路径
      const workspacePath = await this._getWorkspacePath(ctx);
      if (!workspacePath) {
        await this.accessLogger.logCopyToWorkspace(ctx, sourcePath, destRelativePath, false, "no_workspace");
        return { ok: false, error: "no_workspace", message: "无法获取工作区路径" };
      }

      // 构建目标路径
      const destPath = path.join(workspacePath, destRelativePath);
      
      // 确保目标目录存在
      const destDir = path.dirname(destPath);
      if (!existsSync(destDir)) {
        await mkdir(destDir, { recursive: true });
      }

      // 执行复制
      await copyFile(sourcePath, destPath);
      
      await this.accessLogger.logCopyToWorkspace(ctx, sourcePath, destPath, true);
      
      return { 
        ok: true, 
        sourcePath,
        destPath
      };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 复制到工作区失败", { 
        sourcePath, 
        destRelativePath, 
        error: error.message 
      });
      await this.accessLogger.logCopyToWorkspace(ctx, sourcePath, destRelativePath, false, error.message);
      return { ok: false, error: "copy_failed", message: error.message };
    }
  }

  /**
   * 从工作区复制文件出来
   * @param {object} ctx - 智能体上下文
   * @param {string} sourceRelativePath - 源相对路径（工作区内）
   * @param {string} destPath - 目标路径（本地文件系统）
   * @returns {Promise<{ok: boolean, path?: string, error?: string}>}
   */
  async copyFromWorkspace(ctx, sourceRelativePath, destPath) {
    try {
      // 检查目标写入权限
      const permission = await this.permissionManager.checkWritePermission(destPath);
      if (!permission.allowed) {
        await this.accessLogger.logCopyFromWorkspace(ctx, sourceRelativePath, destPath, false, "access_denied");
        return { ok: false, error: "access_denied", message: "没有权限写入目标位置" };
      }

      // 获取工作区路径
      const workspacePath = await this._getWorkspacePath(ctx);
      if (!workspacePath) {
        await this.accessLogger.logCopyFromWorkspace(ctx, sourceRelativePath, destPath, false, "no_workspace");
        return { ok: false, error: "no_workspace", message: "无法获取工作区路径" };
      }

      // 构建源路径
      const sourcePath = path.join(workspacePath, sourceRelativePath);
      
      // 检查源文件是否存在
      if (!existsSync(sourcePath)) {
        await this.accessLogger.logCopyFromWorkspace(ctx, sourceRelativePath, destPath, false, "source_not_found");
        return { ok: false, error: "source_not_found", message: "工作区中源文件不存在" };
      }

      // 确保目标目录存在
      const destDir = path.dirname(destPath);
      if (!existsSync(destDir)) {
        await mkdir(destDir, { recursive: true });
      }

      // 执行复制
      await copyFile(sourcePath, destPath);
      
      await this.accessLogger.logCopyFromWorkspace(ctx, sourcePath, destPath, true);
      
      return { 
        ok: true, 
        sourcePath,
        destPath
      };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 从工作区复制失败", { 
        sourceRelativePath, 
        destPath, 
        error: error.message 
      });
      await this.accessLogger.logCopyFromWorkspace(ctx, sourceRelativePath, destPath, false, error.message);
      return { ok: false, error: "copy_failed", message: error.message };
    }
  }

  /**
   * 检查文件权限
   * @param {object} ctx - 智能体上下文
   * @param {string} filePath - 文件路径
   * @returns {Promise<{ok: boolean, canRead: boolean, canWrite: boolean, folder?: object}>}
   */
  async checkPermission(ctx, filePath) {
    try {
      const info = await this.permissionManager.getPermissionInfo(filePath);
      const exists = existsSync(filePath);
      
      await this.accessLogger.logCheckPermission(ctx, filePath, info.canRead, info.canWrite);
      
      return {
        ok: true,
        canRead: info.canRead,
        canWrite: info.canWrite,
        folder: info.folder,
        exists
      };
    } catch (error) {
      this.log.error?.("[LocalFile] 检查权限失败", { 
        path: filePath, 
        error: error.message 
      });
      return { 
        ok: false, 
        error: "check_failed", 
        message: error.message,
        canRead: false,
        canWrite: false
      };
    }
  }

  /**
   * 获取工作区路径
   * @private
   * @param {object} ctx - 智能体上下文
   * @returns {Promise<string|null>}
   */
  async _getWorkspacePath(ctx) {
    try {
      // 通过 Runtime 获取工作区路径
      if (!this.runtime) return null;
      
      const agentId = ctx?.agent?.id;
      if (!agentId) return null;

      // 使用 runtime 的工作区服务
      const workspaceInfo = await this.runtime.getWorkspaceInfo?.(agentId);
      if (workspaceInfo?.path) {
        return workspaceInfo.path;
      }

      // 备选方案：通过 taskId 获取工作区
      const taskId = ctx?.currentMessage?.taskId;
      if (taskId && this.runtime.getWorkspacePathByTaskId) {
        return await this.runtime.getWorkspacePathByTaskId(taskId);
      }

      return null;
    } catch (error) {
      this.log.error?.("[LocalFile] 获取工作区路径失败", { error: error.message });
      return null;
    }
  }

  /**
   * 获取授权文件夹列表
   * @returns {Array<object>}
   */
  getAuthorizedFolders() {
    return this.permissionManager.getAuthorizedFolders();
  }
}

export default FileService;
