# Design Document: Artifact Binary Content Routing

## Overview

本设计优化 `get_artifact` 工具函数在读取二进制内容时的处理策略。核心思路是：根据当前智能体使用的 LLM 模型能力，智能路由二进制内容到正确的消息字段（image_url、file 或文本描述），避免将 base64 编码的二进制数据放入文本字段浪费 token。

## Architecture

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Tool Executor                                  │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  get_artifact    │───▶│ ArtifactStore    │───▶│ BinaryDetector   │  │
│  │  (工具入口)       │    │ (读取工件)        │    │ (检测二进制类型)  │  │
│  └────────┬─────────┘    └──────────────────┘    └──────────────────┘  │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    ArtifactContentRouter (新增)                    │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │  │
│  │  │ 内容类型检测    │  │ 模型能力查询    │  │ 内容路由决策        │  │  │
│  │  │ - 图片/音频/视频│  │ - vision       │  │ - image_url 字段   │  │  │
│  │  │ - 文档/其他     │  │ - file         │  │ - file 字段        │  │  │
│  │  │ - 文本         │  │ - text only    │  │ - 文本描述         │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Structured Response                             │  │
│  │  {                                                                 │  │
│  │    contentType: "image" | "binary" | "text",                      │  │
│  │    routing: "image_url" | "file" | "text",                        │  │
│  │    content: <actual content or description>,                       │  │
│  │    imageUrl?: { type: "image_url", image_url: {...} },            │  │
│  │    file?: { type: "file", ... },                                  │  │
│  │    metadata: { ... }                                               │  │
│  │  }                                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           LLM Handler                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  处理工具调用结果，根据 routing 字段构建多模态消息                    │  │
│  │  - image_url → 添加到 content 数组                                 │  │
│  │  - file → 添加到 content 数组                                      │  │
│  │  - text → 直接作为文本内容                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 数据流

```
get_artifact(ref) 调用
        │
        ▼
┌───────────────────┐
│ ArtifactStore     │
│ getArtifact(ref)  │
└────────┬──────────┘
         │ 返回 { content, isBinary, mimeType, ... }
         ▼
┌───────────────────────────────────────┐
│ ArtifactContentRouter.routeContent()  │
│                                       │
│ 1. 检测内容类型 (图片/音频/视频/文档/文本)│
│ 2. 查询当前智能体的 LLM 服务能力        │
│ 3. 根据能力决定路由策略                 │
└────────┬──────────────────────────────┘
         │
         ├─── 文本内容 ──────────────────▶ { contentType: "text", routing: "text", content: "..." }
         │
         ├─── 图片 + vision 能力 ────────▶ { contentType: "image", routing: "image_url", 
         │                                   imageUrl: { type: "image_url", image_url: { url: "data:..." } } }
         │
         ├─── 图片 + 无 vision 能力 ─────▶ { contentType: "image", routing: "text",
         │                                   content: "[图片文件: xxx.png, 大小: 1.2MB, 当前模型不支持图片理解]" }
         │
         ├─── 二进制 + file 能力 ────────▶ { contentType: "binary", routing: "file",
         │                                   file: { type: "file", ... } }
         │
         └─── 二进制 + 无 file 能力 ─────▶ { contentType: "binary", routing: "text",
                                            content: "[文件: xxx.pdf, 类型: PDF文档, 大小: 2.5MB, 当前模型不支持文件读取]" }
```

## Components

### 1. ArtifactContentRouter (新增)

**文件**: `src/platform/artifact_content_router.js`

**职责**: 根据工件内容类型和模型能力，决定内容的路由策略。

```javascript
/**
 * @typedef {Object} ContentRouteResult
 * @property {'text' | 'image' | 'binary'} contentType - 内容类型
 * @property {'text' | 'image_url' | 'file'} routing - 路由目标
 * @property {string} [content] - 文本内容或描述
 * @property {Object} [imageUrl] - image_url 格式的图片数据
 * @property {Object} [file] - file 格式的文件数据
 * @property {Object} metadata - 元数据
 */

export class ArtifactContentRouter {
  constructor(options = {}) {
    this.serviceRegistry = options.serviceRegistry;
    this.binaryDetector = options.binaryDetector;
    this.logger = options.logger;
  }

  /**
   * 路由工件内容
   * @param {Object} artifact - 工件对象 (来自 ArtifactStore.getArtifact)
   * @param {string} serviceId - 当前智能体使用的 LLM 服务 ID
   * @returns {Promise<ContentRouteResult>}
   */
  async routeContent(artifact, serviceId) { ... }

  /**
   * 检测二进制内容的具体类型
   * @param {Object} artifact - 工件对象
   * @returns {'image' | 'audio' | 'video' | 'document' | 'other'}
   */
  detectBinaryType(artifact) { ... }

  /**
   * 检查模型是否支持指定能力
   * @param {string} serviceId - 服务 ID
   * @param {string} capability - 能力类型 ('vision' | 'file' | 'audio')
   * @returns {boolean}
   */
  hasCapability(serviceId, capability) { ... }

  /**
   * 格式化图片为 image_url 格式
   * @param {Buffer|string} content - 图片内容 (Buffer 或 base64 字符串)
   * @param {string} mimeType - MIME 类型
   * @returns {Object} image_url 格式对象
   */
  formatImageUrl(content, mimeType) { ... }

  /**
   * 生成不支持内容的文本描述
   * @param {Object} artifact - 工件对象
   * @param {string} binaryType - 二进制类型
   * @returns {string}
   */
  generateTextDescription(artifact, binaryType) { ... }
}
```

