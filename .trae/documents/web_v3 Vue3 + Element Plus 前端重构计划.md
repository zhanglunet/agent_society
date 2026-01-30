## 项目概述
按照 docs/ui-modern-theme-spec-v2.md 设计规范，使用 Vue3 + Bun + Element Plus 构建全新的 web/v3 前端。

## 技术栈
- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite + Bun
- **UI 组件库**: Element Plus
- **状态管理**: Pinia
- **HTTP 客户端**: Axios
- **CSS 预处理器**: SCSS
- **图标**: Element Plus Icons

## 设计 Tokens 实现
严格遵循规范中的 CSS Variables:
- 结构层: `--bg`, `--surface-1`, `--surface-2`, `--surface-3`
- 文本层: `--text-1`, `--text-2`, `--text-3`
- 强调层: `--primary`, `--primary-weak`, `--link`
- 状态层: `--intent-danger-*`, `--intent-warning-*`, `--intent-info-*`, `--intent-success-*`
- 边界层: `--border`, `--overlay`, `--focus`

## 目录结构
```
web/v3/
├── public/                    # 静态资源
├── src/
│   ├── assets/               # 样式、图片
│   │   ├── styles/
│   │   │   ├── tokens.scss   # CSS Variables 设计令牌
│   │   │   ├── global.scss   # 全局样式
│   │   │   └── element-override.scss  # Element Plus 主题覆盖
│   │   └── icons/
│   ├── components/           # 公共组件
│   │   ├── layout/           # 布局组件
│   │   │   ├── AppLayout.vue
│   │   │   ├── GlobalSidebar.vue
│   │   │   ├── WorkspaceTabs.vue
│   │   │   ├── AgentSidebar.vue
│   │   │   └── ChatPanel.vue
│   │   ├── ui/               # 基础 UI 组件
│   │   │   ├── AgentItem.vue
│   │   │   ├── OrgItem.vue
│   │   │   ├── TabItem.vue
│   │   │   ├── MessageBubble.vue
│   │   │   ├── WindowFrame.vue
│   │   │   └── ToolCard.vue
│   │   └── windows/          # 窗口组件
│   │       ├── ArtifactManager.vue
│   │       ├── OrgTemplates.vue
│   │       ├── ModulesPanel.vue
│   │       └── SettingsModal.vue
│   ├── composables/          # 组合式函数
│   │   ├── useTheme.ts       # 主题切换
│   │   ├── useApi.ts         # API 调用
│   │   ├── usePolling.ts     # 轮询
│   │   └── useChat.ts        # 聊天逻辑
│   ├── stores/               # Pinia 状态管理
│   │   ├── app.ts            # 应用状态
│   │   ├── agents.ts         # 智能体状态
│   │   ├── orgs.ts           # 组织状态
│   │   ├── chat.ts           # 聊天状态
│   │   └── windows.ts        # 窗口状态
│   ├── views/                # 页面视图
│   │   ├── HomeView.vue
│   │   ├── OrgView.vue
│   │   └── ChatView.vue
│   ├── api/                  # API 接口
│   │   ├── index.ts
│   │   ├── agents.ts
│   │   ├── orgs.ts
│   │   └── messages.ts
│   ├── types/                # TypeScript 类型
│   │   └── index.ts
│   ├── utils/                # 工具函数
│   │   ├── dom.ts
│   │   └── format.ts
│   ├── App.vue
│   └── main.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── v3.md                     # 模块说明文档
```

## 组件设计

### 1. 布局组件
- **AppLayout**: 三段式布局容器
- **GlobalSidebar**: 左侧全局导航栏（设置/工件/模板/插件/主题）
- **WorkspaceTabs**: 顶部标签页（胶囊风格）
- **AgentSidebar**: 中间智能体列表
- **ChatPanel**: 右侧聊天区域

### 2. 基础 UI 组件
- **AgentItem**: 智能体列表项（图标+标题+描述+状态）
- **OrgItem**: 组织列表项
- **TabItem**: 标签页项（胶囊风格）
- **MessageBubble**: 聊天气泡（我方/对方）
- **WindowFrame**: 统一窗口框架（标题栏+操作按钮+双栏布局）
- **ToolCard**: 工具/思考/工件卡片（可折叠）

### 3. 窗口组件
- **ArtifactManager**: 工件管理器
- **OrgTemplates**: 组织模板管理
- **ModulesPanel**: 插件管理
- **SettingsModal**: 设置模态框

## 状态管理 (Pinia)

### app Store
- theme: 当前主题 (light/dark/system)
- activeTabId: 当前活动标签
- openTabs: 打开的标签列表

### agents Store
- agents: 智能体列表
- agentsById: Map 结构
- selectedAgentId: 当前选中智能体

### orgs Store
- orgs: 组织列表
- orgTree: 组织树
- orgMemberIdsByOrgId: 组织成员映射

### chat Store
- messages: 消息列表
- conversationByAgentId: 会话映射
- lastMessageCounts: 消息计数

### windows Store
- artifactVisible: 工件管理器显示状态
- templatesVisible: 模板管理器显示状态
- modulesVisible: 插件管理器显示状态
- settingsVisible: 设置模态框显示状态

## 交互规范实现

### 按钮体系
- Primary: 主操作 (--primary)
- Secondary: 次操作 (surface-1 + border)
- Ghost/Icon: 图标按钮 (透明底 + hover 表面)
- Danger: 删除/终止 (--intent-danger-fg)

### 列表项状态
- default: 透明或 surface
- hover: surface-3
- selected: selected 背景 + 左侧 2px primary 条
- disabled: 降低对比度

### 标签页（胶囊风格）
- 未选中: 透明底 + text-2
- hover: surface-1
- 选中: surface-1 + shadow-1 + text-1 + 下划线 primary

### 聊天气泡
- 我方: surface-1 + primary 细条
- 对方: surface-1

## 开发步骤

### 第一阶段：项目初始化
1. 创建 web/v3 目录结构
2. 初始化 bun + vite + vue3 项目
3. 安装 Element Plus 及相关依赖
4. 配置 TypeScript
5. 配置 Vite

### 第二阶段：设计令牌与全局样式
1. 创建 tokens.scss（CSS Variables）
2. 创建 global.scss（全局样式）
3. 创建 element-override.scss（Element Plus 主题覆盖）
4. 实现主题切换功能

### 第三阶段：基础布局
1. 实现 AppLayout 组件
2. 实现 GlobalSidebar 组件
3. 实现 WorkspaceTabs 组件
4. 实现 AgentSidebar 组件
5. 实现 ChatPanel 组件框架

### 第四阶段：状态管理
1. 创建 Pinia stores
2. 实现 API 接口层
3. 实现轮询逻辑

### 第五阶段：聊天功能
1. 实现 MessageBubble 组件
2. 实现消息列表渲染
3. 实现输入框和发送功能
4. 实现附件上传

### 第六阶段：窗口组件
1. 实现 WindowFrame 基础组件
2. 实现 ArtifactManager
3. 实现 OrgTemplates
4. 实现 ModulesPanel
5. 实现 SettingsModal

### 第七阶段：集成与测试
1. 整合所有组件
2. 测试主题切换
3. 测试响应式布局
4. 测试所有交互功能

## 验收标准
- [ ] 明亮/黑暗主题切换正常
- [ ] 所有组件风格一致
- [ ] 按钮、列表、标签页交互符合规范
- [ ] 聊天区域层级清晰
- [ ] 窗口组件统一
- [ ] 无硬编码颜色值
- [ ] 所有文本对比度达标
