# 实现计划: Agent Canvas Drawing

## 概述

在现有的 `run_javascript` 工具中增加 Canvas 绘图能力。通过注入 `getCanvas(width, height)` 全局函数，智能体可以在 JavaScript 代码中创建 Canvas 并进行绘图。脚本执行完成后，如果使用了 Canvas，系统自动将内容导出为 PNG 图像并存储到工件库。

## 任务

- [x] 1. 安装 canvas 依赖
  - 安装 @napi-rs/canvas npm 包（替代 node-canvas，提供预编译二进制）
  - 验证安装成功
  - _需求: 技术选型_

- [x] 2. 修改 Runtime._runJavaScriptTool 方法
  - [x] 2.1 添加 Canvas 容器变量和 getCanvas 函数
    - 创建 `canvasInstance` 变量用于跟踪 Canvas 使用
    - 实现 `getCanvas(width, height)` 函数，支持默认尺寸 800x600
    - 确保多次调用返回同一实例（单例模式）
    - 使用动态 import 预加载 @napi-rs/canvas 包
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 2.2 注入 getCanvas 到执行环境
    - 修改 Function 构造函数调用，添加 getCanvas 参数
    - _需求: 1.1_
  - [x] 2.3 实现 Canvas 自动导出逻辑
    - 脚本执行后检查 canvasInstance 是否为 null
    - 如果不为 null，调用 `canvas.toBuffer('image/png')` 导出为 PNG Buffer
    - 生成工件ID（使用 randomUUID），保存为 `{artifactId}.png`
    - 返回结果中包含 images 数组
    - _需求: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.4 添加错误处理
    - 处理 Canvas 库加载失败（返回 canvas_not_available 错误）
    - 处理 Canvas 导出失败（返回 canvas_export_failed 错误）
    - 保持原有错误处理行为
    - _需求: 3.1, 3.2, 3.3_

- [x] 3. 添加 ArtifactStore.generateId 方法
  - 在 ArtifactStore 类中添加 `generateId()` 方法
  - 使用 `randomUUID()` 生成标准格式 UUID
  - _需求: 2.2_

- [x] 4. 更新 run_javascript 工具描述
  - 在 description 中添加 getCanvas 使用说明
  - 添加简单的绘图示例代码
  - 说明 Canvas 内容会自动导出为 PNG 并保存到工件库
  - _需求: 4.1, 4.2, 4.3_

- [x] 5. 检查点 - 确保基本功能正常
  - 所有代码编译通过
  - 手动测试基本绘图功能成功

- [x] 6. 编写单元测试
  - [x] 6.1 编写 getCanvas 基础测试
    - 测试 getCanvas 函数存在且可调用
    - 测试默认尺寸（800x600）
    - 测试自定义尺寸
    - 测试单例行为
    - _需求: 1.1, 1.2, 1.3, 1.5_
  - [x] 6.2 编写自动导出测试
    - 测试使用 Canvas 后结果包含 images 数组
    - 测试不使用 Canvas 时保持原有行为
    - 测试 PNG 文件正确保存
    - _需求: 2.1, 2.3, 2.4_
  - [x] 6.3 编写绘制图形测试
    - 测试绘制矩形（fillRect, strokeRect）
    - 测试绘制圆形（arc, fill）
    - 测试绘制文本（fillText）
    - 测试绘制路径（moveTo, lineTo, stroke）
    - 测试复杂图形组合
    - 测试颜色和样式设置
    - _需求: 1.4_
  - [x] 6.4 编写错误处理测试
    - 测试脚本执行错误
    - 测试向后兼容性
    - _需求: 3.1, 3.2, 3.3_

- [x] 7. 编写属性测试
  - [x] 7.1 属性 1: Canvas 尺寸正确性
    - 对于任意有效尺寸，Canvas 应具有指定的尺寸
    - **验证: 需求 1.2, 2.1**
  - [x] 7.2 属性 2: Canvas 单例性
    - 多次调用 getCanvas 应返回同一实例
    - **验证: 需求 1.5**
  - [x] 7.3 属性 3: 自动导出触发
    - 调用 getCanvas 的脚本结果应包含 images 数组
    - 未调用 getCanvas 的脚本结果不应包含 images 字段
    - **验证: 需求 2.3, 2.4**
  - [x] 7.4 属性 4: 向后兼容性
    - 不使用 getCanvas 的脚本行为应与修改前完全一致
    - **验证: 需求 3.3**

- [x] 8. 最终检查点
  - 所有 28 个测试通过
  - 原有 run_javascript 测试保持通过

## 实现说明

- 使用 `@napi-rs/canvas` 替代 `node-canvas`，因为它提供预编译的二进制文件，在 Windows 上安装更简单
- Canvas 库在方法开始时通过动态 import 预加载，避免在沙箱环境中加载失败
- 测试文件位置: `test/platform/run_javascript_canvas.test.js`
- 属性测试使用 fast-check 库
