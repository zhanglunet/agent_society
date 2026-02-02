# 文件内容查看器

一个独立、模块化的文件查看器组件，支持多种文件格式的预览。

## 特性

- **完全独立**：不依赖任何特定模块，可在任何场景使用
- **自动格式识别**：通过 MIME 类型自动选择渲染方式
- **模块化架构**：易于扩展新的文件类型支持
- **统一体验**：所有文件类型共享一致的界面风格

## 支持的文件类型

| 类型 | MIME 类型 | 扩展名 |
|------|-----------|--------|
| 图片 | `image/*` | png, jpg, jpeg, gif, webp, svg, bmp, ico |
| 视频 | `video/*` | mp4, webm, ogg, mov, avi, mkv |
| 音频 | `audio/*` | mp3, wav, ogg, aac, flac, m4a |
| PDF | `application/pdf` | pdf |
| Markdown | `text/markdown` | md, markdown, mdx |
| JSON | `application/json` | json |
| HTML | `text/html` | html, htm |
| 代码文件 | 多种 | js, ts, vue, py, java, c, cpp, go, rs 等 |
| 文本 | `text/*` | txt, log, csv, css 等 |

## 使用方法

### 基本用法

```ts
import { useDialog } from 'primevue/usedialog';
import { openFileViewer } from '@/components/file-viewer';

// 在组件 setup 中获取 dialog 实例
const dialog = useDialog();

// 打开文件查看器
openFileViewer({
  dialog,
  workspaceId: 'org-123',
  filePath: 'documents/report.pdf'
});
```

### 自定义尺寸

```ts
openFileViewer({
  dialog,
  workspaceId: 'org-123',
  filePath: 'images/logo.png',
  width: '90vw',
  height: '85vh',
  maximized: true  // 默认最大化
});
```

### 作为组件使用

```vue
<script setup>
import { FileViewer } from '@/components/file-viewer';
</script>

<template>
  <FileViewer
    workspaceId="org-123"
    filePath="documents/readme.md"
    @close="handleClose"
    @error="handleError"
  />
</template>
```

## 架构设计

```
file-viewer/
├── FileViewer.vue          # 主组件
├── index.ts                # 模块入口
├── mimeTypeRegistry.ts     # MIME 类型注册表
├── types.ts                # 类型定义
├── services/
│   └── fileViewerService.ts # 文件服务
└── renderers/
    ├── ImageRenderer.vue    # 图片渲染器
    ├── VideoRenderer.vue    # 视频渲染器
    ├── AudioRenderer.vue    # 音频渲染器
    ├── TextRenderer.vue     # 文本渲染器
    ├── MarkdownRenderer.vue # Markdown渲染器
    ├── JsonRenderer.vue     # JSON渲染器
    ├── HtmlRenderer.vue     # HTML渲染器
    ├── PdfRenderer.vue      # PDF渲染器
    └── CodeRenderer.vue     # 代码渲染器
```

## 扩展新的文件类型

要添加对新文件类型的支持：

1. 创建渲染器组件

```vue
<!-- renderers/CustomRenderer.vue -->
<script setup>
import type { RendererProps } from '../types';
const props = defineProps<RendererProps>();
</script>

<template>
  <div>自定义渲染内容</div>
</template>
```

2. 在 `mimeTypeRegistry.ts` 中注册

```ts
import CustomRenderer from './renderers/CustomRenderer.vue';
import { CustomIcon } from 'lucide-vue-next';

mimeTypeRegistry.register({
  mimePattern: 'application/custom-type',
  extensions: ['custom'],
  component: CustomRenderer,
  icon: CustomIcon,
  priority: 100
});
```

## API

### openFileViewer(options)

打开文件查看器对话框。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| dialog | ReturnType&lt;typeof useDialog&gt; | 是 | PrimeVue Dialog 实例，必须在组件 setup 中获取 |
| workspaceId | string | 是 | 工作区ID |
| filePath | string | 是 | 文件路径 |
| options | FileViewerOptions | 否 | 查看器配置 |
| width | string | 否 | 对话框宽度，默认 '80vw' |
| height | string | 否 | 对话框高度，默认 '75vh' |
| maximized | boolean | 否 | 是否最大化，默认 false |

### FileViewerOptions

| 属性 | 类型 | 说明 |
|------|------|------|
| readOnly | boolean | 是否只读模式 |
| showLineNumbers | boolean | 是否显示行号（代码文件） |
| theme | 'light' \| 'dark' | 主题 |
| rendererOptions | object | 自定义渲染器配置 |

## 注意事项

1. **必须在组件 setup 中使用**：`openFileViewer` 需要在组件的 setup 函数中使用，并传入通过 `useDialog()` 获取的 dialog 实例
2. HTML 文件默认在沙箱 iframe 中预览，以防止 XSS 攻击
3. 大文件（>10MB）可能加载较慢
4. 某些文件类型依赖浏览器原生支持（如 PDF）
