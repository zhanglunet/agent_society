# logger 目录

## 职责

提供统一的日志系统，支持按模块设置日志等级，并同时输出到控制台与文件。

## 包含的文件

### logger.js

**职责**：日志系统的核心实现

**主要功能**：
- 按模块设置日志等级
- 同时输出到控制台和文件
- 支持结构化日志
- 记录智能体生命周期事件
- 记录 LLM 调用指标
- 按智能体 ID 分离日志文件

**导出的类和函数**：
- `Logger`：统一日志器类
- `ModuleLogger`：模块日志器类
- `createNoopModuleLogger()`：创建无操作日志器
- `normalizeLoggingConfig(cfg)`：规范化日志配置
- `formatLocalTime(date)`：格式化本地时间

**内部结构**：
- 日志级别管理（trace, debug, info, warn, error）
- 日志文件管理（按运行时间创建目录）
- 智能体日志分离（按 agentId 创建独立日志文件）
- 结构化日志支持（生命周期事件、LLM 指标）

**关键约束**：
- 日志写入失败不影响主流程
- 支持禁用日志功能
- 支持仅控制台输出或同时文件输出
- 日志格式统一：时间戳 [级别] [模块] 消息 数据

**使用示例**：
```javascript
import { Logger, normalizeLoggingConfig } from './logger.js';

// 创建日志器
const config = normalizeLoggingConfig({
  enabled: true,
  logsDir: './logs',
  defaultLevel: 'info',
  levels: {
    'runtime': 'debug',
    'llm': 'trace'
  }
});
const logger = new Logger(config);

// 为模块创建子日志器
const moduleLogger = logger.forModule('my-module');
await moduleLogger.info('操作成功', { userId: '123' });
await moduleLogger.error('操作失败', new Error('详细错误'));

// 记录生命周期事件
await logger.logAgentLifecycleEvent('agent_created', {
  agentId: 'agent-1',
  roleId: 'role-1',
  roleName: 'worker'
});

// 记录 LLM 指标
await logger.logLlmMetrics({
  latencyMs: 1500,
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
  success: true,
  model: 'gpt-4'
}, {
  agentId: 'agent-1',
  taskId: 'task-1'
});
```

## 设计背景

日志系统是系统可观测性的基础设施，需要：
1. 支持灵活的日志级别控制，便于调试和生产环境使用
2. 同时输出到控制台和文件，满足不同场景需求
3. 按智能体分离日志，便于追踪单个智能体的行为
4. 支持结构化日志，便于日志分析和监控
5. 日志写入失败不影响主流程，保证系统稳定性

## 依赖关系

**依赖的模块**：
- `node:fs/promises`：文件系统操作
- `node:path`：路径处理
- `node:util`：对象格式化

**被依赖的模块**：
- 几乎所有平台模块都依赖日志系统
- 通过 `createNoopModuleLogger()` 提供默认实现，避免强依赖
