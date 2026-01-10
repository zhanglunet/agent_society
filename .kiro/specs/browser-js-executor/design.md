# Design Document: Browser JavaScript Executor

## Overview

本设计将智能体的 JavaScript 代码执行环境从 Node.js 迁移到 headless Chrome 浏览器。通过复用现有的 `modules/chrome` 模块（BrowserManager、TabManager、PageActions），在空白页面中执行代码，获得完整的浏览器 API 支持。

核心设计原则：
1. **复用现有基础设施** - 利用已有的 Chrome 模块，避免重复造轮子
2. **保持 API 兼容** - 对外接口与现有 JavaScriptExecutor 完全一致
3. **安全优先** - 在浏览器环境中实施严格的沙箱隔离
4. **完全隔离** - 每次执行创建新标签页，执行完毕后关闭，确保完全隔离
5. **独立实例** - JS 执行使用独立的 Chrome 实例，与其他浏览器操作分离

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Runtime                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ToolExecutor                           │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │           BrowserJavaScriptExecutor              │    │   │
│  │  │                                                  │    │   │
│  │  │  ┌──────────────────────────────────────────┐   │    │   │
│  │  │  │     Dedicated Chrome Instance             │   │    │   │
│  │  │  │     (独立于其他浏览器操作)                  │   │    │   │
│  │  │  └──────────────────────────────────────────┘   │    │   │
│  │  │                                                  │    │   │
│  │  │  每次执行流程:                                   │    │   │
│  │  │  1. 创建新标签页                                │    │   │
│  │  │  2. 注入沙箱环境                                │    │   │
│  │  │  3. 执行代码                                    │    │   │
│  │  │  4. 导出 Canvas (如有)                          │    │   │
│  │  │  5. 关闭标签页                                  │    │   │
│  │  │                                                  │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌───────────────────────────────────────┐
         │    Dedicated Headless Chrome          │
         │    (JS Executor 专用实例)              │
         │                                        │
         │  ┌────────────────────────────────┐   │
         │  │   New Tab (每次执行创建)        │   │
         │  │  ┌─────────────────────────┐   │   │
         │  │  │    Sandboxed Context     │   │   │
         │  │  │  - getCanvas()           │   │   │
         │  │  │  - input variable        │   │   │
         │  │  │  - blocked APIs          │   │   │
         │  │  └─────────────────────────┘   │   │
         │  └────────────────────────────────┘   │
         │           ↓ 执行完毕后关闭             │
         └───────────────────────────────────────┘
```

### 执行隔离模型

每次代码执行都在全新的标签页中进行，执行完毕后立即关闭标签页。这种模式的优势：

1. **完全隔离** - 每次执行都是干净的环境，无需手动重置状态
2. **内存安全** - 关闭标签页自动释放所有资源，避免内存泄漏
3. **简化实现** - 无需复杂的状态重置逻辑
4. **更可靠** - 即使代码导致页面异常，也不影响后续执行

## Components and Interfaces

### 1. BrowserJavaScriptExecutor

新的浏览器 JavaScript 执行器，替代现有的 `JavaScriptExecutor`。

```typescript
interface BrowserJavaScriptExecutor {
  // 初始化浏览器环境
  init(): Promise<void>;
  
  // 执行 JavaScript 代码
  execute(args: {
    code: string;
    input?: any;
  }, messageId?: string, agentId?: string): Promise<ExecutionResult>;
  
  // 关闭浏览器环境
  shutdown(): Promise<void>;
  
  // 转换为 JSON 安全值
  toJsonSafeValue(value: any): { value?: any; error?: string };
}

type ExecutionResult = 
  | any  // 普通执行结果
  | { result: any; images: string[] }  // Canvas 执行结果
  | { error: string; message?: string }  // 错误结果
