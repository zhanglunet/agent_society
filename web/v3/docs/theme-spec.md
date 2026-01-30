# 视觉规范落地方案 (Theme Specification)

## 1. 核心视觉理念
基于 [ui-modern-theme-spec-v2.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/docs/ui-modern-theme-spec-v2.md) 的规范，通过 PrimeVue 4 的 **Design Tokens** 体系实现“清新明亮”与“深邃暗黑”双主题。

## 2. Design Tokens 映射 (Semantic Tokens)
我们将规范中的 N0-N12 中性色阶和 Brand 主色映射到 PrimeVue 的语义变量中：

### 2.1 中性色阶映射 (Neutral)
| 规范 Token | 映射语义 (Light) | 映射语义 (Dark) |
|---|---|---|
| `--bg` | `surface-50` | `surface-0` |
| `--surface-1` | `surface-0` | `surface-100` |
| `--surface-2` | `surface-100` | `surface-50` |
| `--surface-3` | `surface-200` | `surface-200` |
| `--text-1` | `text-900` | `text-50` |
| `--text-2` | `text-600` | `text-400` |
| `--text-3` | `text-400` | `text-600` |

### 2.2 强调色映射 (Primary)
- **Primary**: 使用 Emerald (祖母绿) 色系，`primary-500` 对应 `#16B981`。
- **Primary Weak**: 映射为 `primary-100` 或 `primary-900/20` (暗黑)。

## 3. Pass Through (PT) 全局策略
通过 `pt` 配置，我们在组件层级统一交互行为，而无需在 Vue 模板中手动添加样式类。

### 3.1 按钮 (Button) 规范
- **下压效果**: 通过 PT 为 `root` 增加 `active:translate-y-[1px] active:scale-[0.98] transition-all`。
- **圆角**: 统一使用 `rounded-lg` (--r-sm/md)。

### 3.2 列表项 (Listbox/AgentItem) 规范
- **选中态**: `pt: { item: ({ context }) => ({ class: context.selected ? 'border-l-2 border-primary bg-primary-50' : '' }) }`。
- **Hover**: 统一使用 `hover:bg-surface-200`。

### 3.3 标签页 (Tabs) 规范
- **胶囊风格**: 隐藏默认的下划线，改为圆角背景和轻微阴影。

## 4. 阴影与深度 (Shadows)
- **--shadow-1**: `shadow-sm` 用于卡片。
- **--shadow-2**: `shadow-md` 用于浮窗。
- **--shadow-3**: `shadow-xl` 用于聚焦的 Dialog。

## 5. 响应式与尺度
- **字体**: UI 正文 14px，弱信息 12px。
- **间距**: 遵循 4px 步进原则 (`space-1` = 4px, `space-2` = 8px ...)。

## 6. 暗黑模式切换
- 利用 PrimeVue 4 的内置切换机制，通过 `document.documentElement.setAttribute('data-theme', 'dark')` 触发。
- 确保所有语义 Token 在暗黑模式下自动反转，保持对比度。
