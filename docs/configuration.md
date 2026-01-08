# 配置说明

本文档详细介绍 Agent Society 的配置选项。

## 目录

- [配置文件结构](#配置文件结构)
- [主配置文件](#主配置文件)
- [日志配置](#日志配置)
- [提示词配置](#提示词配置)
- [环境变量](#环境变量)

## 配置文件结构

```
config/
├── app.json           # 主配置文件
├── logging.json       # 日志配置
└── prompts/           # 系统提示词模板
    ├── base.txt       # 基础提示词
    ├── root.txt       # 根智能体提示词
    ├── compose.txt    # 提示词拼接模板
    ├── tool_rules.txt # 工具使用规则
    ├── context_status.txt    # 上下文状态提示
    ├── context_warning.txt   # 上下文警告提示
    ├── context_critical.txt  # 上下文临界提示
    └── context_exceeded.txt  # 上下文超限提示
```

## 主配置文件

`config/app.json` 是系统的主配置文件。

### 完整配置示例

```json
{
  "promptsDir": "config/prompts",
  "artifactsDir": "data/runtime/artifacts",
  "runtimeDir": "data/runtime/state",
  "loggingConfigPath": "config/logging.json",
  "maxSteps": 200,
  "maxToolRounds": 200,
  "idleWarningMs": 300000,
  "httpPort": 3000,
  "enableHttp": false,
  "llm": {
    "baseURL": "http://127.0.0.1:1234/v1",
    "model": "gpt-4",
    "apiKey": "your-api-key"
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
| `maxToolRounds` | `number` | `200` | 单次 LLM 调用最大工具轮次 |
| `idleWarningMs` | `number` | `300000` | 智能体空闲警告时间（毫秒） |

#### HTTP 服务器配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `httpPort` | `number` | `3000` | HTTP 服务器端口 |
| `enableHttp` | `boolean` | `false` | 是否启用 HTTP 服务器 |

#### LLM 配置

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `llm.baseURL` | `string` | LLM API 基础 URL |
| `llm.model` | `string` | 模型名称 |
| `llm.apiKey` | `string` | API 密钥 |

**常见 LLM 配置示例：**

```json
// OpenAI
{
  "llm": {
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4",
    "apiKey": "sk-..."
  }
}

// LM Studio (本地)
{
  "llm": {
    "baseURL": "http://127.0.0.1:1234/v1",
    "model": "local-model",
    "apiKey": "NOT_NEEDED"
  }
}

// Ollama (本地)
{
  "llm": {
    "baseURL": "http://127.0.0.1:11434/v1",
    "model": "llama2",
    "apiKey": "NOT_NEEDED"
  }
}

// Azure OpenAI
{
  "llm": {
    "baseURL": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
    "model": "gpt-4",
    "apiKey": "your-azure-key"
  }
}
```

#### 上下文限制配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `contextLimit.maxTokens` | `number` | `12000` | 最大 token 数 |
| `contextLimit.warningThreshold` | `number` | `0.7` | 警告阈值（70%） |
| `contextLimit.criticalThreshold` | `number` | `0.9` | 临界阈值（90%） |
| `contextLimit.hardLimitThreshold` | `number` | `0.95` | 硬性限制（95%） |

#### 模块配置

`modules` 配置项用于启用和配置可插拔模块。支持两种格式：

**字符串数组格式（向后兼容）：**

```json
{
  "modules": ["chrome", "other-module"]
}
```

**对象格式（带模块配置）：**

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

**Chrome 模块配置选项：**

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `headless` | `boolean` | `true` | 是否以无头模式启动浏览器 |

设置 `headless: false` 可以在启动浏览器时显示浏览器窗口，便于调试。

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
    "contact": "info"
  }
}
```

### 配置项详解

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否启用日志 |
| `logsDir` | `string` | `"data/runtime/logs"` | 日志输出目录 |
| `defaultLevel` | `string` | `"info"` | 默认日志级别 |
| `levels` | `object` | - | 各模块日志级别 |

### 日志级别

从低到高：`debug` < `info` < `warn` < `error`

| 级别 | 说明 |
|------|------|
| `debug` | 调试信息，最详细 |
| `info` | 一般信息 |
| `warn` | 警告信息 |
| `error` | 错误信息 |

### 模块说明

| 模块 | 说明 |
|------|------|
| `runtime` | 运行时核心 |
| `llm` | LLM 调用 |
| `org` | 组织原语 |
| `artifacts` | 工件存储 |
| `bus` | 消息总线 |
| `prompts` | 提示词加载 |
| `society` | AgentSociety |
| `http` | HTTP 服务器 |
| `workspace` | 工作空间管理 |
| `command` | 命令执行 |
| `contact` | 联系人管理 |

### 日志文件结构

```
data/<dataDir>/logs/<timestamp>/
├── system.log              # 系统级日志
├── agent-root.log          # 根智能体日志
├── agent-user.log          # 用户端点日志
├── agent-<id>.log          # 各智能体日志
└── ...
```

## 提示词配置

系统提示词模板位于 `config/prompts/` 目录。

### 文件说明

| 文件 | 说明 |
|------|------|
| `base.txt` | 基础系统提示词，所有智能体共享 |
| `root.txt` | 根智能体专用提示词 |
| `compose.txt` | 提示词拼接模板 |
| `tool_rules.txt` | 工具使用规则说明 |
| `context_status.txt` | 上下文状态信息模板 |
| `context_warning.txt` | 上下文警告提示模板 |
| `context_critical.txt` | 上下文临界提示模板 |
| `context_exceeded.txt` | 上下文超限提示模板 |

### 自定义提示词

你可以修改这些文件来自定义系统行为：

**base.txt 示例：**

```
你是一个智能体，运行在 Agent Society 系统中。

你的职责是：
1. 理解并执行分配给你的任务
2. 与其他智能体协作完成复杂任务
3. 使用工具完成具体操作
4. 向用户或上级汇报进度和结果

重要规则：
- 保持上下文最小化，避免无限堆叠信息
- 跨岗位交付使用工件引用
- 遇到问题及时汇报
```

**root.txt 示例：**

```
你是根智能体（Root），负责接收用户需求并组织执行。

你的职责：
1. 分析用户需求
2. 创建合适的岗位和智能体
3. 将任务分配给子智能体
4. 监督任务执行

约束：
- 每个 taskId 只能创建一个直属子智能体
- 不直接执行具体业务工作
- 创建子智能体后通知用户入口智能体 ID
```

## 环境变量

部分配置可通过环境变量覆盖：

| 环境变量 | 说明 |
|----------|------|
| `AGENT_SOCIETY_CONFIG` | 配置文件路径 |
| `AGENT_SOCIETY_DATA_DIR` | 数据目录 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | OpenAI API 基础 URL |

**示例：**

```bash
# 使用环境变量
export OPENAI_API_KEY="sk-..."
export AGENT_SOCIETY_DATA_DIR="./my_data"

bun run demo/demo1.js
```

## 多实例配置

运行多个独立实例时，使用不同的 `dataDir`：

```javascript
// 实例 1
const system1 = new AgentSociety({ dataDir: "data/instance1" });

// 实例 2
const system2 = new AgentSociety({ dataDir: "data/instance2" });
```

每个实例会有独立的：
- 组织状态 (`state/org.json`)
- 工件存储 (`artifacts/`)
- 日志文件 (`logs/`)
