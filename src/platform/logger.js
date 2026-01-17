/**
 * 兼容性导出：logger.js 已移动到 utils/logger/logger.js
 * 此文件提供向后兼容的导出，保持旧的导入路径可用
 * 
 * @deprecated 请使用新路径：import { Logger } from './utils/logger/logger.js'
 */

export {
  Logger,
  ModuleLogger,
  createNoopModuleLogger,
  normalizeLoggingConfig,
  formatLocalTime
} from "./utils/logger/logger.js";
