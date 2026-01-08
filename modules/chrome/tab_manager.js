/**
 * 标签页管理器
 * 负责 Chrome 标签页的创建、关闭和生命周期管理。
 */

import { randomUUID } from "node:crypto";

/**
 * @typedef {object} Tab
 * @property {string} id - 标签页唯一 ID
 * @property {string} browserId - 所属浏览器实例 ID
 * @property {import('puppeteer-core').Page} page - Puppeteer Page 对象
 * @property {string} createdAt - 创建时间 ISO 字符串
 * @property {string} status - 状态: 'active' | 'closed'
 */

export class TabManager {
  /**
   * @param {{log?: any, browserManager: import('./browser_manager.js').BrowserManager}} options
   */
  constructor(options) {
    this.log = options.log ?? console;
    this.browserManager = options.browserManager;
    /** @type {Map<string, Tab>} */
    this._tabs = new Map();
  }

  /**
   * 在指定浏览器中创建新标签页
   * @param {string} browserId - 浏览器实例 ID
   * @param {string} [url] - 初始 URL
   * @returns {Promise<{ok: boolean, tabId: string, browserId: string, url?: string} | {error: string}>}
   */
  async newTab(browserId, url) {
    const browser = this.browserManager.getPuppeteerBrowser(browserId);
    
    if (!browser) {
      return { error: "browser_not_found", browserId };
    }

    const tabId = randomUUID();
    this.log.info?.("创建新标签页", { tabId, browserId, url });

    try {
      const page = await browser.newPage();
      
      const tab = {
        id: tabId,
        browserId,
        page,
        createdAt: new Date().toISOString(),
        status: "active"
      };

      this._tabs.set(tabId, tab);

      // 监听页面关闭
      page.on("close", () => {
        const t = this._tabs.get(tabId);
        if (t) {
          t.status = "closed";
        }
        this.log.info?.("标签页已关闭", { tabId });
      });

      // 如果提供了 URL，导航到该页面
      if (url) {
        await page.goto(url, { waitUntil: "load" });
      }

      const currentUrl = page.url();
      this.log.info?.("标签页创建成功", { tabId, browserId, url: currentUrl });

      return {
        ok: true,
        tabId,
        browserId,
        url: currentUrl
      };
    } catch (err) {
      const message = err?.message ?? String(err);
      this.log.error?.("标签页创建失败", { tabId, browserId, error: message });
      return { error: "tab_create_failed", browserId, message };
    }
  }

  /**
   * 关闭指定的标签页
   * @param {string} tabId - 标签页 ID
   * @returns {Promise<{ok: boolean} | {error: string, tabId: string}>}
   */
  async closeTab(tabId) {
    const tab = this._tabs.get(tabId);
    
    if (!tab) {
      return { error: "tab_not_found", tabId };
    }

    this.log.info?.("关闭标签页", { tabId });

    try {
      if (tab.status === "active") {
        await tab.page.close();
      }
      tab.status = "closed";
      this._tabs.delete(tabId);
      
      this.log.info?.("标签页已关闭", { tabId });
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      this.log.error?.("标签页关闭失败", { tabId, error: message });
      // 即使关闭失败，也从列表中移除
      this._tabs.delete(tabId);
      return { error: "tab_close_failed", tabId, message };
    }
  }

  /**
   * 列出指定浏览器的所有标签页
   * @param {string} browserId - 浏览器实例 ID
   * @returns {Promise<{ok: boolean, tabs: Array<{id: string, url: string, title: string, status: string}>} | {error: string}>}
   */
  async listTabs(browserId) {
    const browser = this.browserManager.getBrowser(browserId);
    
    if (!browser) {
      return { error: "browser_not_found", browserId };
    }

    const tabs = [];
    for (const [tabId, tab] of this._tabs) {
      if (tab.browserId === browserId && tab.status === "active") {
        try {
          const url = tab.page.url();
          const title = await tab.page.title();
          tabs.push({
            id: tabId,
            url,
            title,
            status: tab.status,
            createdAt: tab.createdAt
          });
        } catch {
          // 页面可能已关闭，跳过
          tabs.push({
            id: tabId,
            url: "unknown",
            title: "unknown",
            status: "error",
            createdAt: tab.createdAt
          });
        }
      }
    }

    return { ok: true, tabs };
  }

  /**
   * 获取标签页
   * @param {string} tabId - 标签页 ID
   * @returns {Tab|null}
   */
  getTab(tabId) {
    return this._tabs.get(tabId) ?? null;
  }

  /**
   * 获取 Puppeteer Page 对象
   * @param {string} tabId - 标签页 ID
   * @returns {import('puppeteer-core').Page|null}
   */
  getPage(tabId) {
    const tab = this._tabs.get(tabId);
    return tab?.page ?? null;
  }

  /**
   * 关闭指定浏览器的所有标签页
   * @param {string} browserId - 浏览器实例 ID
   * @returns {Promise<void>}
   */
  async closeTabsForBrowser(browserId) {
    const tabsToClose = [];
    for (const [tabId, tab] of this._tabs) {
      if (tab.browserId === browserId) {
        tabsToClose.push(tabId);
      }
    }

    for (const tabId of tabsToClose) {
      await this.closeTab(tabId);
    }
  }

  /**
   * 获取标签页数量
   * @returns {number}
   */
  getTabCount() {
    return this._tabs.size;
  }
}
