# 内容工具 (content/)

## 概述

内容工具提供内容适配和类型检测功能，负责将不支持的内容类型转换为文本描述，并提供通用的内容类型检测工具。

## 模块列表

### content_adapter.js
- **职责**：内容适配器
- **功能**：
  - 将不支持的内容类型（图片、音频、文件）转换为文本描述
  - 查找具备相应能力的智能体
  - 提供内容类型到能力类型的映射
  - 格式化文件大小为人类可读格式
- **导出**：
  - `ContentAdapter` 类
  - `formatFileSize` 函数
  - `CONTENT_TYPE_TO_CAPABILITY` 常量
  - `CONTENT_TYPE_LABELS` 常量

### content_type_utils.js
- **职责**：内容类型检测工具
- **功能**：
  - 检测二进制内容的具体类型（图片、音频、视频、文档等）
  - 提供附件类型到能力类型的映射
  - 获取友好的类型名称
- **导出**：
  - `detectBinaryType` 函数
  - `getFriendlyTypeName` 函数
  - `ATTACHMENT_TYPE_TO_CAPABILITY` 常量

## 依赖关系

- `content_adapter.js` 依赖：
  - `../logger/logger.js` - 日志记录
- `content_type_utils.js` 无外部依赖

## 使用场景

1. **内容适配**：当智能体收到不支持的内容类型时，使用 ContentAdapter 将其转换为文本描述
2. **类型检测**：使用 content_type_utils 检测二进制内容的具体类型
3. **能力映射**：根据附件类型确定需要的模型能力

## 注意事项

- 内容适配应该提供清晰的文本描述，让智能体可以理解并决定是否转发
- 类型检测应该支持多种检测方式（MIME 类型、文件扩展名、文件头）
- 文件内容读取应该有大小限制，避免内存溢出
- 二进制文件应该提示需要专门的智能体处理

## 迁移说明

**注意**：`capability_router.js` 已经合并到 `services/artifact/content_router.js`。
- 如果需要能力路由功能，请使用 `ContentRouter` 类（位于 `services/artifact/content_router.js`）
- 本目录现在只包含通用的内容工具函数
