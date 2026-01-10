/**
 * Runtime 子模块索引文件
 * 
 * 本目录包含 Runtime 类拆分后的各个子模块：
 * - javascript_executor.js - JavaScript 代码执行器
 * - context_builder.js - 上下文构建器
 * - agent_manager.js - 智能体管理器
 * - message_processor.js - 消息处理器
 * - tool_executor.js - 工具执行器
 * - llm_handler.js - LLM 处理器
 * - shutdown_manager.js - 关闭管理器
 * 
 * 设计原则：
 * 1. 只做结构调整，不修改业务逻辑
 * 2. 保持向后兼容，Runtime 类的公共 API 不变
 * 3. 每个模块包含详细的中文注释
 * 
 * @module runtime
 */

export { JavaScriptExecutor } from './javascript_executor.js';
export { ContextBuilder } from './context_builder.js';
export { AgentManager } from './agent_manager.js';
export { MessageProcessor } from './message_processor.js';
export { ToolExecutor } from './tool_executor.js';
export { LlmHandler } from './llm_handler.js';
export { ShutdownManager } from './shutdown_manager.js';
