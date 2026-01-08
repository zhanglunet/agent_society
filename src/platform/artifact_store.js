import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createNoopModuleLogger } from "./logger.js";

/**
 * 提供最小可用的工件存储：将 JSON 工件写入 data/artifacts 并用 ref 引用。
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
   * 写入工件并返回引用。
   * @param {{type:string, content:any, meta?:object}} artifact
   * @returns {Promise<string>} artifact_ref
   */
  async putArtifact(artifact) {
    await this.ensureReady();
    const id = randomUUID();
    const filePath = path.resolve(this.artifactsDir, `${id}.json`);
    const payload = {
      id,
      createdAt: new Date().toISOString(),
      ...artifact
    };
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    void this.log.info("写入工件", { id, type: payload.type, ref: `artifact:${id}` });
    return `artifact:${id}`;
  }

  /**
   * 读取工件引用。
   * @param {string} ref artifact_ref
   * @returns {Promise<any>} 工件内容
   */
  async getArtifact(ref) {
    await this.ensureReady();
    const id = String(ref).startsWith("artifact:") ? ref.slice("artifact:".length) : ref;
    const filePath = path.resolve(this.artifactsDir, `${id}.json`);
    try {
      const raw = await readFile(filePath, "utf8");
      const payload = JSON.parse(raw);
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
   * 保存截图为 JPEG 图片文件。
   * @param {Buffer} buffer - 图片二进制数据
   * @param {{tabId?: string, url?: string, title?: string, fullPage?: boolean, selector?: string}} meta - 元数据
   * @returns {Promise<string>} 图片文件路径
   */
  async saveScreenshot(buffer, meta = {}) {
    await this.ensureReady();
    
    // 创建 screenshots 子目录
    const screenshotsDir = path.resolve(this.artifactsDir, "screenshots");
    await mkdir(screenshotsDir, { recursive: true });
    
    // 生成文件名：时间戳_uuid.jpg
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = randomUUID().slice(0, 8);
    const fileName = `${timestamp}_${id}.jpg`;
    const filePath = path.resolve(screenshotsDir, fileName);
    
    // 写入图片文件
    await writeFile(filePath, buffer);
    
    // 返回相对路径
    const relativePath = `screenshots/${fileName}`;
    
    void this.log.info("保存截图", { 
      fileName, 
      relativePath,
      url: meta.url || null,
      title: meta.title || null
    });
    
    return relativePath;
  }
}