### 2. 修改 ToolExecutor._executeGetArtifact

**文件**: `src/platform/runtime/tool_executor.js`

**修改内容**: 在 `_executeGetArtifact` 方法中集成 `ArtifactContentRouter`。

```javascript
async _executeGetArtifact(ctx, args) {
  const runtime = this.runtime;
  
  // 1. 读取工件
  const artifact = await ctx.tools.getArtifact(args.ref);
  if (!artifact) {
    return { error: "artifact_not_found", ref: args.ref };
  }
  
  // 2. 获取当前智能体的 LLM 服务 ID
  const serviceId = runtime._llmHandler._getServiceIdForAgent(ctx.agent?.id);
  
  // 3. 如果是文本内容，直接返回
  if (!artifact.isBinary) {
    return {
      contentType: "text",
      routing: "text",
      content: artifact.content,
      metadata: {
        id: artifact.id,
        type: artifact.type,
        createdAt: artifact.createdAt
      }
    };
  }
  
  // 4. 使用 ArtifactContentRouter 路由二进制内容
  const routeResult = await runtime.artifactContentRouter.routeContent(artifact, serviceId);
  
  return routeResult;
}
```

### 3. 修改 LlmHandler 处理工具调用结果

**文件**: `src/platform/runtime/llm_handler.js`

**修改内容**: 在 `_processToolCall` 方法中，检测 `get_artifact` 的返回结果，根据 `routing` 字段构建多模态消息。

```javascript
async _processToolCall(ctx, call, conv, msg, message) {
  // ... 现有代码 ...
  
  let result = null;
  try {
    result = await runtime.executeToolCall(ctx, toolName, args);
  } catch (toolErr) {
    // ... 错误处理 ...
  }
  
  // 特殊处理 get_artifact 的多模态返回
  if (toolName === "get_artifact" && result && result.routing) {
    const toolResponse = this._formatArtifactToolResponse(result);
    conv.push({
      role: "tool",
      tool_call_id: call.id,
      content: toolResponse.content,
      // 如果有多模态内容，添加到 content 数组
      ...(toolResponse.multimodal && { content: toolResponse.multimodalContent })
    });
    return;
  }
  
  // ... 现有代码 ...
}

/**
 * 格式化 get_artifact 工具的响应
 * @param {ContentRouteResult} result - 路由结果
 * @returns {Object} 格式化后的响应
 */
_formatArtifactToolResponse(result) {
  switch (result.routing) {
    case "image_url":
      return {
        multimodal: true,
        multimodalContent: [
          { type: "text", text: `工件内容 (${result.metadata?.filename || result.metadata?.id}):` },
          result.imageUrl
        ],
        content: JSON.stringify({ 
          status: "success", 
          contentType: result.contentType,
          routing: result.routing,
          metadata: result.metadata 
        })
      };
    
    case "file":
      return {
        multimodal: true,
        multimodalContent: [
          { type: "text", text: `工件内容 (${result.metadata?.filename || result.metadata?.id}):` },
          result.file
        ],
        content: JSON.stringify({ 
          status: "success", 
          contentType: result.contentType,
          routing: result.routing,
          metadata: result.metadata 
        })
      };
    
    case "text":
    default:
      return {
        multimodal: false,
        content: JSON.stringify({
          status: "success",
          contentType: result.contentType,
          routing: result.routing,
          content: result.content,
          metadata: result.metadata
        })
      };
  }
}
```

### 4. 二进制类型检测增强

**文件**: `src/platform/binary_detector.js`

**新增方法**: 添加 `detectBinaryType` 方法，识别具体的二进制类型。

