# 架构设计方案 (Architecture)

## 1. 模块功能描述
本架构旨在构建一个高度模块化、响应式且易于扩展的智能体工作台前端。采用 Vue 3 组合式 API 配合 PrimeVue 4+ 的现代化组件体系，通过设计令牌（Design Tokens）和全局样式覆盖（Pass Through）实现视觉规范的严丝合缝。

## 2. 技术栈选型
- **核心框架**: Vue 3.5+ (Composition API + Script Setup)
- **构建工具**: Vite + Bun
- **UI 库**: PrimeVue 4.0+ (Styled Mode + Aura Preset)
- **CSS 方案**: Tailwind CSS 4.0 (用于布局、间距和原子化微调)
- **状态管理**: Pinia (用于跨组件状态共享)
- **图标库**: Lucide Vue (主图标) + PrimeIcons (组件库内置)
- **通信**: Axios (RESTful API) + SSE/轮询机制 (实时消息)

## 3. 目录结构规范
```
web/v3/
├── src/
│   ├── api/              # API 接口层，按业务职责划分文件
│   ├── assets/
│   │   ├── theme/        # PrimeVue 主题预设、Tokens 和 PT 配置
│   │   └── styles/       # 全局 CSS、Tailwind 配置引入
│   ├── components/
│   │   ├── layout/       # AppLayout, Sidebar, Tabs 等骨架组件
│   │   ├── ui/           # 封装的原子组件 (Message, Card, ToolCard)
│   │   └── windows/      # 业务弹窗 (Artifacts, Settings, OrgTemplates)
│   ├── composables/      # 通用的业务逻辑封装 (useChat, usePolling, useTheme)
│   ├── stores/           # Pinia 状态管理，保持职责单一
│   ├── types/            # TypeScript 类型定义
│   ├── utils/            # 通用工具函数 (格式化、DOM 操作)
│   ├── views/            # 顶层页面视图
│   ├── App.vue           # 根组件
│   └── main.ts           # 入口文件
├── index.html
└── package.json
```

## 4. 模块职责划分
- **API 层**: 仅负责数据的发送与接收，不包含任何 UI 逻辑或复杂的状态转换。
- **Store 层**: 掌握应用的核心数据（真源），负责跨组件的数据分发和状态转换。
- **Composable 层**: 封装可复用的副作用逻辑（如定时器、滚动监听、主题切换）。
- **Layout 层**: 负责页面的宏观结构（三段式布局），管理各个功能区的显示/隐藏。
- **UI 组件层**: 负责具体信息的呈现，通过 Props 接收数据，通过 Events 向上反馈。

## 5. 设计模式与结构
- **组件树层次**:
    - `App.vue`
        - `AppLayout` (主容器)
            - `GlobalSidebar` (左侧收缩边栏)
                - `GlobalToolbar` (顶部工具入口：总览、工件、设置)
                - `OrgList` (组织图标/缩写列表)
            - `WorkspaceTabs` (核心标签页系统)
                - `TabPanel` (标签页内容区)
                    - `Splitter` (内部水平分割)
                        - `AgentSidebar` (当前组织智能体列表)
                        - `ChatPanel` (主聊天/内容区域)
- **Provider/Inject**: 用于深层组件的主题或配置传递。
- **Singleton (Store)**: 每个业务领域（智能体、聊天、组织）拥有唯一的 Store 实例。
- **Factory (Preset)**: 利用 PrimeVue 的 `definePreset` 工厂函数动态生成主题配置。
- **Container/Presenter**: Layout 组件作为容器处理数据逻辑，UI 组件作为展示者处理视觉呈现。

## 6. 性能优化
- **按需加载**: 利用 Vite 的自动导入插件按需加载 PrimeVue 组件。
- **虚拟滚动**: 在智能体列表和长聊天记录中使用 PrimeVue 的虚拟滚动支持。
- **状态冻结**: 对于不参与响应式计算的大型消息历史，考虑使用 `shallowRef` 或 `markRaw`。

## 7. 错误处理机制
- **全局拦截**: 在 Axios 响应拦截器中捕获 4xx/5xx 错误。
- **友好提示**: 使用 PrimeVue 的 `Toast` 服务统一弹出错误信息，不吞掉异常，确保开发环境可见完整栈信息。
- **降级处理**: 模块初始化失败时显示“模块加载失败”空状态，而不导致整站白屏。
