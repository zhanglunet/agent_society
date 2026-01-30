# 组件库规范设计 (Component Library)

## 1. 核心设计原则
- **组合优于继承**: 优先通过 Slots 和 Composition API 实现功能，减少 Props 的层级。
- **状态转换闭环**: 组件内部维护其动画、Hover 等视觉状态，业务状态通过 Events 抛出。
- **高内聚低耦合**: 核心 UI 组件不应直接依赖特定的 Pinia Store，而是通过 Props 注入数据。

## 2. 核心组件定义
### 2.1 MessageBubble (消息气泡)
- **职责**: 展示用户或智能体的文本、Markdown 及思考过程。
- **接口**:
    - `props`: `role` (user/agent), `content`, `status` (sending/success/error), `think` (思考过程)。
    - `slots`: `actions` (消息底部的快捷操作)。
- **交互**: 鼠标悬停显示“复制”、“重新生成”等按钮。

### 2.2 ToolCard (工具/思考卡片)
- **职责**: 以折叠形式展示耗时任务或外部工具调用详情。
- **接口**:
    - `props`: `title`, `type` (think/tool), `isExpanded`, `status` (running/done/fail)。
- **状态转换**: 点击 Header 切换 `isExpanded`。

### 2.3 AgentItem (智能体列表项)
- **职责**: 列表中的选择单元。
- **接口**:
    - `props`: `agent`, `isSelected`, `badgeCount`。
- **视觉状态**: 
    - `isSelected`: 左侧显示 2px 宽的 Primary 垂直线条。
    - `hover`: 背景变为 `surface-200`。

### 2.4 WindowFrame (通用窗口框架)
- **职责**: 包装 Dialog 内容，提供统一的标题栏和双栏布局。
- **接口**:
    - `props`: `title`, `showMaximize`, `sidebarWidth`。
    - `slots`: `sidebar` (左侧列表), `default` (右侧详情)。

## 3. 基础 UI 组件封装 (基于 PrimeVue)
我们通过 `ui/` 目录对 PrimeVue 的基础组件进行二次封装，以锁定 PT 配置：
- **AppButton**: 封装 `p-button`，预设 `rounded-lg` 和 active 动画。
- **AppInput**: 封装 `p-inputtext`，预设符合规范的 focus ring。
- **AppTabStrip**: 封装 `p-tabs`，实现胶囊风格。

## 4. 监听与触发事件规范
- **监听**:
    - `click`: 基本点击。
    - `select`: 列表项选中。
    - `submit`: 表单提交或消息发送。
- **触发**:
    - `update:modelValue`: 双向绑定。
    - `error`: 内部发生异常时向父组件上报。

## 5. 职责划分示例
以聊天功能为例：
1.  **ChatPanel (Layout)**: 监听滚动、分发消息列表。
2.  **MessageList (Presenter)**: 循环渲染 `MessageBubble`。
3.  **MessageBubble (UI)**: 渲染 Markdown 内容，管理其内部的复制状态。
4.  **MarkdownViewer (Atom)**: 负责语法高亮。
