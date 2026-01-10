import { readFile } from "node:fs/promises";
import path from "node:path";
import { createNoopModuleLogger } from "./logger.js";

/**
 * 从系统提示词目录加载预置提示词与拼接模板，并完成最终提示词拼接。
 */
export class PromptLoader {
  /**
   * @param {{promptsDir:string, logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}} options
   */
  constructor(options) {
    this.promptsDir = options.promptsDir;
    this._cache = new Map();
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 读取提示词文件（带简单缓存）。
   * @param {string} fileName 文件名
   * @returns {Promise<string>} 文本内容
   */
  async loadSystemPromptFile(fileName) {
    const filePath = path.resolve(this.promptsDir, fileName);
    if (this._cache.has(filePath)) {
      void this.log.debug("命中提示词缓存", { fileName });
      return this._cache.get(filePath);
    }
    const text = await readFile(filePath, "utf8");
    this._cache.set(filePath, text);
    void this.log.info("加载提示词文件", { fileName });
    return text;
  }

  /**
   * 使用拼接模板将系统预置提示词、岗位提示词与任务内容装配为最终提示词。
   * @param {{base:string, composeTemplate:string, rolePrompt:string, taskText:string, workspace?:string}} parts
   * @returns {string} 最终提示词
   */
  compose(parts) {
    const { base, composeTemplate, rolePrompt, taskText, workspace } = parts;
    return composeTemplate
      .replaceAll("{{BASE}}", base ?? "")
      .replaceAll("{{ROLE}}", rolePrompt ?? "")
      .replaceAll("{{TASK}}", taskText ?? "")
      .replaceAll("{{WORKSPACE}}", workspace ?? "");
  }
}
