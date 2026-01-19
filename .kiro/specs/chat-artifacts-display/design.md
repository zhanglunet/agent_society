# 设计文档

## 概述

本设计扩展聊天面板的工件显示功能，从当前只显示图片工件改为显示所有类型工件并按类型分组。设计复用现有的工件管理器类型识别逻辑，保持系统一致性。

## 架构

### 现有架构分析

当前聊天面板的工件显示架构：
- `ChatPanel.renderToolCallGroupArtifacts()` 方法负责渲染工具调用组的工件
- 只处理 `payload.images` 和 `payload.result.images` 数组
- 使用固定的图片缩略图显示方式
- 点击图片时调用 `ImageViewer.show()` 

现有工件管理器架构：
- `ArtifactManager._getFileIconByType()` 提供类型图标映射
- `ArtifactManager._isImageType()` 判断是否为图片类型
- 支持多种工件类型：JSON、文本、图片、代码、HTML等

### 新架构设计

#### 模块层次结构

```
ChatPanel (主控制器)
├── ArtifactCollector (工件收集器)
│   ├── 依赖: 无
│   └── 职责: 从工具调用消息中提取工件数据
├── ArtifactGrouper (工件分组器) 
│   ├── 依赖: ArtifactCollector
│   └── 职责: 将工件按类型分组
├── ArtifactRenderer (工件渲染器)
│   ├── 依赖: ArtifactGrouper, ArtifactManager
│   └── 职责: 生成HTML显示内容
└── ArtifactInteractionHandler (交互处理器)
    ├── 依赖: ImageViewer, ArtifactManager
    └── 职责: 处理工件点击事件
```

#### 模块协作流程

1. **数据收集阶段**
   - ChatPanel 调用 ArtifactCollector.collectAllArtifacts()
   - ArtifactCollector 遍历工具调用消息，提取所有工件数据
   - 返回标准化的工件对象数组

2. **数据分组阶段**
   - ChatPanel 调用 ArtifactGrouper.groupArtifactsByType()
   - ArtifactGrouper 使用 ArtifactManager._isImageType() 判断类型
   - 将工件按类型分组，图片单独处理

3. **渲染阶段**
   - ChatPanel 调用 ArtifactRenderer.renderGroupedArtifacts()
   - ArtifactRenderer 使用 ArtifactManager._getFileIconByType() 获取图标
   - 图片工件保持现有缩略图格式
   - 非图片工件渲染为分组链接

4. **交互处理阶段**
   - 用户点击工件触发事件
   - ArtifactInteractionHandler 根据工件类型选择处理方式
   - 图片调用 ImageViewer.show()，其他类型打开相应查看器

#### 实现策略

**最小侵入原则**: 
- 保持现有 `renderToolCallGroupArtifacts()` 方法作为主入口
- 内部重构为模块化架构，外部接口不变
- 复用现有的图片显示逻辑和样式

**模块实现方式**:
- 所有新模块作为 ChatPanel 的私有方法实现
- 使用函数式设计，避免状态管理复杂性
- 保持单一职责原则，每个模块功能明确

**错误隔离**:
- 各模块独立处理错误，不影响其他模块
- 渲染失败时降级到现有图片显示逻辑
- 记录详细错误信息用于调试

## 组件和接口

### 工件数据收集器 (ArtifactCollector)

**职责**: 从工具调用消息中提取所有类型的工件数据
**上级模块**: ChatPanel
**下级模块**: 无
**协作模块**: 无

**接口**:
```javascript
/**
 * 从工具调用消息数组中收集所有工件
 * @param {Array} toolCallMessages - 工具调用消息数组
 * @returns {Array} 工件对象数组
 */
collectAllArtifacts(toolCallMessages)
```

**工件对象结构**:
```javascript
{
  id: string,           // 工件唯一标识
  type: string,         // 工件类型 (image, json, text, html, etc.)
  name: string,         // 显示名称
  content: any,         // 工件内容引用
  source: object        // 来源消息引用
}
```

### 工件类型分组器 (ArtifactGrouper)

**职责**: 将工件按类型进行分组
**上级模块**: ChatPanel
**下级模块**: 无
**协作模块**: ArtifactManager (调用类型判断方法)

**接口**:
```javascript
/**
 * 将工件数组按类型分组
 * @param {Array} artifacts - 工件数组
 * @returns {Map} 类型分组映射 (type -> artifacts[])
 */
groupArtifactsByType(artifacts)
```

**协作流程**:
- 调用 ArtifactManager._isImageType() 判断图片类型
- 图片工件单独分组
- 其他类型按 type 字段分组

