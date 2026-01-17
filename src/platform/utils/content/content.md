# 内容工具 (content/)

## 概述

内容工具提供内容适配和能力路由功能。

## 模块列表

### content_adapter.js
- **职责**：内容适配
- **功能**：
  - 适配不同格式的内容
  - 内容类型转换
  - 内容编码和解码

### capability_router.js
- **职责**：能力路由（从 services/artifact/content_router.js 中提取通用部分）
- **功能**：
  - 根据能力类型路由请求
  - 能力注册和查询
  - 能力匹配

## 依赖关系

- 两个模块相对独立
- capability_router.js 可能被 content_adapter.js 使用

## 注意事项

- 内容适配应该支持多种格式
- 能力路由应该可扩展
- 应该有清晰的接口定义
