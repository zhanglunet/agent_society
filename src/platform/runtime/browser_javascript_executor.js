/**
 * 浏览器 JavaScript 执行器模块
 * 
 * 本模块负责在 headless Chrome 浏览器中执行用户提供的 JavaScript 代码。
 * 
 * 【设计初衷】
 * 智能体在处理任务时，经常需要执行 JavaScript 代码进行计算、数据处理、Canvas 绘图等操作。
 * 通过在真实浏览器环境中执行代码，可以获得完整的浏览器 API 支持，避免 Node.js 环境下的兼容性问题。
 * 
 * 【主要功能】
 * 1. 在 headless Chrome 中执行 JavaScript 代码
 * 2. 支持同步和异步代码（Promise、await）
 * 3. 支持 Canvas 绘图并自动导出图像
 * 4. 每次执行创建新标签页，确保完全隔离
 * 
 * 【执行模型】
 * - 使用独立的 Chrome 实例，与其他浏览器操作分离
 * - 每次执行创建新标签页，执行完毕后立即关闭
 * - 浏览器实例在多次执行间复用，减少启动开销
 * 
 * @module runtime/browser_javascript_executor
 */

import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * 浏览器 JavaScript 执行器类
 */
export class BrowserJavaScriptExecutor {
  /**
   * 创建浏览器 JavaScript 执行器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
    
    /** @type {import('puppeteer-core').Browser|null} 浏览器实例 */
    this._browser = null;
    
    /** @type {boolean} 浏览器是否可用 */
    this._browserAvailable = false;
    
    /** @type {boolean} 是否已初始化 */
    this._initialized = false;
    
    /** @type {number} 默认超时时间（毫秒） */
    this._defaultTimeout = 30000;
  }

  /**
   * 查找 Chrome 可执行文件路径
   * @returns {string|null}
   * @private
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
      const macPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      if (existsSync(macPath)) return macPath;
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
    
    return null;
  }


  /**
   * 初始化浏览器环境
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;
    
    const chromePath = this._findChromePath();
    
    if (!chromePath) {
      this.runtime.log?.warn?.("Chrome 浏览器未找到，JavaScript 执行将使用降级模式");
      this._browserAvailable = false;
      this._initialized = true;
      return;
    }

    try {
      this.runtime.log?.info?.("启动 JavaScript 执行器浏览器", { chromePath });
      
      this._browser = await puppeteer.launch({
        headless: "new",
        executablePath: chromePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor"
        ]
      });

      this._browserAvailable = true;
      this._initialized = true;
      
      // 监听浏览器断开连接
      this._browser.on("disconnected", () => {
        this.runtime.log?.warn?.("JavaScript 执行器浏览器已断开连接");
        this._browser = null;
        this._browserAvailable = false;
      });

      this.runtime.log?.info?.("JavaScript 执行器浏览器启动成功");
    } catch (err) {
      const message = err?.message ?? String(err);
      this.runtime.log?.warn?.("JavaScript 执行器浏览器启动失败，将使用降级模式", { error: message });
      this._browserAvailable = false;
      this._initialized = true;
    }
  }

  /**
   * 关闭浏览器环境
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this._browser) {
      try {
        this.runtime.log?.info?.("关闭 JavaScript 执行器浏览器");
        await this._browser.close();
      } catch (err) {
        this.runtime.log?.warn?.("关闭浏览器时出错", { error: err?.message ?? String(err) });
      } finally {
        this._browser = null;
        this._browserAvailable = false;
      }
    }
    this._initialized = false;
  }

  /**
   * 确保浏览器实例存在
   * @returns {Promise<boolean>} 浏览器是否可用
   * @private
   */
  async _ensureBrowser() {
    if (!this._initialized) {
      await this.init();
    }
    
    // 如果浏览器断开了，尝试重新启动
    if (this._initialized && !this._browser && this._browserAvailable === false) {
      this._initialized = false;
      await this.init();
    }
    
    return this._browserAvailable && this._browser !== null;
  }

  /**
   * 获取执行页面的 HTML 模板
   * @returns {string}
   * @private
   */
  _getExecutionPageHTML() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>JS Executor</title>
  <style>
    body { margin: 0; padding: 0; }
    #canvas-container { display: none; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <script>
    // Canvas 辅助函数
    (function() {
      // Canvas 实例数组（支持多个 canvas）
      const _canvases = [];
      
      // getCanvas 函数（每次调用创建新实例）
      window.getCanvas = function(name, width, height) {
        if (typeof name !== 'string' || name.trim() === '') {
          throw new Error('getCanvas: name 参数是必需的，且必须是非空字符串');
        }
        width = width || 800;
        height = height || 600;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas._name = name.trim(); // 存储工件名称到 canvas 对象
        document.getElementById('canvas-container').appendChild(canvas);
        _canvases.push(canvas);
        return canvas;
      };
      
      // 获取所有 Canvas 数据（供外部调用）
      window.__getAllCanvasData = function() {
        return _canvases.map(canvas => canvas.toDataURL('image/png'));
      };
      
      // 检查是否使用了 Canvas
      window.__hasCanvas = function() {
        return _canvases.length > 0;
      };
      
      // 获取 Canvas 数量
      window.__getCanvasCount = function() {
        return _canvases.length;
      };
      
      // 获取所有 Canvas 名称
      window.__getAllCanvasNames = function() {
        return _canvases.map(canvas => {
          if (!canvas._name) {
            throw new Error('Canvas 缺少必需的 name 属性');
          }
          return canvas._name;
        });
      };
      
      // 获取所有 Canvas 尺寸
      window.__getAllCanvasSizes = function() {
        return _canvases.map(canvas => ({ width: canvas.width, height: canvas.height }));
      };
    })();
  </script>
