# 需求文档

## 简介

本功能在现有的 `run_javascript` 工具中增加 Canvas 绘图能力。智能体在执行 JavaScript 代码时，可以调用 `getCanvas(width, height)` 全局函数获取一个 Canvas 对象进行绘图。当脚本执行完成后，如果调用了 `getCanvas()`，系统自动将 Canvas 内容导出为 PNG 图像，存储到工件库中，并在返回结果中包含工件文件名。

## 术语表

- **run_javascript**: 运行时中用于执行 JavaScript 代码的工具函数
- **getCanvas**: 新增的全局函数，用于在脚本中获取 Canvas 对象
- **Artifact_Store**: 工件存储服务，用于保存导出的 PNG 图像
- **node-canvas**: Node.js 环境下的 Canvas 实现库

## 需求

### 需求 1: getCanvas 全局函数

**用户故事:** 作为智能体，我希望在 JavaScript 代码中调用 getCanvas(width, height) 获取一个 Canvas 对象进行绘图，这样我可以轻松创建可视化内容。

#### 验收标准

1. 当智能体通过 run_javascript 执行 JavaScript 代码时，运行时应注入一个全局 `getCanvas(width, height)` 函数
2. 当 getCanvas 被调用并传入宽度和高度参数时，运行时应创建并返回一个具有指定尺寸的 Canvas 对象
3. 当 getCanvas 被调用但未指定参数时，运行时应使用默认尺寸 800x600 像素
4. getCanvas 函数应返回 Canvas 对象，允许智能体调用 `getContext('2d')` 进行绘图操作
5. 如果在同一脚本中多次调用 getCanvas，运行时应返回同一个 Canvas 实例

### 需求 2: 自动导出与工件存储

**用户故事:** 作为智能体，我希望绘图脚本执行完成后 Canvas 内容能自动导出并存储，这样我可以方便地分享绘图结果。

#### 验收标准

1. 当 run_javascript 脚本调用了 getCanvas 并执行完成后，运行时应自动将 Canvas 内容导出为 PNG 图像
2. 导出时，运行时应使用现有的工件存储机制保存 PNG 图像
3. 导出成功后，运行时应在工具调用结果中包含图像文件名（images 数组）
4. 如果绘图脚本没有调用 getCanvas，运行时不应执行任何 Canvas 导出（保持原有 run_javascript 行为）

### 需求 3: 错误处理

**用户故事:** 作为智能体，我希望绘图操作失败时能得到清晰的错误信息，这样我可以调试和修复代码。

#### 验收标准

1. 如果绘图脚本抛出错误，运行时应捕获错误并以结构化格式返回
2. 如果 Canvas 导出失败，运行时应返回错误信息，同时仍返回脚本执行结果
3. 运行时应保持原有 run_javascript 对非 Canvas 相关错误的处理行为

### 需求 4: 提示词与文档

**用户故事:** 作为智能体，我希望有清晰的文档说明如何使用 getCanvas，这样我可以有效地创建绘图。

#### 验收标准

1. 运行时应更新 run_javascript 工具描述，包含 getCanvas 使用说明
2. 工具描述应包含一个简单的绘图示例，展示如何使用 getCanvas 和 2D 上下文
3. 工具描述应说明使用 getCanvas 时 Canvas 内容会自动导出