```javascript
/**
 * 检测二进制内容的具体类型
 * @param {Buffer} buffer - 文件内容
 * @param {Object} options - 检测选项
 * @returns {Promise<{type: string, confidence: number}>}
 */
async detectBinaryType(buffer, options = {}) {
  const { mimeType, extension, filename } = options;
  
  // 1. 优先使用 MIME 类型判断
  if (mimeType) {
    if (mimeType.startsWith('image/')) return { type: 'image', confidence: 0.95 };
    if (mimeType.startsWith('audio/')) return { type: 'audio', confidence: 0.95 };
    if (mimeType.startsWith('video/')) return { type: 'video', confidence: 0.95 };
    if (DOCUMENT_MIME_TYPES.has(mimeType)) return { type: 'document', confidence: 0.95 };
  }
  
  // 2. 使用扩展名判断
  const ext = extension || this._extractExtension(filename);
  if (ext) {
    if (IMAGE_EXTENSIONS.has(ext)) return { type: 'image', confidence: 0.85 };
    if (AUDIO_EXTENSIONS.has(ext)) return { type: 'audio', confidence: 0.85 };
    if (VIDEO_EXTENSIONS.has(ext)) return { type: 'video', confidence: 0.85 };
    if (DOCUMENT_EXTENSIONS.has(ext)) return { type: 'document', confidence: 0.85 };
  }
  
  // 3. 使用 magic bytes 检测
  try {
    const fileType = await fileTypeFromBuffer(buffer);
    if (fileType) {
      if (fileType.mime.startsWith('image/')) return { type: 'image', confidence: 0.9 };
      if (fileType.mime.startsWith('audio/')) return { type: 'audio', confidence: 0.9 };
      if (fileType.mime.startsWith('video/')) return { type: 'video', confidence: 0.9 };
    }
  } catch (e) {
    // 忽略检测错误
  }
  
  // 4. 默认为 other
  return { type: 'other', confidence: 0.5 };
}
```

### 5. Runtime 初始化

**文件**: `src/platform/runtime.js`

**修改内容**: 在 `init()` 方法中初始化 `ArtifactContentRouter`。

```javascript
async init() {
  // ... 现有代码 ...
  
  // 初始化工件内容路由器
  this.artifactContentRouter = new ArtifactContentRouter({
    serviceRegistry: this.serviceRegistry,
    binaryDetector: this.artifacts?.binaryDetector,
    logger: this.loggerRoot?.forModule("artifact_content_router")
  });
  
  // ... 现有代码 ...
}
```

## Data Models

### ContentRouteResult

```typescript
interface ContentRouteResult {
  // 内容类型
  contentType: 'text' | 'image' | 'binary';
  
  // 路由目标
  routing: 'text' | 'image_url' | 'file';
  
  // 文本内容或描述 (routing === 'text' 时必填)
  content?: string;
  
  // image_url 格式数据 (routing === 'image_url' 时必填)
  imageUrl?: {
    type: 'image_url';
    image_url: {
      url: string;  // data:{mimeType};base64,{base64Data}
    };
  };
  
  // file 格式数据 (routing === 'file' 时必填)
  file?: {
    type: 'file';
    file: {
      filename: string;
      mimeType: string;
      data: string;  // base64 编码
    };
  };
  
  // 元数据
  metadata: {
    id: string;
    type?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    createdAt?: string;
    binaryType?: 'image' | 'audio' | 'video' | 'document' | 'other';
  };
}
```

### 能力类型映射

| 二进制类型 | 所需能力 | 路由目标 |
|-----------|---------|---------|
| image | vision | image_url |
| audio | audio | file |
| video | video | file |
| document | file | file |
| other | file | file |
| text | text | text |

### 文本模型读取二进制工件的处理策略

当仅支持文本的模型（无 vision/file 能力）尝试读取二进制工件时，系统采用**安全降级策略**：

#### 处理流程

```
文本模型调用 get_artifact(ref) 读取二进制工件
        │
        ▼
┌───────────────────────────────────────┐
│ ArtifactContentRouter.routeContent()  │
│                                       │
│ 1. 检测到 isBinary = true             │
│ 2. 检测二进制类型 (image/document/etc)│
│ 3. 查询模型能力 → 仅支持 text         │
│ 4. 触发降级策略                       │
└────────┬──────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────┐
│ generateTextDescription()             │
│                                       │
│ 生成描述性文本，包含：                 │
│ - 文件基本信息（名称、类型、大小）     │
│ - 明确的能力限制说明                  │
│ - 建议使用支持该类型的模型            │
│                                       │
│ 【关键】绝不包含任何 base64 数据       │
└────────┬──────────────────────────────┘
         │
         ▼
返回 { contentType: "image"|"binary", routing: "text", content: "描述文本" }
```

