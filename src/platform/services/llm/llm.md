# LLM 服务模块

## 概述

LLM 服务模块负责与大语言模型服务的交互，包括服务注册、模型选择、请求管理和并发控制。

## 模块职责

### llm_client.js
- **职责**：LLM 客户端，负责与 LLM 服务通信
- **主要功能**：
  - 调用聊天补全 API
  - 重试机制（指数退避策略）
  - 请求中断支持
  - 并发控制集成
  - Token 使用统计

### llm_service_registry.js
- **职责**：LLM 服务注册表，管理多个大模型服务配置
- **主要功能**：
  - 加载服务配置文件
  - 服务配置验证
  - 服务查询（按 ID、能力标签、能力类型）
  - 模型能力管理

### model_selector.js
- **职责**：模型选择器，根据岗位提示词选择合适的大模型服务
- **主要功能**：
  - 分析岗位职责要求
  - 匹配最合适的模型服务
  - 提供选择理由

### concurrency_controller.js
- **职责**：并发控制器，管理 LLM 请求的并发数量和队列
- **主要功能**：
  - 限制并发请求数量
  - 请求队列管理
  - 请求取消支持
  - 并发统计信息

## 依赖关系

```
llm_client.js
  ├─ concurrency_controller.js
  └─ logger.js

llm_service_registry.js
  └─ logger.js

model_selector.js
  ├─ llm_client.js
  ├─ llm_service_registry.js
  └─ logger.js

concurrency_controller.js
  └─ logger.js
```

## 使用示例

### 创建 LLM 客户端

```javascript
import { LlmClient } from "./services/llm/llm_client.js";

const client = new LlmClient({
  baseURL: "http://localhost:1234/v1",
  model: "gpt-4",
  apiKey: "sk-xxx",
  maxRetries: 3,
  maxConcurrentRequests: 3,
  logger: myLogger
});

const response = await client.chat({
  messages: [{ role: "user", content: "Hello" }],
  meta: { agentId: "agent-1" }
});
```

### 加载服务注册表

```javascript
import { LlmServiceRegistry } from "./services/llm/llm_service_registry.js";

const registry = new LlmServiceRegistry({
  configDir: "config",
  logger: myLogger
});

await registry.load();
const services = registry.getServices();
```

### 使用模型选择器

```javascript
import { ModelSelector } from "./services/llm/model_selector.js";

const selector = new ModelSelector({
  llmClient: client,
  serviceRegistry: registry,
  logger: myLogger
});

const result = await selector.selectService(rolePrompt);
console.log(`选择的服务: ${result.serviceId}, 原因: ${result.reason}`);
```

## 配置文件

### llmservices.json / llmservices.local.json

```json
{
  "services": [
    {
      "id": "lmstudio-local",
      "name": "LMStudio 本地服务",
      "baseURL": "http://localhost:1234/v1",
      "model": "qwen2.5-coder-32b-instruct",
      "apiKey": "lm-studio",
      "capabilityTags": ["coding", "reasoning"],
      "capabilities": {
        "input": ["text"],
        "output": ["text"]
      },
      "description": "本地运行的 Qwen2.5 Coder 模型"
    }
  ]
}
```

## 注意事项

1. **并发控制**：每个智能体同时只能有一个活跃的 LLM 请求
2. **请求中断**：支持通过 `abort(agentId)` 方法中断请求
3. **重试策略**：使用指数退避策略，延迟时间为 2^n 秒
4. **配置优先级**：优先加载 `llmservices.local.json`，其次是 `llmservices.json`
5. **能力验证**：服务配置中的 capabilities 字段会被验证和标准化
