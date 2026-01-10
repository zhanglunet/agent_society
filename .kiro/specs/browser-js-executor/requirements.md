# Requirements Document

## Introduction

本功能将智能体生成的 JavaScript 代码执行环境从 Node.js 迁移到 headless Chrome 浏览器中。通过在空白网页中执行代码，可以获得与真实浏览器完全一致的 API 兼容性和运行结果，同时消除对 `@napi-rs/canvas` 等 Node.js 兼容性库的依赖。

## Glossary

- **Browser_Executor**: 浏览器 JavaScript 执行器，负责在 headless Chrome 中执行智能体生成的代码
- **Execution_Page**: 用于执行代码的空白浏览器页面
- **Canvas_Export**: 将浏览器 Canvas 绘图结果导出为图像文件的过程
- **Code_Sandbox**: 代码执行的安全沙箱环境
- **BrowserManager**: 现有的浏览器管理器模块，负责 Chrome 实例的生命周期管理

## Requirements

### Requirement 1: 浏览器执行环境初始化

**User Story:** As a system administrator, I want the browser execution environment to be automatically initialized, so that agent-generated code can run in a real browser context.

#### Acceptance Criteria

1. WHEN the Runtime initializes, THE Browser_Executor SHALL launch a headless Chrome instance for code execution
2. WHEN the browser instance is launched, THE Browser_Executor SHALL create a dedicated Execution_Page with a blank HTML document
3. IF the Chrome browser fails to launch, THEN THE Browser_Executor SHALL fall back to the existing Node.js execution mode and log a warning
4. WHEN the Runtime shuts down, THE Browser_Executor SHALL properly close the browser instance and release resources

### Requirement 2: JavaScript 代码执行

**User Story:** As an agent, I want to execute JavaScript code in a browser environment, so that I can use standard browser APIs without compatibility issues.

#### Acceptance Criteria

1. WHEN the run_javascript tool is called, THE Browser_Executor SHALL execute the code in the Execution_Page context
2. WHEN executing code, THE Browser_Executor SHALL pass the input parameter to the code as a global variable
3. WHEN code execution completes, THE Browser_Executor SHALL return the result as a JSON-serializable value
4. IF the code returns a Promise, THEN THE Browser_Executor SHALL await its resolution before returning
5. WHEN code execution exceeds the timeout limit, THE Browser_Executor SHALL terminate execution and return a timeout error
6. IF the code throws an exception, THEN THE Browser_Executor SHALL capture the error and return it in a structured format

### Requirement 3: Canvas 绘图支持

**User Story:** As an agent, I want to use the Canvas API for drawing, so that I can generate images using standard browser Canvas without compatibility libraries.

#### Acceptance Criteria

1. WHEN code calls getCanvas(), THE Execution_Page SHALL create a Canvas element with the specified dimensions
2. WHEN code uses Canvas 2D context methods, THE Browser_Executor SHALL support all standard Canvas 2D API operations
3. WHEN code execution completes and Canvas was used, THE Browser_Executor SHALL export the Canvas content as a PNG image
4. WHEN exporting Canvas, THE Browser_Executor SHALL save the image to the artifacts directory with proper metadata
5. WHEN multiple getCanvas() calls occur, THE Browser_Executor SHALL return the same Canvas instance (singleton pattern)

### Requirement 4: 浏览器沙箱

**User Story:** As a system administrator, I want code execution to leverage browser's built-in sandbox, so that the system is secure without additional checks.

#### Acceptance Criteria

1. THE Browser_Executor SHALL rely on the browser's built-in sandbox for security isolation
2. THE Browser_Executor SHALL NOT perform pre-execution code pattern detection (browser sandbox is sufficient)
3. WHEN code attempts dangerous operations, THE browser's sandbox SHALL naturally block or limit them

### Requirement 5: 执行隔离

**User Story:** As a system administrator, I want each code execution to be completely isolated, so that one execution cannot affect another.

#### Acceptance Criteria

1. WHEN code execution starts, THE Browser_Executor SHALL create a new browser tab for the execution
2. WHEN code execution completes (success or failure), THE Browser_Executor SHALL close the tab immediately
3. THE Browser_Executor SHALL ensure each execution runs in a completely fresh environment with no state from previous executions

### Requirement 6: 向后兼容性

**User Story:** As a developer, I want the new browser executor to maintain API compatibility, so that existing code using run_javascript continues to work.

#### Acceptance Criteria

1. THE Browser_Executor SHALL maintain the same tool interface as the existing JavaScript executor
2. THE Browser_Executor SHALL support the same input/output format for code execution
3. THE Browser_Executor SHALL support the same getCanvas() API signature
4. WHEN Canvas images are saved, THE Browser_Executor SHALL use the same artifact storage format and metadata structure

### Requirement 7: 性能优化

**User Story:** As a system administrator, I want the browser executor to be performant, so that code execution does not introduce significant latency.

#### Acceptance Criteria

1. THE Browser_Executor SHALL use a dedicated Chrome instance separate from other browser operations
2. THE Browser_Executor SHALL reuse the same browser instance across multiple code executions
3. THE Browser_Executor SHALL create a new tab for each execution and close it after completion
4. THE Browser_Executor SHALL support configurable timeout for code execution (default: 30 seconds)
