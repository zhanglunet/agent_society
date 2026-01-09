/**
 * 页面操作
 * 负责页面导航、内容获取和页面交互。
 */

export class PageActions {
  /**
   * @param {{log?: any, tabManager: import('./tab_manager.js').TabManager}} options
   */
  constructor(options) {
    this.log = options.log ?? console;
    this.tabManager = options.tabManager;
  }

  /**
   * 获取页面对象，如果不存在返回错误
   * @param {string} tabId
   * @returns {{page: import('puppeteer-core').Page} | {error: string, tabId: string}}
   */
  _getPage(tabId) {
    const page = this.tabManager.getPage(tabId);
    if (!page) {
      return { error: "tab_not_found", tabId };
    }
    return { page };
  }

  /**
   * 清理选择器字符串，移除多余的引号和空白
   * @param {string} selector - 原始选择器
   * @returns {{original: string, cleaned: string, modified: boolean}}
   */
  _sanitizeSelector(selector) {
    // 处理 null/undefined 情况
    if (selector == null) {
      return { original: selector, cleaned: selector, modified: false };
    }
    
    const original = selector;
    let cleaned = String(selector).trim();
    
    // 移除首尾的双引号
    if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
      cleaned = cleaned.slice(1, -1);
    }
    // 移除首尾的单引号
    else if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // 再次 trim 以处理引号内的空白
    cleaned = cleaned.trim();
    
