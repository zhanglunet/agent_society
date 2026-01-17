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
- **职责**：内容路由（合并 artifact_content_router 和 capability_router）
- **功能**：
  - 根据内容类型路由到不同的处理器
  - 工件内容的格式化和转换
  - 能力路由和分发

## 依赖关系

- artifact_store.js 依赖 binary_detector.js
- content_router.js 依赖 artifact_store.js

## 注意事项

- 工件存储应该支持大文件
- 二进制检测应该准确可靠
- 内容路由应该可扩展
