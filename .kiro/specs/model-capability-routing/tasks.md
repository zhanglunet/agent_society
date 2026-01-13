# Implementation Plan: Model Capability Routing

## Overview

本实现计划将模型能力路由功能分解为可执行的编码任务。实现顺序为：配置格式扩展 → 注册表能力方法 → 内容适配器 → 能力路由器 → 运行时集成。

## Tasks

- [x] 1. 扩展配置格式和验证逻辑
  - [x] 1.1 更新 LlmServiceRegistry 支持 capabilities 字段
    - 修改 `src/platform/llm_service_registry.js`
    - 在 `validateServiceConfig` 函数中添加 capabilities 验证
    - 支持 `input` 和 `output` 数组格式
    - 无 capabilities 时默认为 `{input: ['text'], output: ['text']}`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 5.2_

  - [x] 1.2 编写配置验证的属性测试
    - **Property 1: Configuration Validation**
    - **Validates: Requirements 1.1, 1.2, 1.4**

  - [x] 1.3 编写向后兼容性的属性测试
    - **Property 6: Backward Compatibility**
    - **Validates: Requirements 1.5, 5.2**

- [x] 2. 实现 LlmServiceRegistry 能力查询方法
  - [x] 2.1 添加 hasCapability 方法
    - 在 `src/platform/llm_service_registry.js` 中添加方法
    - 支持 direction 参数：'input' | 'output' | 'both'
    - 处理服务不存在的情况
    - _Requirements: 6.1, 6.4_

  - [x] 2.2 添加 getCapabilities 方法
    - 返回服务的完整 capabilities 对象
    - 服务不存在时返回 null
    - _Requirements: 6.2_

  - [x] 2.3 添加 getServicesByCapability 方法
    - 根据能力类型查询支持的服务列表
    - 支持 direction 过滤
    - _Requirements: 4.1, 4.2_

  - [x] 2.4 编写能力查询API的属性测试
    - **Property 7: Capability Query API Correctness**
    - **Validates: Requirements 4.1, 4.2, 6.1, 6.2, 6.4**

- [x] 3. Checkpoint - 确保配置和注册表测试通过
  - 运行所有测试，确保通过
  - 如有问题，询问用户

- [x] 4. 实现 ContentAdapter 组件
  - [x] 4.1 创建 ContentAdapter 类
    - 新建 `src/platform/content_adapter.js`
    - 实现 `adaptToText` 方法，转换单个附件
    - 实现 `adaptMultiple` 方法，批量转换
    - 生成包含 artifactRef、filename、type、size 的结构化文本
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 实现 findCapableAgents 方法
    - 查询具备指定能力的智能体
    - 在转换文本中添加建议转发的智能体列表
    - _Requirements: 4.4_

  - [x] 4.3 编写内容适配器输出完整性的属性测试
    - **Property 4: Content Adapter Output Completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

  - [x] 4.4 编写结构化输出格式的属性测试
    - **Property 5: Structured Output Format**
    - **Validates: Requirements 3.6**

- [x] 5. 实现 CapabilityRouter 组件
  - [x] 5.1 创建 CapabilityRouter 类
    - 新建 `src/platform/capability_router.js`
    - 实现 `routeContent` 方法
    - 实现 `getRequiredCapabilities` 方法
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 5.2 实现支持能力的内容处理
    - 当模型支持对应能力时，保留原始附件数据
    - 调用现有的 `formatMultimodalContent` 处理图片
    - _Requirements: 2.1, 2.3, 2.5_

  - [x] 5.3 实现不支持能力的回退处理
    - 当模型不支持对应能力时，调用 ContentAdapter 转换
    - 将转换后的文本描述添加到消息内容
    - _Requirements: 2.2, 2.4, 2.6_

  - [x] 5.4 编写能力路由的属性测试
    - **Property 2: Capability Routing for Supported Types**
    - **Validates: Requirements 2.1, 2.3, 2.5**

  - [x] 5.5 编写回退转换的属性测试
    - **Property 3: Fallback Conversion for Unsupported Types**
    - **Validates: Requirements 2.2, 2.4, 2.6**

- [x] 6. Checkpoint - 确保核心组件测试通过
  - 运行所有测试，确保通过
  - 如有问题，询问用户

- [x] 7. 集成到运行时
  - [x] 7.1 在 Runtime 中初始化 CapabilityRouter
    - 修改 `src/platform/runtime.js`
    - 创建 CapabilityRouter 实例
    - 将 router 添加到 agent context
    - _Requirements: 6.3_

  - [x] 7.2 修改消息处理流程
    - 在调用 LLM 前通过 CapabilityRouter 处理消息
    - 根据路由结果决定发送给 LLM 的内容格式
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 7.3 暴露能力查询到 agent context
    - 在 context 中添加 `getCapableAgents` 方法
    - 允许智能体查询具备特定能力的其他智能体
    - _Requirements: 4.3, 4.4_

- [x] 8. 更新配置模板
  - [x] 8.1 更新 llmservices_template.json
    - 添加 capabilities 字段示例
    - 包含各种能力类型的配置示例
    - _Requirements: 5.1, 5.4_

- [x] 9. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 验证集成功能正常
  - 如有问题，询问用户

## Notes

- 所有任务均为必需，包括属性测试
- 每个任务都引用了具体的需求条款以便追溯
- 检查点用于确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
