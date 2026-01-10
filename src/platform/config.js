import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 加载 LLM 服务配置文件（优先 local 文件）
 * @param {string} configDir 配置目录路径
 * @returns {Promise<{services: any[], configPath: string|null, configSource: string|null}>}
 */
async function loadLlmServicesConfig(configDir) {
  const localPath = path.resolve(configDir, "llmservices.local.json");
  const defaultPath = path.resolve(configDir, "llmservices.json");
  
  let configPath = null;
  let configSource = null;
  
  // 优先加载 local 配置文件
  if (existsSync(localPath)) {
    configPath = localPath;
    configSource = "local";
  } else if (existsSync(defaultPath)) {
    configPath = defaultPath;
    configSource = "default";
  }
  
  // 如果两个文件都不存在，返回空配置
  if (!configPath) {
    return { services: [], configPath: null, configSource: null };
  }
  
  try {
    const raw = await readFile(configPath, "utf8");
    const data = JSON.parse(raw);
    const services = Array.isArray(data?.services) ? data.services : [];
    return { services, configPath, configSource };
  } catch {
    // 解析失败时返回空配置
    return { services: [], configPath, configSource };
  }
}

/**
 * 读取并解析平台配置文件。
 * 优先加载 app.local.json，如果不存在则加载 app.json。
 * @param {string} configPath 配置文件路径（相对或绝对）
 * @param {{dataDir?:string}} [options] 可选配置
 * @returns {Promise<object>} 配置对象
 */
export async function loadConfig(configPath = "config/app.json", options = {}) {
  let absPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);
  
  // 如果使用默认配置路径，优先检查 app.local.json
  if (configPath === "config/app.json") {
    const localConfigPath = path.resolve(process.cwd(), "config/app.local.json");
    if (existsSync(localConfigPath)) {
      absPath = localConfigPath;
    }
  }
  
  const raw = await readFile(absPath, "utf8");
  const cfg = JSON.parse(raw);

  const loggingConfigPath = cfg.loggingConfigPath
    ? path.resolve(process.cwd(), String(cfg.loggingConfigPath))
    : null;
  let logging = loggingConfigPath ? await _loadOptionalJson(loggingConfigPath) : null;

  // 如果提供了 dataDir，则使用它作为数据目录的基础路径
  const dataDir = options.dataDir
    ? (path.isAbsolute(options.dataDir) ? options.dataDir : path.resolve(process.cwd(), options.dataDir))
    : null;

  // 如果提供了 dataDir，尝试加载 dataDir 下的 logging.json（优先级高于全局配置）
  if (dataDir) {
    const dataDirLoggingPath = path.resolve(dataDir, "logging.json");
    const dataDirLogging = await _loadOptionalJson(dataDirLoggingPath);
    if (dataDirLogging) {
      logging = dataDirLogging;
    }
  }

  // 如果提供了 dataDir，覆盖日志目录配置
  if (dataDir && logging) {
    logging.logsDir = path.resolve(dataDir, "logs");
  }

  return {
    promptsDir: path.resolve(process.cwd(), cfg.promptsDir),
    artifactsDir: dataDir ? path.resolve(dataDir, "artifacts") : path.resolve(process.cwd(), cfg.artifactsDir),
    runtimeDir: dataDir ? path.resolve(dataDir, "state") : path.resolve(process.cwd(), cfg.runtimeDir),
    maxSteps: Number.isFinite(cfg.maxSteps) ? cfg.maxSteps : 200,
    maxToolRounds: Number.isFinite(cfg.maxToolRounds) ? cfg.maxToolRounds : 200,
    httpPort: Number.isFinite(cfg.httpPort) ? cfg.httpPort : 3000,
    enableHttp: typeof cfg.enableHttp === "boolean" ? cfg.enableHttp : false,
    llm: cfg.llm
      ? {
          baseURL: String(cfg.llm.baseURL ?? ""),
          model: String(cfg.llm.model ?? ""),
          apiKey: String(cfg.llm.apiKey ?? ""),
          maxConcurrentRequests: _validateMaxConcurrentRequests(cfg.llm.maxConcurrentRequests)
        }
      : null
    ,
    logging,
    dataDir,
    // 模块配置：支持字符串数组或对象格式
    // 数组格式: ["chrome", "other"]
    // 对象格式: { "chrome": { headless: false }, "other": {} }
    modules: cfg.modules ?? {},
    contextLimit: cfg.contextLimit ?? null,
    // LLM 服务配置：从 llmservices.local.json 或 llmservices.json 加载
    llmServices: await loadLlmServicesConfig(path.dirname(absPath))
  };
}

/**
 * 尝试加载 JSON 文件；不存在则返回 null。
 * @param {string} absPath
 * @returns {Promise<any|null>}
 */
async function _loadOptionalJson(absPath) {
  try {
    const raw = await readFile(absPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * 验证并返回有效的最大并发请求数
 * @param {any} value 配置值
 * @returns {number} 有效的最大并发请求数
 */
function _validateMaxConcurrentRequests(value) {
  const defaultValue = 2;
  
  // 如果未配置，使用默认值
  if (value === undefined || value === null) {
    return defaultValue;
  }
  
  // 必须是数字类型且为正整数
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    console.warn(`Invalid maxConcurrentRequests value: ${value}. Using default value: ${defaultValue}`);
    return defaultValue;
  }
  
  return value;
}
