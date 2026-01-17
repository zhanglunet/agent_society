# 工件服务 (artifact/)

## 概述

工件服务负责工件的存储、检索、二进制检测和内容路由。

## 模块列表

### artifact_store.js
- **职责**：工件的存储和检索
- **功能**：
  - 写入工件
  - 读取工件
  - 元信息管理
  - 工件列表查询

### binary_detector.js
- **职责**：二进制文件检测
- **功能**：
  - 检测文件是否为二进制
  - 根据 MIME 类型判断
  - 根据文件内容判断
  - 根据文件扩展名判断

### content_router.js
- **职责**：统一的内容路由器（合并了 artifact_content_router 和 capability_router）
- **功能**：
  - 工件内容路由：根据工件类型（图片、文件等）和模型能力路由
  - 消息内容路由：根据消息附件类型和模型能力路由
  - 能力检查：检查模型是否支持特定内容类型
  - 内容格式化：将内容格式化为模型可接受的格式
  - 降级处理：为不支持的内容类型生成文本描述
- **类**：ContentRouter
- **依赖**：
  - utils/content/content_type_utils.js（类型检测工具）
  - utils/message/message_formatter.js（消息格式化）

## 依赖关系

- artifact_store.js 依赖 binary_detector.js
- content_router.js 依赖 artifact_store.js

## 注意事项

- 工件存储应该支持大文件
- 二进制检测应该准确可靠
- 内容路由应该可扩展
