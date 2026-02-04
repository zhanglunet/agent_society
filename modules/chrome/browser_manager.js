/**
 * 浏览器管理器
 * 负责 Chrome 浏览器实例的启动、关闭和生命周期管理。
 */

import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {object} BrowserInstance
 * @property {string} id - 浏览器实例唯一 ID
 * @property {import('puppeteer-core').Browser} browser - Puppeteer Browser 对象
 * @property {string} createdAt - 创建时间 ISO 字符串
 * @property {string} status - 状态: 'running' | 'closed'
 * @property {{server?: string, username?: string, password?: string}|null} proxy - 代理配置
 */

export class BrowserManager {
  /**
   * @param {{log?: any, config?: object}} options
   */
  constructor(options = {}) {
    this.log = options.log ?? console;
    this.config = options.config ?? {};
    /** @type {Map<string, BrowserInstance>} */
    this._browsers = new Map();
  }

  /**
   * 查找 Chrome 可执行文件路径
   * @returns {string}
   */
  _findChromePath() {
    const platform = process.platform;
    
    if (platform === "win32") {
      const paths = [
        process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
        process.env["PROGRAMFILES"] + "\\Google\\Chrome\\Application\\chrome.exe",
        process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe"
      ];
      for (const p of paths) {
        if (p && existsSync(p)) return p;
      }
    } else if (platform === "darwin") {
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    } else {
      // Linux
      const paths = [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser"
      ];
      for (const p of paths) {
        if (existsSync(p)) return p;
      }
    }
    
    return "chrome"; // 回退到 PATH 中的 chrome
  }

  /**
   * 启动新的浏览器实例
   * @param {{headless?: boolean, autoOpenDevtoolsForTabs?: boolean, executablePath?: string, proxy?: {server?: string, username?: string, password?: string}}} options
   * @returns {Promise<{ok: boolean, browserId: string, createdAt: string}>}
   */
  async launch(options = {}) {
    // 优先使用调用参数，其次使用模块配置，最后使用默认值 true
    const defaultHeadless = this.config.headless ?? true;
    const defaultProxy = this.config.proxy ?? {};
    const {
      headless = defaultHeadless,
      autoOpenDevtoolsForTabs = false,
      executablePath,
      proxy = defaultProxy
    } = options;

    const effectiveHeadless = autoOpenDevtoolsForTabs ? false : headless;
    const browserId = randomUUID();
    const chromePath = executablePath ?? this._findChromePath();

    // 构建 Chrome 用户数据目录路径（从配置获取）
    let userDataDir = null;
    if (this.config.dataDir) {
      userDataDir = path.resolve(this.config.dataDir, "chrome");
      // 确保用户数据目录存在
      if (!existsSync(userDataDir)) {
        mkdirSync(userDataDir, { recursive: true });
      }
    }

    this.log.info?.("启动浏览器", { browserId, headless: effectiveHeadless, chromePath, userDataDir, proxy: proxy.server ? { server: proxy.server } : null, autoOpenDevtoolsForTabs });

    try {
      // 构建启动参数
      const args = [
        // "--no-sandbox",
        // "--disable-setuid-sandbox",
        // "--disable-dev-shm-usage"
      ];

      if (autoOpenDevtoolsForTabs) {
        args.push("--auto-open-devtools-for-tabs");
      }

      // 添加代理配置
      if (proxy.server) {
        args.push(`--proxy-server=${proxy.server}`);
        this.log.info?.("使用代理服务器", { server: proxy.server });
      }

      const launchOptions = {
        headless: effectiveHeadless ? "new" : false,
        executablePath: chromePath,
        args
      };

      // 只有在配置了 dataDir 时才设置 userDataDir
      if (userDataDir) {
        launchOptions.userDataDir = userDataDir;
      }

      const browser = await puppeteer.launch(launchOptions);

      // 如果有代理认证信息，设置认证
      if (proxy.server && proxy.username && proxy.password) {
        const pages = await browser.pages();
        for (const page of pages) {
          await page.authenticate({
            username: proxy.username,
            password: proxy.password
          });
        }
        this.log.info?.("已设置代理认证");
      }

      const instance = {
        id: browserId,
        browser,
        createdAt: new Date().toISOString(),
        status: "running",
        proxy: proxy.server ? proxy : null
      };

      this._browsers.set(browserId, instance);

      // 监听浏览器断开连接
      browser.on("disconnected", () => {
        // 直接从列表中删除，不保留 closed 状态记录
        this._browsers.delete(browserId);
        this.log.info?.("浏览器已断开连接", { browserId });
      });

      this.log.info?.("浏览器启动成功", { browserId });

      return {
        ok: true,
        browserId,
        createdAt: instance.createdAt
      };
    } catch (err) {
      const message = err?.message ?? String(err);
      this.log.error?.("浏览器启动失败", { browserId, error: message });
      return {
        error: "browser_launch_failed",
        message,
        browserId
      };
    }
  }

  /**
   * 关闭指定的浏览器实例
   * @param {string} browserId - 浏览器实例 ID
   * @returns {Promise<{ok: boolean} | {error: string, browserId: string}>}
   */
  async close(browserId) {
    const instance = this._browsers.get(browserId);
    
    if (!instance) {
      return { error: "browser_not_found", browserId };
    }

    this.log.info?.("关闭浏览器", { browserId });

    try {
      if (instance.status === "running") {
        await instance.browser.close();
      }
      instance.status = "closed";
      this._browsers.delete(browserId);
      
      this.log.info?.("浏览器已关闭", { browserId });
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      this.log.error?.("浏览器关闭失败", { browserId, error: message });
      // 即使关闭失败，也从列表中移除
      this._browsers.delete(browserId);
      return { error: "browser_close_failed", browserId, message };
    }
  }

  /**
   * 关闭所有浏览器实例
   * @returns {Promise<void>}
   */
  async closeAll() {
    this.log.info?.("关闭所有浏览器", { count: this._browsers.size });
    
    const closePromises = [];
    for (const [browserId] of this._browsers) {
      closePromises.push(this.close(browserId));
    }
    
    await Promise.allSettled(closePromises);
    this._browsers.clear();
  }

  /**
   * 获取浏览器实例
   * @param {string} browserId - 浏览器实例 ID
   * @returns {BrowserInstance|null}
   */
  getBrowser(browserId) {
    return this._browsers.get(browserId) ?? null;
  }

  /**
   * 获取 Puppeteer Browser 对象
   * @param {string} browserId - 浏览器实例 ID
   * @returns {import('puppeteer-core').Browser|null}
   */
  getPuppeteerBrowser(browserId) {
    const instance = this._browsers.get(browserId);
    return instance?.browser ?? null;
  }

  /**
   * 列出所有浏览器实例
   * @returns {Array<{id: string, createdAt: string, status: string}>}
   */
  listBrowsers() {
    const list = [];
    for (const [id, instance] of this._browsers) {
      list.push({
        id,
        createdAt: instance.createdAt,
        status: instance.status
      });
    }
    return list;
  }

  /**
   * 获取浏览器数量
   * @returns {number}
   */
  getBrowserCount() {
    return this._browsers.size;
  }
}