#### 各类型二进制文件的降级描述模板

**统一格式（简洁版）**
```
[无法读取] {filename} (artifact:{id})
类型: {friendlyType}
当前模型不支持读取此类文件。建议创建具备相应能力的智能体协助处理。
```

**示例**

图片文件：
```
[无法读取] screenshot.png (artifact:abc123)
类型: PNG 图片
当前模型不支持读取此类文件。建议创建具备相应能力的智能体协助处理。
```

PDF 文档：
```
[无法读取] report.pdf (artifact:def456)
类型: PDF 文档
当前模型不支持读取此类文件。建议创建具备相应能力的智能体协助处理。
```

音频文件：
```
[无法读取] recording.mp3 (artifact:ghi789)
类型: MP3 音频
当前模型不支持读取此类文件。建议创建具备相应能力的智能体协助处理。
```

#### 关键设计原则

1. **绝不泄露二进制数据**: 降级描述中绝不包含任何 base64 编码数据，避免浪费 token
2. **提供有用信息**: 描述包含文件元信息，帮助模型理解上下文
3. **明确能力限制**: 清楚说明为什么无法处理，避免模型困惑
4. **提供可行建议**: 给出替代方案，帮助用户解决问题
5. **保持一致格式**: 所有类型使用统一的描述结构，便于解析

#### 代码实现

```javascript
/**
 * 生成不支持内容的文本描述
 * @param {Object} artifact - 工件对象
 * @param {string} binaryType - 二进制类型 ('image'|'audio'|'video'|'document'|'other')
 * @returns {string} 描述文本
 */
generateTextDescription(artifact, binaryType) {
  const filename = artifact.meta?.filename || artifact.id || '未知文件';
  const artifactId = artifact.id || '未知';
  const mimeType = artifact.mimeType || 'application/octet-stream';
  const friendlyType = this._getFriendlyTypeName(mimeType);
  
  return `[无法读取] ${filename} (artifact:${artifactId})
类型: ${friendlyType}
当前模型不支持读取此类文件。建议创建具备相应能力的智能体协助处理。`;
}

/**
 * 获取友好的类型名称
 * @param {string} mimeType - MIME 类型
 * @returns {string} 友好的类型名称
 * @private
 */
_getFriendlyTypeName(mimeType) {
  const typeMap = {
    'image/jpeg': 'JPEG 图片',
    'image/png': 'PNG 图片',
    'image/gif': 'GIF 图片',
    'image/webp': 'WebP 图片',
    'image/bmp': 'BMP 图片',
    'image/svg+xml': 'SVG 图片',
    'application/pdf': 'PDF 文档',
    'application/msword': 'Word 文档',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word 文档',
    'application/vnd.ms-excel': 'Excel 表格',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel 表格',
    'application/vnd.ms-powerpoint': 'PowerPoint 演示',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint 演示',
    'audio/mpeg': 'MP3 音频',
    'audio/mp3': 'MP3 音频',
    'audio/wav': 'WAV 音频',
    'audio/ogg': 'OGG 音频',
    'video/mp4': 'MP4 视频',
    'video/webm': 'WebM 视频',
    'video/quicktime': 'QuickTime 视频',
    'application/zip': 'ZIP 压缩包',
    'application/x-rar-compressed': 'RAR 压缩包',
    'application/octet-stream': '二进制文件'
  };
  
  return typeMap[mimeType] || mimeType;
}
```

## Error Handling

### 错误场景和处理策略

| 错误场景 | 处理策略 |
|---------|---------|
| 工件不存在 | 返回 `{ error: "artifact_not_found", ref: "..." }` |
| 元数据损坏 | 使用内容检测作为回退 |
| 内容检测失败 | 默认为二进制，返回文本描述 |
| 能力查询失败 | 假设仅支持文本，返回文本描述 |
| base64 编码失败 | 返回错误描述 |

### 错误响应格式

```javascript
// 工件不存在
{
  error: "artifact_not_found",
  ref: "artifact:xxx",
  message: "工件不存在或已被删除"
}

// 内容处理失败
{
  contentType: "binary",
  routing: "text",
  content: "[文件处理失败: xxx.pdf]\n错误: 无法读取文件内容\n请检查文件是否损坏",
  metadata: { ... }
}
```

## Testing Strategy

本功能采用严格的多层测试策略，确保核心不变量在任何情况下都得到保证。

### 核心不变量 (Invariants)

以下不变量必须在所有测试中得到验证：

