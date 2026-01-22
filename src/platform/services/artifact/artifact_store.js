import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { BinaryDetector } from "./binary_detector.js";
import { IdGenerator } from "./id_generator.js";

/**
 * 元信息文件后缀
 */
const META_EXTENSION = ".meta";

/**
 * 提供最小可用的工件存储：将工件写入 data/artifacts 并用 ref 引用。
 * 工件文件只保存原始内容，元信息保存在同名的 .meta 后缀的 JSON 文件里。
 */
export class ArtifactStore {
  /**
   * @param {{artifactsDir:string, logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}} options
   */
  constructor(options) {
    this.artifactsDir = options.artifactsDir;
    this.log = options.logger ?? createNoopModuleLogger();
    this.binaryDetector = new BinaryDetector({ logger: this.log });
    
    // 初始化ID生成器，状态文件保存在artifacts目录的父目录（通常是state目录）
    const stateDir = path.dirname(this.artifactsDir);
    this.idGenerator = new IdGenerator({ stateDir });
  }

  /**
   * 确保工件目录存在。
   * @returns {Promise<void>}
   */
  async ensureReady() {
    await mkdir(this.artifactsDir, { recursive: true });
    await this.idGenerator.init();
  }

  /**
   * 写入工件元信息文件。
   * @param {string} artifactId - 工件ID
   * @param {object} metadata - 元信息对象
   * @returns {Promise<void>}
   */
  async _writeMetadata(artifactId, metadata) {
    const metaFilePath = path.resolve(this.artifactsDir, `${artifactId}${META_EXTENSION}`);
    await writeFile(metaFilePath, JSON.stringify(metadata, null, 2), "utf8");
    void this.log.debug("写入工件元信息", { id: artifactId, metaFile: `${artifactId}${META_EXTENSION}` });
  }

