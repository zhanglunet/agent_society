<script setup lang="ts">
/**
 * 代码渲染器
 *
 * 支持多种编程语言语法高亮
 *
 * @module components/file-viewer/renderers/CodeRenderer
 */
import { computed, inject, onMounted } from 'vue';
import type { RendererProps } from '../types';
import { CopyFunctionKey } from '../injectionKeys';

const props = defineProps<RendererProps>();

// 注入 FileViewer 提供的方法
const copyContext = inject<{ setCopyFunction: (fn: () => void) => void; copied: { value: boolean } } | null>(CopyFunctionKey, null);

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
 * 复制到剪贴板
 */
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(codeContent.value);
    if (copyContext?.copied) {
      copyContext.copied.value = true;
      setTimeout(() => {
        if (copyContext?.copied) {
          copyContext.copied.value = false;
        }
      }, 2000);
    }
  } catch (err) {
    console.error('复制失败:', err);
  }
};

// 组件挂载时注册复制函数
onMounted(() => {
  console.log('[CodeRenderer] onMounted, copyContext:', copyContext);
  if (copyContext) {
    copyContext.setCopyFunction(copyToClipboard);
    console.log('[CodeRenderer] copyFunction registered');
  }
});

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
