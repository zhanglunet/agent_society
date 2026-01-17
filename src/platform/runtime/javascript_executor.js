/**
 * JavaScript 执行器模块
 * 
 * 本模块负责安全执行用户提供的 JavaScript 代码，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 智能体在处理任务时，经常需要进行精确计算、数据转换、日期处理等操作。
 * 由于 LLM 在数值计算方面不够可靠，因此提供一个安全的 JavaScript 执行环境，
 * 让智能体可以通过代码来完成这些需要精确结果的任务。
 * 
 * 【主要功能】
 * 1. 执行用户提供的 JavaScript 代码
 * 2. 检测并阻止危险代码模式（如文件系统、网络访问等）
 * 3. 支持 Canvas 绘图功能
 * 4. 将执行结果转换为 JSON 安全格式
 * 
 * 【安全机制】
 * - 代码在隔离环境中执行（new Function）
 * - 禁用 require、process、fs 等危险 API
 * - 限制代码长度和结果大小
 * - 检测危险代码模式
 * 
 * 【使用流程】
 * 1. Runtime 收到 run_javascript 工具调用
 * 2. 调用 JavaScriptExecutor.execute() 执行代码
 * 3. 返回执行结果或错误信息
 * 
 * 【与其他模块的关系】
 * - 被 ToolExecutor 调用来处理 run_javascript 工具
 * - 使用 Runtime 的 artifacts 存储 Canvas 生成的图像
 * 
 * @module runtime/javascript_executor
 */

import path from "node:path";

/**
 * JavaScript 执行器类
 * 
 * 提供安全的 JavaScript 代码执行环境，支持 Canvas 绘图。
 */
export class JavaScriptExecutor {
  /**
   * 创建 JavaScript 执行器实例
   * 
   * @param {object} runtime - Runtime 实例引用，用于访问 artifacts 等共享资源
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 执行 JavaScript 代码
   * 
   * 【执行流程】
   * 1. 验证代码参数
   * 2. 检测危险代码模式
   * 3. 准备执行环境（包括 Canvas 支持）
   * 4. 执行代码并获取结果
   * 5. 如果使用了 Canvas，保存生成的图像
   * 6. 返回 JSON 安全的结果
   * 
   * @param {object} args - 执行参数
   * @param {string} args.code - 要执行的 JavaScript 代码（函数体形式）
   * @param {any} [args.input] - 传入代码的输入参数
   * @param {string|null} [messageId] - 关联的消息ID（用于 Canvas 图像元数据）
   * @param {string|null} [agentId] - 关联的智能体ID（用于 Canvas 图像元数据）
   * @returns {Promise<any>} 执行结果或错误对象
   * 
   * @example
   * // 简单计算
   * const result = await executor.execute({ code: 'return 1 + 2;' });
   * // result: 3
   * 
   * @example
   * // 使用输入参数
   * const result = await executor.execute({ 
   *   code: 'return input.a + input.b;', 
   *   input: { a: 1, b: 2 } 
   * });
   * // result: 3
   * 
   * @example
   * // Canvas 绘图
   * const result = await executor.execute({
   *   code: `
   *     const canvas = getCanvas(400, 300);
   *     const ctx = canvas.getContext('2d');
   *     ctx.fillStyle = 'red';
   *     ctx.fillRect(50, 50, 100, 100);
   *     return 'done';
   *   `
   * });
   * // result: { result: 'done', images: ['xxx.png'] }
   */
  async execute(args, messageId = null, agentId = null) {
    const code = args?.code;
    const input = args?.input;
    
    // 验证代码参数
    if (typeof code !== "string") {
      return { error: "invalid_args", message: "code must be a string" };
    }
    if (code.length > 20000) {
      return { error: "code_too_large", maxLength: 20000, length: code.length };
    }

    // 检测危险代码模式
    const blocked = this.detectBlockedTokens(code);
    if (blocked.length > 0) {
      return { error: "blocked_code", blocked };
    }

    // Canvas 支持：预加载 canvas 库并创建容器数组
    const canvasInstances = [];
    let canvasError = null;
    let createCanvasFn = null;

    // 预加载 @napi-rs/canvas 库（会自动加载系统字体，包括中文字体）
    try {
      const canvasModule = await import("@napi-rs/canvas");
      createCanvasFn = canvasModule.createCanvas;
    } catch (err) {
      // Canvas 库不可用，但不影响普通 JS 执行
      canvasError = err;
    }

    // 定义 getCanvas 函数（每次调用创建新实例）
    const getCanvas = (width = 800, height = 600) => {
      if (!createCanvasFn) {
        throw new Error("Canvas 功能不可用，请确保 @napi-rs/canvas 包已安装");
      }
      const newCanvas = createCanvasFn(width, height);
      canvasInstances.push(newCanvas);
      return newCanvas;
    };

    try {
      // 构建安全的执行环境前置代码
      // 禁用危险的全局对象和函数
      const prelude =
        '"use strict";\n' +
        "const require=undefined, process=undefined, globalThis=undefined, module=undefined, exports=undefined, __filename=undefined, __dirname=undefined;\n" +
        "const fetch=undefined, XMLHttpRequest=undefined, WebSocket=undefined;\n";
      
      // 创建函数并执行
      const fn = new Function("input", "getCanvas", prelude + String(code));
      let value = fn(input, getCanvas);
      
      // 如果返回 Promise，等待其完成
      if (value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function") {
        value = await value;
      }
      
      // 转换为 JSON 安全格式
      const jsonSafe = this.toJsonSafeValue(value);
      if (jsonSafe.error) return jsonSafe;

      // 如果使用了 Canvas，自动导出并保存所有图像
      if (canvasInstances.length > 0) {
        return await this._saveAllCanvasImages(canvasInstances, jsonSafe.value, messageId, agentId);
      }

      return jsonSafe.value;
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      // 检查是否是 Canvas 库加载错误
      if (canvasError) {
        return { error: "canvas_not_available", message: "Canvas 功能不可用，请安装 @napi-rs/canvas 包" };
      }
      return { error: "js_execution_failed", message };
    }
  }

