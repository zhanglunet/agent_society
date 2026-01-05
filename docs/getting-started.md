# 快速入门指南

本指南将帮助你快速上手 Agent Society，从安装配置到运行第一个多智能体协作任务。

## 目录

- [环境准备](#环境准备)
- [安装](#安装)
- [配置](#配置)
- [第一个示例](#第一个示例)
- [理解输出](#理解输出)
- [下一步](#下一步)

## 环境准备

### 运行时环境

Agent Society 推荐使用 [Bun](https://bun.sh/) 作为运行时，也支持 Node.js。

**安装 Bun（推荐）：**

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

**或使用 Node.js：**

确保 Node.js 版本 >= 18。

### LLM 服务

Agent Society 需要一个兼容 OpenAI API 的 LLM 服务。你可以选择：

1. **本地 LLM**（推荐开发测试）
   - [LM Studio](https://lmstudio.ai/) - 图形界面，易于使用
   - [Ollama](https://ollama.ai/) - 命令行工具
   - [vLLM](https://github.com/vllm-project/vllm) - 高性能推理

2. **云端 API**
   - OpenAI API
   - Azure OpenAI
   - 其他兼容 OpenAI API 的服务

## 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/agent-society.git
cd agent-society

# 安装依赖
bun install
# 或使用 npm
npm install
```

## 配置

### 主配置文件

编辑 `config/app.json`：

```json
{
  "promptsDir": "config/prompts",
  "artifactsDir": "data/runtime/artifacts",
  "runtimeDir": "data/runtime/state",
  "loggingConfigPath": "config/logging.json",
  "maxSteps": 200,
  "maxToolRounds": 200,
  "llm": {
    "baseURL": "http://127.0.0.1:1234/v1",
    "model": "your-model-name",
    "apiKey": "your-api-key-or-NOT_NEEDED"
  },
  "contextLimit": {
    "maxTokens": 12000,
    "warningThreshold": 0.7,
    "criticalThreshold": 0.9,
    "hardLimitThreshold": 0.95
  }
}
```

**配置项说明：**

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `promptsDir` | 系统提示词目录 | `config/prompts` |
| `artifactsDir` | 工件存储目录 | `data/runtime/artifacts` |
| `runtimeDir` | 运行时状态目录 | `data/runtime/state` |
| `maxSteps` | 消息循环最大步数 | `200` |
| `maxToolRounds` | 单次 LLM 调用最大工具轮次 | `200` |
| `llm.baseURL` | LLM API 地址 | - |
| `llm.model` | 模型名称 | - |
| `llm.apiKey` | API 密钥 | - |

### 日志配置

编辑 `config/logging.json`：

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
    "society": "info"
  }
}
```

**日志级别：** `debug` < `info` < `warn` < `error`

## 第一个示例

### 示例 1：简单计算

创建一个文件 `my_first_demo.js`：

```javascript
import { AgentSociety } from "./src/platform/agent_society.js";

async function main() {
  // 创建系统实例
  const system = new AgentSociety({ 
    dataDir: "data/my_demo"  // 指定数据目录
  });
  
  // 初始化系统
  await system.init();
  
  // 提交需求给根智能体
  const { taskId } = await system.submitRequirement(
    "计算 123 + 456 等于多少？把结果告诉我。"
  );
  
  console.log(`任务已提交，taskId: ${taskId}`);
  
  // 等待用户端点收到回复
  const reply = await system.waitForUserMessage(
    (m) => m?.taskId === taskId && m?.from !== "root",
    { timeoutMs: 120000 }  // 2分钟超时
  );
  
  if (reply) {
    console.log("收到回复：", reply.payload?.text ?? JSON.stringify(reply.payload));
  } else {
    console.log("等待超时");
  }
}

main().catch(console.error);
```

运行：

```bash
bun run my_first_demo.js
```

### 示例 2：交互式对话

```javascript
import readline from "node:readline";
import { AgentSociety } from "./src/platform/agent_society.js";

async function main() {
  const system = new AgentSociety({ dataDir: "data/interactive" });
  await system.init();
  
  // 提交初始需求
  const { taskId } = await system.submitRequirement(
    "你是一个友好的助手，请回答用户的问题。"
  );
  
  // 等待入口智能体创建
  const entryMsg = await system.waitForUserMessage(
    (m) => m?.taskId === taskId && m?.from === "root" && m?.payload?.agentId,
    { timeoutMs: 60000 }
  );
  
  const entryAgentId = entryMsg?.payload?.agentId;
  if (!entryAgentId) {
    console.log("未能获取入口智能体");
    return;
  }
  
  console.log(`入口智能体: ${entryAgentId}`);
  console.log("输入 'exit' 退出\n");
  
  // 创建命令行接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (q) => new Promise(r => rl.question(q, r));
  
  while (true) {
    const input = await question("你: ");
    if (input.toLowerCase() === "exit") break;
    
    // 发送消息给智能体
    system.sendTextToAgent(entryAgentId, input, { taskId });
    
    // 等待回复
    const reply = await system.waitForUserMessage(
      (m) => m?.taskId === taskId && m?.payload?.text,
      { timeoutMs: 60000 }
    );
    
    if (reply) {
      console.log(`助手: ${reply.payload.text}\n`);
    }
  }
  
  rl.close();
}

main().catch(console.error);
```

## 理解输出

### 控制台输出

运行示例时，你会看到类似这样的输出：

```
[user] from=assistant-xxx taskId=abc-123
计算结果是 579。
```

- `[user]` - 表示这是发送到用户端点的消息
- `from=assistant-xxx` - 消息发送者的智能体 ID
- `taskId=abc-123` - 任务标识符
- 下一行是消息内容

### 日志文件

日志保存在 `data/<dataDir>/logs/<timestamp>/` 目录下：

- `system.log` - 系统级日志
- `agent-root.log` - 根智能体日志
- `agent-<id>.log` - 各智能体日志

### 组织状态

组织结构保存在 `data/<dataDir>/state/org.json`：

```json
{
  "roles": {
    "role-xxx": {
      "id": "role-xxx",
      "name": "assistant",
      "rolePrompt": "...",
      "createdBy": "root",
      "createdAt": "2026-01-06T..."
    }
  },
  "agents": {
    "agent-xxx": {
      "id": "agent-xxx",
      "roleId": "role-xxx",
      "parentAgentId": "root"
    }
  }
}
```

## 下一步

- 阅读 [架构设计](./architecture.md) 了解系统原理
- 查看 [API 参考](./api-reference.md) 了解完整接口
- 学习 [工具参考](./tools.md) 了解可用工具
- 运行 [示例教程](./examples.md) 体验更多场景
