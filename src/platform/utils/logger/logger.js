import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";

/**
 * 格式化日期为本地时间字符串（ISO 格式但使用本地时区）
 * @param {Date} [date] - 日期对象，默认为当前时间
 * @returns {string} 格式化后的时间字符串，如 "2026-01-12T15:30:45.123"
 */
export function formatLocalTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * @typedef {"trace"|"debug"|"info"|"warn"|"error"} LogLevel
 */

/**
 * @typedef {"agent_created"|"agent_terminated"|"agent_message_received"|"agent_message_sent"|"llm_call_start"|"llm_call_success"|"llm_call_error"} LifecycleEventType
 */

/**
 * @typedef {Object} LlmMetrics
 * @property {number} latencyMs - LLM调用延迟（毫秒）
 * @property {number} [promptTokens] - 输入token数量
 * @property {number} [completionTokens] - 输出token数量
 * @property {number} [totalTokens] - 总token数量
 * @property {boolean} success - 调用是否成功
 * @property {string} [model] - 使用的模型
 */

/**
 * @typedef {Object} StructuredLogEntry
 * @property {string} timestamp - ISO时间戳
 * @property {LogLevel} level - 日志级别
 * @property {string} module - 模块名
 * @property {string} message - 日志消息
 * @property {LifecycleEventType} [eventType] - 生命周期事件类型
 * @property {any} [data] - 附加数据
 */

const LEVEL_VALUE = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

/**
 * 统一日志器：支持按模块设置日志等级，并同时输出到控制台与文件。
 */
export class Logger {
  /**
   * @param {{enabled:boolean, logsDir:string|null, defaultLevel:LogLevel, levels:Record<string, LogLevel>, consoleOutput?:boolean}} options
   */
  constructor(options) {
    this.enabled = Boolean(options.enabled);
    this.logsDir = options.logsDir ? String(options.logsDir) : null;
    this.defaultLevel = options.defaultLevel;
    this.levels = options.levels ?? {};
    this.consoleOutput = options.consoleOutput !== false; // 默认启用控制台输出
    this._runDir = null;
    this._systemFilePath = null;
    this._readyPromise = null;
    this._ready = false;
  }

  /**
   * 创建一个绑定模块名的子日志器。
   * @param {string} moduleName
   * @returns {ModuleLogger}
   */
  forModule(moduleName) {
    return new ModuleLogger(this, moduleName);
  }

  /**
   * 准备日志文件（若启用文件输出）。
   * @returns {Promise<void>}
   */
  async ensureReady() {
    if (!this.enabled) return;
    if (this._ready) return;
    if (this._readyPromise) return await this._readyPromise;
    if (!this.logsDir) {
      this._ready = true;
      return;
    }
    this._readyPromise = (async () => {
      await mkdir(this.logsDir, { recursive: true });
      const runDirName = _buildRunDirName();
      const runDir = path.resolve(this.logsDir, runDirName);
      await mkdir(runDir, { recursive: true });
      this._runDir = runDir;
      this._systemFilePath = path.resolve(runDir, "system.log");
      this._ready = true;
      this._readyPromise = null;
    })();
    return await this._readyPromise;
  }

  /**
   * 输出一条日志（内部使用）。
   * @param {string} moduleName
   * @param {LogLevel} level
   * @param {string} message
   * @param {any} [data]
   * @returns {Promise<void>}
   */
  async write(moduleName, level, message, data) {
    if (!this.enabled) return;
    const effective = this.levels[moduleName] ?? this.defaultLevel;
    if (LEVEL_VALUE[level] < LEVEL_VALUE[effective]) return;

    const line = _formatLine(moduleName, level, message, data);
    if (this.consoleOutput) {
      _writeToConsole(level, line);
    }
    try {
      await this.ensureReady();
      if (this._systemFilePath) {
        await appendFile(this._systemFilePath, line + "\n", "utf8");
      }
      const agentId = _extractAgentId(data);
      if (agentId && this._runDir) {
        const agentFile = path.resolve(this._runDir, `agent-${_sanitizeFileSegment(agentId)}.log`);
        await appendFile(agentFile, line + "\n", "utf8");
      }
    } catch (err) {
      const text = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      process.stderr.write(
        _formatLine("logger", "error", "日志写入失败（已忽略，不影响主流程）", { message: text }) + "\n"
      );
    }
  }

