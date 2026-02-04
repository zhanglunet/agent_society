/**
 * 代码高亮插件
 * 
 * @module components/file-viewer/renderers/markdown/plugins/code-highlight
 */

import Prism from 'prismjs';
import type { MarkdownEngine } from '../engine';

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
  'yml': 'yaml',
  'md': 'markdown',
  'vue': 'markup',
  'html': 'markup',
  'xml': 'markup',
  'jsx': 'javascript',
  'tsx': 'typescript',
  'c++': 'cpp',
  'c#': 'csharp'
};

// 懒加载的语言列表
const LAZY_LANGUAGES = [
  'python', 'java', 'bash', 'yaml', 'sql', 'rust', 'go',
  'php', 'ruby', 'docker', 'nginx', 'graphql'
];

// 已加载的语言
const loadedLanguages = new Set(['javascript', 'typescript', 'json', 'markdown', 'css', 'markup']);

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
  
  if (!LAZY_LANGUAGES.includes(normalized)) {
    return false;
  }
  
  try {
    await import(`prismjs/components/prism-${normalized}`);
    loadedLanguages.add(normalized);
    return true;
  } catch {
    return false;
  }
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
 * 代码高亮插件
 */
export const codeHighlightPlugin = {
  name: 'code-highlight',
  
  install(engine: MarkdownEngine) {
    const md = engine.md;
    
    // 重写 fence 规则（代码块）
    const originalFence = md.renderer.rules.fence || md.renderer.renderToken;
    
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (!token) {
        return originalFence(tokens, idx, options, env, self);
      }
      
      const code = token.content;
      const info = token.info.trim();
      const lang = info.split(' ')[0];
      
      // Mermaid 和数学公式不处理
      if (lang === 'mermaid' || lang === 'math' || lang === 'latex') {
        return originalFence(tokens, idx, options, env, self);
      }
      
      // 有指定语言则高亮
      if (lang && Prism.languages[normalizeLang(lang)]) {
        const highlighted = highlightCode(code, lang);
        return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
      }
      
      // 无语言或未知语言
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    };
    
    // 重写 code_inline 规则（行内代码）
    const originalCodeInline = md.renderer.rules.code_inline || md.renderer.renderToken;
    
    md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (!token) {
        return originalCodeInline(tokens, idx, options, env, self);
      }
      
      const code = token.content;
      // 行内代码不做高亮，只做转义
      return `<code>${escapeHtml(code)}</code>`;
    };
  }
};

/**
 * 预加载常用语言
 */
export async function preloadCommonLanguages(): Promise<void> {
  const promises = LAZY_LANGUAGES.slice(0, 5).map(loadLanguage);
  await Promise.all(promises);
}
