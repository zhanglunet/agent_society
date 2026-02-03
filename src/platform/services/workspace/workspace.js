import { mkdir, readFile, writeFile, readdir, stat, unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { extractExtension, MIME_TYPE_MAPPINGS } from "../../utils/content/content_type_utils.js";

/**
 * 工作区对象
 * 负责具体的文件操作和元数据维护
 */
export class Workspace {
  /**
   * @param {string} id - 工作区 ID
   * @param {string} workspacesDir - 工作区根目录所在的父目录
   * @param {object} options
   */
  constructor(id, workspacesDir, options = {}) {
    this.id = id;
    this.workspacesDir = workspacesDir;
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 动态计算工作区物理根路径
   */
  get rootPath() {
    return path.join(this.workspacesDir, this.id);
  }

  /**
   * 元数据目录路径
   */
  get metaDir() {
    return path.join(this.rootPath, ".meta");
  }

  /**
   * 全局元数据文件路径
   */
  get globalMetaFile() {
    return path.join(this.metaDir, ".meta");
  }

  /**
   * 验证路径安全
   * @param {string} relativePath
   * @returns {boolean}
   */
  _isPathSafe(relativePath) {
    if (!relativePath || typeof relativePath !== "string") return false;
    if (path.isAbsolute(relativePath)) return false;
    const normalized = path.normalize(relativePath);
    if (normalized.startsWith("..") || normalized.includes(`${path.sep}..`)) return false;
    return true;
  }

  /**
   * 自动探测 MIME 类型
   * @param {string} relativePath
   * @param {Buffer} [content] - 可选的内容，用于内容嗅探（暂未实现复杂嗅探）
   * @returns {string}
   */
  _detectMimeType(relativePath, content) {
    const ext = extractExtension(relativePath);
    if (ext) {
      const e = ext.toLowerCase();
      // 这里的 MIME 类型映射应与前端和系统内部语义一致
      if (['.txt', '.md', '.ts', '.py', '.c', '.cpp', '.h', '.sh', '.bat', '.ps1', '.yaml', '.yml'].includes(e)) return 'text/plain';
      if (e === '.js') return 'application/javascript';
      if (e === '.json') return 'application/json';
      if (['.jpg', '.jpeg'].includes(e)) return 'image/jpeg';
      if (e === '.png') return 'image/png';
      if (e === '.gif') return 'image/gif';
      if (e === '.pdf') return 'application/pdf';
      if (e === '.html' || e === '.htm') return 'text/html';
      if (e === '.css') return 'text/css';
    }

    // 如果没有扩展名，检查内容是否为文本
    if (content) {
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
      // 检查前 1024 字节是否包含空字节，如果没有通常是文本
      let isBinary = false;
      const checkLen = Math.min(buffer.length, 1024);
      for (let i = 0; i < checkLen; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }
      if (!isBinary) return 'text/plain';
    }

    return 'application/octet-stream';
  }

  /**
   * 写入文件并更新元数据
   * @param {string} relativePath
   * @param {string|Buffer} content
   * @param {object} options { operator, messageId, mimeType }
   */
  async writeFile(relativePath, content, options = {}) {
    if (!this._isPathSafe(relativePath)) {
      throw new Error("path_traversal_blocked");
    }

    // 先检查必需参数，避免文件写入后才发现参数缺失
    if (!options.operator) {
      throw new Error(`writeFile_missing_operator: ${relativePath}`);
    }
    if (!options.messageId) {
      throw new Error(`writeFile_missing_messageId: ${relativePath}`);
    }

    const fullPath = path.resolve(this.rootPath, relativePath);
    const parentDir = path.dirname(fullPath);
    
    // 确保目录存在
    await mkdir(parentDir, { recursive: true });
    await mkdir(this.metaDir, { recursive: true });

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const mimeType = options.mimeType || this._detectMimeType(relativePath, buffer);

    // 写入文件
    await writeFile(fullPath, buffer);

    // 更新文件级元数据
    const existingMeta = await this._readFileMeta(relativePath);
    const fileMeta = {
      ...existingMeta,
      ...options.meta, // 保留传入的额外元数据（如图片宽高）
      path: relativePath,
      mimeType,
      deleted: false
    };

    const record = {
      operator: options.operator,
      messageId: options.messageId,
      timestamp: new Date().toISOString(),
      action: 'write',
      size: buffer.length
    };

    fileMeta.history.push(record);

    // 写入文件级元数据（保留完整历史和所有字段）
    await this._writeFileMeta(relativePath, fileMeta);

    // 更新全局索引（仅保留最新高频数据）
    await this._updateGlobalMeta(relativePath, {
      ...options.meta, // 同步保留到全局高频索引
      type: 'file',
      size: buffer.length,
      mimeType,
      updatedAt: record.timestamp,
      lastOperator: record.operator,
      lastMessageId: record.messageId
    });

    return { ok: true, path: relativePath, size: buffer.length, mimeType };
  }

  /**
   * 随机读取文件内容
   * @param {string} relativePath
   * @param {object} options { offset, length }
   */
  async readFile(relativePath, options = {}) {
    if (!this._isPathSafe(relativePath)) {
      throw new Error("path_traversal_blocked");
    }

    const fullPath = path.resolve(this.rootPath, relativePath);
    let stats;
    try {
      stats = await stat(fullPath);
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error("file_not_found");
      }
      throw e;
    }

    const total = stats.size;
    const offset = Math.max(0, options.offset || 0);
    // 默认读取 5000 字节，最大支持 10MB
    const length = Math.min(10 * 1024 * 1024, options.length || 5000);

    const fsPromises = await import('node:fs/promises');
    const handle = await fsPromises.open(fullPath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      const resultBuffer = buffer.subarray(0, bytesRead);
      
      const mimeType = await this.getFileInfo(relativePath).then(m => m?.mimeType).catch(() => 'application/octet-stream') || 'application/octet-stream';
      
      let content;
      if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/javascript') {
        content = resultBuffer.toString('utf8');
      } else {
        content = resultBuffer.toString('base64');
      }

      return {
        content,
        start: offset,
        total,
        readLength: bytesRead,
        mimeType
      };
    } finally {
      await handle.close();
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(relativePath, options = {}) {
    if (!this._isPathSafe(relativePath)) {
      throw new Error("path_traversal_blocked");
    }

    if (!options.operator) {
      throw new Error(`deleteFile_missing_operator: ${relativePath}`);
    }
    if (!options.messageId) {
      throw new Error(`deleteFile_missing_messageId: ${relativePath}`);
    }

    const fullPath = path.resolve(this.rootPath, relativePath);
    await unlink(fullPath);

    // 记录删除历史到元数据文件
    const existingMeta = await this._readFileMeta(relativePath);
    const fileMeta = {
      ...existingMeta,
      path: relativePath,
      deleted: true,
      deletedAt: null
    };

    const record = {
      operator: options.operator,
      messageId: options.messageId,
      timestamp: new Date().toISOString(),
      action: 'delete'
    };

    fileMeta.history.push(record);
    fileMeta.deleted = true;
    fileMeta.deletedAt = record.timestamp;

    // 写入文件级元数据（保留完整历史，不随文件物理删除而销毁）
    await this._writeFileMeta(relativePath, fileMeta);

    // 仅从全局索引中移除，让前端列表变干净，但保留文件审计历史
    await this._removeFromGlobalMeta(relativePath);

    return { ok: true };
  }

  /**
   * 获取元数据
   */
  async getMetadata(relativePath) {
    const globalMeta = await this._readGlobalMeta();
    const info = globalMeta.files[relativePath];
    if (!info) throw new Error("file_not_found");
    return info;
  }

  /**
   * 获取文件详细历史
   */
  async getFileHistory(relativePath) {
    const fileMetaPath = path.join(this.metaDir, relativePath);
    const content = await readFile(fileMetaPath, "utf8");
    return JSON.parse(content).history;
  }

  /**
   * 获取目录树（仅文件夹）
   */
  async getTree() {
    const globalMeta = await this._readGlobalMeta();
    const dirs = new Set();
    Object.keys(globalMeta.files).forEach(filePath => {
      // 统一使用正斜杠处理路径
      const normalizedPath = filePath.replace(/\\/g, "/");
      const parts = normalizedPath.split("/");
      // 如果文件在子目录下，每一级父目录都算一个目录
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    });
    return Array.from(dirs).sort();
  }

  /**
   * 获取文件信息
   * @param {string} relativePath
   */
  async getFileInfo(relativePath) {
    if (!this._isPathSafe(relativePath)) throw new Error("path_traversal_blocked");
    const meta = await this._readGlobalMeta();
    const key = relativePath.replace(/\\/g, "/");
    const info = meta.files[key];
    if (!info) return null;
    
    return {
      path: key,
      filename: path.basename(key),
      ...info,
      isBinary: !info.mimeType.startsWith('text/') && 
                info.mimeType !== 'application/json' && 
                info.mimeType !== 'application/javascript'
    };
  }

  /**
   * 列出文件和子目录
   * 
   * 根据全局元数据推断指定目录下的文件和子目录列表。
   * 子目录是通过分析文件路径中的目录层级推断出来的。
   * 
   * @param {string} subDir - 子目录路径，相对于工作区根目录，默认为根目录 "."
   * @returns {Promise<Array<{name: string, type: 'file'|'directory', [key: string]: any}>>} 文件和目录列表
   */
  async listFiles(subDir = ".") {
    const globalMeta = await this._readGlobalMeta();
    const normalizedSubDir = subDir === "." ? "" : (subDir.replace(/\\/g, "/").endsWith("/") ? subDir.replace(/\\/g, "/") : subDir.replace(/\\/g, "/") + "/");
    
    const files = [];
    const dirs = new Set();
    
    for (const [filePath, info] of Object.entries(globalMeta.files)) {
      // 只处理以指定子目录开头的路径
      if (!filePath.startsWith(normalizedSubDir)) continue;
      
      // 获取相对于指定子目录的剩余路径
      const relativePath = filePath.slice(normalizedSubDir.length);
      if (!relativePath) continue;
      
      // 检查是否还有子目录层级
      const slashIndex = relativePath.indexOf("/");
      
      if (slashIndex === -1) {
        // 这是直接位于指定目录下的文件
        files.push({
          name: relativePath,
          ...info
        });
      } else {
        // 这是位于指定目录下某个子目录中的文件，提取子目录名
        const dirName = relativePath.slice(0, slashIndex);
        dirs.add(dirName);
      }
    }
    
    // 构建目录结果
    const dirResults = Array.from(dirs).map(dirName => ({
      name: dirName,
      type: 'directory'
    }));
    
    // 合并目录和文件，按名称排序
    return [...dirResults, ...files].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 获取工作区摘要信息
   * @returns {Promise<{fileCount: number, dirCount: number, totalSize: number, lastModified: string}>}
   */
  async getInfo() {
    const meta = await this._readGlobalMeta();
    let totalSize = 0;
    const files = Object.keys(meta.files);
    files.forEach(f => totalSize += (meta.files[f].size || 0));

    // 计算目录数
    const dirs = new Set();
    files.forEach(f => {
      const parts = f.split("/");
      // 如果文件在子目录下，每一级父目录都算一个目录
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    });

    // 同时检查是否存在空目录（不在全局元数据 files 中的目录）
    // 虽然目前 WorkspaceManager 主要跟踪有文件的路径，但为了准确性，
    // 我们在 sync 时其实可以记录所有目录。
    // 目前 getInfo 依赖 _readGlobalMeta，所以暂时只统计包含文件的目录。
    // 如果需要统计空目录，需要扩展 globalMeta 结构。

    return {
      fileCount: files.length,
      dirCount: dirs.size,
      totalSize,
      lastModified: meta.lastSync || new Date().toISOString()
    };
  }

  /**
   * 获取磁盘占用
   */
  async getDiskUsage() {
    return this.getInfo();
  }

  /**
   * 在指定子文件夹内搜索文本
   * @param {string} subDir - 子目录路径，相对于工作区根目录
   * @param {string} searchText - 要搜索的文本
   * @param {object} options - 可选参数 { caseSensitive, maxResults }
   * @returns {Promise<Array<{file: string, line: number, col: number}>>}
   */
  async searchText(subDir, searchText, options = {}) {
    if (!this._isPathSafe(subDir)) {
      throw new Error("path_traversal_blocked");
    }

    if (!searchText || typeof searchText !== "string") {
      throw new Error("invalid_search_text");
    }

    const { caseSensitive = true, maxResults = 1000 } = options;

    // 确定搜索目录
    const searchDir = subDir === "." ? this.rootPath : path.resolve(this.rootPath, subDir);

    // 检查目录是否存在
    try {
      const stats = await stat(searchDir);
      if (!stats.isDirectory()) {
        throw new Error("not_a_directory");
      }
    } catch (e) {
      if (e.code === 'ENOENT') {
        return [];
      }
      throw e;
    }

    const results = [];
    const searchPattern = caseSensitive ? searchText : searchText.toLowerCase();
    const flags = caseSensitive ? 'g' : 'gi';

    // 递归扫描目录并搜索文本文件
    const searchInDirectory = async (dir, baseRelPath = "") => {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const relPath = baseRelPath ? path.join(baseRelPath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // 跳过 .meta 目录
          if (entry.name === ".meta") continue;
          await searchInDirectory(path.join(dir, entry.name), relPath);
        } else {
          // 检查文件是否为文本文件
          const ext = extractExtension(entry.name);
          const textExtensions = ['.txt', '.md', '.js', '.ts', '.py', '.c', '.cpp', '.h', '.sh', '.bat', '.ps1', '.yaml', '.yml', '.json', '.html', '.css', '.xml', '.java', '.go', '.rs'];

          if (!textExtensions.includes(ext?.toLowerCase())) {
            continue;
          }

          try {
            const fullPath = path.join(dir, entry.name);
            const content = await readFile(fullPath, 'utf8');
            const lines = content.split(/\r?\n/);

            // 搜索每一行
            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
              if (results.length >= maxResults) break;

              const line = lines[lineNum];
              const searchLine = caseSensitive ? line : line.toLowerCase();

              let matchIndex = searchLine.indexOf(searchPattern);
              while (matchIndex !== -1) {
                results.push({
                  file: relPath.replace(/\\/g, "/"),
                  line: lineNum + 1,
                  col: matchIndex + 1
                });

                // 查找下一个匹配
                matchIndex = searchLine.indexOf(searchPattern, matchIndex + 1);

                if (results.length >= maxResults) break;
              }
            }
          } catch (e) {
            // 跳过无法读取的文件
            this.log.warn(`搜索文件失败: ${relPath}`, { error: e.message });
          }
        }
      }
    };

    await searchInDirectory(searchDir, subDir === "." ? "" : subDir);

    return results;
  }

  /**
   * 同步外部变更
   */
  async sync() {
    await mkdir(this.rootPath, { recursive: true });
    const files = await this._scanDirectory(this.rootPath);
    const newFiles = {};
    
    for (const f of files) {
      if (f.startsWith(".meta")) continue;
      const fullPath = path.resolve(this.rootPath, f);
      const stats = await stat(fullPath);
      // 统一使用正斜杠作为 key
      const key = f.replace(/\\/g, "/");
      
      // 尝试从文件级元数据中读取 mimeType 和其他信息
      let mimeType = null;
      let lastOperator = null;
      let lastMessageId = null;
      
      try {
        const fileMetaPath = path.join(this.metaDir, key);
        if (existsSync(fileMetaPath)) {
          const metaContent = await readFile(fileMetaPath, "utf8");
          const fileMeta = JSON.parse(metaContent);
          // 优先使用元数据中存储的 mimeType
          if (fileMeta.mimeType) {
            mimeType = fileMeta.mimeType;
          }
          const lastRecord = fileMeta.history?.[fileMeta.history.length - 1];
          if (lastRecord) {
            lastOperator = lastRecord.operator;
            lastMessageId = lastRecord.messageId;
          }
        }
      } catch (e) { /* ignore recovery failure */ }
      
      // 如果元数据中没有 mimeType，则通过扩展名检测
      if (!mimeType) {
        mimeType = this._detectMimeType(key);
      }
      
      newFiles[key] = {
        type: 'file',
        size: stats.size,
        mimeType,
        updatedAt: stats.mtime.toISOString(),
        lastOperator,
        lastMessageId
      };
    }

    const meta = {
      id: this.id,
      lastSync: new Date().toISOString(),
      files: newFiles
    };

    await mkdir(this.metaDir, { recursive: true });
    await writeFile(this.globalMetaFile, JSON.stringify(meta, null, 2));
    return meta;
  }

  /**
   * 递归扫描目录
   */
  async _scanDirectory(dir, base = "") {
    const entries = await readdir(dir, { withFileTypes: true });
    let results = [];
    for (const entry of entries) {
      const relPath = base ? path.join(base, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === ".meta") continue;
        results = results.concat(await this._scanDirectory(path.join(dir, entry.name), relPath));
      } else {
        results.push(relPath.replace(/\\/g, "/"));
      }
    }
    return results;
  }

  /**
   * 读取全局元数据
   */
  async _readGlobalMeta() {
    try {
      const content = await readFile(this.globalMetaFile, "utf8");
      const meta = JSON.parse(content);
      // 如果文件列表为空，但目录确实存在，触发一次同步补偿
      if (Object.keys(meta.files).length === 0) {
        if (existsSync(this.rootPath)) {
          return await this.sync();
        }
      }
      return meta;
    } catch (e) {
      // 仅在文件不存在（初始化）时触发一次同步，之后完全依赖增量更新
      return await this.sync();
    }
  }

  /**
   * 更新全局元数据
   */
  async _updateGlobalMeta(relativePath, info) {
    const meta = await this._readGlobalMeta();
    // 强制转换为正斜杠存储，确保 API 和 getTree 逻辑一致
    const key = relativePath.replace(/\\/g, "/");
    meta.files[key] = {
      ...(meta.files[key] || {}),
      ...info
    };
    meta.lastSync = new Date().toISOString();
    await mkdir(this.metaDir, { recursive: true });
    await writeFile(this.globalMetaFile, JSON.stringify(meta, null, 2));
  }

  /**
   * 从全局元数据中移除
   */
  async _removeFromGlobalMeta(relativePath) {
    const meta = await this._readGlobalMeta();
    const key = relativePath.replace(/\\/g, "/");
    delete meta.files[key];
    await writeFile(this.globalMetaFile, JSON.stringify(meta, null, 2));
  }

  /**
   * 读取文件级元数据
   * @private
   */
  async _readFileMeta(relativePath) {
    const fileMetaPath = path.join(this.metaDir, relativePath);
    try {
      const content = await readFile(fileMetaPath, "utf8");
      return JSON.parse(content);
    } catch (e) {
      return {
        path: relativePath,
        history: [],
        deleted: false
      };
    }
  }

  /**
   * 写入文件级元数据
   * @private
   */
  async _writeFileMeta(relativePath, meta) {
    const fileMetaPath = path.join(this.metaDir, relativePath);
    await mkdir(path.dirname(fileMetaPath), { recursive: true });
    await writeFile(fileMetaPath, JSON.stringify(meta, null, 2));
  }
}