**实现细节**:
- 输入验证: 检查 artifacts 数组有效性
- 类型标准化: 统一类型字符串格式 (小写)
- 分组策略: 图片类型优先，其他类型按字母排序

### 工件渲染器 (ArtifactRenderer)

**职责**: 渲染分组后的工件HTML，图片保持缩略图格式，其他类型显示为分组链接
**上级模块**: ChatPanel
**下级模块**: 无
**协作模块**: ArtifactManager (获取类型图标)

**接口**:
```javascript
/**
 * 渲染工件分组HTML
 * @param {Map} groupedArtifacts - 分组后的工件
 * @returns {string} HTML字符串
 */
renderGroupedArtifacts(groupedArtifacts)

/**
 * 渲染图片工件缩略图 (保持现有格式)
 * @param {Array} imageArtifacts - 图片工件数组
 * @returns {string} HTML字符串
 */
renderImageThumbnails(imageArtifacts)

/**
 * 渲染非图片工件分组
 * @param {string} type - 工件类型
 * @param {Array} artifacts - 该类型的工件数组
 * @returns {string} HTML字符串
 */
renderTypeGroup(type, artifacts)
```

**协作流程**:
- 调用 ArtifactManager._getFileIconByType() 获取分组图标
- 图片工件复用现有缩略图渲染逻辑
- 非图片工件渲染为带图标的分组和链接列表

**实现细节**:
- HTML结构: 保持与现有样式兼容的DOM结构
- 图片渲染: 完全复用现有的缩略图生成逻辑
- 链接渲染: 使用语义化的 `<a>` 标签，支持键盘导航
- 错误处理: 工件加载失败时显示占位符和错误提示

### 工件交互处理器 (ArtifactInteractionHandler)

**职责**: 处理工件点击交互
**上级模块**: ChatPanel
**下级模块**: 无
**协作模块**: ImageViewer, ArtifactManager

**接口**:
```javascript
/**
 * 处理工件点击事件
 * @param {object} artifact - 工件对象
 */
handleArtifactClick(artifact)
```

**协作流程**:
- 初始化时注册各类型处理器到处理器映射表
- 从事件目标获取工件类型
- 直接调用已注册的类型处理器
- 未注册类型使用默认处理器

**实现细节**:
- 事件委托: 使用事件委托机制处理动态生成的工件点击
- 类型路由: 根据工件类型选择合适的处理器
- 错误恢复: 交互失败时提供用户友好的错误提示

## 数据模型

### 工具调用消息结构

基于现有代码分析，工具调用消息的结构：

```javascript
{
  type: "tool_call",
  payload: {
    toolName: string,
    args: object,
    result: {
      // JavaScript执行器结果
      result: any,           // 执行结果
      images: string[],      // 图片文件名数组
      
      // 其他可能的工件类型
      files: string[],       // 文件工件数组
      documents: object[],   // 文档工件数组
      artifacts: object[]    // 通用工件数组
    },
    // 直接在payload层级的工件
    images: string[],        // 图片数组
    files: string[],         // 文件数组
    artifacts: object[]      // 工件数组
  }
}
```

### 工件显示规则

基于用户反馈的显示规则：

1. **图片工件**: 保持当前缩略图显示格式，不显示图标
2. **非图片工件**: 按类型分组，分组标题显示类型图标，工件本身显示为可点击链接

```javascript
const TYPE_ICONS = {
  // JSON类型分组图标
  json: "📄", config: "📄", settings: "📄", data: "📄",
  
  // 文本类型分组图标
  text: "📝", txt: "📝", markdown: "📝", md: "📝",
  
  // 代码类型分组图标
  javascript: "💻", js: "💻", typescript: "💻", ts: "💻",
  
  // 网页类型分组图标
  html: "🌐", css: "🎨",
  
  // 默认分组图标
  default: "📋"
};

const DISPLAY_RULES = {
  image: "thumbnail",    // 显示缩略图
  other: "link"         // 显示为链接
};
```

## 错误处理

### 工件加载失败

- 显示错误状态图标
- 保留点击功能，显示错误信息
- 记录错误日志但不影响其他工件显示

### 类型识别失败

- 使用默认文档图标
- 按文本类型处理交互
- 记录警告日志

### 渲染异常

- 捕获渲染异常，显示降级UI
- 保持现有图片显示功能作为后备
- 记录详细错误信息

## 测试策略

### 单元测试

- 工件收集逻辑测试
- 类型分组逻辑测试  
- HTML渲染输出测试
- 错误处理测试

### 集成测试

- 与工件管理器集成测试
- 与图片查看器集成测试
- 完整工具调用流程测试

### 属性测试

