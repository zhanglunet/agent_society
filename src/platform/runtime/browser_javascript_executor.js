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
 * 安全的日志记录函数
 * 当 runtime.log 不可用时，回退到 console
 * @param {object} runtime - Runtime 实例
 * @param {string} level - 日志级别: debug, info, warn, error
 * @param {string} message - 日志消息
 * @param {object} [meta] - 元数据
 */
function safeLog(runtime, level, message, meta = {}) {
  // 尝试使用 runtime 日志系统（需要保持 this 上下文）
  const logger = runtime?.log;
  const logMethod = logger?.[level];
  if (typeof logMethod === "function") {
    try {
      logMethod.call(logger, message, meta);
      return;
    } catch (e) {
      // 日志系统出错，回退到 console
    }
  }
  
  // 回退到 console
  const consoleMethod = console[level] || console.log;
  const timestamp = new Date().toISOString();
  consoleMethod(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta);
}

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
      safeLog(this.runtime, "warn", "Chrome 浏览器未找到，JavaScript 执行将使用降级模式");
      this._browserAvailable = false;
      this._initialized = true;
      return;
    }

    try {
      safeLog(this.runtime, "info", "启动 JavaScript 执行器浏览器", { chromePath });
      
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
        safeLog(this.runtime, "warn", "JavaScript 执行器浏览器已断开连接");
        this._browser = null;
        this._browserAvailable = false;
      });

      safeLog(this.runtime, "info", "JavaScript 执行器浏览器启动成功");
    } catch (err) {
      const message = err?.message ?? String(err);
      safeLog(this.runtime, "warn", "JavaScript 执行器浏览器启动失败，将使用降级模式", { error: message });
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
        safeLog(this.runtime, "info", "关闭 JavaScript 执行器浏览器");
        await this._browser.close();
      } catch (err) {
        safeLog(this.runtime, "warn", "关闭浏览器时出错", { error: err?.message ?? String(err) });
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
   * 验证文件路径是否安全
   * 路径必须是相对于工作区的子路径，不能使用 .. 向上遍历
   * 
   * @param {string} filepath - 要验证的文件路径
   * @returns {{valid: boolean, error?: string}} 验证结果
   */
  _validateFilePath(filepath) {
    if (!filepath || typeof filepath !== 'string') {
      return { valid: false, error: "filepath must be a non-empty string" };
    }

    // 检查是否为绝对路径
    if (path.isAbsolute(filepath)) {
      return { valid: false, error: "filepath must be relative, not absolute" };
    }

    // 规范化路径并检查是否包含 .. 
    const normalized = path.normalize(filepath);
    const parts = normalized.split(path.sep);
    
    // 检查任何部分是否为 .. 
    for (const part of parts) {
      if (part === '..') {
        return { valid: false, error: "filepath cannot contain '..' to traverse upward" };
      }
    }

    // 检查路径是否以 .. 开头
    if (normalized.startsWith('..')) {
      return { valid: false, error: "filepath cannot start with '..'" };
    }

    return { valid: true };
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
    // Canvas 和下载辅助函数
    (function() {
      // Canvas 实例数组（支持多个 canvas）
      const _canvases = [];
      
      // 下载内容数组
      const _downloads = [];
      
      // getCanvas 函数（每次调用创建新实例）
      // path: 工作空间中的完整路径，必须以 .png 结尾，例如 'charts/bar-chart.png'
      window.getCanvas = function(path, width, height) {
        if (typeof path !== 'string' || path.trim() === '') {
          throw new Error('getCanvas: path 参数是必需的，且必须是非空字符串');
        }
        if (!path.trim().toLowerCase().endsWith('.png')) {
          throw new Error('getCanvas: path 参数必须以 .png 结尾');
        }
        width = width || 800;
        height = height || 600;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas._name = path.trim(); // 存储路径到 canvas 对象
        document.getElementById('canvas-container').appendChild(canvas);
        _canvases.push(canvas);
        return canvas;
      };
      
      // downloadToWorkspace 函数 - 将内容保存到工作区
      // filepath: 相对于工作区根的子路径，不能用..向上
      // mimeType: 文件 MIME 类型
      // content: 支持字符串、ArrayBuffer、TypedArray、Blob、Uint8Array 等
      window.downloadToWorkspace = async function(filepath, mimeType, content) {
        // 参数验证
        if (!filepath || typeof filepath !== 'string') {
          throw new Error('downloadToWorkspace: filepath must be a non-empty string');
        }
        if (!mimeType || typeof mimeType !== 'string') {
          throw new Error('downloadToWorkspace: mimeType must be a non-empty string');
        }
        if (content === undefined) {
          throw new Error('downloadToWorkspace: content is required');
        }
        
        // 路径安全验证 - 不能使用 .. 向上遍历
        const normalized = filepath.replace(/\\/g, '/');
        if (normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('/../')) {
          throw new Error('downloadToWorkspace: invalid filepath - path traversal not allowed');
        }
        if (normalized.split('/').some(part => part === '..')) {
          throw new Error('downloadToWorkspace: invalid filepath - cannot contain ".."');
        }
        
        // 转换内容为 base64
        let base64Content;
        let byteLength = 0;
        
        if (content === null) {
          base64Content = '';
        } else if (typeof content === 'string') {
          // 字符串 - 使用 TextEncoder
          const encoder = new TextEncoder();
          const bytes = encoder.encode(content);
          byteLength = bytes.length;
          base64Content = btoa(String.fromCharCode(...bytes));
        } else if (content instanceof ArrayBuffer) {
          // ArrayBuffer
          byteLength = content.byteLength;
          const bytes = new Uint8Array(content);
          base64Content = btoa(String.fromCharCode(...bytes));
        } else if (ArrayBuffer.isView(content)) {
          // TypedArray (Uint8Array, Int8Array, etc.)
          const bytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
          byteLength = bytes.length;
          base64Content = btoa(String.fromCharCode(...bytes));
        } else if (content instanceof Blob) {
          // Blob - 需要异步读取
          const arrayBuffer = await content.arrayBuffer();
          byteLength = arrayBuffer.byteLength;
          const bytes = new Uint8Array(arrayBuffer);
          base64Content = btoa(String.fromCharCode(...bytes));
        } else {
          // 其他类型转为字符串
          const str = String(content);
          const encoder = new TextEncoder();
          const bytes = encoder.encode(str);
          byteLength = bytes.length;
          base64Content = btoa(String.fromCharCode(...bytes));
        }
        
        // 存储下载信息
        _downloads.push({
          filepath: filepath,
          mimeType: mimeType,
          content: base64Content,
          size: byteLength
        });
        
        return { success: true, path: filepath, size: byteLength };
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
      
      // 获取所有下载内容
      window.__getAllDownloads = function() {
        return _downloads;
      };
      
      // 检查是否有下载内容
      window.__hasDownloads = function() {
        return _downloads.length > 0;
      };
      
      // 获取下载数量
      window.__getDownloadCount = function() {
        return _downloads.length;
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
   * @param {string|null} [workspaceId] - 工作区ID（可选，优先于 agentId 查找）
   * @returns {Promise<any>} 执行结果或错误对象
   */
  async execute(args, messageId = null, agentId = null, workspaceId = null) {
    const code = args?.code;
    const input = args?.input;
    const timeout = args?.timeout ?? this._defaultTimeout;
    
    // [WORKSPACE TRACE 3/5] 执行器入口
    console.error(`[WORKSPACE TRACE] BrowserJsExecutor.execute: agentId=${agentId}, messageId=${messageId}, workspaceId=${workspaceId}`);
    console.error(`[WORKSPACE TRACE] this.runtime exists:`, !!this.runtime);
    console.error(`[WORKSPACE TRACE] this.runtime._getAgentTaskId exists:`, !!(this.runtime?._getAgentTaskId));
    
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
      return await this._executeInNode(args, messageId, agentId, workspaceId);
    }

    return await this._executeInBrowser(args, messageId, agentId, timeout, workspaceId);
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
  async _executeInBrowser(args, messageId, agentId, timeout, workspaceId = null) {
    const { code, input } = args;
    let page = null;
    
    // [WORKSPACE TRACE 4/5] 浏览器执行入口
    console.error(`[WORKSPACE TRACE] _executeInBrowser: agentId=${agentId}, messageId=${messageId}`);
    
    try {
      // 创建新标签页
      page = await this._browser.newPage();
      
      // 设置页面内容
      await page.setContent(this._getExecutionPageHTML());
      
      // 直接在页面上下文中注入辅助函数（确保它们存在）
      await page.evaluate(() => {
        // Canvas 实例数组
        if (!window._canvases) window._canvases = [];
        if (!window._downloads) window._downloads = [];
        
        // getCanvas 函数
        if (typeof window.getCanvas !== 'function') {
          window.getCanvas = function(path, width, height) {
            if (typeof path !== 'string' || path.trim() === '') {
              throw new Error('getCanvas: path 参数是必需的');
            }
            if (!path.trim().toLowerCase().endsWith('.png')) {
              throw new Error('getCanvas: path 必须以 .png 结尾');
            }
            width = width || 800;
            height = height || 600;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas._name = path.trim();
            const container = document.getElementById('canvas-container');
            if (container) container.appendChild(canvas);
            window._canvases.push(canvas);
            return canvas;
          };
        }
        
        // downloadToWorkspace 函数
        if (typeof window.downloadToWorkspace !== 'function') {
          window.downloadToWorkspace = async function(filepath, mimeType, content) {
            if (!filepath || typeof filepath !== 'string') {
              throw new Error('downloadToWorkspace: filepath must be a non-empty string');
            }
            if (!mimeType || typeof mimeType !== 'string') {
              throw new Error('downloadToWorkspace: mimeType must be a non-empty string');
            }
            if (content === undefined) {
              throw new Error('downloadToWorkspace: content is required');
            }
            
            const normalized = filepath.replace(/\\/g, '/');
            if (normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('/../')) {
              throw new Error('downloadToWorkspace: path traversal not allowed');
            }
            if (normalized.split('/').some(part => part === '..')) {
              throw new Error('downloadToWorkspace: cannot contain ".."');
            }
            
            let base64Content;
            let byteLength = 0;
            
            if (content === null) {
              base64Content = '';
            } else if (typeof content === 'string') {
              const encoder = new TextEncoder();
              const bytes = encoder.encode(content);
              byteLength = bytes.length;
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              base64Content = btoa(binary);
            } else if (content instanceof ArrayBuffer) {
              byteLength = content.byteLength;
              const bytes = new Uint8Array(content);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              base64Content = btoa(binary);
            } else if (ArrayBuffer.isView(content)) {
              const bytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
              byteLength = bytes.length;
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              base64Content = btoa(binary);
            } else if (content instanceof Blob) {
              const arrayBuffer = await content.arrayBuffer();
              byteLength = arrayBuffer.byteLength;
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              base64Content = btoa(binary);
            } else {
              const str = String(content);
              const encoder = new TextEncoder();
              const bytes = encoder.encode(str);
              byteLength = bytes.length;
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              base64Content = btoa(binary);
            }
            
            window._downloads.push({
              filepath: filepath,
              mimeType: mimeType,
              content: base64Content,
              size: byteLength
            });
            
            return { success: true, path: filepath, size: byteLength };
          };
        }
        
        // 辅助函数
        window.__hasCanvas = function() { return window._canvases.length > 0; };
        window.__getCanvasCount = function() { return window._canvases.length; };
        window.__getAllCanvasSizes = function() {
          return window._canvases.map(c => ({ width: c.width, height: c.height }));
        };
        window.__getAllCanvasNames = function() {
          return window._canvases.map(c => c._name);
        };
        window.__getAllCanvasData = function() {
          return window._canvases.map(c => c.toDataURL('image/png'));
        };
        window.__hasDownloads = function() { return window._downloads.length > 0; };
        window.__getDownloadCount = function() { return window._downloads.length; };
        window.__getAllDownloads = function() { return window._downloads; };
      });
      
      // 执行代码（支持同步和异步）
      const result = await page.evaluate(
        async (userCode, userInput) => {
          // 辅助函数：安全调用 window 上的函数
          const safeCall = (fnName, defaultValue) => {
            try {
              return typeof window[fnName] === 'function' ? window[fnName]() : defaultValue;
            } catch (e) {
              return defaultValue;
            }
          };
          
          try {
            // 使用 AsyncFunction 支持 await
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction('input', 'getCanvas', 'downloadToWorkspace', userCode);
            const value = await fn(userInput, window.getCanvas, window.downloadToWorkspace);
            return {
              success: true,
              result: value,
              hasCanvas: safeCall('__hasCanvas', false),
              canvasCount: safeCall('__getCanvasCount', 0),
              canvasSizes: safeCall('__getAllCanvasSizes', []),
              canvasNames: safeCall('__getAllCanvasNames', []),
              hasDownloads: safeCall('__hasDownloads', false),
              downloadCount: safeCall('__getDownloadCount', 0),
              downloads: safeCall('__getAllDownloads', [])
            };
          } catch (err) {
            return {
              success: false,
              error: err.message || String(err),
              hasCanvas: safeCall('__hasCanvas', false)
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

      // 获取工作区ID（优先使用传入的 workspaceId，否则通过 agentId 查找）
      const resolvedWorkspaceId = workspaceId || (agentId ? this.runtime._getAgentTaskId(agentId) : null);
      
      // 处理下载内容
      let downloadFiles = [];
      if (result.hasDownloads) {
        if (!resolvedWorkspaceId) {
          return { error: "workspace_required", message: "使用 downloadToWorkspace 功能需要提供 workspaceId" };
        }
        
        const downloadResult = await this._saveDownloads(
          result.downloads,
          resolvedWorkspaceId,
          messageId,
          agentId
        );
        
        if (downloadResult.error) {
          return {
            result: result.result,
            error: "download_failed",
            message: downloadResult.message,
            errors: downloadResult.errors
          };
        }
        
        downloadFiles = downloadResult.files || [];
      }
      
      // 如果使用了 Canvas，导出所有图像
      if (result.hasCanvas) {
        if (!resolvedWorkspaceId) {
          return { error: "workspace_required", message: "使用 Canvas 功能需要提供 workspaceId" };
        }
        
        const allCanvasData = await page.evaluate(() => window.__getAllCanvasData());
        const imageResult = await this._saveAllCanvasImages(
          allCanvasData, 
          result.canvasSizes, 
          result.canvasNames,
          messageId, 
          agentId,
          resolvedWorkspaceId
        );
        
        if (imageResult.error) {
          // 构建详细的错误信息，包含所有子错误
          let detailedMessage = imageResult.message || "Canvas 导出失败";
          if (imageResult.errors && imageResult.errors.length > 0) {
            detailedMessage += `; 详细错误: ${JSON.stringify(imageResult.errors)}`;
          }
          
          // 记录详细错误日志
          safeLog(this.runtime, "error", "Canvas 导出失败", {
            error: imageResult.error,
            message: imageResult.message,
            workspaceId: imageResult.workspaceId,
            errors: imageResult.errors,
            partialErrors: imageResult.partialErrors
          });
          
          return {
            result: result.result,
            error: "canvas_export_failed",
            message: detailedMessage,
            workspaceId: imageResult.workspaceId,
            exportErrors: imageResult.errors || imageResult.partialErrors
          };
        }

        // 构建文件信息数组（合并 Canvas 图像和下载文件）
        const canvasFiles = (imageResult.files || []).map(f => ({
          path: typeof f === 'string' ? f : f.path,
          mimeType: "image/png"
        }));
        
        const allFiles = [...canvasFiles, ...downloadFiles];

        return { result: result.result, files: allFiles, workspaceId: imageResult.workspaceId };
      }
      
      // 如果有下载文件但没有 Canvas，返回结果和下载文件列表
      if (downloadFiles.length > 0) {
        return { result: result.result, files: downloadFiles, workspaceId: resolvedWorkspaceId };
      }

      // 转换为 JSON 安全格式
      const jsonSafe = this.toJsonSafeValue(result.result);
      if (jsonSafe.error) return jsonSafe;
      
      return jsonSafe.value;
    } catch (err) {
      const message = err?.message ?? String(err);
      safeLog(this.runtime, "error", "浏览器执行代码失败", { error: message });
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
  async _executeInNode(args, messageId, agentId, workspaceId = null) {
    safeLog(this.runtime, "warn", "使用 Node.js 降级模式执行 JavaScript");
    
    // 使用现有的 JavaScriptExecutor
    // 工作区ID = taskId，必须正确获取
    if (this.runtime._jsExecutor) {
      const resolvedWorkspaceId = workspaceId || (agentId ? this.runtime._getAgentTaskId(agentId) : null);
      
      if (!resolvedWorkspaceId) {
        const errorMsg = `Node模式: 无法获取工作区ID: agentId=${agentId}`;
        safeLog(this.runtime, "error", errorMsg);
        return { error: "workspace_not_found", message: errorMsg, agentId };
      }
      
      return await this.runtime._jsExecutor.execute(args, resolvedWorkspaceId, messageId, agentId);
    }
    
    return { error: "browser_not_available", message: "浏览器不可用且无降级执行器" };
  }

  /**
   * 保存下载内容到工作区
   * @param {Array<{filepath: string, mimeType: string, content: string, size: number}>} downloads - 下载内容数组
   * @param {string} workspaceId - 工作区ID
   * @param {string|null} messageId - 关联的消息ID
   * @param {string|null} agentId - 关联的智能体ID
   * @returns {Promise<object>} 保存结果
   * @private
   */
  async _saveDownloads(downloads, workspaceId, messageId, agentId) {
    if (!downloads || downloads.length === 0) {
      return { files: [] };
    }

    const filePaths = [];
    const errors = [];

    // 路径安全验证
    for (const download of downloads) {
      const pathValidation = this._validateFilePath(download.filepath);
      if (!pathValidation.valid) {
        errors.push({ filepath: download.filepath, error: pathValidation.error });
      }
    }

    if (errors.length > 0) {
      return { error: "invalid_paths", errors };
    }

    // 检查必需参数
    if (!agentId) {
      return { error: "missing_agent_id", message: "缺少 agentId，无法确定操作者" };
    }
    if (!messageId) {
      return { error: "missing_message_id", message: "缺少 messageId，无法记录操作来源" };
    }

    let workspace;
    try {
      workspace = await this.runtime.workspaceManager.getWorkspace(workspaceId);
    } catch (wsErr) {
      const message = wsErr?.message ?? String(wsErr);
      safeLog(this.runtime, "error", "获取工作区失败", { workspaceId, error: message });
      return { error: "workspace_error", message: `无法获取工作区 ${workspaceId}: ${message}` };
    }

    for (const download of downloads) {
      try {
        // 解码 base64 内容
        const buffer = Buffer.from(download.content, 'base64');
        
        // 安全检查：只排除非法文件名字符
        const fileName = download.filepath.replace(/[<>:"|?*]/g, '_');
        
        // 写入文件到工作区
        const writeResult = await workspace.writeFile(fileName, buffer, {
          mimeType: download.mimeType,
          operator: agentId,
          messageId: messageId
        });
        
        filePaths.push({
          path: fileName,
          mimeType: download.mimeType,
          size: buffer.length
        });
        
        safeLog(this.runtime, "info", "downloadToWorkspace 文件已保存", {
          workspaceId,
          filepath: fileName,
          mimeType: download.mimeType,
          size: buffer.length,
          agentId,
          messageId
        });
      } catch (err) {
        const message = err?.message ?? String(err);
        errors.push({ filepath: download.filepath, error: message });
        safeLog(this.runtime, "error", "downloadToWorkspace 保存失败", {
          workspaceId,
          filepath: download.filepath,
          error: message
        });
      }
    }

    if (filePaths.length === 0 && errors.length > 0) {
      return { error: "download_failed", message: "所有下载均失败", errors };
    }

    const response = { files: filePaths };
    if (errors.length > 0) {
      response.partialErrors = errors;
    }

    return response;
  }

  /**
   * 保存所有 Canvas 图像到工作区
   * @param {string[]} dataUrls - Canvas 数据 URL 数组
   * @param {object[]} canvasSizes - Canvas 尺寸数组
   * @param {string[]} canvasNames - Canvas 工件名称数组
   * @param {string|null} messageId - 关联的消息ID
   * @param {string|null} agentId - 关联的智能体ID
   * @param {string|null} workspaceId - 工作区ID（可选，优先于 agentId 查找）
   * @returns {Promise<object>} 保存结果
   * @private
   */
  async _saveAllCanvasImages(dataUrls, canvasSizes, canvasNames, messageId, agentId, workspaceId = null) {
    // [WORKSPACE TRACE 5/5] 保存 Canvas 图像入口
    console.error(`[WORKSPACE TRACE] _saveAllCanvasImages: agentId=${agentId}, messageId=${messageId}, workspaceId=${workspaceId}`);
    console.error(`[WORKSPACE TRACE] this.runtime exists:`, !!this.runtime);
    
    if (!dataUrls || dataUrls.length === 0) {
      return { error: "no_canvas_data" };
    }

    const filePaths = [];
    const errors = [];
    
    // 工作区ID（优先使用传入的 workspaceId，否则通过 agentId 查找）
    const resolvedWorkspaceId = workspaceId || (agentId ? this.runtime._getAgentTaskId(agentId) : null);
    
    // [WORKSPACE TRACE] 计算工作区ID
    console.error(`[WORKSPACE TRACE] resolvedWorkspaceId:`, resolvedWorkspaceId);
    
    if (!resolvedWorkspaceId) {
      const errorMsg = `无法获取工作区ID: agentId=${agentId}, workspaceId=${workspaceId}`;
      console.error(`[WORKSPACE TRACE ERROR] ${errorMsg}`);
      safeLog(this.runtime, "error", errorMsg);
      return { error: "workspace_not_found", message: errorMsg, agentId };
    }
    
    // 记录关键参数
    console.error(`[WORKSPACE TRACE] 最终 workspaceId=${workspaceId}`);
    safeLog(this.runtime, "info", "开始保存 Canvas 图像", {
      workspaceId,
      agentId: agentId ?? null,
      messageId: messageId ?? null,
      canvasCount: dataUrls.length
    });
    
    let workspace;
    try {
      workspace = await this.runtime.workspaceManager.getWorkspace(workspaceId);
    } catch (wsErr) {
      const message = wsErr?.message ?? String(wsErr);
      safeLog(this.runtime, "error", "获取工作区失败", { workspaceId, error: message });
      return { error: "workspace_error", message: `无法获取工作区 ${workspaceId}: ${message}` };
    }

    for (let i = 0; i < dataUrls.length; i++) {
      const dataUrl = dataUrls[i];
      const canvasSize = canvasSizes[i] || { width: 0, height: 0 };
      const name = canvasNames[i];

      // 验证 name 必须存在且以 .png 结尾
      if (!name || typeof name !== 'string' || name.trim() === '') {
        errors.push({ index: i, error: "Canvas 缺少必需的 name 属性" });
        continue;
      }
      const trimmedName = name.trim();
      if (!trimmedName.toLowerCase().endsWith('.png')) {
        errors.push({ index: i, error: "Canvas 路径必须以 .png 结尾" });
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
        
        // 安全检查：只排除非法文件名字符：< > : " | ? *（保留 / 用于路径分隔，保留 \ 用于 Windows 路径）
        const fileName = trimmedName.replace(/[<>:"|?*]/g, '_');
        
        // 检查 writeFile 必需的参数
        if (!agentId) {
          throw new Error("缺少 agentId，无法确定操作者");
        }
        if (!messageId) {
          throw new Error("缺少 messageId，无法记录操作来源");
        }
        
        // 写入文件到工作区
        const writeResult = await workspace.writeFile(fileName, pngBuffer, {
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
        
        safeLog(this.runtime, "info", "保存浏览器 Canvas 图像成功", {
          workspaceId,
          path: fileName,
          fullPath: writeResult?.path ?? fileName,
          userName: name.trim(),
          width: canvasSize.width,
          height: canvasSize.height,
          size: pngBuffer.length,
          index: i,
          total: dataUrls.length
        });
      } catch (err) {
        const message = err?.message ?? String(err);
        errors.push({ index: i, name: name.trim(), error: message });
        safeLog(this.runtime, "error", "保存浏览器 Canvas 图像失败", {
          workspaceId,
          index: i,
          name: name.trim(),
          error: message,
          hasAgentId: !!agentId,
          hasMessageId: !!messageId
        });
      }
    }

    if (filePaths.length === 0 && errors.length > 0) {
      return { error: "canvas_export_failed", message: "所有 Canvas 导出均失败", workspaceId, errors };
    }

    // 构建文件信息数组
    const files = filePaths.map(p => ({
      path: p,
      mimeType: "image/png"
    }));

    const response = { files, workspaceId };
    if (errors.length > 0) {
      response.partialErrors = errors;
    }
    
    safeLog(this.runtime, "info", "Canvas 图像保存完成", {
      workspaceId,
      savedCount: filePaths.length,
      errorCount: errors.length,
      files: filePaths
    });
    
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
