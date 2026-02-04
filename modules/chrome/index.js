/**
 * Chrome 浏览器控制模块
 * 提供无头浏览器操作能力，包括浏览器管理、标签页管理、页面导航、内容读取、资源管理和页面交互。
 */

import { BrowserManager } from "./browser_manager.js";
import { TabManager } from "./tab_manager.js";
import { PageActions } from "./page_actions.js";
import { getToolDefinitions } from "./tools.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {BrowserManager|null} */
let browserManager = null;

/** @type {TabManager|null} */
let tabManager = null;

/** @type {PageActions|null} */
let pageActions = null;

/** @type {any} */
let runtime = null;

/** @type {any} */
let log = null;

/** @type {object} */
let moduleConfig = {};

/**
 * Chrome 模块导出
 */
export default {
  name: "chrome",
  
  // 工具组标识符，用于工具组管理
  toolGroupId: "chrome",
  
  // 工具组描述
  toolGroupDescription: "Chrome 浏览器控制工具，提供无头浏览器操作能力",

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

    // 合并全局配置中的 dataDir 到模块配置
    const configWithDataDir = {
      ...moduleConfig,
      dataDir: runtime?.config?.dataDir ?? null
    };

    browserManager = new BrowserManager({ log, config: configWithDataDir });
    tabManager = new TabManager({ log, browserManager });
    pageActions = new PageActions({ log, tabManager, runtime });

    log.info?.("Chrome 模块初始化完成", { config: moduleConfig });
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
      switch (toolName) {
        // 浏览器管理
        case "chrome_launch":
          return await browserManager.launch(args);
        case "chrome_close":
          return await browserManager.close(args.browserId);
        
        // 标签页管理
        case "chrome_new_tab":
          return await tabManager.newTab(args.browserId, args.url);
        case "chrome_close_tab":
          return await tabManager.closeTab(args.tabId);
        case "chrome_list_tabs":
          return await tabManager.listTabs(args.browserId);

        // DevTools（调试采集）
        case "chrome_open_devtools":
          return await tabManager.enableDevtools(args.tabId, args);
        case "chrome_get_devtools_content":
          return await tabManager.getDevtoolsContent(args.tabId, args);
        
        // 页面导航
        case "chrome_navigate":
          return await pageActions.navigate(args.tabId, args.url, args);
        case "chrome_get_url":
          return await pageActions.getUrl(args.tabId);
        
        // 内容获取
        case "chrome_screenshot":
          return await pageActions.screenshot(args.tabId, { ...args, ctx });
        case "chrome_get_text":
          return await pageActions.getText(args.tabId, args.selector);
        case "chrome_get_elements":
          return await pageActions.getElements(args.tabId, args);
        
        // 资源管理
        case "chrome_list_resources":
          return await pageActions.listResources(args.tabId, args);
        case "chrome_save_resource":
          return await pageActions.saveResource(args.tabId, args.resources, { ...args, ctx });
        
        // 页面交互
        case "chrome_click":
          return await pageActions.click(args.tabId, args.selector, args);
        case "chrome_click_at":
          return await pageActions.clickAt(args.tabId, args.x, args.y, args);
        case "chrome_type":
          return await pageActions.type(args.tabId, args.selector, args.text, args);
        case "chrome_fill":
          return await pageActions.fill(args.tabId, args.selector, args.value);
        case "chrome_evaluate":
          return await pageActions.evaluate(args.tabId, args.script);
        case "chrome_wait_for":
          return await pageActions.waitFor(args.tabId, args.selector, args);
        
        default:
          return { error: "unknown_tool", toolName };
      }
    } catch (err) {
      const message = err?.message ?? String(err);
      log?.error?.("Chrome 工具调用失败", { toolName, error: message });
      return { error: "tool_error", toolName, message };
    }
  },

  /**
   * 获取 Web 管理界面组件定义
   * @returns {object}
   */
  getWebComponent() {
    return {
      moduleName: "chrome",
      displayName: "Chrome 浏览器管理",
      icon: "🌐",
      panelPath: "modules/chrome/web/panel.html"
    };
  },

  /**
   * 获取 HTTP API 路由处理器
   * @returns {Function}
   */
  getHttpHandler() {
    return async (req, res, pathParts) => {
      console.log('[Chrome] Handler called:', { pathParts, method: req?.method });
      
      const [resource, id, action] = pathParts;

      try {
        // GET /api/modules/chrome/panel - 返回管理面板 HTML
        if (resource === "panel" && req.method === "GET") {
          console.log('[Chrome] Serving panel');
          return await this._servePanel(res);
        }

        if (resource === "browsers") {
          if (!id) {
            const browsers = browserManager.listBrowsers();
            return { ok: true, browsers };
          }
          if (action === "close") {
            const result = await browserManager.close(id);
            return result;
          }
          if (action === "tabs") {
            const tabs = await tabManager.listTabs(id);
            return tabs;
          }
          const browser = browserManager.getBrowser(id);
          return browser ? { ok: true, browser } : { error: "browser_not_found", browserId: id };
        }

        if (resource === "tabs") {
          if (id && action === "screenshot") {
            return await pageActions.screenshot(id, {});
          }
          if (id && action === "close") {
            log?.info?.("HTTP请求关闭标签页", { tabId: id, method: req.method });
            const result = await tabManager.closeTab(id);
            log?.info?.("标签页关闭结果", { tabId: id, result });
            return result;
          }
        }

        return { error: "not_found", path: pathParts.join("/") };
      } catch (err) {
        const message = err?.message ?? String(err);
        log?.error?.("Chrome HTTP处理器错误", { error: message });
        return { error: "handler_error", message };
      }
    };
  },

  /**
   * 提供管理面板 HTML
   */
  async _servePanel(res) {
    try {
      const panelDir = path.join(__dirname, "web");
      const htmlPath = path.join(panelDir, "panel.html");
      const cssPath = path.join(panelDir, "panel.css");
      const jsPath = path.join(panelDir, "panel.js");

      let html = "", css = "", js = "";

      if (existsSync(htmlPath)) {
        html = await readFile(htmlPath, "utf8");
      }
      if (existsSync(cssPath)) {
        css = await readFile(cssPath, "utf8");
      }
      if (existsSync(jsPath)) {
        js = await readFile(jsPath, "utf8");
      }

      // 组装完整 HTML
      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chrome 浏览器管理</title>
  <style>${css}</style>
</head>
<body>
  ${html}
  <script>${js}</script>
</body>
</html>`;

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fullHtml);
      return { handled: true };
    } catch (err) {
      log?.error?.("读取面板文件失败", { error: err.message });
      return { error: "read_panel_failed", message: err.message };
    }
  },

  /**
   * 关闭模块并释放资源
   * @returns {Promise<void>}
   */
  async shutdown() {
    log?.info?.("Chrome 模块开始关闭");
    
    if (browserManager) {
      await browserManager.closeAll();
    }
    
    browserManager = null;
    tabManager = null;
    pageActions = null;
    runtime = null;
    
    log?.info?.("Chrome 模块已关闭");
  }
};
