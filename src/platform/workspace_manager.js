import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createNoopModuleLogger } from "./logger.js";

/**
 * 工作空间管理器
 * 负责任务工作空间的文件操作，确保路径安全
 */
export class WorkspaceManager {
  /**
   * @param {{logger?: {trace:(m:string,d?:any)=>Promise<void>, debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}}} options
   */
  constructor(options = {}) {
    /** @type {Map<string, {workspacePath: string, createdAt: string, lazyCreated: boolean}>} */
    this._workspaces = new Map();
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 为任务绑定工作空间
   * @param {string} taskId
   * @param {string} workspacePath - 绝对路径
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async bindWorkspace(taskId, workspacePath) {
    if (!taskId || typeof taskId !== "string") {
      return { ok: false, error: "invalid_task_id" };
    }
    if (!workspacePath || typeof workspacePath !== "string") {
      return { ok: false, error: "invalid_workspace_path" };
    }

    const absolutePath = path.resolve(workspacePath);
    
    try {
      // 自动创建工作空间目录（Requirements 11.3）
      await mkdir(absolutePath, { recursive: true });
      
      this._workspaces.set(taskId, {
        workspacePath: absolutePath,
        createdAt: new Date().toISOString(),
        lazyCreated: true
      });
      
      void this.log.info("工作空间绑定成功", { taskId, workspacePath: absolutePath });
      return { ok: true };
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      void this.log.error("工作空间绑定失败", { taskId, workspacePath, error: message });
      return { ok: false, error: `bind_failed: ${message}` };
    }
  }

  /**
   * 为工作空间分配路径（懒加载，不立即创建文件夹）
   * @param {string} workspaceId - 工作空间ID（通常是 root 直接子智能体的 agentId）
   * @param {string} workspacePath - 工作空间绝对路径
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async assignWorkspace(workspaceId, workspacePath) {
    if (!workspaceId || typeof workspaceId !== "string") {
      return { ok: false, error: "invalid_workspace_id" };
    }
    if (!workspacePath || typeof workspacePath !== "string") {
      return { ok: false, error: "invalid_workspace_path" };
    }

    const absolutePath = path.resolve(workspacePath);
    
    // 懒加载：仅记录路径信息，不创建文件夹
    this._workspaces.set(workspaceId, {
      workspacePath: absolutePath,
      createdAt: new Date().toISOString(),
      lazyCreated: false
    });
    
    void this.log.info("工作空间分配成功（懒加载）", { workspaceId, workspacePath: absolutePath });
    return { ok: true };
  }

  /**
   * 检查工作空间是否已分配
   * @param {string} workspaceId
   * @returns {boolean}
   */
  hasWorkspace(workspaceId) {
    return this._workspaces.has(workspaceId);
  }

  /**
   * 确保工作空间文件夹存在（懒加载创建）
   * @param {string} workspaceId
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async ensureWorkspaceExists(workspaceId) {
    const entry = this._workspaces.get(workspaceId);
    if (!entry) {
      return { ok: false, error: "workspace_not_assigned" };
    }

    if (entry.lazyCreated) {
      return { ok: true };
    }

    try {
      await mkdir(entry.workspacePath, { recursive: true });
      entry.lazyCreated = true;
      void this.log.info("工作空间文件夹已创建", { workspaceId, workspacePath: entry.workspacePath });
      return { ok: true };
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      void this.log.error("工作空间文件夹创建失败", { workspaceId, error: message });
      return { ok: false, error: `create_failed: ${message}` };
    }
  }

  /**
   * 获取任务的工作空间路径
   * @param {string} taskId
   * @returns {string|null}
   */
  getWorkspacePath(taskId) {
    const entry = this._workspaces.get(taskId);
    return entry ? entry.workspacePath : null;
  }

  /**
   * 验证路径是否在工作空间内（防止路径遍历攻击）
   * @param {string} workspacePath
   * @param {string} targetPath
   * @returns {boolean}
   */
  _isPathSafe(workspacePath, targetPath) {
    if (!targetPath || typeof targetPath !== "string") {
      return false;
    }
    
    // 拒绝绝对路径
    if (path.isAbsolute(targetPath)) {
      return false;
    }
    
    // 拒绝包含 .. 的路径
    const normalized = path.normalize(targetPath);
    if (normalized.startsWith("..") || normalized.includes(`${path.sep}..`)) {
      return false;
    }
    
    // 解析完整路径并验证是否在工作空间内
    const resolvedPath = path.resolve(workspacePath, targetPath);
    const normalizedWorkspace = path.normalize(workspacePath);
    
    // 确保解析后的路径以工作空间路径开头
    return resolvedPath.startsWith(normalizedWorkspace + path.sep) || 
           resolvedPath === normalizedWorkspace;
  }


  /**
   * 读取文件内容
   * @param {string} taskId
   * @param {string} relativePath - 相对于工作空间的路径
   * @returns {Promise<{content?: string, error?: string}>}
   */
  async readFile(taskId, relativePath) {
    const workspacePath = this.getWorkspacePath(taskId);
    if (!workspacePath) {
      return { error: "workspace_not_bound" };
    }

    if (!this._isPathSafe(workspacePath, relativePath)) {
      void this.log.warn("路径遍历攻击被拦截", { taskId, relativePath });
      return { error: "path_traversal_blocked" };
    }

    const fullPath = path.resolve(workspacePath, relativePath);
    
    try {
      const content = await readFile(fullPath, "utf8");
      void this.log.debug("读取文件成功", { taskId, relativePath });
      return { content };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        if (err.code === "ENOENT") {
          return { error: "file_not_found" };
        }
        if (err.code === "EACCES") {
          return { error: "permission_denied" };
        }
      }
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      return { error: `read_failed: ${message}` };
    }
  }

