# LLM 服务 (llm/)

## 概述

LLM 服务负责与大语言模型的交互、服务管理、模型选择和并发控制。

## 模块列表

### llm_client.js
- **职责**：LLM 客户端，与 LLM 服务通信
- **功能**：
  - 调用聊天补全
  - 重试机制
  - 请求中断
  - 错误处理

### llm_service_registry.js
- **职责**：LLM 服务注册表
- **功能**：
  - 注册 LLM 服务
  - 查询可用服务
  - 服务配置管理

### model_selector.js
- **职责**：模型选择器
- **功能**：
  - 根据需求选择合适的模型
  - 模型能力匹配
  - 负载均衡

### concurrency_controller.js
- **职责**：并发控制器
- **功能**：
  - 控制 LLM 请求并发数
  - 请求队列管理
  - 限流和降级

## 依赖关系

- llm_client.js 依赖 concurrency_controller.js
- model_selector.js 依赖 llm_service_registry.js

## 注意事项

- LLM 调用应该有完善的错误处理和重试机制
- 并发控制应该防止请求风暴
- 模型选择应该考虑成本和性能