    return {
      original,
      cleaned,
      modified: original !== cleaned
    };
  }

  // ==================== 页面导航 ====================

  /**
   * 导航到指定 URL
   * @param {string} tabId
   * @param {string} url
   * @param {{waitUntil?: string, timeoutMs?: number}} options
   */
  async navigate(tabId, url, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { waitUntil = "load", timeoutMs = 30000 } = options;

    this.log.info?.("导航到 URL", { tabId, url, waitUntil });

    try {
      await page.goto(url, {
        waitUntil,
        timeout: timeoutMs
      });

      const finalUrl = page.url();
      const title = await page.title();

      return { ok: true, url: finalUrl, title };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("timeout") || message.includes("Timeout")) {
        return { error: "navigation_timeout", url, timeoutMs, message };
      }
      return { error: "navigation_failed", url, message };
    }
  }

  /**
   * 获取当前 URL
   * @param {string} tabId
   */
  async getUrl(tabId) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const url = page.url();
    return { ok: true, url };
  }

  // ==================== 内容获取 ====================

  /**
   * 获取页面截图并保存为 JPEG 图片文件
   * @param {string} tabId
   * @param {{fullPage?: boolean, selector?: string, ctx?: any}} options
   */
  async screenshot(tabId, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { fullPage = false, selector, ctx } = options;

    // 清理选择器（如果提供）
    let cleanedSelector = selector;
    let originalSelector;
    let selectorModified = false;
    if (selector) {
      const sanitized = this._sanitizeSelector(selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    this.log.info?.("获取截图", { tabId, fullPage, selector: cleanedSelector });

    try {
      let screenshotBuffer;
      
      if (cleanedSelector) {
        const element = await page.$(cleanedSelector);
        if (!element) {
          return { error: "element_not_found", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
        }
        screenshotBuffer = await element.screenshot({ type: "jpeg", quality: 80 });
      } else {
        screenshotBuffer = await page.screenshot({
          fullPage,
          type: "jpeg",
          quality: 80
        });
      }

      // 如果有上下文，保存为图片文件
      if (ctx && ctx.tools && typeof ctx.tools.saveImage === 'function') {
        const pageUrl = page.url();
        const pageTitle = await page.title();
        const messageId = ctx.currentMessage?.id ?? null;
        
        const filePath = await ctx.tools.saveImage(screenshotBuffer, {
          format: "jpg",
          messageId,
          tabId,
          url: pageUrl,
          title: pageTitle,
          fullPage,
          selector: cleanedSelector || null
        });

        return { 
          ok: true, 
          images: [filePath],    // 使用 images 数组
          url: pageUrl,
          title: pageTitle,
          fullPage,
          selector: cleanedSelector || null
        };
      }

      // 没有上下文时返回 base64（用于 HTTP API 预览）
      return { ok: true, screenshot: screenshotBuffer.toString('base64'), format: "jpeg" };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "screenshot_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  /**
   * 获取页面 HTML 内容
   * @param {string} tabId
   * @param {string} [selector]
   */
  async getContent(tabId, selector) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    // 清理选择器（如果提供）
    let cleanedSelector = selector;
    let originalSelector;
    let selectorModified = false;
    if (selector) {
      const sanitized = this._sanitizeSelector(selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    try {
      let html;
      
      if (cleanedSelector) {
        const element = await page.$(cleanedSelector);
        if (!element) {
          return { error: "element_not_found", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
        }
        html = await page.evaluate(el => el.outerHTML, element);
      } else {
        html = await page.content();
      }

      return { ok: true, html };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "get_content_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  /**
   * 获取页面纯文本内容
   * @param {string} tabId
   * @param {string} [selector]
   */
  async getText(tabId, selector) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    // 清理选择器（如果提供）
    let cleanedSelector = selector;
    let originalSelector;
    let selectorModified = false;
    if (selector) {
      const sanitized = this._sanitizeSelector(selector);
      cleanedSelector = sanitized.cleaned;
      originalSelector = sanitized.original;
      selectorModified = sanitized.modified;
      if (selectorModified) {
        this.log.info?.("选择器已清理", { tabId, original: originalSelector, cleaned: cleanedSelector });
      }
    }

    try {
      let text;
      
      if (cleanedSelector) {
        const element = await page.$(cleanedSelector);
        if (!element) {
          return { error: "element_not_found", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined };
        }
        text = await page.evaluate(el => el.innerText || el.textContent, element);
      } else {
        text = await page.evaluate(() => document.body.innerText || document.body.textContent);
      }

      return { ok: true, text };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "get_text_failed", selector: cleanedSelector, originalSelector: selectorModified ? originalSelector : undefined, message };
    }
  }

  // ==================== 页面交互 ====================

  /**
   * 点击页面元素
   * @param {string} tabId
   * @param {string} selector
   * @param {{waitForSelector?: boolean, timeoutMs?: number}} options
   */
  async click(tabId, selector, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { waitForSelector = true, timeoutMs = 5000 } = options;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("点击元素", { tabId, selector: cleaned });

    try {
      if (waitForSelector) {
        await page.waitForSelector(cleaned, { timeout: timeoutMs });
      }
      
      await page.click(cleaned);
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("No element found") || message.includes("not found")) {
        return { error: "element_not_found", selector: cleaned, originalSelector: modified ? original : undefined };
      }
      if (message.includes("timeout") || message.includes("Timeout")) {
        return { error: "wait_timeout", selector: cleaned, originalSelector: modified ? original : undefined, timeoutMs };
      }
      return { error: "click_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }

  /**
   * 在页面指定坐标位置点击
   * @param {string} tabId
   * @param {number} x - X 坐标（像素）
   * @param {number} y - Y 坐标（像素）
   * @param {{button?: 'left' | 'right' | 'middle', clickCount?: number}} options
   */
  async clickAt(tabId, x, y, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { button = "left", clickCount = 1 } = options;

    this.log.info?.("按坐标点击", { tabId, x, y, button, clickCount });

    try {
      await page.mouse.click(x, y, { button, clickCount });
      return { ok: true, x, y, button, clickCount };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "click_at_failed", x, y, message };
    }
  }

  /**
   * 在元素中输入文本（追加模式）
   * @param {string} tabId
   * @param {string} selector
   * @param {string} text
   * @param {{delay?: number}} options
   */
  async type(tabId, selector, text, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { delay = 0 } = options;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("输入文本", { tabId, selector: cleaned, textLength: text?.length });

    try {
      await page.waitForSelector(cleaned, { timeout: 5000 });
      await page.type(cleaned, text, { delay });
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("No element found") || message.includes("not found")) {
        return { error: "element_not_found", selector: cleaned, originalSelector: modified ? original : undefined };
      }
      return { error: "type_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }

  /**
   * 清空输入框并填入新文本
   * @param {string} tabId
   * @param {string} selector
   * @param {string} value
   */
  async fill(tabId, selector, value) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("填充文本", { tabId, selector: cleaned, valueLength: value?.length });

    try {
      await page.waitForSelector(cleaned, { timeout: 5000 });
      
      // 清空现有内容
      await page.$eval(cleaned, el => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = "";
        }
      });
      
      // 填入新值
      await page.type(cleaned, value);
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("No element found") || message.includes("not found")) {
        return { error: "element_not_found", selector: cleaned, originalSelector: modified ? original : undefined };
      }
      return { error: "fill_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }

  /**
   * 在页面上下文中执行 JavaScript 代码
   * @param {string} tabId
   * @param {string} script
   */
  async evaluate(tabId, script) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;

    this.log.info?.("执行脚本", { tabId, scriptLength: script?.length });

    try {
      // 使用 Function 构造器来执行脚本字符串
      const evalResult = await page.evaluate((code) => {
        return new Function(code)();
      }, script);
      
      return { ok: true, result: evalResult };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "evaluate_error", message };
    }
  }

  /**
   * 等待元素出现或满足条件
   * @param {string} tabId
   * @param {string} selector
   * @param {{state?: string, timeoutMs?: number}} options
   */
  async waitFor(tabId, selector, options = {}) {
    const result = this._getPage(tabId);
    if ("error" in result) return result;
    
    const { page } = result;
    const { state = "visible", timeoutMs = 30000 } = options;

    // 清理选择器
    const { original, cleaned, modified } = this._sanitizeSelector(selector);
    if (modified) {
      this.log.info?.("选择器已清理", { tabId, original, cleaned });
    }

    this.log.info?.("等待元素", { tabId, selector: cleaned, state });

    try {
      const waitOptions = { timeout: timeoutMs };
      
      switch (state) {
        case "attached":
          await page.waitForSelector(cleaned, { ...waitOptions });
          break;
        case "detached":
          await page.waitForSelector(cleaned, { ...waitOptions, hidden: true });
          break;
        case "visible":
          await page.waitForSelector(cleaned, { ...waitOptions, visible: true });
          break;
        case "hidden":
          await page.waitForSelector(cleaned, { ...waitOptions, hidden: true });
          break;
        default:
          await page.waitForSelector(cleaned, { ...waitOptions, visible: true });
      }
      
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      if (message.includes("timeout") || message.includes("Timeout")) {
        return { error: "wait_timeout", selector: cleaned, originalSelector: modified ? original : undefined, state, timeoutMs };
      }
      return { error: "wait_failed", selector: cleaned, originalSelector: modified ? original : undefined, message };
    }
  }
}