  /**
   * 写入文件内容
   * @param {string} taskId
   * @param {string} relativePath
   * @param {string} content
   * @param {{messageId?: string, agentId?: string, [key: string]: any}} [meta] - 可选的元信息
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async writeFile(taskId, relativePath, content, meta = null) {
    const workspacePath = this.getWorkspacePath(taskId);
    if (!workspacePath) {
      return { ok: false, error: "workspace_not_bound" };
    }

    if (!this._isPathSafe(workspacePath, relativePath)) {
      void this.log.warn("路径遍历攻击被拦截", { taskId, relativePath });
      return { ok: false, error: "path_traversal_blocked" };
    }

    // 懒加载：首次写入时创建工作空间文件夹
    const ensureResult = await this.ensureWorkspaceExists(taskId);
    if (!ensureResult.ok) {
      return { ok: false, error: ensureResult.error };
    }

    const fullPath = path.resolve(workspacePath, relativePath);
    
    try {
      // 确保父目录存在
      const parentDir = path.dirname(fullPath);
      await mkdir(parentDir, { recursive: true });
      
      await writeFile(fullPath, content, "utf8");
      void this.log.debug("写入文件成功", { taskId, relativePath });

      // 如果提供了元信息，保存到工作空间元信息文件
      if (meta && (meta.messageId || meta.agentId || Object.keys(meta).length > 0)) {
        await this._updateWorkspaceMeta(taskId, relativePath, meta);
      }

      return { ok: true };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "EACCES") {
        return { ok: false, error: "permission_denied" };
      }
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      return { ok: false, error: `write_failed: ${message}` };
    }
  }

  /**
   * 更新工作空间元信息文件
   * @param {string} taskId - 工作空间ID
   * @param {string} relativePath - 文件相对路径
   * @param {object} fileMeta - 文件元信息
   * @returns {Promise<void>}
   */
  async _updateWorkspaceMeta(taskId, relativePath, fileMeta) {
    const entry = this._workspaces.get(taskId);
    if (!entry) {
      return;
    }

    // 元信息文件保存在工作空间目录的上一级，与工作空间同名
    const workspacesDir = path.dirname(entry.workspacePath);
    const metaFilePath = path.join(workspacesDir, `${taskId}.meta.json`);

    try {
      // 读取现有的元信息
      let workspaceMeta = {
        workspaceId: taskId,
        createdAt: entry.createdAt,
        files: {}
      };

      try {
        const existingContent = await readFile(metaFilePath, "utf8");
        workspaceMeta = JSON.parse(existingContent);
        if (!workspaceMeta.files) {
          workspaceMeta.files = {};
        }
      } catch (err) {
        // 文件不存在或解析失败，使用默认值
      }

      // 更新文件元信息
      const normalizedPath = path.normalize(relativePath).replace(/\\/g, "/");
      workspaceMeta.files[normalizedPath] = {
        ...fileMeta,
        updatedAt: new Date().toISOString()
      };

      // 写入元信息文件
      await writeFile(metaFilePath, JSON.stringify(workspaceMeta, null, 2), "utf8");
      void this.log.debug("更新工作空间元信息成功", { taskId, relativePath });
    } catch (err) {
      // 元信息写入失败不影响主流程
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      void this.log.warn("更新工作空间元信息失败", { taskId, relativePath, error: message });
    }
  }