每个属性测试运行100次迭代，使用随机生成的测试数据验证通用属性。

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 全类型工件收集
*对于任何* 包含工件的工具调用消息组，收集到的工件应该包含所有类型的工件，而不仅限于图片类型
**验证: 需求 1.1**

### 属性 2: 图片工件缩略图显示
*对于任何* 图片类型工件，应该保持当前的缩略图显示格式，不显示额外图标
**验证: 需求 1.1, 用户反馈**

### 属性 3: 非图片工件分组显示
*对于任何* 非图片类型工件，应该按类型分组显示，分组标题显示类型图标，工件显示为可点击链接
**验证: 需求 1.2, 1.3, 1.4, 1.5, 用户反馈**

### 属性 4: 类型分组一致性
*对于任何* 包含多种类型工件的消息组，渲染结果应该将相同类型的工件分组在一起，每个分组有清晰的类型标题和图标
**验证: 需求 2.1, 2.2, 2.3**

### 属性 5: 工件管理器一致性
*对于任何* 工件类型，使用的类型判断和分组图标应该与ArtifactManager的实现完全一致
**验证: 需求 2.4, 4.3, 5.1, 5.2, 5.3, 5.4**

### 属性 6: 交互行为保持
*对于任何* 工件点击操作，图片工件应该打开图片查看器，非图片工件链接应该打开相应的工件查看器
**验证: 需求 3.1, 3.2**

### 属性 7: 错误状态处理
*对于任何* 工件加载失败的情况，应该显示错误状态提示而不是崩溃或空白显示
**验证: 需求 3.4**

### 属性 8: 文本截断处理
*对于任何* 长文件名，应该进行适当的截断处理以保持界面可读性
**验证: 需求 4.2**

## 测试策略

### 双重测试方法
- **单元测试**: 验证特定示例、边界情况和错误条件
- **属性测试**: 验证跨所有输入的通用属性
- 两者互补，共同提供全面覆盖

### 单元测试重点
- 特定工件类型的显示示例
- 组件间集成点
- 边界情况和错误条件

### 属性测试重点
- 通过随机化实现全面输入覆盖的通用属性
- 最少100次迭代的属性测试配置
- 每个正确性属性由单个属性测试实现

### 属性测试配置
- 使用JavaScript的fast-check库进行属性测试
- 每个测试最少100次迭代
- 测试标签格式: **Feature: chat-artifacts-display, Property {number}: {property_text}**
#### 详细模块设计

**ChatPanel 主控制器**:
- 职责: 协调各模块完成工件显示功能
- 公开接口: `renderToolCallGroupArtifacts(toolCallMessages)` - 保持现有接口不变
- 内部方法: 
  - `_collectAllArtifacts(toolCallMessages)` - 调用工件收集器
  - `_groupArtifactsByType(artifacts)` - 调用工件分组器  
  - `_renderGroupedArtifacts(groupedArtifacts)` - 调用工件渲染器
  - `_setupArtifactInteractions()` - 设置交互处理器
- 数据流: toolCallMessages → artifacts → groupedArtifacts → HTML
- 依赖关系: 依赖 ArtifactManager (类型识别), ImageViewer (图片查看)

**ArtifactCollector 工件收集器**:
- 职责: 从工具调用消息中提取工件数据
- 输入: 工具调用消息数组
- 输出: 标准化工件对象数组
- 处理逻辑:
  1. 遍历每个工具调用消息
  2. 检查 `payload.images`, `payload.result.images` 等字段
  3. 检查 `payload.files`, `payload.result.files` 等字段
  4. 检查 `payload.artifacts`, `payload.result.artifacts` 等字段
  5. 为每个工件生成唯一ID和标准化类型
- 错误处理: 跳过无效工件，记录警告日志

**ArtifactGrouper 工件分组器**:
- 职责: 将工件按类型分组，使用类型处理器注册机制
- 输入: 工件对象数组
- 输出: 类型分组映射 (Map<string, Array>)
- 处理逻辑:
  1. 初始化时注册类型识别器到识别器映射表
  2. 遍历工件数组，调用对应类型识别器
  3. 根据识别结果进行分组
  4. 分组按预定义顺序排序
- 注册机制:
```javascript
// 类型识别器注册表
const typeIdentifiers = new Map();
typeIdentifiers.set('image', ArtifactManager._isImageType);
typeIdentifiers.set('json', (type) => ['json', 'config'].includes(type));
typeIdentifiers.set('text', (type) => ['text', 'md'].includes(type));
// ... 其他类型识别器

// 识别工件类型
identifyArtifactType(artifact) {
  for (const [groupType, identifier] of typeIdentifiers) {
    if (identifier(artifact.type)) {
      return groupType;
    }
  }
  return 'other'; // 默认分组
}
```
- 依赖关系: 调用 ArtifactManager 的类型判断方法