  /**
   * 输出结构化日志条目。
   * @param {StructuredLogEntry} entry
   * @returns {Promise<void>}
   */
  async writeStructured(entry) {
    const moduleName = entry.module ?? "unknown";
    const level = entry.level ?? "info";
    const message = entry.message ?? "";
    const data = {
      ...entry.data,
      eventType: entry.eventType
    };
    return this.write(moduleName, level, message, data);
  }

  /**
   * 记录智能体生命周期事件。
   * @param {LifecycleEventType} eventType
   * @param {{agentId:string, roleId?:string, roleName?:string, parentAgentId?:string, messageId?:string, from?:string, to?:string, taskId?:string, reason?:string}} data
   * @returns {Promise<void>}
   */
  async logAgentLifecycleEvent(eventType, data) {
    const messages = {
      agent_created: "智能体创建",
      agent_terminated: "智能体终止",
      agent_message_received: "智能体收到消息",
      agent_message_sent: "智能体发送消息"
    };
    const message = messages[eventType] ?? eventType;
    return this.writeStructured({
      timestamp: new Date().toISOString(),
      level: "info",
      module: "lifecycle",
      message,
      eventType,
      data
    });
  }

  /**
   * 记录LLM调用指标。
   * @param {LlmMetrics} metrics
   * @param {{agentId?:string, roleId?:string, roleName?:string, messageId?:string, taskId?:string}} [meta]
   * @returns {Promise<void>}
   */
  async logLlmMetrics(metrics, meta) {
    const level = metrics.success ? "info" : "error";
    const message = metrics.success ? "LLM调用成功" : "LLM调用失败";
    return this.writeStructured({
      timestamp: new Date().toISOString(),
      level,
      module: "llm",
      message,
      eventType: metrics.success ? "llm_call_success" : "llm_call_error",
      data: {
        ...meta,
        latencyMs: metrics.latencyMs,
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        totalTokens: metrics.totalTokens,
        model: metrics.model
      }
    });
  }
}

/**
 * 模块日志器：把 moduleName 固化，简化调用方使用。
 */
export class ModuleLogger {
  /**
   * @param {Logger} root
   * @param {string} moduleName
   */
  constructor(root, moduleName) {
    this.root = root;
    this.moduleName = moduleName;
  }

  /**
   * @param {string} message
   * @param {any} [data]
   * @returns {Promise<void>}
   */
  trace(message, data) {
    return this.root.write(this.moduleName, "trace", message, data);
  }

  /**
   * @param {string} message
   * @param {any} [data]
   * @returns {Promise<void>}
   */
  debug(message, data) {
    return this.root.write(this.moduleName, "debug", message, data);
  }

  /**
   * @param {string} message
   * @param {any} [data]
   * @returns {Promise<void>}
   */
  info(message, data) {
    return this.root.write(this.moduleName, "info", message, data);
  }

  /**
   * @param {string} message
   * @param {any} [data]
   * @returns {Promise<void>}
   */
  warn(message, data) {
    return this.root.write(this.moduleName, "warn", message, data);
  }

  /**
   * @param {string} message
   * @param {any} [data]
   * @returns {Promise<void>}
   */
  error(message, data) {
    return this.root.write(this.moduleName, "error", message, data);
  }

  /**
   * 记录智能体生命周期事件。
   * @param {LifecycleEventType} eventType
   * @param {{agentId:string, roleId?:string, roleName?:string, parentAgentId?:string, messageId?:string, from?:string, to?:string, taskId?:string, reason?:string}} data
   * @returns {Promise<void>}
   */
  logAgentLifecycleEvent(eventType, data) {
    return this.root.logAgentLifecycleEvent(eventType, data);
  }

  /**
   * 记录LLM调用指标。
   * @param {LlmMetrics} metrics
   * @param {{agentId?:string, roleId?:string, roleName?:string, messageId?:string, taskId?:string}} [meta]
   * @returns {Promise<void>}
   */
  logLlmMetrics(metrics, meta) {
    return this.root.logLlmMetrics(metrics, meta);
  }
}

