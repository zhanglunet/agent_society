/**
 * 配置管理器
 * 
 * 职责：
 * - 管理自动化模块配置
 * - 加载和保存配置文件
 * - 提供配置查询接口
 */

import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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
    
    /** @type {boolean} */
    this.enabled = true;
    
    /** @type {boolean} */
    this.allowMouse = true;
    
    /** @type {boolean} */
    this.allowKeyboard = true;
    
    /** @type {boolean} */
    this.allowAccessibility = true;
    
    /** @type {Array<{x: number, y: number, width: number, height: number, reason: string}>} */
    this.restrictedRegions = [];
    
    /** @type {boolean} */
    this.requireConfirmation = false;
    
    /** @type {boolean} */
    this.logAllActions = true;
    
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
    
    this.log.info?.("[Automation] 配置管理器初始化完成", {
      enabled: this.enabled,
      allowMouse: this.allowMouse,
      allowKeyboard: this.allowKeyboard,
      allowAccessibility: this.allowAccessibility
    });
  }

  /**
   * 加载配置文件
   * @private
   */
  async _loadConfig() {
    try {
      if (!this.configPath || !existsSync(this.configPath)) {
        this.log.warn?.("[Automation] 配置文件不存在，使用默认配置", {
          configPath: this.configPath
        });
        await this._saveConfig();
        return;
      }

      const content = await readFile(this.configPath, "utf8");
      const config = JSON.parse(content);
      
      this.enabled = config.enabled ?? true;
      this.allowMouse = config.allowMouse ?? true;
      this.allowKeyboard = config.allowKeyboard ?? true;
      this.allowAccessibility = config.allowAccessibility ?? true;
      this.restrictedRegions = Array.isArray(config.restrictedRegions) ? config.restrictedRegions : [];
      this.requireConfirmation = config.requireConfirmation ?? false;
      this.logAllActions = config.logAllActions ?? true;
      
    } catch (error) {
      this.log.error?.("[Automation] 加载配置失败", {
        error: error.message,
        configPath: this.configPath
      });
    }
  }

  /**
   * 保存配置文件
   * @private
   */
  async _saveConfig() {
    try {
      if (!this.configPath) return;
      
      const configDir = path.dirname(this.configPath);
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
      }
      
      const config = {
        enabled: this.enabled,
        allowMouse: this.allowMouse,
        allowKeyboard: this.allowKeyboard,
        allowAccessibility: this.allowAccessibility,
        restrictedRegions: this.restrictedRegions,
        requireConfirmation: this.requireConfirmation,
        logAllActions: this.logAllActions
      };
      
      await writeFile(this.configPath, JSON.stringify(config, null, 2), "utf8");
      
    } catch (error) {
      this.log.error?.("[Automation] 保存配置失败", { error: error.message });
    }
  }

  /**
   * 更新配置
   * @param {object} updates
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async updateConfig(updates) {
    try {
      if (updates.enabled !== undefined) this.enabled = Boolean(updates.enabled);
      if (updates.allowMouse !== undefined) this.allowMouse = Boolean(updates.allowMouse);
      if (updates.allowKeyboard !== undefined) this.allowKeyboard = Boolean(updates.allowKeyboard);
      if (updates.allowAccessibility !== undefined) this.allowAccessibility = Boolean(updates.allowAccessibility);
      if (updates.requireConfirmation !== undefined) this.requireConfirmation = Boolean(updates.requireConfirmation);
      if (updates.logAllActions !== undefined) this.logAllActions = Boolean(updates.logAllActions);
      if (Array.isArray(updates.restrictedRegions)) this.restrictedRegions = updates.restrictedRegions;
      
      await this._saveConfig();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * 获取当前配置
   * @returns {object}
   */
  getConfig() {
    return {
      enabled: this.enabled,
      allowMouse: this.allowMouse,
      allowKeyboard: this.allowKeyboard,
      allowAccessibility: this.allowAccessibility,
      restrictedRegions: [...this.restrictedRegions],
      requireConfirmation: this.requireConfirmation,
      logAllActions: this.logAllActions
    };
  }

  /**
   * 检查坐标是否在受限区域内
   * @param {number} x
   * @param {number} y
   * @returns {{restricted: boolean, reason?: string}}
   */
  checkRestrictedRegion(x, y) {
    for (const region of this.restrictedRegions) {
      if (x >= region.x && x <= region.x + region.width &&
          y >= region.y && y <= region.y + region.height) {
        return { restricted: true, reason: region.reason };
      }
    }
    return { restricted: false };
  }
}

export default ConfigManager;
