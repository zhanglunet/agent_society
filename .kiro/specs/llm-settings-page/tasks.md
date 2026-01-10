# Implementation Plan: LLM Settings Page

## Overview

本实现计划将大模型设置页面功能分解为可执行的编码任务。采用后端优先的方式，先实现配置服务和 API 端点，再实现前端组件。

## Tasks

- [x] 1. 实现 ConfigService 配置服务
  - [x] 1.1 创建 ConfigService 类基础结构
    - 创建 `src/platform/config_service.js` 文件
    - 实现构造函数，接收配置目录路径
    - 实现 `hasLocalConfig()` 方法检测 app.local.json 是否存在
    - 实现 `maskApiKey()` 方法掩码 API Key
    - _Requirements: 2.3, 5.2, 6.5, 9.5_

  - [x] 1.2 编写 ConfigService 基础方法的属性测试
    - **Property 6: API Key Masking**
    - **Validates: Requirements 5.2, 6.5, 9.5**

  - [x] 1.3 实现 LLM 配置读写方法
    - 实现 `getLlmConfig()` 方法，优先读取 app.local.json
    - 实现 `saveLlmConfig()` 方法，复制 app.json 到 app.local.json 并更新 llm 字段
    - 确保保存时保留其他配置字段
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.3_

  - [x] 1.4 编写配置保存的属性测试
    - **Property 5: Config Save Preserves Non-LLM Fields**
    - **Property 7: Config Source Priority**
    - **Validates: Requirements 4.2, 4.3, 5.3**

  - [x] 1.5 实现 LLM 服务管理方法
    - 实现 `getLlmServices()` 方法，优先读取 llmservices.local.json
    - 实现 `addLlmService()` 方法，添加新服务到 llmservices.local.json
    - 实现 `updateLlmService()` 方法，更新现有服务
    - 实现 `deleteLlmService()` 方法，删除服务
    - _Requirements: 9.1, 10.3, 11.3, 12.2_

  - [x] 1.6 编写服务管理的属性测试
    - **Property 8: Service ID Uniqueness**
    - **Validates: Requirements 10.5**

- [x] 2. Checkpoint - 确保 ConfigService 测试通过
  - 运行所有 ConfigService 相关测试
  - 确保所有测试通过，如有问题请询问用户

- [x] 3. 实现 HTTP Server API 端点
  - [x] 3.1 添加配置状态 API
    - 在 `src/platform/http_server.js` 中添加 `GET /api/config/status` 端点
    - 返回 hasLocalConfig、llmStatus、lastError
    - 添加 LLM 连接状态跟踪
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.2 添加 LLM 配置读取 API
    - 添加 `GET /api/config/llm` 端点
    - 调用 ConfigService 获取配置
    - 返回掩码后的 apiKey
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.3 添加 LLM 配置保存 API
    - 添加 `POST /api/config/llm` 端点
    - 验证 baseURL 和 model 非空
    - 调用 ConfigService 保存配置
    - 触发 LLM Client 重新加载
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 13.1_

  - [x] 3.4 编写配置验证的属性测试
    - **Property 2: Validation Rejects Empty Required Fields**
    - **Validates: Requirements 1.3, 6.2, 10.2**
    - (已在 ConfigService 测试中实现)

  - [x] 3.5 添加 LLM 服务管理 API
    - 添加 `GET /api/config/llm-services` 端点
    - 添加 `POST /api/config/llm-services` 端点（添加服务）
    - 添加 `POST /api/config/llm-services/:serviceId` 端点（更新服务）
    - 添加 `DELETE /api/config/llm-services/:serviceId` 端点（删除服务）
    - 触发 LLM Service Registry 重新加载
    - _Requirements: 9.1, 10.3, 10.4, 11.3, 11.4, 12.2, 12.3, 13.2_

- [x] 4. Checkpoint - 确保 API 端点测试通过
  - 运行所有 API 相关测试
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 实现前端 LlmSettingsModal 组件
  - [x] 5.1 创建模态框 HTML 结构
    - 在 `web/index.html` 中添加设置模态框 HTML
    - 包含默认 LLM 配置表单（baseURL、model、apiKey、maxConcurrentRequests）
    - 包含 LLM 服务列表区域
    - 包含服务编辑表单（id、name、baseURL、model、apiKey、maxConcurrentRequests、capabilityTags、description）
    - _Requirements: 1.1, 1.5, 1.6, 9.2, 9.3, 9.4_

  - [x] 5.2 添加模态框样式
    - 在 `web/css/style.css` 中添加设置模态框样式
    - 包含表单样式、错误提示样式、服务列表样式
    - _Requirements: 1.1, 1.4_

  - [x] 5.3 创建 LlmSettingsModal JavaScript 组件
    - 创建 `web/js/components/llm-settings-modal.js` 文件
    - 实现 `init()` 方法初始化组件
    - 实现 `open()` 和 `close()` 方法
    - 实现 `loadConfig()` 方法加载当前配置
    - 实现 `validate()` 方法验证表单
    - 实现 `saveConfig()` 方法保存配置
    - _Requirements: 1.2, 1.3, 4.4, 4.5_

  - [x] 5.4 实现服务管理功能
    - 实现 `renderServiceList()` 方法渲染服务列表
    - 实现 `openServiceForm()` 方法打开服务编辑表单
    - 实现 `saveService()` 方法保存服务
    - 实现 `deleteService()` 方法删除服务
    - 实现删除确认对话框
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 11.1, 12.1_

- [x] 6. 扩展 API 模块
  - [x] 6.1 添加配置相关 API 方法
    - 在 `web/js/api.js` 中添加 `getLlmConfig()` 方法
    - 添加 `saveLlmConfig()` 方法
    - 添加 `getConfigStatus()` 方法
    - 添加 `getLlmServicesConfig()` 方法
    - 添加 `addLlmService()` 方法
    - 添加 `updateLlmService()` 方法
    - 添加 `deleteLlmService()` 方法
    - _Requirements: 5.1, 6.1, 7.1, 9.1, 10.3, 11.3, 12.2_

- [x] 7. 集成自动弹出逻辑
  - [x] 7.1 添加设置按钮到 UI
    - 在 `web/index.html` 的 sidebar-header 中添加设置按钮
    - 绑定点击事件打开设置模态框
    - _Requirements: 8.1, 8.2_

  - [x] 7.2 实现首次启动自动弹出
    - 在 `web/js/app.js` 的 `init()` 方法中检查配置状态
    - 如果 hasLocalConfig 为 false，自动打开设置模态框
    - _Requirements: 2.1, 2.2_

  - [x] 7.3 实现连接错误自动弹出
    - 在轮询中检查 llmStatus
    - 如果状态为 error，自动打开设置模态框并显示错误信息
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 8. 实现配置即刻生效
  - [x] 8.1 实现 LLM Client 热重载
    - 在 HTTPServer 中添加 `reloadLlmClient()` 方法
    - 保存配置后调用此方法重新初始化 LLM Client
    - _Requirements: 13.1_

  - [x] 8.2 实现 LLM Service Registry 热重载
    - 在 HTTPServer 中添加 `reloadLlmServiceRegistry()` 方法
    - 服务增删改后调用此方法更新注册表
    - _Requirements: 13.2_

- [x] 9. Final Checkpoint - 确保所有测试通过
  - 运行所有测试
  - 手动测试设置页面功能
  - 确保所有测试通过，如有问题请询问用户

## Notes

- All tasks are required for comprehensive test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
