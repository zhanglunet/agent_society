import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
console.log("WorkspaceManager.js loaded");
import path from "node:path";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { Workspace } from "./workspace.js";

/**
 * 工作区管理器
 * 负责工作区的生命周期管理和实例索引
 */
export class WorkspaceManager {
  /**
   * @param {object} options { workspacesDir, logger }
   */
  constructor(options = {}) {
    // 基础工作区目录，默认为项目根目录下的 data/workspaces
    this.workspacesDir = options.workspacesDir || path.resolve(process.cwd(), "data/workspaces");
    this.log = options.logger ?? createNoopModuleLogger();
    
    /** @type {Map<string, Workspace>} */
    this._workspaces = new Map();
  }

  /**
   * 获取工作区对象 (单例管理)
   * @param {string} workspaceId
   * @returns {Promise<Workspace>}
   */
  async getWorkspace(workspaceId) {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("invalid_workspace_id");
    }

    if (this._workspaces.has(workspaceId)) {
      return this._workspaces.get(workspaceId);
    }

    const ws = new Workspace(workspaceId, this.workspacesDir, { logger: this.log });
    this._workspaces.set(workspaceId, ws);
    
    return ws;
  }

  /**
   * 创建并返回工作区对象
   * @param {string} workspaceId
   * @param {object} options
   * @returns {Promise<Workspace>}
   */
  async createWorkspace(workspaceId, options = {}) {
    const ws = await this.getWorkspace(workspaceId);
    await ws.sync(); // 初始化元数据
    return ws;
  }

  /**
   * 删除工作区
   * @param {string} workspaceId
   * @returns {Promise<{ok: boolean}>}
   */
  async deleteWorkspace(workspaceId) {
    if (!workspaceId) throw new Error("invalid_workspace_id");
    
    const ws = await this.getWorkspace(workspaceId);
    await rm(ws.rootPath, { recursive: true, force: true });
    this._workspaces.delete(workspaceId);
    
    void this.log.info("工作区已删除", { workspaceId });
    return { ok: true };
  }

  /**
   * 检查工作区是否存在
   * @param {string} workspaceId
   * @returns {boolean}
   */
  checkWorkspaceExists(workspaceId) {
    if (!workspaceId) return false;
    if (this._workspaces.has(workspaceId)) return true;
    
    const fullPath = path.join(this.workspacesDir, workspaceId);
    const exists = existsSync(fullPath);
    console.error(`Checking workspace ${workspaceId} at ${fullPath}: ${exists}`);
    return exists;
  }

  /**
   * 获取文件信息
   * @param {string} workspaceId
   * @param {string} relativePath
   */
  async getFileInfo(workspaceId, relativePath) {
    const ws = await this.getWorkspace(workspaceId);
    return await ws.getFileInfo(relativePath);
  }

  /**
   * 获取工作区详细信息 (兼容旧版)
   * @param {string} workspaceId
   */
  async getWorkspaceInfo(workspaceId) {
    try {
      const ws = await this.getWorkspace(workspaceId);
      // 先同步一下，确保信息是最新的
      await ws.sync();
      return await ws.getInfo();
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 读取文件
   * @param {string} workspaceId
   * @param {string} relativePath
   * @param {object} options
   */
  async readFile(workspaceId, relativePath, options = {}) {
    const ws = await this.getWorkspace(workspaceId);
    return await ws.readFile(relativePath, options);
  }

  /**
   * 写入文件
   * @param {string} workspaceId
   * @param {string} relativePath
   * @param {string|Buffer} content
   * @param {object} options
   */
  async writeFile(workspaceId, relativePath, content, options = {}) {
    const ws = await this.getWorkspace(workspaceId);
    return await ws.writeFile(relativePath, content, options);
  }

  /**
   * 删除文件
   * @param {string} workspaceId
   * @param {string} relativePath
   * @param {object} options
   */
  async deleteFile(workspaceId, relativePath, options = {}) {
    const ws = await this.getWorkspace(workspaceId);
    return await ws.deleteFile(relativePath, options);
  }

  /**
   * 列出文件
   * @param {string} workspaceId
   * @param {string} subDir
   */
  async listFiles(workspaceId, subDir = ".") {
    const ws = await this.getWorkspace(workspaceId);
    return await ws.listFiles(subDir);
  }

  /**
   * 列出所有工作区
   * @returns {Promise<Array<{id: string, updatedAt: number}>>}
   */
  async listWorkspaces() {
    const { readdir } = await import("node:fs/promises");
    const { statSync, existsSync } = await import("node:fs");
    
    if (!existsSync(this.workspacesDir)) {
      return [];
    }

    const entries = await readdir(this.workspacesDir, { withFileTypes: true });
    const results = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workspacePath = path.join(this.workspacesDir, entry.name);
        const stat = statSync(workspacePath);
        results.push({
          id: entry.name,
          updatedAt: stat.mtimeMs
        });
      }
    }
    
    // 按修改时间降序
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // --- 以下为兼容旧版代码保留的方法，后续迁移完成后可删除 ---

  /**
   * 为任务绑定工作空间 (兼容旧版)
   */
  async bindWorkspace(taskId, workspacePath) {
    // 旧版绑定逻辑，在重构期间暂时重定向到 getWorkspace
    await this.getWorkspace(taskId);
    return { ok: true };
  }

  /**
   * 获取任务的工作空间路径 (兼容旧版)
   */
  getWorkspacePath(taskId) {
    return path.join(this.workspacesDir, taskId);
  }

  /**
   * 检查工作空间是否已分配 (兼容旧版)
   */
  hasWorkspace(workspaceId) {
    return this.checkWorkspaceExists(workspaceId);
  }
}
