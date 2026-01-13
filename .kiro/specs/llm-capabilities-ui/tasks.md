# Implementation Plan: LLM Capabilities UI

## Overview

本实现计划将 LLM 能力配置界面功能分解为可执行的编码任务。实现顺序为：CSS 样式 → 表单 UI 组件 → 服务列表显示 → 数据处理逻辑。

## Tasks

- [x] 1. 添加能力配置相关的 CSS 样式
  - [x] 1.1 添加能力配置区域样式
    - 修改 `web/css/style.css`
    - 添加 `.capabilities-section` 相关样式
    - 添加 `.capability-checkbox` 复选框样式
    - 添加折叠/展开动画效果
    - _Requirements: 1.1, 5.2, 5.4_

  - [x] 1.2 添加服务列表能力显示样式
    - 添加 `.service-capabilities` 容器样式
    - 添加 `.capability-badge` 徽章样式
    - 区分输入/输出能力的视觉样式
    - _Requirements: 4.2, 4.3_

- [x] 2. 扩展服务编辑表单
  - [x] 2.1 定义标准能力类型常量
    - 修改 `web/js/components/llm-settings-modal.js`
    - 添加 `STANDARD_CAPABILITIES` 常量定义
    - 包含 input 和 output 能力类型及其图标、描述
    - _Requirements: 1.3_

  - [x] 2.2 创建能力配置区域 DOM 结构
    - 在 `_createModal` 方法中添加能力配置区域 HTML
    - 添加输入能力和输出能力两个复选框组
    - 添加折叠/展开按钮
    - _Requirements: 1.1, 1.2, 5.4_

  - [x] 2.3 添加能力配置相关的 DOM 引用
    - 添加 `serviceCapabilitiesSection` 引用
    - 添加 `serviceInputCapabilities` 引用
    - 添加 `serviceOutputCapabilities` 引用
    - 添加 `capabilitiesToggleBtn` 引用
    - _Requirements: 1.1_

  - [x] 2.4 实现能力配置区域的事件绑定
    - 在 `_bindEvents` 方法中添加折叠/展开事件
    - 添加复选框选择事件（视觉反馈）
    - _Requirements: 1.4, 5.4_

- [x] 3. 实现能力配置数据处理
  - [x] 3.1 实现 `_getSelectedCapabilities` 方法
    - 获取当前选中的输入能力数组
    - 获取当前选中的输出能力数组
    - 返回 `{ input: [], output: [] }` 格式
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 实现 `_setCapabilities` 方法
    - 接收 capabilities 对象参数
    - 设置对应的复选框选中状态
    - 处理 null/undefined 情况（使用默认值）
    - _Requirements: 2.2, 2.3_

  - [x] 3.3 修改 `_showServiceForm` 方法
    - 新建模式：调用 `_setCapabilities` 设置默认值
    - 编辑模式：调用 `_setCapabilities` 回显已有配置
    - _Requirements: 2.1, 2.3_

  - [x] 3.4 修改 `_saveService` 方法
    - 调用 `_getSelectedCapabilities` 获取能力配置
    - 将 capabilities 添加到服务对象中
    - 处理空选择情况（默认 text）
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - 确保表单功能正常
  - 测试新建服务时的默认能力选择
  - 测试编辑服务时的能力回显
  - 测试保存服务时的能力持久化
  - 如有问题，询问用户

- [x] 5. 实现服务列表能力显示
  - [x] 5.1 创建 `_renderCapabilityBadges` 方法
    - 接收 capabilities 对象参数
    - 生成输入能力徽章 HTML
    - 生成输出能力徽章 HTML
    - 处理无 capabilities 情况（显示默认 text）
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 5.2 修改 `_renderServiceList` 方法
    - 在服务项中调用 `_renderCapabilityBadges`
    - 添加能力显示区域到服务信息中
    - _Requirements: 4.1, 4.2_

- [x] 6. 添加提示信息
  - [x] 6.1 为能力选项添加 title 属性
    - 每个复选框添加描述性 title
    - 徽章添加完整能力名称 title
    - _Requirements: 5.1, 5.3_

- [x] 7. Final Checkpoint - 完整功能测试
  - 测试完整的添加服务流程
  - 测试完整的编辑服务流程
  - 测试服务列表的能力显示
  - 测试折叠/展开功能
  - 如有问题，询问用户

## Notes

- 本功能为纯前端 UI 实现，后端 API 已支持 capabilities 字段
- 与 model-capability-routing 功能配合使用
- 保持与现有 UI 风格一致
- 确保向后兼容（无 capabilities 的服务正常显示）

