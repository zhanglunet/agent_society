import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createNoopModuleLogger } from "./logger.js";

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
  }

  /**
   * 确保工件目录存在。
   * @returns {Promise<void>}
   */
  async ensureReady() {
    await mkdir(this.artifactsDir, { recursive: true });
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
   * @param {{type:string, content:any, meta?:object, messageId?:string}} artifact
   * @returns {Promise<string>} artifact_ref
   */
  async putArtifact(artifact) {
    await this.ensureReady();
    const id = randomUUID();
    const extension = ".json";
    const filePath = path.resolve(this.artifactsDir, `${id}${extension}`);
    const createdAt = new Date().toISOString();
    
    // 工件文件只保存原始内容
    await writeFile(filePath, JSON.stringify(artifact.content, null, 2), "utf8");
    
    // 元信息保存到独立的 .meta 文件
    const metadata = {
      id,
      extension,
      type: artifact.type,
      createdAt,
      messageId: artifact.messageId || null,
      meta: artifact.meta || null
    };
    await this._writeMetadata(id, metadata);
    
    void this.log.info("写入工件", { id, type: artifact.type, ref: `artifact:${id}`, messageId: artifact.messageId || null });
    return `artifact:${id}`;
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
      // 判断是否为二进制文件
      const isBinary = this._isBinaryExtension(extension);
      
      let content;
      if (isBinary) {
        // 二进制文件读取为 base64
        const buffer = await readFile(filePath);
        content = buffer.toString("base64");
      } else {
        // 文本文件按 utf8 读取
        const raw = await readFile(filePath, "utf8");
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
        meta: metadata?.meta || null,
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
   * 判断文件扩展名是否为二进制类型。
   * @param {string} extension - 文件扩展名（包含点号）
   * @returns {boolean}
   * @private
   */
  _isBinaryExtension(extension) {
    const binaryExtensions = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".ico",
      ".pdf", ".zip", ".rar", ".7z", ".tar", ".gz",
      ".mp3", ".mp4", ".wav", ".avi", ".mov", ".webm",
      ".bin", ".exe", ".dll", ".so", ".dylib",
      ".woff", ".woff2", ".ttf", ".otf", ".eot"
    ]);
    return binaryExtensions.has(extension?.toLowerCase() || "");
  }

  /**
   * 保存图片文件。
   * @param {Buffer} buffer - 图片二进制数据
   * @param {{format?: "png"|"jpg"|"jpeg"|"gif"|"webp", messageId?: string, agentId?: string, [key: string]: any}} meta - 元数据，format 默认为 "png"
   * @returns {Promise<string>} 图片文件名（相对于 artifacts 目录）
   */
  async saveImage(buffer, meta = {}) {
    await this.ensureReady();
    
    const { format = "png", messageId, agentId, ...otherMeta } = meta;
    const id = randomUUID();
    const extension = `.${format}`;
    const fileName = `${id}${extension}`;
    const filePath = path.resolve(this.artifactsDir, fileName);
    const createdAt = new Date().toISOString();
    
    // 写入图片文件（原始内容）
    await writeFile(filePath, buffer);
    
    // 写入元信息文件
    const metadata = {
      id,
      extension,
      type: "image",
      createdAt,
      messageId: messageId || null,
      agentId: agentId || null,
      ...otherMeta
    };
    await this._writeMetadata(id, metadata);
    
    void this.log.info("保存图片", { fileName, format, agentId });
    
    return fileName;
  }

  /**
   * 生成工件ID。
   * @returns {string} 工件ID（UUID格式）
   */
  generateId() {
    return randomUUID();
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
    const id = randomUUID();
    
    // 根据 mimeType 确定文件扩展名
    const extension = this._getExtensionFromMimeType(mimeType, filename);
    const fullFilename = `${id}${extension}`;
    const filePath = path.resolve(this.artifactsDir, fullFilename);
    const createdAt = new Date().toISOString();
    
    // 写入文件（原始内容）
    await writeFile(filePath, buffer);
    
    // 构建元信息
    const metadata = {
      id,
      extension,
      type,
      filename: filename || fullFilename,
      size: buffer.length,
      mimeType: mimeType || "application/octet-stream",
      createdAt,
      ...otherMeta
    };
    
    // 写入元信息文件
    await this._writeMetadata(id, metadata);
    
    const artifactRef = `artifact:${id}`;
    void this.log.info("保存上传文件", { id, type, filename, size: buffer.length, ref: artifactRef });
    
    return {
      artifactRef,
      metadata
    };
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