  /**
   * 列出目录内容
   * @param {string} taskId
   * @param {string} relativePath - 默认为 "."
   * @returns {Promise<{files?: Array<{name: string, type: 'file'|'directory', size: number}>, error?: string}>}
   */
  async listFiles(taskId, relativePath = ".") {
    const workspacePath = this.getWorkspacePath(taskId);
    if (!workspacePath) {
      return { error: "workspace_not_bound" };
    }

    if (!this._isPathSafe(workspacePath, relativePath)) {
      void this.log.warn("路径遍历攻击被拦截", { taskId, relativePath });
      return { error: "path_traversal_blocked" };
    }

    const fullPath = path.resolve(workspacePath, relativePath);
    
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(fullPath, entry.name);
          let size = 0;
          try {
            const stats = await stat(entryPath);
            size = stats.size;
          } catch {
            // 忽略无法获取大小的文件
          }
          return {
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
            size
          };
        })
      );
      
      void this.log.debug("列出目录成功", { taskId, relativePath, count: files.length });
      return { files };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        if (err.code === "ENOENT") {
          // 懒加载：工作空间文件夹不存在时返回空列表而不是错误
          void this.log.debug("工作空间文件夹不存在，返回空列表", { taskId, relativePath });
          return { files: [] };
        }
        if (err.code === "EACCES") {
          return { error: "permission_denied" };
        }
        if (err.code === "ENOTDIR") {
          return { error: "not_a_directory" };
        }
      }
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      return { error: `list_failed: ${message}` };
    }
  }

  /**
   * 获取工作空间信息
   * @param {string} taskId
   * @returns {Promise<{fileCount: number, dirCount: number, totalSize: number, lastModified: string}|{error: string}>}
   */
  async getWorkspaceInfo(taskId) {
    const workspacePath = this.getWorkspacePath(taskId);
    if (!workspacePath) {
      return { error: "workspace_not_bound" };
    }

    try {
      const info = await this._collectWorkspaceInfo(workspacePath);
      void this.log.debug("获取工作空间信息成功", { taskId, ...info });
      return info;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        if (err.code === "ENOENT") {
          // 懒加载：工作空间文件夹不存在时返回空的统计信息
          void this.log.debug("工作空间文件夹不存在，返回空统计信息", { taskId });
          return {
            fileCount: 0,
            dirCount: 0,
            totalSize: 0,
            lastModified: new Date(0).toISOString()
          };
        }
        if (err.code === "EACCES") {
          return { error: "permission_denied" };
        }
      }
      const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
      return { error: `info_failed: ${message}` };
    }
  }

  /**
   * 递归收集工作空间信息
   * @param {string} dirPath
   * @returns {Promise<{fileCount: number, dirCount: number, totalSize: number, lastModified: string}>}
   */
  async _collectWorkspaceInfo(dirPath) {
    let fileCount = 0;
    let dirCount = 0;
    let totalSize = 0;
    let lastModified = new Date(0);

    const processDir = async (currentPath) => {
      const entries = await readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        
        try {
          const stats = await stat(entryPath);
          
          if (stats.mtime > lastModified) {
            lastModified = stats.mtime;
          }
          
          if (entry.isDirectory()) {
            dirCount++;
            await processDir(entryPath);
          } else {
            fileCount++;
            totalSize += stats.size;
          }
        } catch {
          // 忽略无法访问的文件
        }
      }
    };

    await processDir(dirPath);

    return {
      fileCount,
      dirCount,
      totalSize,
      lastModified: lastModified.toISOString()
    };
  }
}