  /**
   * 保存所有 Canvas 生成的图像到工件库
   * 
   * @param {object[]} canvasInstances - Canvas 实例数组
   * @param {any} result - 代码执行结果
   * @param {string|null} messageId - 关联的消息ID
   * @param {string|null} agentId - 关联的智能体ID
   * @returns {Promise<object>} 包含结果和图像文件名数组的对象
   * @private
   */
  async _saveAllCanvasImages(canvasInstances, result, messageId, agentId) {
    const imageFiles = [];
    const errors = [];

    for (let i = 0; i < canvasInstances.length; i++) {
      const canvas = canvasInstances[i];
      try {
        const { randomUUID } = await import("node:crypto");
        const { writeFile } = await import("node:fs/promises");
        const pngBuffer = canvas.toBuffer("image/png");
        const artifactId = randomUUID();
        const extension = ".png";
        const fileName = `${artifactId}${extension}`;
        const filePath = path.resolve(this.runtime.artifacts.artifactsDir, fileName);
        const createdAt = new Date().toISOString();
        
        await this.runtime.artifacts.ensureReady();
        await writeFile(filePath, pngBuffer);
        
        // 写入元信息文件
        const metadata = {
          id: artifactId,
          extension,
          type: "image",
          createdAt,
          messageId: messageId,
          agentId: agentId,
          width: canvas.width,
          height: canvas.height,
          source: "canvas",
          canvasIndex: i
        };
        await this.runtime.artifacts._writeMetadata(artifactId, metadata);
        
        imageFiles.push(fileName);
        
        void this.runtime.log?.info?.("保存 Canvas 图像", {
          fileName,
          width: canvas.width,
          height: canvas.height,
          index: i,
          total: canvasInstances.length
        });
      } catch (exportErr) {
        const exportMessage = exportErr && typeof exportErr.message === "string" ? exportErr.message : String(exportErr ?? "unknown error");
        errors.push({ index: i, error: exportMessage });
        void this.runtime.log?.error?.("保存 Canvas 图像失败", {
          index: i,
          error: exportMessage
        });
      }
    }

    if (imageFiles.length === 0 && errors.length > 0) {
      return { result, error: "canvas_export_failed", message: "所有 Canvas 导出均失败", errors };
    }

    const response = { result, images: imageFiles };
    if (errors.length > 0) {
      response.partialErrors = errors;
    }
    return response;
  }

  /**
   * 保存 Canvas 生成的图像到工件库
   * 
   * @param {object} canvasInstance - Canvas 实例
   * @param {any} result - 代码执行结果
   * @param {string|null} messageId - 关联的消息ID
   * @param {string|null} agentId - 关联的智能体ID
   * @returns {Promise<object>} 包含结果和图像文件名的对象
   * @private
   */
  async _saveCanvasImage(canvasInstance, result, messageId, agentId) {
    try {
      const { randomUUID } = await import("node:crypto");
      const { writeFile } = await import("node:fs/promises");
      const pngBuffer = canvasInstance.toBuffer("image/png");
      const artifactId = randomUUID();
      const extension = ".png";
      const fileName = `${artifactId}${extension}`;
      const filePath = path.resolve(this.runtime.artifacts.artifactsDir, fileName);
      const createdAt = new Date().toISOString();
      
      await this.runtime.artifacts.ensureReady();
      await writeFile(filePath, pngBuffer);
      
      // 写入元信息文件
      const metadata = {
        id: artifactId,
        extension,
        type: "image",
        createdAt,
        messageId: messageId,
        agentId: agentId,
        width: canvasInstance.width,
        height: canvasInstance.height,
        source: "canvas"
      };
      await this.runtime.artifacts._writeMetadata(artifactId, metadata);
      
      void this.runtime.log?.info?.("保存 Canvas 图像", {
        fileName,
        width: canvasInstance.width,
        height: canvasInstance.height
      });
      
      return { result, images: [fileName] };
    } catch (exportErr) {
      const exportMessage = exportErr && typeof exportErr.message === "string" ? exportErr.message : String(exportErr ?? "unknown error");
      return { result, error: "canvas_export_failed", message: exportMessage };
    }
  }

  /**
   * 检测代码中的危险模式
   * 
   * 【检测的危险模式】
   * - require() - 模块加载
   * - process. - 进程访问
   * - child_process - 子进程
   * - fs. - 文件系统
   * - os. - 操作系统
   * - net./http./https./dgram. - 网络访问
   * - worker_threads - 工作线程
   * - vm. - 虚拟机
   * - import() - 动态导入
   * - Deno./Bun. - 其他运行时
   * 
   * @param {string} code - 要检测的代码
   * @returns {string[]} 检测到的危险模式名称数组
   */
  detectBlockedTokens(code) {
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
   * 将值转换为 JSON 安全格式
   * 
   * 【转换规则】
   * - undefined 转换为 null
   * - 检查结果是否可以 JSON 序列化
   * - 限制结果大小不超过 200KB
   * 
   * @param {any} value - 要转换的值
   * @returns {{value?: any, error?: string}} 转换结果或错误
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
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      return { error: "non_json_serializable_return", message };
    }
  }
}
