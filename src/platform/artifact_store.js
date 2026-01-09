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
    const filePath = path.resolve(this.artifactsDir, `${id}.json`);
    try {
      const raw = await readFile(filePath, "utf8");
      const content = JSON.parse(raw);
      
      // 读取元信息
      const metadata = await this.getMetadata(id);
      
      // 返回合并后的工件对象（兼容旧格式）
      const payload = {
        id,
        content,
        type: metadata?.type || null,
        createdAt: metadata?.createdAt || new Date().toISOString(),
        messageId: metadata?.messageId || null,
        meta: metadata?.meta || null
      };
      
      void this.log.debug("读取工件成功", { id, ref: `artifact:${id}` });
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
   * 保存图片文件。
   * @param {Buffer} buffer - 图片二进制数据
   * @param {{format?: "png"|"jpg"|"jpeg"|"gif"|"webp", messageId?: string, [key: string]: any}} meta - 元数据，format 默认为 "png"
   * @returns {Promise<string>} 图片文件名（相对于 artifacts 目录）
   */
  async saveImage(buffer, meta = {}) {
    await this.ensureReady();
    
    const { format = "png", messageId, ...otherMeta } = meta;
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
      ...otherMeta
    };
    await this._writeMetadata(id, metadata);
    
    void this.log.info("保存图片", { fileName, format });
    
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
