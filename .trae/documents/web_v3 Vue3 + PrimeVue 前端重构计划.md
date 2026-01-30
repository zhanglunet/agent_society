## 项目概述
按照 [ui-modern-theme-spec-v2.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/docs/ui-modern-theme-spec-v2.md) 设计规范，使用 Vue3 + Bun + PrimeVue 构建全新的 web/v3 前端。充分利用 PrimeVue 4+ 的 **Design Tokens**、**Pass Through (PT)** 和 **Styled Mode** 实现高度定制化且性能卓越的现代化智能体工作台。

## 技术栈
- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite + Bun
- **UI 组件库**: PrimeVue 4+ (使用 Aura 预设)
- **CSS 框架**: Tailwind CSS 4 (用于布局和原子化样式，与 PrimeVue 深度集成)
- **状态管理**: Pinia
- **HTTP 客户端**: Axios
- **图标**: Lucide Vue + PrimeIcons
- **动画**: PrimeVue 内置动画 + Tailwind Transitions

## 设计 Tokens 实现 (PrimeVue Theme Config)
不再仅仅依赖全局 SCSS，而是通过 PrimeVue 的 `theme` 配置项，将规范中的设计令牌直接注入组件系统：

### 1. 核心颜色映射 (Theme Preset)
```typescript
const MyPreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{emerald.50}',
            // ... 映射到规范中的 --primary
            500: '#16B981', 
        },
        colorScheme: {
            light: {
                surface: {
                    0: '#FFFFFF',
                    50: '#F7F8FB', // --bg
                    100: '#EEF2F7', // --surface-2
                    200: '#F0F4F8', // --surface-3
                    // ... 映射到规范 N0-N12
                }
            },
            dark: {
                surface: {
                    0: '#0B0F17', // --bg
                    50: '#0F172A', // --surface-2
                    100: '#151B26', // --surface-1
                    // ... 映射到规范 N0-N12
                }
            }
        }
    }
});
```

### 2. 全局样式覆盖 (Pass Through - PT)
利用 PT 全局配置，实现规范中要求的交互效果（如下划线选中态、下压动画等），无需在每个组件写 class。

## 目录结构
```
web/v3/
├── src/
│   ├── assets/
│   │   ├── theme/               # PrimeVue 主题配置
│   │   │   ├── index.ts         # 主题入口 (Presets + PT)
│   │   │   ├── tokens.ts        # 设计令牌定义
│   │   │   └── pt.ts            # 全局 Pass Through 配置
│   │   └── main.css             # Tailwind 引入及全局基础样式
│   ├── components/
│   │   ├── layout/              # 使用 Splitter 和 ScrollPanel
│   │   │   ├── AppLayout.vue
│   │   │   ├── GlobalSidebar.vue
│   │   │   ├── WorkspaceTabs.vue
│   │   │   ├── AgentSidebar.vue
│   │   │   └── ChatPanel.vue
│   │   ├── ui/                  # 基于 PrimeVue 封装的基础组件
│   │   │   ├── MessageBubble.vue
│   │   │   ├── ToolCard.vue (使用 Panel/Fieldset)
│   │   │   └── WindowFrame.vue (使用 Dialog/DynamicDialog)
│   ├── plugins/
│   │   └── primevue.ts          # PrimeVue 初始化配置
│   ├── stores/                  # Pinia
│   ├── views/
│   └── ...
```

## 核心功能利用

### 1. 布局系统
- **Splitter**: 实现三段式布局的可调节宽度功能。
- **ScrollPanel**: 统一美化侧栏和聊天区域的滚动条。
- **Tabs (New)**: 实现规范要求的胶囊风格标签页。

### 2. 窗口与弹出层
- **DynamicDialog**: 统一管理工件管理器、设置等窗口，支持最大化、拖拽等规范要求。
- **OverlayPanel**: 用于快捷设置和简单的浮窗交互。
- **Toast / ConfirmDialog**: 统一的反馈系统。

### 3. 交互增强
- **v-ripple**: 全局水波纹反馈。
- **v-tooltip**: 规范要求的图标提示。
- **Transitions**: 利用内置过渡动画实现流畅的视图切换。

## 开发步骤

### 第一阶段：项目环境搭建
1. 初始化 `web/v3`，安装 `primevue`, `@primevue/themes`, `tailwindcss`, `lucide-vue-next`。
2. 配置 `vite.config.ts` 支持 PrimeVue 自动导入。
3. 在 `src/plugins/primevue.ts` 中完成基础配置。

### 第二阶段：主题与 Tokens 落地
1. 在 `src/assets/theme/tokens.ts` 定义规范中的颜色阶梯。
2. 编写 `Preset`，将 Tailwind 颜色与 PrimeVue 语义颜色关联。
3. 实现 `src/assets/theme/pt.ts`，为 `Button`, `Listbox`, `Tabs` 注入全局样式规范。

### 第三阶段：布局与核心组件
1. 使用 `Splitter` 构建主架构。
2. 实现 `MessageBubble`：利用 PrimeVue 的 `Avatar` 和自定义容器。
3. 实现 `WindowFrame`：基于 `Dialog` 扩展，支持双栏布局规范。

### 第四阶段：状态与业务逻辑
1. 迁移 v2 的 API 和轮询逻辑至 Pinia。
2. 对接聊天、智能体管理、组织管理等核心业务。

## 验收标准
- [ ] 深度利用 PrimeVue 4 的 **Styled Mode**，无冗余 CSS。
- [ ] 通过 **Pass Through** 实现 100% 的规范 UI 覆盖。
- [ ] 黑暗模式切换平滑，符合 N0-N12 色阶规范。
- [ ] 响应式 Splitter 布局在不同分辨率下表现良好。
- [ ] 窗口系统（Dialog）交互统一且符合双栏布局。
