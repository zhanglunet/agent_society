<script setup lang="ts">
/**
 * 模块面板内容组件
 * 
 * 职责：
 * - 安全地注入模块的 HTML
 * - 加载模块的 CSS（通过 style 标签）
 * - 执行模块的 JS（通过 script 标签）
 * - 处理样式隔离
 * 
 * @author Agent Society
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = defineProps<{
  html: string;
  css?: string;
  js?: string;
  moduleName: string;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
let styleId = '';

/**
 * 注入 CSS 样式
 */
const injectStyles = () => {
  if (!props.css) return;
  
  // 移除旧的样式
  removeStyles();
  
  // 创建新的 style 标签
  const styleEl = document.createElement('style');
  styleId = `module-style-${props.moduleName}-${Date.now()}`;
  styleEl.id = styleId;
  styleEl.textContent = props.css;
  
  // 添加到 document head
  document.head.appendChild(styleEl);
};

/**
 * 移除 CSS 样式
 */
const removeStyles = () => {
  if (styleId) {
    const oldStyle = document.getElementById(styleId);
    if (oldStyle) {
      oldStyle.remove();
    }
  }
  
  // 也移除该模块的其他旧样式
  const oldStyles = document.querySelectorAll(`[id^="module-style-${props.moduleName}-"]`);
  oldStyles.forEach(el => el.remove());
};

/**
 * 执行 JS
 */
const executeScript = () => {
  if (!props.js || !containerRef.value) return;
  
  // 创建 script 标签执行代码
  const scriptEl = document.createElement('script');
  
  // 使用普通 script 标签（非模块）以兼容现有代码
  scriptEl.type = 'text/javascript';
  
  // 添加代码内容
  scriptEl.textContent = props.js;
  
  // 添加到容器中执行
  containerRef.value.appendChild(scriptEl);
  
  // 执行后移除 script 标签（保持 DOM 整洁）
  // 使用 setTimeout 确保脚本已执行
  setTimeout(() => {
    scriptEl.remove();
  }, 100);
};

/**
 * 初始化面板内容
 */
const initializeContent = async () => {
  if (!containerRef.value) return;
  
  // 先注入样式
  injectStyles();
  
  // 等待 DOM 更新后执行脚本
  await nextTick();
  
  // 延迟执行 JS，确保 DOM 已就绪
  setTimeout(() => {
    executeScript();
  }, 50);
};

// 监听内容变化
watch(() => [props.html, props.css, props.js], () => {
  initializeContent();
}, { immediate: true });

onMounted(() => {
  initializeContent();
});

onUnmounted(() => {
  removeStyles();
});
</script>

<template>
  <div 
    ref="containerRef" 
    class="module-panel-wrapper"
    v-html="html"
  ></div>
</template>

<style scoped>
.module-panel-wrapper {
  width: 100%;
  height: 100%;
}

/* 确保注入的内容不会溢出 */
.module-panel-wrapper :deep(*) {
  box-sizing: border-box;
}

/* 防止注入的样式影响外部 */
.module-panel-wrapper :deep(.chrome-panel),
.module-panel-wrapper :deep(.ffmpeg-panel),
.module-panel-wrapper :deep(.ssh-panel) {
  width: 100%;
  height: 100%;
}
</style>
