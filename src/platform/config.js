import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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
    llm: cfg.llm
      ? {
          baseURL: String(cfg.llm.baseURL ?? ""),
          model: String(cfg.llm.model ?? ""),
          apiKey: String(cfg.llm.apiKey ?? "")
        }
      : null
    ,
    logging,
    dataDir,
    // 模块配置：支持字符串数组或对象格式
    // 数组格式: ["chrome", "other"]
    // 对象格式: { "chrome": { headless: false }, "other": {} }
    modules: cfg.modules ?? {},
    contextLimit: cfg.contextLimit ?? null
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