**ArtifactRenderer 工件渲染器**:
- 职责: 生成工件显示HTML，使用渲染器注册机制
- 输入: 类型分组映射
- 输出: HTML字符串
- 处理逻辑:
  1. 初始化时注册各类型渲染器到渲染器映射表
  2. 遍历分组映射，调用对应类型渲染器
  3. 组合各渲染器输出为最终HTML
- 注册机制:
```javascript
// 渲染器注册表
const typeRenderers = new Map();
typeRenderers.set('image', this.renderImageThumbnails.bind(this));
typeRenderers.set('json', this.renderTypeGroup.bind(this, 'json', '📄'));
typeRenderers.set('text', this.renderTypeGroup.bind(this, 'text', '📝'));
// ... 其他类型渲染器

// 渲染分组
renderGroupedArtifacts(groupedArtifacts) {
  const htmlParts = [];
  for (const [type, artifacts] of groupedArtifacts) {
    const renderer = typeRenderers.get(type) || defaultRenderer;
    htmlParts.push(renderer(artifacts));
  }
  return htmlParts.join('');
}
```
- 依赖关系: 调用 ArtifactManager 的图标获取方法
- HTML结构:
```html
<div class="tool-call-group-artifacts">
  <div class="artifact-images"><!-- 图片缩略图 --></div>
  <div class="artifact-type-group">
    <div class="artifact-type-header">📄 JSON文件</div>
    <div class="artifact-type-items">
      <a href="#" class="artifact-link">config.json</a>
      <a href="#" class="artifact-link">data.json</a>
    </div>
  </div>
</div>
```

**ArtifactInteractionHandler 交互处理器**:
- 职责: 处理工件点击事件，使用注册机制而非条件判断
- 输入: 工件点击事件
- 输出: 打开相应查看器
- 处理逻辑:
  1. 初始化时注册各类型处理器到处理器映射表
  2. 使用事件委托监听工件点击
  3. 从事件目标获取工件类型
  4. 直接调用已注册的类型处理器
  5. 未注册类型使用默认处理器
- 注册机制:
```javascript
// 处理器注册表
const typeHandlers = new Map();
typeHandlers.set('image', (artifact) => ImageViewer.show(artifact));
typeHandlers.set('json', (artifact) => openArtifactViewer(artifact));
typeHandlers.set('text', (artifact) => openArtifactViewer(artifact));
// ... 其他类型处理器

// 处理点击事件
handleArtifactClick(artifact) {
  const handler = typeHandlers.get(artifact.type) || defaultHandler;
  handler(artifact);
}
```
- 依赖关系: 调用 ImageViewer, ArtifactManager
- 事件绑定: 在 ChatPanel 初始化时设置事件委托

#### 模块间数据传递

**数据流向**:
```
toolCallMessages (输入)
    ↓
ArtifactCollector.collectAllArtifacts()
    ↓
artifacts[] (标准化工件数组)
    ↓
ArtifactGrouper.groupArtifactsByType()
    ↓
groupedArtifacts (Map<type, artifacts[]>)
    ↓
ArtifactRenderer.renderGroupedArtifacts()
    ↓
HTML字符串 (输出)
```

**错误传播**:
- 各模块独立处理错误，不向上传播
- 收集器错误: 跳过问题工件，继续处理其他工件
- 分组器错误: 使用默认分组策略
- 渲染器错误: 降级到现有图片显示逻辑
- 交互器错误: 显示用户友好的错误提示

#### 注册机制设计原则

**避免条件判断堆叠**:
- 使用 Map 数据结构存储处理器映射
- 通过类型键直接获取对应处理器
- 流程上直接调用回调函数，不使用数据做判断

**处理器注册时机**:
- 在模块初始化时完成所有处理器注册
- 注册表作为模块私有属性，避免外部修改
- 支持运行时动态注册新类型处理器

**扩展性设计**:
- 新增工件类型只需注册对应处理器
- 不需要修改现有判断逻辑
- 支持处理器的组合和链式调用

#### 与现有系统集成
**ArtifactManager 集成**:
- 复用类型识别方法: `_isImageType()`, `_getFileIconByType()`
- 保持类型定义一致性
- 不修改 ArtifactManager 现有代码

**ImageViewer 集成**:
- 保持现有图片查看器调用方式
- 传递相同的参数格式
- 维持现有用户体验

**CSS样式集成**:
- 复用现有工件显示样式类
- 新增最少必要的样式类
- 保持视觉一致性