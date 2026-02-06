/**
 * 配置管理器
 * 
 * 职责：
 * - 管理授权文件夹列表
 * - 加载和保存配置文件
 * - 验证文件夹路径合法性
 * - 提供文件夹查询接口
 */

import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * 配置管理器类
 */
export class ConfigManager {
  /**
   * @param {{configPath?: string, log?: any}} options
   */
  constructor(options = {}) {
    this.configPath = options.configPath;
    this.log = options.log ?? console;
    
    /** @type {Array<{id: string, path: string, read: boolean, write: boolean, description: string}>} */
    this.folders = [];
    
    /** @type {number} */
    this.logRetentionDays = 30;
    
    /** @type {boolean} */
    this._initialized = false;
  }

  /**
   * 初始化配置管理器
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;
    
    await this._loadConfig();
    this._initialized = true;
    
    this.log.info?.("[LocalFile] 配置管理器初始化完成", { 
      folderCount: this.folders.length 
    });
  }

  /**
   * 加载配置文件
   * @private
   */
  async _loadConfig() {
    try {
      if (!this.configPath || !existsSync(this.configPath)) {
        this.log.warn?.("[LocalFile] 配置文件不存在，使用默认配置", { 
          configPath: this.configPath 
        });
        // 创建默认配置
        await this._saveConfig();
        return;
      }

      const content = await readFile(this.configPath, "utf8");
      const config = JSON.parse(content);
      
      this.folders = Array.isArray(config.folders) ? config.folders : [];
      this.logRetentionDays = config.logRetentionDays ?? 30;
      
      // 验证并规范化文件夹配置
      this.folders = this.folders.filter(folder => this._validateFolder(folder));
      
    } catch (error) {
      this.log.error?.("[LocalFile] 加载配置失败", { 
        error: error.message,
        configPath: this.configPath 
      });
      // 使用空配置继续
      this.folders = [];
    }
  }

  /**
   * 保存配置文件
   * @private
   */
  async _saveConfig() {
    try {
      if (!this.configPath) return;
      
      // 确保目录存在
      const configDir = path.dirname(this.configPath);
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
      }
      
      const config = {
        folders: this.folders,
        logRetentionDays: this.logRetentionDays
      };
      
      await writeFile(
        this.configPath, 
        JSON.stringify(config, null, 2), 
        "utf8"
      );
      
    } catch (error) {
      this.log.error?.("[LocalFile] 保存配置失败", { error: error.message });
      throw error;
    }
  }

  /**
   * 验证文件夹配置
   * @private
   * @param {any} folder
   * @returns {boolean}
   */
  _validateFolder(folder) {
    if (!folder || typeof folder !== "object") return false;
    if (typeof folder.path !== "string" || !folder.path) return false;
    
    // 确保有ID
    if (!folder.id) {
      folder.id = randomUUID();
    }
    
    // 规范化权限
    folder.read = Boolean(folder.read);
    folder.write = Boolean(folder.write);
    folder.description = String(folder.description ?? "");
    
    return true;
  }

  /**
   * 获取所有授权文件夹
   * @returns {Array<{id: string, path: string, read: boolean, write: boolean, description: string}>}
   */
  getFolders() {
    return this.folders.map(f => ({ ...f }));
  }

  /**
   * 根据ID获取文件夹
   * @param {string} folderId
   * @returns {{id: string, path: string, read: boolean, write: boolean, description: string}|null}
   */
  getFolder(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    return folder ? { ...folder } : null;
  }

  /**
   * 添加授权文件夹
   * @param {{path: string, read?: boolean, write?: boolean, description?: string}} folderConfig
   * @returns {{ok: boolean, folder?: object, error?: string}}
   */
  async addFolder(folderConfig) {
    try {
      // 验证路径
      if (!folderConfig.path || typeof folderConfig.path !== "string") {
        return { ok: false, error: "invalid_path" };
      }

      // 规范化路径
      const normalizedPath = path.resolve(folderConfig.path);
      
      // 检查路径是否已存在
      const exists = this.folders.some(f => 
        path.resolve(f.path) === normalizedPath
      );
      if (exists) {
        return { ok: false, error: "path_already_exists" };
      }

      // 检查路径是否存在且可访问
      try {
        await access(normalizedPath);
      } catch {
        return { ok: false, error: "path_not_accessible" };
      }

      const folder = {
        id: randomUUID(),
        path: normalizedPath,
        read: Boolean(folderConfig.read),
        write: Boolean(folderConfig.write),
        description: String(folderConfig.description ?? "")
      };

      this.folders.push(folder);
      await this._saveConfig();

      this.log.info?.("[LocalFile] 添加授权文件夹", { 
        folderId: folder.id, 
        path: folder.path 
      });

      return { ok: true, folder: { ...folder } };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 添加文件夹失败", { error: error.message });
      return { ok: false, error: "save_failed" };
    }
  }

  /**
   * 更新授权文件夹
   * @param {string} folderId
   * @param {{read?: boolean, write?: boolean, description?: string}} updates
   * @returns {{ok: boolean, folder?: object, error?: string}}
   */
  async updateFolder(folderId, updates) {
    try {
      const folder = this.folders.find(f => f.id === folderId);
      if (!folder) {
        return { ok: false, error: "folder_not_found" };
      }

      if (updates.read !== undefined) {
        folder.read = Boolean(updates.read);
      }
      if (updates.write !== undefined) {
        folder.write = Boolean(updates.write);
      }
      if (updates.description !== undefined) {
        folder.description = String(updates.description);
      }

      await this._saveConfig();

      this.log.info?.("[LocalFile] 更新授权文件夹", { folderId });

      return { ok: true, folder: { ...folder } };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 更新文件夹失败", { error: error.message });
      return { ok: false, error: "save_failed" };
    }
  }

  /**
   * 删除授权文件夹
   * @param {string} folderId
   * @returns {{ok: boolean, error?: string}}
   */
  async removeFolder(folderId) {
    try {
      const index = this.folders.findIndex(f => f.id === folderId);
      if (index === -1) {
        return { ok: false, error: "folder_not_found" };
      }

      const folder = this.folders[index];
      this.folders.splice(index, 1);
      await this._saveConfig();

      this.log.info?.("[LocalFile] 删除授权文件夹", { 
        folderId, 
        path: folder.path 
      });

      return { ok: true };
      
    } catch (error) {
      this.log.error?.("[LocalFile] 删除文件夹失败", { error: error.message });
      return { ok: false, error: "save_failed" };
    }
  }

  /**
   * 获取日志保留天数
   * @returns {number}
   */
  getLogRetentionDays() {
    return this.logRetentionDays;
  }

  /**
   * 设置日志保留天数
   * @param {number} days
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async setLogRetentionDays(days) {
    try {
      const numDays = parseInt(days, 10);
      if (isNaN(numDays) || numDays < 1) {
        return { ok: false, error: "invalid_days" };
      }
      
      this.logRetentionDays = numDays;
      await this._saveConfig();
      
      return { ok: true };
    } catch (error) {
      this.log.error?.("[LocalFile] 设置日志保留天数失败", { error: error.message });
      return { ok: false, error: "save_failed" };
    }
  }
}

export default ConfigManager;
