# 需求文档：JSON工件查看器增强

## 介绍

增强JSON工件查看器，确保JSON类型的工件（扩展名为.json或type为application/json）能够正确地以树状控件展示，支持展开/收缩节点，以及复制值或对象功能。本需求主要解决当前JSON工件内容被双重编码导致无法正确展示为树状结构的问题。

## 术语表

- **JSON工件（JSON_Artifact）**: 扩展名为.json或MIME类型为application/json的工件文件
- **JSON查看器（JSON_Viewer）**: 用于显示JSON工件的专门组件，支持树状视图
- **树状控件（Tree_Control）**: 分层显示JSON对象结构的UI组件，支持展开/收缩
- **双重编码（Double_Encoding）**: JSON字符串被再次序列化，导致内容变成转义字符串
- **工件存储（Artifact_Store）**: 后端存储工件的服务模块

## 需求

### 需求1：JSON内容正确解析

**用户故事：** 作为智能体开发者，我想查看JSON工件时能够看到正确解析的JSON结构，以便检查数据内容。

#### 验收标准

1. WHEN 加载JSON工件时，THE JSON_Viewer SHALL 检测内容是否为字符串类型的JSON
2. IF 内容是字符串类型且可解析为JSON，THEN THE JSON_Viewer SHALL 自动解析并显示为对象结构
3. WHEN 内容是有效的JSON对象时，THE JSON_Viewer SHALL 直接显示对象结构
4. IF JSON解析失败，THEN THE JSON_Viewer SHALL 显示原始字符串内容并提示解析错误

_需求: 1.1, 1.2, 1.3, 1.4_

### 需求2：树状控件展示

**用户故事：** 作为智能体开发者，我想以树状结构查看JSON数据，以便理解数据的层级关系。

#### 验收标准

1. WHEN 显示JSON对象时，THE JSON_Viewer SHALL 以树状结构展示所有键值对
2. WHEN 显示JSON数组时，THE JSON_Viewer SHALL 以树状结构展示所有数组元素及其索引
3. WHEN 显示嵌套结构时，THE JSON_Viewer SHALL 正确缩进子节点以表示层级关系
4. WHEN 显示对象或数组时，THE JSON_Viewer SHALL 显示元素数量（如 Array[3] 或 Object{5}）

_需求: 2.1, 2.2, 2.3, 2.4_

### 需求3：展开和收缩节点

**用户故事：** 作为智能体开发者，我想展开或收缩JSON节点，以便专注于感兴趣的数据部分。

#### 验收标准

1. WHEN 点击可展开节点的展开按钮时，THE JSON_Viewer SHALL 显示该节点的所有子节点
2. WHEN 点击已展开节点的收缩按钮时，THE JSON_Viewer SHALL 隐藏该节点的所有子节点
3. WHEN JSON_Viewer 首次加载时，THE JSON_Viewer SHALL 默认展开根节点
4. WHEN 展开/收缩节点时，THE JSON_Viewer SHALL 使用视觉指示器（如箭头）表示当前状态

_需求: 3.1, 3.2, 3.3, 3.4_

### 需求4：复制功能

**用户故事：** 作为智能体开发者，我想复制JSON中的值或对象，以便在其他地方使用这些数据。

#### 验收标准

1. WHEN 右键点击JSON节点时，THE JSON_Viewer SHALL 显示包含复制选项的上下文菜单
2. WHEN 选择"复制字段名"时，THE JSON_Viewer SHALL 将字段名复制到剪贴板
3. WHEN 选择"复制字段值"时，THE JSON_Viewer SHALL 将字段值复制到剪贴板
4. WHEN 选择"复制对象"时，THE JSON_Viewer SHALL 将整个对象（格式化的JSON）复制到剪贴板
5. WHEN 复制成功时，THE JSON_Viewer SHALL 显示复制成功的提示信息

_需求: 4.1, 4.2, 4.3, 4.4, 4.5_

### 需求5：长字符串处理

**用户故事：** 作为智能体开发者，我想在查看包含长字符串的JSON时保持界面整洁，同时能够查看完整内容。

#### 验收标准

1. WHEN 字符串值超过100个字符时，THE JSON_Viewer SHALL 截断显示并添加省略号
2. WHEN 鼠标悬停在截断的字符串上时，THE JSON_Viewer SHALL 在工具提示中显示完整字符串
3. WHEN 复制截断的字符串值时，THE JSON_Viewer SHALL 复制完整的原始字符串

_需求: 5.1, 5.2, 5.3_

### 需求6：文本/JSON视图切换

**用户故事：** 作为智能体开发者，我想在文本视图和JSON树状视图之间切换，以便根据需要选择最合适的查看方式。

#### 验收标准

1. WHEN 打开JSON工件时，THE JSON_Viewer SHALL 默认以文本形式展示内容
2. WHEN 以文本形式展示时，THE JSON_Viewer SHALL 限制显示长度为5000字符
3. IF 文本内容超过5000字符，THEN THE JSON_Viewer SHALL 截断显示并提示内容已截断
4. WHEN 显示JSON工件时，THE JSON_Viewer SHALL 提供"文本/JSON"切换按钮
5. WHEN 点击切换按钮切换到JSON视图时，THE JSON_Viewer SHALL 以树状控件展示JSON结构
6. WHEN 点击切换按钮切换到文本视图时，THE JSON_Viewer SHALL 以纯文本形式展示JSON内容
7. THE JSON_Viewer SHALL 按照现有的"文本/Markdown"切换按钮的样式实现切换按钮

_需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

### 需求7：工件存储修复

**用户故事：** 作为系统维护者，我想确保新创建的JSON工件不会被双重编码，以便正确存储和读取。

#### 验收标准

1. WHEN 存储JSON工件时，THE Artifact_Store SHALL 检测内容类型并正确序列化
2. IF 内容已经是字符串类型的JSON，THEN THE Artifact_Store SHALL 先解析再存储
3. WHEN 读取JSON工件时，THE Artifact_Store SHALL 返回正确解析的JSON对象

_需求: 7.1, 7.2, 7.3_

