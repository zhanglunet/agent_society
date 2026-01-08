# Implementation Plan: Chat Image Display and Chrome Panel Fix

## Overview

本实现计划分为三个主要部分：
1. 图片字段统一化和存储修改
2. 聊天界面图片展示功能
3. 模块面板通用初始化机制

## Tasks

- [x] 1. 修改图片存储和返回值格式
  - [x] 1.1 修改 ArtifactStore.saveScreenshot 方法
    - 移除 screenshots 子目录创建逻辑
    - 图片直接保存在 artifacts 目录下
    - _Requirements: 1.1, 1.4_
  - [x] 1.2 修改 page_actions.js 截图返回值
    - 将 `filePath` 字段改为 `images` 数组
    - _Requirements: 1.2, 1.3_

- [x] 2. 创建 ImageViewer 图片查看器组件
  - [x] 2.1 创建 web/js/components/image-viewer.js
    - 实现 show/close/prev/next 方法
    - 实现模态框渲染
    - 支持键盘导航（Escape 关闭，左右箭头切换）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 2.2 添加 ImageViewer 样式到 style.css
    - 模态框遮罩层样式
    - 图片居中显示样式
    - 导航按钮和关闭按钮样式
    - _Requirements: 3.2, 3.4_
  - [x] 2.3 在 index.html 中引入 image-viewer.js
    - _Requirements: 3.1_

- [x] 3. 修改 ChatPanel 支持图片缩略图显示
  - [x] 3.1 添加 renderMessageImages 方法
    - 渲染消息中的图片缩略图
    - 点击缩略图调用 ImageViewer.show
    - 处理图片加载失败
    - _Requirements: 2.1, 2.3, 2.4_
  - [x] 3.2 修改 render 方法集成图片渲染
    - 在消息气泡中插入图片缩略图
    - _Requirements: 2.1_
  - [x] 3.3 添加缩略图样式到 style.css
    - 最大宽度 200px，最大高度 150px
    - 水平布局
    - 错误状态样式
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 4. Checkpoint - 图片功能验证
  - 确保截图保存和显示功能正常
  - 确保图片点击放大功能正常
  - 如有问题请告知

- [x] 5. 重构 ModulesPanel 通用初始化机制
  - [x] 5.1 添加 toPascalCase 工具方法
    - 将 kebab-case 转换为 PascalCase
    - _Requirements: 6.1_
  - [x] 5.2 添加 initModulePanel 通用初始化方法
    - 通过标准命名约定查找模块面板对象
    - 调用 init() 方法
    - 处理初始化错误
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 6.4, 6.5_
  - [x] 5.3 修改 renderModuleComponent 方法
    - 移除硬编码的 ChromePanel.init() 调用
    - 使用 initModulePanel 通用方法
    - _Requirements: 5.1_

- [x] 6. 修改 Chrome 模块面板遵循标准接口
  - [x] 6.1 重命名 ChromePanel 为 ModulePanel_Chrome
    - 注册到 window.ModulePanel_Chrome
    - 保留 window.ChromePanel 别名以兼容
    - _Requirements: 6.2, 6.3_
  - [x] 6.2 确保 init 方法正确处理错误
    - 添加超时处理
    - 确保空数据时显示正确提示
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

- [x] 7. Checkpoint - 模块面板验证
  - 确保 Chrome 模块面板正常加载
  - 确保不再显示"加载中"卡住
  - 如有问题请告知

- [x] 8. 编写属性测试
  - [x] 8.1 编写图片字段一致性属性测试
    - **Property 1: 图片字段一致性**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  - [x] 8.2 编写图片缩略图渲染属性测试
    - **Property 2: 图片缩略图渲染完整性**
    - **Validates: Requirements 2.1**
  - [x] 8.3 编写模块面板通用初始化属性测试
    - **Property 3: 模块面板通用初始化**
    - **Validates: Requirements 5.1, 5.2, 5.4, 6.2, 6.3, 6.4**
  - [x] 8.4 编写浏览器列表渲染属性测试
    - **Property 4: 浏览器列表渲染**
    - **Validates: Requirements 4.5**

- [x] 9. Final Checkpoint
  - 确保所有测试通过
  - 如有问题请告知

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