</body>
</html>`;
  }


  /**
   * 执行 JavaScript 代码
   * 
   * @param {object} args - 执行参数
   * @param {string} args.code - 要执行的 JavaScript 代码
   * @param {any} [args.input] - 传入代码的输入参数
   * @param {string|null} [messageId] - 关联的消息ID
   * @param {string|null} [agentId] - 关联的智能体ID
   * @returns {Promise<any>} 执行结果或错误对象
   */
  async execute(args, messageId = null, agentId = null) {
    const code = args?.code;
    const input = args?.input;
    const timeout = args?.timeout ?? this._defaultTimeout;
    
    // 验证代码参数
    if (typeof code !== "string") {
      return { error: "invalid_args", message: "code must be a string" };
    }
    if (code.length > 50000) {
      return { error: "code_too_large", maxLength: 50000, length: code.length };
    }

    // 检测被禁止的代码模式
    const blocked = this._detectBlockedTokens(code);
    if (blocked.length > 0) {
      return { error: "blocked_code", blocked };
    }

    // 确保浏览器可用
    const browserReady = await this._ensureBrowser();
    
    if (!browserReady) {
      // 降级到 Node.js 执行模式
      return await this._executeInNode(args, messageId, agentId);
    }

    return await this._executeInBrowser(args, messageId, agentId, timeout);
  }

  /**
   * 检测被禁止的代码模式
   * @param {string} code - 要检测的代码
   * @returns {string[]} 检测到的被禁止模式名称列表
   * @private
   */
  _detectBlockedTokens(code) {
    // 使用正则匹配完整单词边界，避免误报（如 "required" 匹配 "require"）
    const patterns = [
      { name: "require", regex: /\brequire\s*\(/ },
      { name: "process", regex: /\bprocess\./ },
      { name: "child_process", regex: /\bchild_process\b/ },
      { name: "fs", regex: /\bfs\./ },
      { name: "os", regex: /\bos\./ },
      { name: "net", regex: /\bnet\./ },
      { name: "http", regex: /\bhttp\./ },
      { name: "https", regex: /\bhttps\./ },
      { name: "dgram", regex: /\bdgram\./ },
      { name: "worker_threads", regex: /\bworker_threads\b/ },
      { name: "vm", regex: /\bvm\./ },
      { name: "import()", regex: /\bimport\s*\(/ },
      { name: "Deno", regex: /\bDeno\./ },
      { name: "Bun", regex: /\bBun\./ }
    ];
    const found = [];
    for (const p of patterns) {
      if (p.regex.test(code)) found.push(p.name);
    }
    return found;
  }

  /**
   * 在浏览器中执行代码
   * @private
   */
  async _executeInBrowser(args, messageId, agentId, timeout) {
    const { code, input } = args;
    let page = null;
    
    try {
      // 创建新标签页
      page = await this._browser.newPage();
      
      // 设置页面内容
      await page.setContent(this._getExecutionPageHTML());
      
      // 执行代码（支持同步和异步）
      const result = await page.evaluate(
        async (userCode, userInput) => {
          try {
            // 使用 AsyncFunction 支持 await
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction('input', 'getCanvas', userCode);
            const value = await fn(userInput, window.getCanvas);
            return {
              success: true,
              result: value,
              hasCanvas: window.__hasCanvas(),
              canvasCount: window.__getCanvasCount(),
              canvasSizes: window.__getAllCanvasSizes(),
              canvasNames: window.__getAllCanvasNames()
            };
          } catch (err) {
            return {
              success: false,
              error: err.message || String(err),
              hasCanvas: window.__hasCanvas()
            };
          }
        },
        code,
        input
      ).catch(err => {
        // 处理 page.evaluate 本身的错误（如超时）
        const message = err?.message ?? String(err);
        if (message.includes("timeout") || message.includes("Timeout")) {
          return { success: false, error: "execution_timeout", timedOut: true };
        }
        return { success: false, error: message };
      });

      // 如果执行失败，返回错误
      if (!result.success) {
        if (result.timedOut) {
          return { error: "execution_timeout", timeoutMs: timeout };
        }
        return { error: "js_execution_failed", message: result.error };
      }

      // 如果使用了 Canvas，导出所有图像
      if (result.hasCanvas) {
        const allCanvasData = await page.evaluate(() => window.__getAllCanvasData());
        const imageResult = await this._saveAllCanvasImages(
          allCanvasData, 
          result.canvasSizes, 
          result.canvasNames,
          messageId, 
          agentId
        );
        
        if (imageResult.error) {
          return { result: result.result, error: "canvas_export_failed", message: imageResult.message };
        }
        
        return { result: result.result, filePaths: imageResult.filePaths };
      }

      // 转换为 JSON 安全格式
      const jsonSafe = this.toJsonSafeValue(result.result);
      if (jsonSafe.error) return jsonSafe;
      
      return jsonSafe.value;
    } catch (err) {
      const message = err?.message ?? String(err);
      this.runtime.log?.error?.("浏览器执行代码失败", { error: message });
      return { error: "js_execution_failed", message };
    } finally {
      // 关闭标签页
      if (page) {
        try {
          await page.close();
        } catch {
          // 忽略关闭错误
        }
      }
    }
  }


  /**
   * 降级到 Node.js 执行模式
   * @private
   */
  async _executeInNode(args, messageId, agentId) {
    this.runtime.log?.warn?.("使用 Node.js 降级模式执行 JavaScript");
    
    // 使用现有的 JavaScriptExecutor
    if (this.runtime._jsExecutor) {
      return await this.runtime._jsExecutor.execute(args, messageId, agentId);
    }
    
    return { error: "browser_not_available", message: "浏览器不可用且无降级执行器" };
  }

  /**
   * 保存所有 Canvas 图像到工作区
   * @param {string[]} dataUrls - Canvas 数据 URL 数组
   * @param {object[]} canvasSizes - Canvas 尺寸数组
   * @param {string[]} canvasNames - Canvas 工件名称数组
   * @param {string|null} messageId - 关联的消息ID
   * @param {string|null} agentId - 关联的智能体ID
   * @returns {Promise<object>} 保存结果
   * @private
   */
  async _saveAllCanvasImages(dataUrls, canvasSizes, canvasNames, messageId, agentId) {
    if (!dataUrls || dataUrls.length === 0) {
      return { error: "no_canvas_data" };
    }

    const filePaths = [];
    const errors = [];
    
    // 获取智能体对应的工作区
    const workspaceId = agentId || "system";
    const workspace = await this.runtime.workspaceManager.getWorkspace(workspaceId);

    for (let i = 0; i < dataUrls.length; i++) {
      const dataUrl = dataUrls[i];
      const canvasSize = canvasSizes[i] || { width: 0, height: 0 };
      const name = canvasNames[i];

      // 验证 name 必须存在
      if (!name || typeof name !== 'string' || name.trim() === '') {
        errors.push({ index: i, error: "Canvas 缺少必需的 name 属性" });
        continue;
      }

      try {
        // 解析 data URL
        const matches = dataUrl.match(/^data:image\/png;base64,(.+)$/);
        if (!matches) {
          errors.push({ index: i, error: "无效的 Canvas 数据格式" });
          continue;
        }
        
        const base64Data = matches[1];
        const pngBuffer = Buffer.from(base64Data, "base64");
        
        // 生成文件名：canvas/名称_时间戳.png
        const sanitizedName = name.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fileName = `canvas/${sanitizedName}.png`;
        
        // 写入文件到工作区
        await workspace.writeFile(fileName, pngBuffer, {
          mimeType: "image/png",
          operator: agentId,
          messageId: messageId,
          meta: {
            name: name.trim(),
            width: canvasSize.width,
            height: canvasSize.height,
            source: "browser-canvas",
            canvasIndex: i
          }
        });
        
        filePaths.push(fileName);
        
        this.runtime.log?.info?.("保存浏览器 Canvas 图像", {
          workspaceId,
          path: fileName,
          userName: name.trim(),
          width: canvasSize.width,
          height: canvasSize.height,
          index: i,
          total: dataUrls.length
        });
      } catch (err) {
        const message = err?.message ?? String(err);
        errors.push({ index: i, error: message });
        this.runtime.log?.error?.("保存浏览器 Canvas 图像失败", {
          index: i,
          error: message
        });
      }
    }

    if (filePaths.length === 0 && errors.length > 0) {
      return { error: "canvas_export_failed", message: "所有 Canvas 导出均失败", errors };
    }

    const response = { filePaths };
    if (errors.length > 0) {
      response.partialErrors = errors;
    }
    return response;
  }

  /**
   * 将值转换为 JSON 安全格式
   * @param {any} value - 要转换的值
   * @returns {{value?: any, error?: string}}
   */
  toJsonSafeValue(value) {
    if (value === undefined) return { value: null };
    try {
      const json = JSON.stringify(value);
      if (json === undefined) return { value: null };
      if (json.length > 200000) {
        return { error: "result_too_large", maxJsonLength: 200000, jsonLength: json.length };
      }
      return { value: JSON.parse(json) };
    } catch (err) {
      const message = err?.message ?? String(err);
      return { error: "non_json_serializable_return", message };
    }
  }

  /**
   * 检查浏览器是否可用
   * @returns {boolean}
   */
  isBrowserAvailable() {
    return this._browserAvailable && this._browser !== null;
  }
}
