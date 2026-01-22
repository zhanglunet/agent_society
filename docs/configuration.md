# 配置说明

本文档详细介绍 Agent Society 的配置选项。

## 目录

- [配置说明](#配置说明)
  - [目录](#目录)
  - [配置文件结构](#配置文件结构)
  - [主配置文件 (app.json)](#主配置文件-appjson)
    - [完整配置示例](#完整配置示例)
    - [配置项详解](#配置项详解)
      - [目录配置](#目录配置)
      - [运行时配置](#运行时配置)
      - [HTTP 服务器配置](#http-服务器配置)
      - [默认 LLM 配置](#默认-llm-配置)
      - [上下文限制配置](#上下文限制配置)
      - [模块配置](#模块配置)
  - [多模型服务配置 (llmservices.json)](#多模型服务配置-llmservicesjson)
    - [完整配置示例](#完整配置示例-1)
    - [字段说明](#字段说明)
    - [能力标签建议](#能力标签建议)
  - [日志配置](#日志配置)
    - [完整配置示例](#完整配置示例-2)
    - [日志级别](#日志级别)
  - [提示词配置](#提示词配置)
    - [文件说明](#文件说明)
  - [环境变量](#环境变量)

## 配置文件结构

```
config/
├── app.json           # 主配置文件 (或 app.local.json)
├── llmservices.json   # 多模型服务配置 (或 llmservices.local.json)
├── logging.json       # 日志配置
└── prompts/           # 系统提示词模板
    ├── base.txt       # 基础提示词
    ├── root.txt       # 根智能体提示词
    ├── compose.txt    # 提示词拼接模板
    ├── tool_rules.txt # 工具使用规则
    ├── model_selector.txt # 模型选择器提示词
    ├── context_status.txt    # 上下文状态提示
    ├── context_warning.txt   # 上下文警告提示
    ├── context_critical.txt  # 上下文临界提示
    └── context_exceeded.txt  # 上下文超限提示
```

> **注意**：系统会优先加载 `*.local.json` 文件（如果存在），这允许你创建不被 Git 追踪的本地配置文件。

## 主配置文件 (app.json)

`config/app.json` 是系统的主配置文件。

### 完整配置示例

```json
{
  "promptsDir": "config/prompts",
  "artifactsDir": "data/runtime/artifacts",
  "runtimeDir": "data/runtime/state",
  "loggingConfigPath": "config/logging.json",
  "maxSteps": 200,
  "maxToolRounds": 20000,
  "idleWarningMs": 300000,
  "httpPort": 3000,
  "enableHttp": true,
  "modules": ["chrome"],
  "llm": {
    "baseURL": "http://127.0.0.1:1234/v1",
    "model": "gpt-4",
    "apiKey": "your-api-key",
    "concurrencyController": {
      "maxConcurrentRequests": 3
    }
  },
  "contextLimit": {
    "maxTokens": 12000,
    "warningThreshold": 0.7,
    "criticalThreshold": 0.9,
    "hardLimitThreshold": 0.95
  }
}
```

### 配置项详解

#### 目录配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `promptsDir` | `string` | `"config/prompts"` | 系统提示词目录 |
| `artifactsDir` | `string` | `"data/runtime/artifacts"` | 工件存储目录 |
| `runtimeDir` | `string` | `"data/runtime/state"` | 运行时状态目录 |
| `loggingConfigPath` | `string` | `"config/logging.json"` | 日志配置文件路径 |

#### 运行时配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `maxSteps` | `number` | `200` | 消息循环最大步数 |
| `maxToolRounds` | `number` | `20000` | 单次 LLM 调用最大工具轮次 |
| `idleWarningMs` | `number` | `300000` | 智能体空闲警告时间（毫秒） |

#### HTTP 服务器配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `httpPort` | `number` | `3000` | HTTP 服务器端口 |
| `enableHttp` | `boolean` | `false` | 是否启用 HTTP 服务器 |

#### 默认 LLM 配置

此配置作为系统的默认 LLM 服务，当岗位未指定特定服务或模型选择器未启用时使用。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `llm.baseURL` | `string` | LLM API 基础 URL |
| `llm.model` | `string` | 模型名称 |
| `llm.apiKey` | `string` | API 密钥 |
| `llm.concurrencyController.maxConcurrentRequests` | `number` | 全局最大并发请求数（默认 3） |

#### 上下文限制配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `contextLimit.maxTokens` | `number` | `12000` | 最大 token 数 |
| `contextLimit.warningThreshold` | `number` | `0.7` | 警告阈值（70%） |
| `contextLimit.criticalThreshold` | `number` | `0.9` | 临界阈值（90%） |
| `contextLimit.hardLimitThreshold` | `number` | `0.95` | 硬性限制（95%） |

#### 模块配置

`modules` 配置项用于启用和配置可插拔模块。支持两种格式：

**字符串数组格式（简单启用）：**

```json
{
  "modules": ["chrome", "other-module"]
}
```

**对象格式（带模块参数）：**

```json
{
  "modules": {
    "chrome": {
      "headless": false
    },
    "other-module": {
      "customOption": "value"
    }
  }
}
```

## 多模型服务配置 (llmservices.json)

`config/llmservices.json` 用于配置额外的 LLM 服务，供模型选择器使用。

### 完整配置示例

```json
{
  "services": [
    {
      "id": "gpt4-turbo",
      "name": "GPT-4 Turbo",
      "baseURL": "https://api.openai.com/v1",
      "model": "gpt-4-turbo",
      "apiKey": "sk-...",
      "capabilityTags": ["reasoning", "coding", "complex"],
      "description": "Powerful model for complex reasoning and coding tasks",
      "maxConcurrentRequests": 5
    },
    {
      "id": "claude-3-opus",
      "name": "Claude 3 Opus",
      "baseURL": "https://api.anthropic.com/v1",
      "model": "claude-3-opus-20240229",
      "apiKey": "sk-ant-...",
      "capabilityTags": ["writing", "creative", "analysis"],
      "description": "Excellent at writing and analysis"
    },
    {
      "id": "local-llama3",
      "name": "Local Llama 3",
      "baseURL": "http://localhost:11434/v1",
      "model": "llama3",
      "apiKey": "ollama",
      "capabilityTags": ["chat", "fast", "local"],
      "description": "Fast local model for simple tasks"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 服务唯一标识（用于引用） |
| `name` | `string` | 是 | 服务显示名称 |
| `baseURL` | `string` | 是 | API 基础 URL |
| `model` | `string` | 是 | 模型名称 |
| `apiKey` | `string` | 是 | API 密钥 |
| `capabilityTags` | `string[]` | 是 | 能力标签（用于自动匹配） |
| `description` | `string` | 是 | 服务描述（用于辅助选择） |
| `maxConcurrentRequests` | `number` | 否 | 该服务的最大并发数（默认 2） |

### 能力标签建议

- `reasoning`: 逻辑推理
- `coding`: 编程能力
- `creative`: 创意写作
- `fast`: 响应速度快
- `chat`: 日常对话
- `analysis`: 数据分析

## 日志配置

`config/logging.json` 配置日志行为。

### 完整配置示例

```json
{
  "enabled": true,
  "logsDir": "data/runtime/logs",
  "defaultLevel": "info",
  "levels": {
    "runtime": "info",
    "llm": "info",
    "org": "info",
    "artifacts": "info",
    "bus": "info",
    "prompts": "warn",
    "society": "info",
    "http": "info",
    "workspace": "info",
    "command": "info",
    "contact": "info",
    "modules": "debug",
    "model_selector": "info"
  }
}
```

### 日志级别

从低到高：`debug` < `info` < `warn` < `error`

## 提示词配置

系统提示词模板位于 `config/prompts/` 目录。

### 文件说明

| 文件 | 说明 |
|------|------|
| `base.txt` | 基础系统提示词，所有智能体共享 |
| `root.txt` | 根智能体专用提示词 |
| `compose.txt` | 提示词拼接模板 |
| `tool_rules.txt` | 工具使用规则说明 |
| `workspace.txt` | 工作空间使用指南，说明文件操作工具的使用场景和方法 |
| `model_selector.txt` | 模型选择器的系统提示词，指导如何根据岗位选择 LLM |
| `context_status.txt` | 上下文状态信息模板 |
| `context_warning.txt` | 上下文警告提示模板 |
| `context_critical.txt` | 上下文临界提示模板 |
| `context_exceeded.txt` | 上下文超限提示模板 |

## 环境变量

部分配置可通过环境变量覆盖：

| 环境变量 | 说明 |
|----------|------|
| `AGENT_SOCIETY_CONFIG` | 主配置文件路径 |
| `AGENT_SOCIETY_DATA_DIR` | 数据目录 |
| `OPENAI_API_KEY` | 默认 LLM 的 API 密钥 |
| `OPENAI_BASE_URL` | 默认 LLM 的 API 基础 URL |