1. **INV-1: 二进制内容永不进入文本字段** - 任何二进制内容（isBinary=true）在 routing="text" 时，content 字段只能包含描述性文本，绝不能包含原始 base64 数据
2. **INV-2: 文本内容永不编码** - 任何文本内容（isBinary=false）必须原样返回，不进行任何编码
3. **INV-3: 路由决策一致性** - 相同的 (contentType, capability) 组合必须产生相同的路由决策
4. **INV-4: 返回结构完整性** - 返回结果必须包含所有必需字段，且字段类型正确
5. **INV-5: 能力降级安全性** - 当模型不支持某能力时，必须安全降级到文本描述，不能抛出异常

---

### Property-Based Tests (基于属性的测试)

#### Property 1: 文本内容永不编码为 base64

```javascript
// 对于任意文本内容，路由结果的 routing 字段应为 "text"，
// 且 content 字段应为原始文本（非 base64 编码）
fc.assert(
  fc.asyncProperty(
    fc.string(),
    async (textContent) => {
      const artifact = { content: textContent, isBinary: false };
      const result = await router.routeContent(artifact, serviceId);
      
      expect(result.routing).toBe("text");
      expect(result.content).toBe(textContent);
      expect(result.content).not.toMatch(/^[A-Za-z0-9+/]+=*$/); // 非 base64
    }
  )
);
```

#### Property 2: 二进制内容永不进入文本字段

```javascript
// 对于任意二进制内容，当 routing 为 "text" 时，
// content 应为描述性文本，不包含 base64 数据
fc.assert(
  fc.asyncProperty(
    fc.uint8Array({ minLength: 1 }),
    async (binaryData) => {
      const artifact = { 
        content: Buffer.from(binaryData).toString('base64'), 
        isBinary: true 
      };
      const result = await router.routeContent(artifact, textOnlyServiceId);
      
      expect(result.routing).toBe("text");
      // content 应为描述性文本，不应包含原始 base64 数据
      expect(result.content).toContain("[");
      expect(result.content.length).toBeLessThan(artifact.content.length);
    }
  )
);
```

#### Property 3: 图片内容正确路由

```javascript
// 对于任意图片内容，当模型支持 vision 时，
// 应路由到 image_url 字段
fc.assert(
  fc.asyncProperty(
    fc.uint8Array({ minLength: 100 }),
    fc.constantFrom('image/jpeg', 'image/png', 'image/gif', 'image/webp'),
    async (imageData, mimeType) => {
      const artifact = { 
        content: Buffer.from(imageData).toString('base64'), 
        isBinary: true,
        mimeType 
      };
      const result = await router.routeContent(artifact, visionServiceId);
      
      expect(result.routing).toBe("image_url");
      expect(result.imageUrl).toBeDefined();
      expect(result.imageUrl.type).toBe("image_url");
      expect(result.imageUrl.image_url.url).toMatch(/^data:image\//);
    }
  )
);
```

### Unit Tests

1. **ArtifactContentRouter 基础功能**
   - 文本内容直接返回
   - 图片内容 + vision 能力 → image_url
   - 图片内容 + 无 vision 能力 → 文本描述
   - 二进制内容 + file 能力 → file
   - 二进制内容 + 无 file 能力 → 文本描述

2. **二进制类型检测**
   - MIME 类型检测
   - 扩展名检测
   - Magic bytes 检测
   - 回退到默认类型

3. **错误处理**
   - 工件不存在
   - 元数据损坏
   - 能力查询失败

4. **集成测试**
   - 完整的 get_artifact 工具调用流程
   - LLM Handler 处理多模态响应

## Migration Notes

### 向后兼容性

1. **现有 API 保持不变**: `get_artifact` 工具的参数格式不变
2. **返回格式扩展**: 新增 `routing`、`imageUrl`、`file` 字段，原有字段保留
3. **渐进式迁移**: 如果 `routing` 字段不存在，LLM Handler 按原有逻辑处理

### 配置要求

确保 `llmservices.json` 中正确配置了模型能力：

```json
{
  "services": [
    {
      "id": "gpt-4-vision",
      "capabilities": {
        "input": ["text", "vision"],
        "output": ["text"]
      }
    },
    {
      "id": "claude-3",
      "capabilities": {
        "input": ["text", "vision", "file"],
        "output": ["text"]
      }
    }
  ]
}
```

## Performance Considerations

1. **缓存**: 利用 BinaryDetector 的现有缓存机制
2. **延迟加载**: 只在需要时才读取工件内容
3. **流式处理**: 对于大文件，考虑分块处理（未来优化）

## Security Considerations

1. **内容验证**: 验证 base64 数据的有效性
2. **大小限制**: 限制单个工件的最大大小
3. **MIME 类型验证**: 防止 MIME 类型欺骗
