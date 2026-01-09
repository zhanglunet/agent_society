# Implementation Plan: LLM Service Selector

## Overview

本实现计划将多场景化大模型服务选择功能分解为可执行的编码任务。实现顺序为：配置加载 → 模型选择器 → OrgPrimitives 扩展 → Runtime 扩展 → 集成测试。

## Tasks

- [x] 1. 创建 LlmServiceRegistry 组件
  - [x] 1.1 创建 src/platform/llm_service_registry.js 文件
    - 实现 LlmServiceRegistry 类
    - 实现 load() 方法，支持优先加载 local 配置文件
    - 实现 getServices()、getServiceById()、hasServices() 方法
    - 实现服务条目验证逻辑
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 1.2 编写 Property 1 属性测试：配置文件加载优先级
    - **Property 1: 配置文件加载优先级**
    - **Validates: Requirements 1.1, 1.2**
  - [x] 1.3 编写 Property 2 属性测试：服务配置字段完整性
    - **Property 2: 服务配置字段完整性**
    - **Validates: Requirements 1.4**
  - [x] 1.4 编写 Property 3 属性测试：无效条目过滤
    - **Property 3: 无效条目过滤**
    - **Validates: Requirements 1.5**
  - [x] 1.5 编写 Property 4 属性测试：服务 ID 查询一致性
    - **Property 4: 服务 ID 查询一致性**
    - **Validates: Requirements 1.6**

- [x] 2. 创建模型选择提示词模板
  - [x] 2.1 创建 config/prompts/model_selector.txt 文件
    - 编写模型选择提示词模板
    - 包含 {{ROLE_PROMPT}} 和 {{SERVICES_LIST}} 占位符
    - 指导 LLM 输出 JSON 格式结果
    - _Requirements: 2.1, 2.2, 2.4_

- [x] 3. 创建 ModelSelector 组件
  - [x] 3.1 创建 src/platform/model_selector.js 文件
    - 实现 ModelSelector 类
    - 实现 selectService() 方法
    - 实现 _buildSelectionPrompt() 方法
    - 实现 _parseSelectionResult() 方法
    - 实现空服务列表跳过逻辑
    - 实现异常处理和回退逻辑
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_
  - [x] 3.2 编写 Property 5 属性测试：空配置跳过选择
    - **Property 5: 空配置跳过选择**
    - **Validates: Requirements 3.2**
  - [x] 3.3 编写 Property 6 属性测试：选择结果解析与验证
    - **Property 6: 选择结果解析与验证**
    - **Validates: Requirements 3.4, 3.5**

- [x] 4. 扩展 OrgPrimitives 支持 llmServiceId
  - [x] 4.1 修改 src/platform/org_primitives.js
    - 在 createRole() 方法中添加 llmServiceId 参数
    - 在岗位数据结构中存储 llmServiceId 字段
    - 更新 validateRole() 函数支持可选的 llmServiceId
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 4.2 编写 Property 7 属性测试：岗位 llmServiceId 持久化往返
    - **Property 7: 岗位 llmServiceId 持久化往返**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 5. Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 确保 LlmServiceRegistry、ModelSelector、OrgPrimitives 扩展正常工作
  - 如有问题请询问用户

- [x] 6. 扩展 config.js 加载 LLM 服务配置
  - [x] 6.1 修改 src/platform/config.js
    - 在 loadConfig() 中添加 LLM 服务配置加载逻辑
    - 支持优先加载 llmservices.local.json
    - 返回 llmServices 配置项
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 7. 扩展 Runtime 支持多 LlmClient
  - [x] 7.1 修改 src/platform/runtime.js
    - 添加 LlmServiceRegistry 实例
    - 添加 ModelSelector 实例
    - 添加 llmClientPool (Map<string, LlmClient>)
    - 实现 getLlmClientForService() 方法
    - 实现 getLlmClientForAgent() 方法
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 7.2 编写 Property 8 属性测试：LlmClient 池实例复用
    - **Property 8: LlmClient 池实例复用**
    - **Validates: Requirements 4.4**
  - [x] 7.3 编写 Property 9 属性测试：LlmClient 回退逻辑
    - **Property 9: LlmClient 回退逻辑**
    - **Validates: Requirements 4.2, 4.3**

- [x] 8. 集成岗位创建时的模型选择
  - [x] 8.1 修改 Runtime 中的 create_role 工具处理逻辑
    - 在创建岗位时调用 ModelSelector.selectService()
    - 将选择的 llmServiceId 传递给 OrgPrimitives.createRole()
    - _Requirements: 3.1, 3.6_
  - [x] 8.2 修改 Runtime 中的 _handleWithLlm 方法
    - 根据智能体岗位的 llmServiceId 获取对应的 LlmClient
    - 使用获取的 LlmClient 进行对话
    - _Requirements: 4.1_

- [x] 9. 创建示例配置文件
  - [x] 9.1 创建 config/llmservices_template.json
    - 提供示例服务配置
    - 包含视觉理解、编程、低成本等场景示例
    - _Requirements: 1.4_

- [x] 10. Final Checkpoint - 确保所有测试通过 ✅
  - 运行完整测试套件
  - 验证端到端功能
  - 如有问题请询问用户

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
