# 需求文档

## 介绍

聊天对话界面的工件显示功能需要改进，当前只显示图片类型工件的缩略图，用户希望显示所有类型的工件并按类型分组。这个功能将提升用户在聊天界面中查看和管理工件的体验。

## 术语表

- **Chat_Panel**: 聊天面板组件，负责显示对话消息
- **Tool_Call_Group**: 工具调用组，包含连续的工具调用消息
- **Artifact**: 工件，由工具调用创建的各种类型文件（图片、文本、JSON、HTML等）
- **Artifact_Manager**: 工件管理器，已有的工件类型识别和图标显示逻辑
- **Type_Group**: 类型分组，按工件类型进行的分组显示

## 需求

### 需求 1: 显示所有类型工件

**用户故事:** 作为用户，我希望在聊天对话界面看到所有类型的工件，而不仅仅是图片，这样我可以快速了解工具调用创建了哪些内容。

#### 验收标准

1. WHEN 工具调用组包含任何类型的工件 THEN THE Chat_Panel SHALL 显示所有工件而不仅限于图片类型
2. WHEN 工具调用创建文本工件 THEN THE Chat_Panel SHALL 显示文本工件的图标和名称
3. WHEN 工具调用创建JSON工件 THEN THE Chat_Panel SHALL 显示JSON工件的图标和名称
4. WHEN 工具调用创建HTML工件 THEN THE Chat_Panel SHALL 显示HTML工件的图标和名称
5. WHEN 工具调用创建代码工件 THEN THE Chat_Panel SHALL 显示代码工件的图标和名称

### 需求 2: 按类型分组显示

**用户故事:** 作为用户，我希望工件按类型分组显示，这样我可以更清晰地看到不同类型的内容分布。

#### 验收标准

1. WHEN 工具调用组包含多种类型工件 THEN THE Chat_Panel SHALL 按工件类型进行分组显示
2. WHEN 同一类型有多个工件 THEN THE Chat_Panel SHALL 将它们显示在同一个类型组中
3. WHEN 显示类型分组 THEN THE Chat_Panel SHALL 为每个类型组显示清晰的标题
4. WHEN 显示类型分组 THEN THE Chat_Panel SHALL 使用与Artifact_Manager一致的类型图标

### 需求 3: 保持现有交互功能

**用户故事:** 作为用户，我希望新的工件显示保持现有的点击交互功能，这样我可以继续使用熟悉的操作方式。

#### 验收标准

1. WHEN 用户点击图片工件 THEN THE Chat_Panel SHALL 打开图片查看器
2. WHEN 用户点击非图片工件 THEN THE Chat_Panel SHALL 打开相应的工件查看器
3. WHEN 用户点击工件 THEN THE Chat_Panel SHALL 保持与现有实现相同的交互行为
4. WHEN 工件加载失败 THEN THE Chat_Panel SHALL 显示错误状态提示

### 需求 4: 差异化显示格式

**用户故事:** 作为用户，我希望不同类型的工件采用不同的显示格式，图片保持缩略图，其他类型显示为分组链接，这样我可以快速识别和访问不同类型的工件。

#### 验收标准

1. WHEN 显示图片工件 THEN THE Chat_Panel SHALL 保持当前的缩略图显示格式不变
2. WHEN 显示非图片工件 THEN THE Chat_Panel SHALL 按类型分组显示为可点击链接
3. WHEN 显示类型分组 THEN THE Chat_Panel SHALL 在分组标题前显示类型图标
4. WHEN 显示工件链接 THEN THE Chat_Panel SHALL 不在单个工件上显示图标，只显示工件名称链接
5. WHEN 显示工件名称 THEN THE Chat_Panel SHALL 确保文本可读性和适当的截断处理

### 需求 5: 界面清晰易读

**用户故事:** 作为用户，我希望工件显示界面清晰易读，这样我可以快速识别和访问需要的工件。

#### 验收标准

1. WHEN 显示工件列表 THEN THE Chat_Panel SHALL 使用清晰的视觉层次区分不同类型组
2. WHEN 工件数量较多 THEN THE Chat_Panel SHALL 保持界面整洁不拥挤

### 需求 6: 复用现有类型识别逻辑

**用户故事:** 作为开发者，我希望复用Artifact_Manager的类型识别和图标显示逻辑，这样可以保持系统的一致性。

#### 验收标准

1. THE Chat_Panel SHALL 使用Artifact_Manager的_getFileIconByType方法获取工件图标
2. THE Chat_Panel SHALL 使用Artifact_Manager的_isImageType方法判断图片类型
3. THE Chat_Panel SHALL 使用与Artifact_Manager一致的工件类型分类逻辑
4. THE Chat_Panel SHALL 保持与Artifact_Manager相同的工件显示名称规则