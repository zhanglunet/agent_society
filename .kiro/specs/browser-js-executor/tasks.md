# Implementation Plan: Browser JavaScript Executor

## Overview

将智能体的 JavaScript 代码执行环境从 Node.js 迁移到 headless Chrome 浏览器。使用独立的 Chrome 实例，每次执行创建新标签页，执行完毕后关闭，确保完全隔离。

## Tasks

- [x] 1. 创建 BrowserJavaScriptExecutor 类
  - [x] 1.1 创建 `src/platform/runtime/browser_javascript_executor.js` 文件
    - 定义 BrowserJavaScriptExecutor 类结构
    - 实现构造函数，接收 runtime 引用
    - 添加浏览器实例和状态管理属性
    - _Requirements: 1.1, 7.1_

  - [x] 1.2 实现浏览器初始化方法 `init()`
    - 使用 puppeteer-core 启动 headless Chrome
    - 复用 BrowserManager 的 Chrome 路径查找逻辑
    - 实现浏览器启动失败时的降级标记
    - _Requirements: 1.1, 1.3_

  - [x] 1.3 实现关闭方法 `shutdown()`
    - 关闭浏览器实例
    - 清理资源和状态
    - _Requirements: 1.4_

- [x] 2. 实现代码执行核心逻辑
  - [x] 2.1 实现执行页面 HTML 模板
    - 创建包含 getCanvas 辅助函数的 HTML
    - 实现 `__getCanvasData()` 和 `__hasCanvas()` 辅助函数
    - _Requirements: 3.1, 3.5_

  - [x] 2.2 实现 `execute()` 方法主体
    - 创建新标签页
    - 设置页面内容
    - 使用 AsyncFunction 执行代码（支持 await）
    - 处理同步和异步返回值
    - 关闭标签页
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2_

  - [x] 2.3 实现超时控制
    - 使用 page.evaluate 的 timeout 选项
    - 超时后返回结构化错误
    - _Requirements: 2.5, 7.4_

  - [x] 2.4 实现错误捕获
    - 捕获代码执行异常
    - 返回结构化错误格式
    - _Requirements: 2.6_

  - [x] 2.5 编写属性测试：代码执行结果一致性
    - **Property 1: Code execution result consistency**
    - **Validates: Requirements 2.1, 2.2, 2.3, 6.2**

  - [x] 2.6 编写属性测试：Promise 解析
    - **Property 2: Promise resolution**
    - **Validates: Requirements 2.4**

  - [x] 2.7 编写属性测试：超时控制
    - **Property 3: Timeout enforcement**
    - **Validates: Requirements 2.5**

  - [x] 2.8 编写属性测试：错误捕获
    - **Property 4: Error capture completeness**
    - **Validates: Requirements 2.6**

- [x] 3. 实现 Canvas 支持
  - [x] 3.1 实现 Canvas 图像导出
    - 从页面获取 Canvas 数据 URL
    - 转换 base64 为 Buffer
    - 保存到 artifacts 目录
    - _Requirements: 3.3, 3.4_

  - [x] 3.2 实现 Canvas 元数据写入
    - 生成 artifact ID
    - 写入元数据文件（兼容现有格式）
    - 设置 source 为 "browser-canvas"
    - _Requirements: 3.4, 6.4_

  - [x] 3.3 编写属性测试：Canvas 尺寸
    - **Property 5: Canvas creation with dimensions**
    - **Validates: Requirements 3.1**

  - [x] 3.4 编写属性测试：Canvas 单例
    - **Property 6: Canvas singleton behavior**
    - **Validates: Requirements 3.5**

  - [x] 3.5 编写属性测试：Canvas 导出
    - **Property 7: Canvas export with metadata**
    - **Validates: Requirements 3.3, 3.4**

- [x] 4. 实现 JSON 序列化和降级逻辑
  - [x] 4.1 实现 `toJsonSafeValue()` 方法
    - 复用现有的 JSON 安全转换逻辑
    - 处理 undefined、超大结果等边界情况
    - _Requirements: 2.3, 6.2_

  - [x] 4.2 实现降级到 Node.js 执行模式
    - 当浏览器不可用时使用现有 JavaScriptExecutor
    - 记录降级日志
    - _Requirements: 1.3, 6.1_

- [x] 5. 集成到 Runtime
  - [x] 5.1 修改 Runtime 初始化逻辑
    - 在 init() 中初始化 BrowserJavaScriptExecutor
    - 处理初始化失败的情况
    - _Requirements: 1.1, 1.3_

  - [x] 5.2 修改 ToolExecutor 的 run_javascript 处理
    - 使用 BrowserJavaScriptExecutor 替代 JavaScriptExecutor
    - 保持接口兼容
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.3 更新工具定义提示词
    - 更新 run_javascript 工具的 description
    - 说明异步执行支持和 Canvas 功能
    - _Requirements: 2.4, 3.1_

  - [x] 5.4 修改 Runtime shutdown 逻辑
    - 在关闭时调用 BrowserJavaScriptExecutor.shutdown()
    - _Requirements: 1.4_

- [x] 6. Checkpoint - 确保所有测试通过
  - 运行现有的 run_javascript 测试
  - 确保向后兼容性
  - 如有问题请询问用户

- [x] 7. 编写集成测试
  - [x] 7.1 编写端到端执行测试
    - 测试完整的代码执行流程
    - 测试 Canvas 绘图和导出
    - _Requirements: 2.1, 3.3_

  - [x] 7.2 编写属性测试：页面状态隔离
    - **Property 9: Page state isolation**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 7.3 编写属性测试：浏览器实例复用
    - **Property 10: Browser instance reuse**
    - **Validates: Requirements 7.1, 7.2**

- [ ] 8. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 验证功能正常工作
  - 如有问题请询问用户

## Notes

- 使用 JavaScript 实现（与项目其他代码一致）
- 属性测试使用 fast-check 库
- 每个属性测试至少运行 100 次迭代
