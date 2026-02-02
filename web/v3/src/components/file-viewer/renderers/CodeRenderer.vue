<script setup lang="ts">
/**
 * 代码渲染器
 * 
 * 支持多种编程语言语法高亮
 * 
 * @module components/file-viewer/renderers/CodeRenderer
 */
import { computed, ref } from 'vue';
import { Copy, Check, Download, FileCode } from 'lucide-vue-next';
import Button from 'primevue/button';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const copied = ref(false);

/**
 * 代码内容
 */
const codeContent = computed(() => {
  if (typeof props.content.data === 'string') {
    return props.content.data;
  }
  if (props.content.data instanceof ArrayBuffer) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(props.content.data);
  }
  return '';
});

/**
 * 行数
 */
const lines = computed(() => {
  return codeContent.value.split('\n');
});

/**
 * 语言标识
 */
const language = computed(() => {
  const ext = props.fileName.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'vue': 'vue',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'html': 'html',
    'htm': 'html',
    'xml': 'xml',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash'
  };
  return langMap[ext || ''] || 'plaintext';
});

/**
 * 复制到剪贴板
 */
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(codeContent.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
  }
};

/**
 * 下载
 */
const download = () => {
  const blob = new Blob([codeContent.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = props.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 简单的语法高亮
 */
const highlightLine = (line: string): string => {
  // 转义 HTML
  let highlighted = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // 注释
  highlighted = highlighted
    .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
    .replace(/(#.*$)/gm, '<span class="comment">$1</span>');
  
  // 字符串
  highlighted = highlighted
    .replace(/("[^"]*")/g, '<span class="string">$1</span>')
    .replace(/('[^']*')/g, '<span class="string">$1</span>');
  
  // 关键字
  const keywords = ['const', 'let', 'var', 'function', 'class', 'import', 'export', 
    'from', 'return', 'if', 'else', 'for', 'while', 'async', 'await', 'new'];
  
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
    highlighted = highlighted.replace(regex, '<span class="keyword">$1</span>');
  });
  
  // 数字
  highlighted = highlighted.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');
  
  return highlighted;
};
</script>

<template>
  <div class="code-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div class="flex items-center gap-2">
        <FileCode class="w-4 h-4 text-[var(--primary)]" />
        <span class="text-sm text-[var(--text-1)]">{{ language }}</span>
        <span class="text-xs text-[var(--text-3)]">({{ lines.length }} 行)</span>
      </div>
      
      <div class="flex items-center gap-2">
        <Button
          variant="text"
          size="small"
          v-tooltip.top="copied ? '已复制' : '复制'"
          @click="copyToClipboard"
        >
          <Check v-if="copied" class="w-4 h-4 text-green-500" />
          <Copy v-else class="w-4 h-4" />
        </Button>
        <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
          <Download class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- 代码内容 -->
    <div class="flex-1 overflow-auto">
      <table class="code-table">
        <tbody>
          <tr v-for="(line, index) in lines" :key="index">
            <td class="line-number">{{ index + 1 }}</td>
            <td class="code-line" v-html="highlightLine(line) || '&nbsp;'" />
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.code-renderer {
  width: 100%;
  height: 100%;
}

.code-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.line-number {
  width: 50px;
  padding: 0 12px;
  text-align: right;
  color: var(--text-3);
  background: var(--surface-2);
  border-right: 1px solid var(--border);
  user-select: none;
  vertical-align: top;
}

.code-line {
  padding: 0 12px;
  color: var(--text-1);
  white-space: pre;
  vertical-align: top;
}

/* 语法高亮颜色 */
:deep(.keyword) { color: #c678dd; }
:deep(.string) { color: #98c379; }
:deep(.number) { color: #d19a66; }
:deep(.comment) { color: #5c6370; font-style: italic; }
</style>