```

### 工具定义（Tool Definition）

run_javascript 工具的定义，包含提示词说明：

```javascript
{
  type: "function",
  function: {
    name: "run_javascript",
    description: `在浏览器环境中执行 JavaScript 代码。

代码在真实的 Chrome 浏览器中运行，支持所有标准浏览器 API。

【执行模式】
- 代码可以是同步的，直接返回结果
- 代码可以是异步的，返回 Promise，系统会等待 Promise 完成
- 支持使用 await 关键字（代码会被包装在 async 函数中）

【Canvas 绘图】
- 调用 getCanvas(width, height) 获取 Canvas 元素
- 使用标准 Canvas 2D API 进行绘图
- 执行完成后 Canvas 内容会自动导出为图像

【输入输出】
- 通过 input 变量访问传入的参数
- 返回值必须是 JSON 可序列化的
- 返回 Promise 时，resolved 值会作为结果返回

【示例】
同步计算：
  return input.a + input.b;

异步操作：
  return new Promise(resolve => {
    setTimeout(() => resolve('done'), 1000);
  });

Canvas 绘图：
  const canvas = getCanvas(400, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'red';
  ctx.fillRect(50, 50, 100, 100);
  return 'drawn';
`,
    parameters: {
      type: "object",
      properties: {
        code: { 
          type: "string",
          description: "要执行的 JavaScript 代码（函数体形式，使用 return 返回结果）"
        },
        input: { 
          type: "object",
          description: "传入代码的输入参数，在代码中通过 input 变量访问"
        }
      },
      required: ["code"]
    }
  }
}
```

### 2. 执行流程（每次创建新标签页）

每次代码执行的完整流程：

```javascript
async execute(args, messageId, agentId) {
  // 1. 确保浏览器实例存在
  await this._ensureBrowser();
  
  // 2. 创建新标签页
  const page = await this._browser.newPage();
  
  try {
    // 3. 设置页面内容（包含 getCanvas 等辅助函数）
    await page.setContent(this._getExecutionPageHTML());
    
    // 4. 执行代码（支持同步和异步）
    // 代码可以返回 Promise，会自动等待 Promise 完成
    const result = await page.evaluate(
      async (code, input) => {
        try {
          // 使用 AsyncFunction 支持 await
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction('input', 'getCanvas', code);
          const value = await fn(input, window.getCanvas);
          return {
            success: true,
            result: value,
            hasCanvas: window.__hasCanvas()
          };
        } catch (err) {
          return {
            success: false,
            error: err.message || String(err)
          };
        }
      },
      args.code,
      args.input
    );
    
    // 5. 如果使用了 Canvas，导出图像
    if (result.success && result.hasCanvas) {
      const imageData = await page.evaluate(() => window.__getCanvasData());
      // 保存图像...
    }
    
    return result;
  } finally {
    // 6. 关闭标签页（无论成功或失败）
    await page.close();
  }
}
```

### 异步代码支持

代码可以是同步或异步的：

```javascript
// 同步代码
return input.a + input.b;

// 异步代码 - 返回 Promise
return new Promise(resolve => {
  setTimeout(() => resolve('done'), 1000);
});

// 使用 await 的异步代码
const response = await fetch('...'); // 注意：fetch 在浏览器中可用
const data = await response.json();
return data;

// 长时间运行的异步操作
const canvas = getCanvas(800, 600);
const ctx = canvas.getContext('2d');
// 执行复杂的绘图操作...
await new Promise(r => setTimeout(r, 100)); // 等待渲染
return 'done';
```

### 3. 执行页面 HTML 模板

空白执行页面的 HTML 结构（仅包含 Canvas 辅助函数）：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>JS Executor</title>
  <style>
    body { margin: 0; padding: 0; }
    #canvas-container { display: none; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <script>
    // Canvas 辅助函数
    (function() {
      // Canvas 单例
      let _canvas = null;
      
      // getCanvas 函数
      window.getCanvas = function(width = 800, height = 600) {
        if (_canvas) return _canvas;
        _canvas = document.createElement('canvas');
        _canvas.width = width;
        _canvas.height = height;
        document.getElementById('canvas-container').appendChild(_canvas);
        return _canvas;
      };
      
      // 获取 Canvas 数据（供外部调用）
      window.__getCanvasData = function() {
        if (!_canvas) return null;
        return _canvas.toDataURL('image/png');
      };
      
      // 检查是否使用了 Canvas
      window.__hasCanvas = function() {
        return _canvas !== null;
      };
    })();
  </script>
</body>
</html>
```