/**
 * 创建一个无操作日志器（用于未传入 logger 的调用方/测试场景）。
 * @returns {{trace:(m:string,d?:any)=>Promise<void>, debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>, logAgentLifecycleEvent:(e:string,d?:any)=>Promise<void>, logLlmMetrics:(m:any,meta?:any)=>Promise<void>}}
 */
export function createNoopModuleLogger() {
  const noop = async () => {};
  return { 
    trace: noop, 
    debug: noop, 
    info: noop, 
    warn: noop, 
    error: noop,
    logAgentLifecycleEvent: noop,
    logLlmMetrics: noop
  };
}

/**
 * 创建一个默认的 Logger 配置（当配置缺失或无效时使用）。
 * @param {any} cfg
 * @returns {{enabled:boolean, logsDir:string|null, defaultLevel:LogLevel, levels:Record<string, LogLevel>}}
 */
export function normalizeLoggingConfig(cfg) {
  const enabled = cfg ? Boolean(cfg.enabled ?? true) : false;
  const logsDir = cfg && typeof cfg.logsDir === "string" ? cfg.logsDir : null;
  const defaultLevel = _normalizeLevel(cfg?.defaultLevel) ?? "info";
  const consoleOutput = cfg?.consoleOutput !== false; // 默认启用控制台输出
  const levels = {};
  if (cfg && cfg.levels && typeof cfg.levels === "object") {
    for (const [k, v] of Object.entries(cfg.levels)) {
      const lv = _normalizeLevel(v);
      if (lv) levels[String(k)] = lv;
    }
  }
  return { enabled, logsDir, defaultLevel, levels, consoleOutput };
}

/**
 * @param {any} value
 * @returns {LogLevel|null}
 */
function _normalizeLevel(value) {
  const lv = String(value ?? "").toLowerCase();
  if (lv === "trace") return "trace";
  if (lv === "debug") return "debug";
  if (lv === "info") return "info";
  if (lv === "warn") return "warn";
  if (lv === "error") return "error";
  return null;
}

/**
 * @returns {string}
 */
function _buildRunDirName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function _extractAgentId(data) {
  if (!data || typeof data !== "object") return null;
  const direct = typeof data.agentId === "string" ? data.agentId : null;
  if (direct) return direct;
  const meta = data.meta && typeof data.meta === "object" ? data.meta : null;
  if (meta && typeof meta.agentId === "string") return meta.agentId;
  return null;
}

function _sanitizeFileSegment(value) {
  const s = String(value ?? "").trim();
  if (!s) return "unknown";
  const replaced = s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return replaced.length > 120 ? replaced.slice(0, 120) : replaced;
}

/**
 * @param {string} moduleName
 * @param {LogLevel} level
 * @param {string} message
 * @param {any} [data]
 * @returns {string}
 */
function _formatLine(moduleName, level, message, data) {
  const ts = _formatTimestamp(new Date());
  const head = `${ts} [${level.toUpperCase()}] [${moduleName}]`;
  if (data === undefined) return `${head} ${message}`;

  const tail = _formatData(data);
  if (tail.includes("\n")) return `${head} ${message}\n${tail}`;
  return `${head} ${message} ${tail}`;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function _formatTimestamp(date) {
  // 使用本地时间格式：YYYY-MM-DD HH:mm:ss.SSS
  return formatLocalTime(date).replace('T', ' ');
}

/**
 * @param {any} data
 * @returns {string}
 */
function _formatData(data) {
  if (data instanceof Error) {
    return data.stack || `${data.name}: ${data.message}`;
  }
  if (typeof data === "string") return data;
  if (typeof data === "number") return String(data);
  if (typeof data === "boolean") return String(data);
  if (typeof data === "bigint") return data.toString();
  if (data === null) return "null";
  if (data === undefined) return "undefined";

  const seen = new WeakSet();
  const replacer = (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (value && typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };

  try {
    return JSON.stringify(data, replacer, 2);
  } catch {
    return inspect(data, { depth: 6, colors: false, breakLength: 120, maxArrayLength: 200 });
  }
}

/**
 * @param {LogLevel} level
 * @param {string} line
 * @returns {void}
 */
function _writeToConsole(level, line) {
  if (level === "warn" || level === "error") {
    process.stderr.write(line + "\n");
    return;
  }
  process.stdout.write(line + "\n");
}