  /**
   * 读取工件元信息文件。
   * @param {string} artifactId - 工件ID
   * @returns {Promise<object|null>} 元信息对象，不存在时返回 null
   */
  async getMetadata(artifactId) {
    const metaFilePath = path.resolve(this.artifactsDir, `${artifactId}${META_EXTENSION}`);
    try {
      const raw = await readFile(metaFilePath, "utf8");
      const metadata = JSON.parse(raw);
      void this.log.debug("读取工件元信息成功", { id: artifactId });
      return metadata;
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        void this.log.debug("工件元信息文件不存在", { id: artifactId });
        return null;
      }
      throw err;
    }
  }

  /**
   * 写入工件并返回引用。
   * 工件文件只保存原始内容（content），元信息保存在独立的 .meta 文件中。
   * 
   * 【文件扩展名规则】
   * - 根据 type 参数确定文件扩展名
   * - text/html, text/xml, text/css, text/javascript 等使用对应扩展名
   * - text/plain, text/* 使用 .txt
   * - application/json, *\/json 使用 .json
   * - 未指定 type 时，根据 content 类型判断：对象/数组默认 .json，字符串默认 .txt
   * 
   * 【内容保存规则】
   * - 字符串类型：直接保存原始字符串内容（不进行 JSON 序列化）
   * - 对象/数组类型：序列化为标准 JSON 格式保存
   * - Buffer/Blob/ArrayBuffer：保存为二进制文件
   * 
   * @param {{type:string, content:any, name:string, meta?:object, messageId?:string}} artifact
   * @returns {Promise<string>} 工件ID
   */
  async putArtifact(artifact) {
    // 验证必需参数
    if (!artifact.name || typeof artifact.name !== 'string' || artifact.name.trim() === '') {
      throw new Error('工件名称是必需参数，且不能为空');
    }

    await this.ensureReady();
    const id = await this.idGenerator.next();
    const createdAt = new Date().toISOString();
    
    // 检测内容类型
    const isBinaryContent = Buffer.isBuffer(artifact.content) || 
                           artifact.content instanceof ArrayBuffer ||
                           (typeof Blob !== 'undefined' && artifact.content instanceof Blob);
    const isObjectContent = !isBinaryContent && 
                           typeof artifact.content === 'object' && 
                           artifact.content !== null;
    const isStringContent = typeof artifact.content === 'string';
    
    // 根据 type 和 content 类型确定文件扩展名
    let extension;
    if (artifact.type) {
      extension = this._getExtensionFromType(artifact.type);
    } else {
      // 未指定 type 时，根据 content 类型判断
      if (isObjectContent) {
        extension = ".json";
      } else if (isStringContent) {
        extension = ".txt";
      } else if (isBinaryContent) {
        extension = ".bin";
      } else {
        extension = ".json"; // 默认 JSON
      }
    }
    
    const filePath = path.resolve(this.artifactsDir, `${id}${extension}`);
    
    // 根据内容类型决定如何保存
    let contentToWrite;
    let encoding = "utf8";
    
    if (isBinaryContent) {
      // 二进制内容：直接保存
      contentToWrite = Buffer.isBuffer(artifact.content) 
        ? artifact.content 
        : Buffer.from(artifact.content);
      encoding = null; // 二进制模式
      void this.log.debug("工件内容为二进制，直接保存", { id, type: artifact.type });
    } else if (isStringContent) {
      // 字符串类型：直接保存原始内容（不进行 JSON 序列化）
      contentToWrite = artifact.content;
      void this.log.debug("工件内容为字符串，直接保存", { id, type: artifact.type });
    } else {
      // 对象或数组类型：序列化为标准 JSON 格式
      contentToWrite = JSON.stringify(artifact.content, null, 2);
      void this.log.debug("工件内容为对象，序列化为JSON", { id, type: artifact.type });
    }
    
    // 写入文件
    if (encoding) {
      await writeFile(filePath, contentToWrite, encoding);
    } else {
      await writeFile(filePath, contentToWrite);
    }
    
    // 元信息保存到独立的 .meta 文件
    const metadata = {
      id,
      extension,
      type: artifact.type || (isObjectContent ? "application/json" : isStringContent ? "text/plain" : "application/octet-stream"),
      name: artifact.name.trim(), // 工件名称作为顶级字段
      createdAt,
      messageId: artifact.messageId || null,
      meta: artifact.meta || {}
    };
    await this._writeMetadata(id, metadata);
    
    void this.log.info("写入工件", { 
      id, 
      name: artifact.name.trim(),
      type: metadata.type, 
      extension, 
      messageId: artifact.messageId || null 
    });
    return id;
  }

  /**
   * 根据 type 参数确定文件扩展名。
   * 
   * @param {string} type - 工件类型（MIME 类型或自定义类型）
   * @returns {string} 文件扩展名（包含点号）
   * @private
   */
  _getExtensionFromType(type) {
    if (!type) return ".json"; // 默认 JSON
    
    const typeLower = type.toLowerCase();
    
    // 精确匹配常见 MIME 类型
    const typeToExt = {
      "text/html": ".html",
      "text/xml": ".xml",
      "text/css": ".css",
      "text/javascript": ".js",
      "text/plain": ".txt",
      "text/markdown": ".md",
      "application/json": ".json",
      "application/xml": ".xml",
      "application/javascript": ".js",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "application/pdf": ".pdf"
    };
    
    if (typeToExt[typeLower]) {
      return typeToExt[typeLower];
    }
    
    // 模糊匹配
    if (typeLower.includes("json")) return ".json";
    if (typeLower.includes("html")) return ".html";
    if (typeLower.includes("xml")) return ".xml";
    if (typeLower.includes("javascript") || typeLower.includes("js")) return ".js";
    if (typeLower.includes("css")) return ".css";
    if (typeLower.startsWith("text/")) return ".txt";
    if (typeLower.startsWith("image/")) return ".bin";
    
    // 默认使用 JSON
    return ".json";
  }

  /**
   * 读取工件引用。
   * @param {string} ref artifact_ref
   * @returns {Promise<any>} 工件内容（包含元信息）
   */
  async getArtifact(ref) {
    await this.ensureReady();
    const id = String(ref).startsWith("artifact:") ? ref.slice("artifact:".length) : ref;
    
    // 先读取元信息以确定文件类型和扩展名
    const metadata = await this.getMetadata(id);
    const extension = metadata?.extension || ".json";
    const filePath = path.resolve(this.artifactsDir, `${id}${extension}`);
    
    try {
      // 读取文件内容
      const buffer = await readFile(filePath);
      
      // 使用增强的二进制检测系统
      const isBinary = await this._detectBinary(buffer, {
        mimeType: metadata?.mimeType,
        extension: extension,
        filename: metadata?.filename
      });
      
      let content;
      if (isBinary) {
        // 二进制文件读取为 base64
        content = buffer.toString("base64");
      } else {
        // 文本文件按 utf8 读取
        const raw = buffer.toString("utf8");
        // 尝试解析 JSON，如果失败则返回原始文本
        try {
          content = JSON.parse(raw);
        } catch {
          content = raw;
        }
      }
      
      // 返回合并后的工件对象（兼容旧格式）
      const payload = {
        id,
        content,
        type: metadata?.type || null,
        createdAt: metadata?.createdAt || new Date().toISOString(),
        messageId: metadata?.messageId || null,
        meta: {
          ...(metadata?.meta || {}),
          // 将name字段包含在meta中以保持向后兼容
          ...(metadata?.name && { name: metadata.name }),
          // Include filename and size from metadata if available
          ...(metadata?.filename && { filename: metadata.filename }),
          ...(metadata?.size && { size: metadata.size })
        },
        isBinary,
        mimeType: metadata?.mimeType || null
      };
      
      void this.log.debug("读取工件成功", { id, ref: `artifact:${id}`, isBinary });
      return payload;
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        void this.log.warn("读取工件不存在", { id, ref: String(ref) });
        return null;
      }
      throw err;
    }
  }

  /**
   * 使用增强的二进制检测系统判断文件是否为二进制
   * @param {Buffer} buffer - 文件内容缓冲区
   * @param {Object} options - 检测选项
   * @param {string} [options.mimeType] - MIME 类型
   * @param {string} [options.filename] - 文件名
   * @param {string} [options.extension] - 文件扩展名
   * @returns {Promise<boolean>} 是否为二进制文件
   * @private
   */
  async _detectBinary(buffer, options = {}) {
    try {
      const result = await this.binaryDetector.detectBinary(buffer, options);
      
      void this.log.debug("二进制检测完成", {
        isBinary: result.isBinary,
        method: result.method,
        confidence: result.confidence,
        mimeType: options.mimeType || null,
        extension: options.extension || null
      });
      
      return result.isBinary;
    } catch (error) {
      void this.log.error("二进制检测失败，默认为二进制", { 
        error: error.message,
        mimeType: options.mimeType || null,
        extension: options.extension || null
      });
      
      // 出错时默认为二进制（安全处理）
      return true;
    }
  }


  /**
   * 保存图片文件。
   * @param {Buffer} buffer - 图片二进制数据
   * @param {{name: string, format?: "png"|"jpg"|"jpeg"|"gif"|"webp", messageId?: string, agentId?: string, [key: string]: any}} meta - 元数据，name为必需参数，format 默认为 "png"
   * @returns {Promise<string>} 工件ID
   */
  async saveImage(buffer, meta = {}) {
    await this.ensureReady();
    
    const { name, format = "png", messageId, agentId, ...otherMeta } = meta;
    
    // 验证必需参数
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('图片名称是必需参数，且不能为空');
    }
    
    const id = await this.idGenerator.next();
    const extension = `.${format}`;
    const fileName = `${id}${extension}`;
    const filePath = path.resolve(this.artifactsDir, fileName);
    const createdAt = new Date().toISOString();
    
    // 根据格式获取正确的 MIME 类型
    const mimeType = this._getImageMimeType(format);
    
    // 写入图片文件（原始内容）
    await writeFile(filePath, buffer);
    
    // 写入元信息文件
    const metadata = {
      id,
      extension,
      type: mimeType,
      name: name.trim(), // 图片名称作为顶级字段
      createdAt,
      messageId: messageId || null,
      agentId: agentId || null,
      meta: otherMeta
    };
    await this._writeMetadata(id, metadata);
    
    void this.log.info("保存图片", { 
      id,
      fileName, 
      name: name.trim(),
      format,
      mimeType,
      agentId 
    });
    
    return id;
  }

  /**
   * 根据图片格式获取对应的 MIME 类型。
   * @param {string} format - 图片格式（如 "png", "jpg", "jpeg", "gif", "webp"）
   * @returns {string} MIME 类型
   * @private
   */
  _getImageMimeType(format) {
    const formatLower = format.toLowerCase();
    const formatToMime = {
      "png": "image/png",
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "gif": "image/gif",
      "webp": "image/webp",
      "bmp": "image/bmp",
      "svg": "image/svg+xml",
      "avif": "image/avif"
    };
    
    return formatToMime[formatLower] || "image/png";
  }

  /**
   * 生成工件ID。
   * @returns {Promise<string>} 工件ID（单调递增的数字字符串）
   */
  async generateId() {
    await this.idGenerator.init();
    return await this.idGenerator.next();
  }

  /**
   * 保存上传的文件。
   * @param {Buffer} buffer - 文件二进制数据
   * @param {{type: "image"|"file", filename: string, mimeType: string, [key: string]: any}} meta - 元数据
   * @returns {Promise<{artifactRef: string, metadata: object}>} 工件引用和元数据
   */
  async saveUploadedFile(buffer, meta = {}) {
    await this.ensureReady();
    
    const { type = "file", filename, mimeType, ...otherMeta } = meta;
    
    // 验证必需参数
    if (!filename || typeof filename !== 'string' || filename.trim() === '') {
      throw new Error('文件名是必需参数，且不能为空');
    }
    
    const id = await this.idGenerator.next();
    
    // 根据 mimeType 确定文件扩展名
    const extension = this._getExtensionFromMimeType(mimeType, filename);
    const fullFilename = `${id}${extension}`;
    const filePath = path.resolve(this.artifactsDir, fullFilename);
    const createdAt = new Date().toISOString();
    
    // 写入文件（原始内容）
    await writeFile(filePath, buffer);
    
    // 如果客户端传来的 mimeType 是通用类型，尝试根据扩展名推断正确的 MIME 类型
    const resolvedMimeType = this._resolveMimeType(mimeType, extension);
    
    // 构建元信息
    const metadata = {
      id,
      extension,
      type: resolvedMimeType,
      name: filename.trim(), // 统一使用 name 字段
      size: buffer.length,
      createdAt,
      ...otherMeta
    };
    
    // 写入元信息文件
    await this._writeMetadata(id, metadata);
    
    const artifactRef = `artifact:${id}`;
    void this.log.info("保存上传文件", { id, type: resolvedMimeType, name: filename.trim(), size: buffer.length, ref: artifactRef });
    
    return {
      artifactRef,
      metadata
    };
  }

  /**
   * 根据扩展名和客户端 MIME 类型解析最终的 MIME 类型。
   * 当客户端传来的是通用类型（如 application/octet-stream）时，尝试根据扩展名推断。
   * @param {string} clientMimeType - 客户端传来的 MIME 类型
   * @param {string} extension - 文件扩展名（包含点号）
   * @returns {string} 解析后的 MIME 类型
   * @private
   */
  _resolveMimeType(clientMimeType, extension) {
    // 如果客户端提供了具体的 MIME 类型（非通用类型），直接使用
    const genericTypes = ["application/octet-stream", "", null, undefined];
    if (!genericTypes.includes(clientMimeType)) {
      return clientMimeType;
    }
    
    // 根据扩展名推断 MIME 类型
    const extToMime = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
      ".avif": "image/avif",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".xml": "application/xml",
      ".html": "text/html",
      ".htm": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".ts": "text/typescript",
      ".tsx": "text/typescript",
      ".jsx": "text/javascript",
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
      ".7z": "application/x-7z-compressed",
      ".tar": "application/x-tar",
      ".gz": "application/gzip",
      ".csv": "text/csv",
      ".yaml": "text/yaml",
      ".yml": "text/yaml",
      ".py": "text/x-python",
      ".java": "text/x-java",
      ".c": "text/x-c",
      ".cpp": "text/x-c++",
      ".h": "text/x-c",
      ".hpp": "text/x-c++",
      ".sh": "text/x-shellscript",
      ".bat": "text/x-batch",
      ".ps1": "text/x-powershell",
      ".sql": "text/x-sql",
      ".log": "text/plain"
    };
    
    const ext = extension?.toLowerCase();
    return extToMime[ext] || "application/octet-stream";
  }

  /**
   * 根据 MIME 类型获取文件扩展名。
   * @param {string} mimeType - MIME 类型
   * @param {string} [filename] - 原始文件名（用于提取扩展名）
   * @returns {string} 文件扩展名（包含点号）
   * @private
   */
  _getExtensionFromMimeType(mimeType, filename) {
    // 优先从原始文件名提取扩展名
    if (filename) {
      const lastDot = filename.lastIndexOf(".");
      if (lastDot > 0) {
        return filename.slice(lastDot).toLowerCase();
      }
    }
    
    // 根据 MIME 类型映射扩展名
    const mimeToExt = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/bmp": ".bmp",
      "image/svg+xml": ".svg",
      "image/avif": ".avif",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
      "application/json": ".json",
      "application/xml": ".xml",
      "text/html": ".html",
      "text/css": ".css",
      "text/javascript": ".js",
      "application/zip": ".zip",
      "application/x-rar-compressed": ".rar",
      "application/x-7z-compressed": ".7z"
    };
    
    return mimeToExt[mimeType] || ".bin";
  }

  /**
   * 读取上传的文件内容。
   * @param {string} ref - 工件引用
   * @returns {Promise<{buffer: Buffer, metadata: object}|null>} 文件内容和元数据
   */
  async getUploadedFile(ref) {
    await this.ensureReady();
    const id = String(ref).startsWith("artifact:") ? ref.slice("artifact:".length) : ref;
    
    // 读取元信息
    const metadata = await this.getMetadata(id);
    if (!metadata) {
      void this.log.warn("读取上传文件失败: 元信息不存在", { id, ref: String(ref) });
      return null;
    }
    
    // 尝试多种路径查找文件
    const candidatePaths = [
      // 1. 标准路径: ${id}${extension}
      metadata.extension ? path.resolve(this.artifactsDir, `${id}${metadata.extension}`) : null,
      // 2. 使用元信息中的 filename（可能包含完整文件名）
      metadata.filename ? path.resolve(this.artifactsDir, metadata.filename) : null,
      // 3. 使用 id + 从 filename 提取的扩展名
      metadata.filename ? path.resolve(this.artifactsDir, `${id}${this._extractExtension(metadata.filename)}`) : null,
    ].filter(Boolean);
    
    for (const filePath of candidatePaths) {
      try {
        const buffer = await readFile(filePath);
        void this.log.debug("读取上传文件成功", { id, ref: `artifact:${id}`, path: filePath });
        return { buffer, metadata };
      } catch (err) {
        if (err && typeof err === "object" && err.code === "ENOENT") {
          // 文件不存在，尝试下一个路径
          continue;
        }
        throw err;
      }
    }
    
    // 所有路径都找不到文件
    void this.log.warn("读取上传文件失败: 文件不存在", { 
      id, 
      ref: String(ref), 
      triedPaths: candidatePaths,
      metadata 
    });
    return null;
  }

  /**
   * 从文件名提取扩展名。
   * @param {string} filename - 文件名
   * @returns {string} 扩展名（包含点号），如果没有则返回空字符串
   * @private
   */
  _extractExtension(filename) {
    if (!filename) return "";
    const lastDot = filename.lastIndexOf(".");
    return lastDot > 0 ? filename.slice(lastDot).toLowerCase() : "";
  }

  /**
   * 检查文件名是否为元信息文件。
   * @param {string} filename - 文件名
   * @returns {boolean}
   */
  static isMetaFile(filename) {
    return filename.endsWith(META_EXTENSION);
  }

  /**
   * 获取元信息文件后缀。
   * @returns {string}
   */
  static get META_EXTENSION() {
    return META_EXTENSION;
  }
}