### 4. 代码执行流程

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ run_javascript│────▶│ Ensure Browser   │────▶│ Create new Tab   │
│    tool call  │     │    Instance      │     │                  │
└──────────────┘     └──────────────────┘     └────────┬─────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │ Set page content │
                                              │ (注入辅助函数)    │
                                              └────────┬─────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │ page.evaluate()  │
                                              │ Execute code     │
                                              └────────┬─────────┘
                                                       │
                                              ┌────────┴────────┐
                                              │ Canvas used?    │
                                              └────────┬────────┘
                                              ┌────────┴────────┐
                                              │ Yes             │ No
                                              ▼                 ▼
                                    ┌─────────────────┐  ┌──────────────┐
                                    │ Export Canvas   │  │ Close Tab    │
                                    │ Save to artifacts│  │ Return result│
                                    └────────┬────────┘  └──────────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ Close Tab       │
                                    │ Return result   │
                                    │ with images     │
                                    └─────────────────┘
```

## Data Models

### ExecutionContext

传递给浏览器页面的执行上下文：

```typescript
interface ExecutionContext {
  code: string;      // 要执行的代码
  input: any;        // 输入参数
  timeout: number;   // 超时时间（毫秒）
}
```

### ExecutionResponse

从浏览器页面返回的执行结果：

```typescript
interface ExecutionResponse {
  success: boolean;
  result?: any;           // 执行结果
  error?: string;         // 错误消息
  hasCanvas: boolean;     // 是否使用了 Canvas
  canvasData?: string;    // Canvas 数据 URL（base64 PNG）
}
```

### CanvasMetadata

Canvas 图像的元数据（与现有格式兼容）：

```typescript
interface CanvasMetadata {
  id: string;           // 工件 ID
  extension: string;    // 文件扩展名 (.png)
  type: string;         // 类型 (image)
  createdAt: string;    // 创建时间
  messageId: string;    // 关联消息 ID
  agentId: string;      // 关联智能体 ID
  width: number;        // Canvas 宽度
  height: number;       // Canvas 高度
  source: string;       // 来源 (browser-canvas)
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Code execution result consistency

*For any* valid JavaScript code with JSON-serializable input and output, executing it in the browser executor with the input parameter SHALL produce the correct result accessible via the `input` variable, and the result SHALL be JSON-serializable.

**Validates: Requirements 2.1, 2.2, 2.3, 6.2**

### Property 2: Promise resolution

*For any* code that returns a Promise resolving to a JSON-serializable value, the executor SHALL await the Promise and return the resolved value.

**Validates: Requirements 2.4**

### Property 3: Timeout enforcement

*For any* code execution that runs longer than the configured timeout, the executor SHALL terminate execution and return a timeout error within a reasonable margin (timeout + 1 second).

**Validates: Requirements 2.5**

### Property 4: Error capture completeness

*For any* code that throws an exception, the executor SHALL capture the error and return it in a structured format with an error message, without crashing.

**Validates: Requirements 2.6**

### Property 5: Canvas creation with dimensions

*For any* valid width and height parameters passed to getCanvas(), the returned Canvas element SHALL have exactly those dimensions.

**Validates: Requirements 3.1**

### Property 6: Canvas singleton behavior

*For any* sequence of getCanvas() calls within a single execution, all calls SHALL return the same Canvas instance, and the dimensions SHALL be those specified in the first call.

**Validates: Requirements 3.5**

### Property 7: Canvas export with metadata

*For any* code execution that uses Canvas, the executor SHALL export the Canvas as a PNG image and save it to the artifacts directory with metadata containing id, type, dimensions, and source.

**Validates: Requirements 3.3, 3.4**

### Property 8: Browser sandbox security

*For any* code execution, the browser's built-in sandbox SHALL provide sufficient security isolation without requiring pre-execution code pattern detection.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 9: Page state isolation

*For any* two consecutive code executions where the first creates variables or DOM elements, the second execution SHALL NOT be able to access those variables or elements (guaranteed by creating new tab for each execution).

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 10: Browser instance reuse

*For any* sequence of code executions, the executor SHALL reuse the same dedicated Chrome browser instance (but create new tabs for each execution).

**Validates: Requirements 7.1, 7.2**

## Error Handling

### 错误类型

| 错误代码 | 描述 | 处理方式 |
|---------|------|---------|
| `browser_not_available` | Chrome 浏览器不可用 | 降级到 Node.js 执行模式 |
| `page_creation_failed` | 无法创建执行页面 | 重试或降级 |
| `execution_timeout` | 代码执行超时 | 终止执行，返回超时错误 |
| `js_execution_failed` | JavaScript 运行时错误 | 捕获错误，返回错误信息 |
| `canvas_export_failed` | Canvas 导出失败 | 返回执行结果但标记导出失败 |
| `non_json_serializable_return` | 返回值无法序列化 | 返回序列化错误 |

### 降级策略

当浏览器环境不可用时，系统自动降级到现有的 Node.js 执行模式：

```javascript
async execute(args, messageId, agentId) {
  // 尝试浏览器执行
  if (this._browserAvailable) {
    try {
      return await this._executeInBrowser(args, messageId, agentId);
    } catch (err) {
      if (this._shouldFallback(err)) {
        this.runtime.log?.warn?.("浏览器执行失败，降级到 Node.js 模式", { error: err.message });
        return await this._executeInNode(args, messageId, agentId);
      }
      throw err;
    }
  }
  
  // 浏览器不可用，使用 Node.js 模式
  return await this._executeInNode(args, messageId, agentId);
}
```

## Testing Strategy

### 单元测试

1. **JSON 转换测试**
   - 测试各种类型的值转换
   - 测试超大结果的处理

2. **页面 HTML 模板测试**
   - 测试 getCanvas 函数正确注入
   - 测试辅助函数可用

3. **初始化和生命周期测试**
   - 测试浏览器实例启动
   - 测试执行页面创建
   - 测试关闭和资源释放

### 属性测试

使用 fast-check 进行属性测试，每个属性至少运行 100 次迭代。测试标签格式：**Feature: browser-js-executor, Property N: property_text**

1. **Property 1: Code execution result consistency**
   - 生成随机的算术表达式和输入对象
   - 验证代码正确执行并返回 JSON 可序列化结果

2. **Property 2: Promise resolution**
   - 生成返回 Promise 的代码
   - 验证 Promise 被正确等待并返回解析值

3. **Property 3: Timeout enforcement**
   - 生成无限循环代码，配置不同超时值
   - 验证超时后返回错误

4. **Property 4: Error capture completeness**
   - 生成抛出各种异常的代码
   - 验证错误被捕获并以结构化格式返回

5. **Property 5: Canvas creation with dimensions**
   - 生成随机宽高参数
   - 验证 Canvas 尺寸正确

6. **Property 6: Canvas singleton behavior**
   - 生成多次 getCanvas 调用序列
   - 验证返回同一实例

7. **Property 7: Canvas export with metadata**
   - 生成 Canvas 绘图代码
   - 验证图像导出和元数据正确

8. **Property 8: Browser sandbox security**
   - 验证浏览器沙箱提供足够的安全隔离

9. **Property 9: Page state isolation**
   - 生成两段代码，第一段创建变量/DOM
   - 验证第二段无法访问

10. **Property 10: Browser instance reuse**
    - 执行多次代码
    - 验证浏览器实例被复用

### 集成测试

1. **端到端执行测试**
   - 测试完整的代码执行流程
   - 测试 Canvas 绘图和导出

2. **降级测试**
   - 模拟浏览器不可用，验证降级行为

3. **并发测试**
   - 测试多个并发执行请求

4. **兼容性测试**
   - 验证与现有 run_javascript 工具接口兼容
   - 验证 Canvas 元数据格式兼容
