/**
 * 代码高亮插件
 * 
 * @module components/file-viewer/renderers/markdown/plugins/code-highlight
 * 
 * 支持懒加载语言，首次使用时会动态导入
 */

import Prism from 'prismjs';

// 基础语言（首屏加载）
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup'; // HTML/XML

// 语言别名映射
const LANG_ALIASES: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'bash',
  'shell': 'bash',
  'bash/shell': 'bash',
  'yml': 'yaml',
  'md': 'markdown',
  'vue': 'markup',
  'html': 'markup',
  'xml': 'markup',
  'jsx': 'javascript',
  'tsx': 'typescript',
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'golang': 'go',
  'rs': 'rust'
};

// 懒加载的语言列表
const LAZY_LANGUAGES = [
  'python', 'java', 'bash', 'yaml', 'sql', 'rust', 'go',
  'php', 'ruby', 'cpp', 'csharp', 'swift', 'kotlin',
  'docker', 'nginx', 'graphql', 'c', 'perl', 'lua'
];

// 已加载的语言
const loadedLanguages = new Set(['javascript', 'typescript', 'json', 'markdown', 'css', 'markup']);

// 加载中的语言
const loadingLanguages = new Map<string, Promise<boolean>>();

// 使用 import.meta.glob 预声明所有可能的语言模块导入
// 这样 Vite 在构建时就能知道需要处理这些模块
const languageModules = import.meta.glob('/node_modules/prismjs/components/prism-*.js', { eager: false });

/**
 * 获取标准语言名称
 */
function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] || lower;
}

/**
 * 懒加载语言
 */
async function loadLanguage(lang: string): Promise<boolean> {
  const normalized = normalizeLang(lang);
  
  if (loadedLanguages.has(normalized)) {
    return true;
  }
  
  // 检查是否正在加载中
  if (loadingLanguages.has(normalized)) {
    return loadingLanguages.get(normalized)!;
  }
  
  // 构建模块路径
  const modulePath = `/node_modules/prismjs/components/prism-${normalized}.js`;
  const loader = languageModules[modulePath];
  
  if (!loader) {
    console.warn(`[CodeHighlight] 语言模块不存在: ${normalized}`);
    return false;
  }
  
  // 创建加载 Promise
  const loadPromise = (async () => {
    try {
      await loader();
      loadedLanguages.add(normalized);
      return true;
    } catch (err) {
      console.warn(`[CodeHighlight] 加载语言失败: ${normalized}`, err);
      return false;
    } finally {
      loadingLanguages.delete(normalized);
    }
  })();
  
  loadingLanguages.set(normalized, loadPromise);
  return loadPromise;
}

/**
 * 高亮代码
 */
function highlightCode(code: string, lang: string): string {
  const normalized = normalizeLang(lang);
  
  if (!Prism.languages[normalized]) {
    return escapeHtml(code);
  }
  
  try {
    return Prism.highlight(code, Prism.languages[normalized], normalized);
  } catch {
    return escapeHtml(code);
  }
}

/**
 * 转义 HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 预加载语言（如果尚未加载）
 */
async function ensureLanguageLoaded(lang: string): Promise<boolean> {
  const normalized = normalizeLang(lang);
  if (loadedLanguages.has(normalized)) {
    return true;
  }
  return loadLanguage(lang);
}

/**
 * 渲染所有代码块
 * 后处理函数，用于懒加载语言并高亮
 */
export async function renderAllCodeBlocks(container: HTMLElement): Promise<void> {
  const codeBlocks = container.querySelectorAll('pre[data-lang]:not([data-highlighted])');
  
  console.log('[CodeHighlight] Found code blocks:', codeBlocks.length);
  if (codeBlocks.length === 0) return;
  
  const promises: Promise<void>[] = [];
  
  for (const pre of codeBlocks) {
    const lang = pre.getAttribute('data-lang');
    const code = pre.querySelector('code');
    
    if (!lang || !code) continue;
    
    const promise = (async () => {
      console.log(`[CodeHighlight] Processing ${lang} block`);
      // 确保语言加载完成
      const loaded = await ensureLanguageLoaded(lang);
      console.log(`[CodeHighlight] Language ${lang} loaded:`, loaded);
      if (!loaded) return;
      
      // 高亮代码
      const content = code.textContent || '';
      console.log(`[CodeHighlight] Content length:`, content.length);
      const highlighted = highlightCode(content, lang);
      console.log(`[CodeHighlight] Highlighted length:`, highlighted.length);
      code.innerHTML = highlighted;
      
      // 标记为已高亮
      pre.setAttribute('data-highlighted', 'true');
      console.log(`[CodeHighlight] Done highlighting ${lang}`);
    })();
    
    promises.push(promise);
  }
  
  await Promise.all(promises);
}

/**
 * 代码高亮插件
 */
export const codeHighlightPlugin = {
  name: 'code-highlight',
  
  install() {
    // 这个插件现在主要通过 renderAllCodeBlocks 后处理函数工作
    // 在 MarkdownRenderer 中调用
  }
};

/**
 * 预加载常用语言
 */
export async function preloadCommonLanguages(): Promise<void> {
  const promises = LAZY_LANGUAGES.slice(0, 6).map(loadLanguage);
  await Promise.all(promises);
}
