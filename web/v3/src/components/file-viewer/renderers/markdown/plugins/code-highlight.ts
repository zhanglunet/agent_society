/**
 * 代码高亮插件
 * 
 * @module components/file-viewer/renderers/markdown/plugins/code-highlight
 * 
 * 使用静态导入确保所有语言依赖正确加载
 */

import Prism from 'prismjs';

// ========== 基础语言 ==========
import 'prismjs/components/prism-markup';      // HTML/XML - 必须在其他语言之前
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';       // C-like 基础
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';

// ========== 编程语言（静态导入确保依赖正确） ==========
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-lua';

// 注意：PHP 组件存在兼容性问题，暂时禁用
// import 'prismjs/components/prism-php';

// ========== 配置/脚本语言 ==========
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-graphql';

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

// 所有语言已静态导入，无需运行时加载跟踪

/**
 * 获取标准语言名称
 */
function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase();
  return LANG_ALIASES[lower] || lower;
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
 */
export async function renderAllCodeBlocks(container: HTMLElement): Promise<void> {
  const codeBlocks = container.querySelectorAll('pre[data-lang]:not([data-highlighted])');
  
  if (codeBlocks.length === 0) return;
  
  for (const pre of codeBlocks) {
    const lang = pre.getAttribute('data-lang');
    const code = pre.querySelector('code');
    
    if (!lang || !code) continue;
    
    // 高亮代码
    const content = code.textContent || '';
    const highlighted = highlightCode(content, lang);
    code.innerHTML = highlighted;
    
    // 标记为已高亮
    pre.setAttribute('data-highlighted', 'true');
  }
}

/**
 * 代码高亮插件
 */
export const codeHighlightPlugin = {
  name: 'code-highlight',
  
  install() {
    // 静态导入已完成，无需额外操作
  }
};

/**
 * 预加载（静态导入已完成，此函数保留用于兼容性）
 */
export async function preloadCommonLanguages(): Promise<void> {
  // 所有语言已静态导入，无需预加载
}
