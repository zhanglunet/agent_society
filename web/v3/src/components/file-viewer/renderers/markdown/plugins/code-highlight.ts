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
import 'prismjs/components/prism-clike'; // C-like 语言基础

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

// 已加载的语言
const loadedLanguages = new Set([
  'javascript', 'typescript', 'json', 'markdown', 'css', 'markup', 'html', 'xml', 'clike'
]);

// 加载中的语言
const loadingLanguages = new Map<string, Promise<boolean>>();

/**
 * 获取标准语言名称
 */
function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] || lower;
}

/**
 * 语言加载器映射表
 * 使用动态导入加载语言组件
 */
const languageLoaders: Record<string, () => Promise<void>> = {
  // @ts-ignore
  python: async () => { await import('prismjs/components/prism-python'); },
  // @ts-ignore
  java: async () => { await import('prismjs/components/prism-java'); },
  // @ts-ignore
  bash: async () => { await import('prismjs/components/prism-bash'); },
  // @ts-ignore
  yaml: async () => { await import('prismjs/components/prism-yaml'); },
  // @ts-ignore
  sql: async () => { await import('prismjs/components/prism-sql'); },
  // @ts-ignore
  rust: async () => { await import('prismjs/components/prism-rust'); },
  // @ts-ignore
  go: async () => { await import('prismjs/components/prism-go'); },
  // @ts-ignore  
  php: async () => { 
    // PHP 依赖 clike，确保已加载
    await ensureLanguageLoaded('clike');
    // @ts-ignore
    await import('prismjs/components/prism-php'); 
  },
  // @ts-ignore
  ruby: async () => { await import('prismjs/components/prism-ruby'); },
  // @ts-ignore
  cpp: async () => { 
    // C++ 依赖 clike
    await ensureLanguageLoaded('clike');
    // @ts-ignore
    await import('prismjs/components/prism-cpp'); 
  },
  // @ts-ignore
  csharp: async () => { 
    await ensureLanguageLoaded('clike');
    // @ts-ignore
    await import('prismjs/components/prism-csharp'); 
  },
  // @ts-ignore
  swift: async () => { await import('prismjs/components/prism-swift'); },
  // @ts-ignore
  kotlin: async () => { 
    await ensureLanguageLoaded('clike');
    // @ts-ignore
    await import('prismjs/components/prism-kotlin'); 
  },
  // @ts-ignore
  docker: async () => { await import('prismjs/components/prism-docker'); },
  // @ts-ignore
  nginx: async () => { await import('prismjs/components/prism-nginx'); },
  // @ts-ignore
  graphql: async () => { await import('prismjs/components/prism-graphql'); },
  // @ts-ignore
  c: async () => { 
    await ensureLanguageLoaded('clike');
    // @ts-ignore
    await import('prismjs/components/prism-c'); 
  },
  // @ts-ignore
  perl: async () => { await import('prismjs/components/prism-perl'); },
  // @ts-ignore
  lua: async () => { await import('prismjs/components/prism-lua'); },
};

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
  
  // 获取语言加载器
  const loader = languageLoaders[normalized];
  
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
 * 高亮代码
 */
function highlightCode(code: string, lang: string): string {
  const normalized = normalizeLang(lang);
  
  // 检查 Prism.languages 中是否存在该语言定义
  const languageDef = Prism.languages[normalized];
  
  if (!languageDef) {
    console.warn(`[CodeHighlight] Prism.languages['${normalized}'] 不存在，跳过高亮`);
    return escapeHtml(code);
  }
  
  try {
    return Prism.highlight(code, languageDef, normalized);
  } catch (err) {
    console.error(`[CodeHighlight] 高亮失败: ${normalized}`, err);
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
 * 渲染所有代码块
 * 后处理函数，用于懒加载语言并高亮
 */
export async function renderAllCodeBlocks(container: HTMLElement): Promise<void> {
  const codeBlocks = container.querySelectorAll('pre[data-lang]:not([data-highlighted])');
  
  if (codeBlocks.length === 0) return;
  
  const promises: Promise<void>[] = [];
  
  for (const pre of codeBlocks) {
    const lang = pre.getAttribute('data-lang');
    const code = pre.querySelector('code');
    
    if (!lang || !code) continue;
    
    const promise = (async () => {
      // 确保语言加载完成
      const loaded = await ensureLanguageLoaded(lang);
      if (!loaded) {
        console.warn(`[CodeHighlight] 语言 ${lang} 加载失败`);
        return;
      }
      
      // 高亮代码
      const content = code.textContent || '';
      const highlighted = highlightCode(content, lang);
      code.innerHTML = highlighted;
      
      // 标记为已高亮
      pre.setAttribute('data-highlighted', 'true');
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
  const commonLangs = ['python', 'java', 'bash', 'yaml', 'sql', 'rust'];
  const promises = commonLangs.map(loadLanguage);
  await Promise.all(promises);
}
