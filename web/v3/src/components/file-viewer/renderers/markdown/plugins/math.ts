/**
 * 数学公式插件（KaTeX）
 * 
 * @module components/file-viewer/renderers/markdown/plugins/math
 */

import type { MarkdownEngine } from '../engine';

// KaTeX 动态导入
let katex: any = null;
let katexLoaded = false;
let katexLoading: Promise<void> | null = null;

/**
 * 加载 KaTeX
 */
async function loadKatex(): Promise<void> {
  if (katexLoaded) return;
  if (katexLoading) return katexLoading;

  katexLoading = (async () => {
    try {
      const k = await import('katex');
      katex = k.default || k;
      katexLoaded = true;
    } catch (err) {
      console.error('[MathPlugin] 加载失败:', err);
    }
  })();

  return katexLoading;
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
 * 渲染行内公式
 */
async function renderInlineMath(element: HTMLElement): Promise<void> {
  if (!katex) await loadKatex();
  if (!katex) {
    element.textContent = element.getAttribute('data-math') || '';
    return;
  }

  const content = element.getAttribute('data-math');
  if (!content) return;

  try {
    const html = katex.renderToString(content, {
      throwOnError: false,
      displayMode: false
    });
    element.innerHTML = html;
    element.classList.add('math-rendered');
  } catch {
    element.textContent = '$' + content + '$';
  }
}

/**
 * 渲染块级公式
 */
async function renderBlockMath(element: HTMLElement): Promise<void> {
  if (!katex) await loadKatex();
  if (!katex) {
    element.innerHTML = `<pre>${escapeHtml(element.getAttribute('data-math') || '')}</pre>`;
    return;
  }

  const content = element.getAttribute('data-math');
  if (!content) return;

  try {
    const html = katex.renderToString(content, {
      throwOnError: false,
      displayMode: true
    });
    element.innerHTML = html;
    element.classList.add('math-rendered');
  } catch {
    element.innerHTML = `<pre>$$${escapeHtml(content)}$$</pre>`;
  }
}

/**
 * 渲染所有公式
 */
export async function renderAllMath(container: HTMLElement): Promise<void> {
  const inlineElements = container.querySelectorAll('.math-inline:not(.math-rendered)');
  const blockElements = container.querySelectorAll('.math-block:not(.math-rendered)');
  
  if (inlineElements.length === 0 && blockElements.length === 0) return;
  
  // 先加载库
  await loadKatex();
  
  // 渲染
  const promises = [
    ...Array.from(inlineElements).map(el => renderInlineMath(el as HTMLElement)),
    ...Array.from(blockElements).map(el => renderBlockMath(el as HTMLElement))
  ];
  
  await Promise.all(promises);
}

/**
 * 数学公式插件
 */
export const mathPlugin = {
  name: 'math',
  
  install(engine: MarkdownEngine) {
    const md = engine.md;
    
    // 使用 markdown-it 的自定义容器来处理数学公式
    // 行内公式: $...$
    // 块级公式: $$...$$
    
    // 添加行内规则来处理 $
    // 使用 push 添加到规则列表末尾，确保能处理未被其他规则匹配的 $
    md.inline.ruler.push('math_inline', (state, silent) => {
      // 检查是否是 $
      if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) {
        return false;
      }
      

      
      // 检查是否是 $$
      if (state.src.charCodeAt(state.pos + 1) === 0x24 /* $ */) {
        return false; // 块级公式由其他规则处理
      }
      
      const start = state.pos + 1;
      const end = state.src.indexOf('$', start);
      
      if (end === -1) return false;
      if (end === start) return false; // 空公式
      
      const content = state.src.slice(start, end);
      
      // 检查是否包含换行（行内公式不允许）
      if (content.includes('\n')) return false;
      
      if (!silent) {
        const token = state.push('math_inline', 'span', 0);
        token.content = content;
        token.markup = '$';
      }
      
      state.pos = end + 1;
      return true;
    });
    
    // 添加块级规则来处理 $$
    // 支持两种格式：
    //   多行：$$\n...\n$$
    //   单行：$$...$$
    md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
      // 安全检查
      if (startLine >= state.bMarks.length) return false;
      
      const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
      
      // 检查行首是否是 $$
      if (state.src.slice(pos, pos + 2) !== '$$') {
        return false;
      }
      
      const lineMax = state.eMarks[startLine]!;
      const lineContent = state.src.slice(pos + 2, lineMax).trim();
      
      // 检查是否是单行格式 $$...$$
      if (lineContent.endsWith('$$') && lineContent.length > 2) {
        // 单行格式：$$content$$
        if (!silent) {
          const content = lineContent.slice(0, -2).trim();
          const token = state.push('math_block', 'div', 0);
          token.content = content;
          token.markup = '$$';
          token.block = true;
          token.map = [startLine, startLine + 1];
        }
        state.line = startLine + 1;
        return true;
      }
      
      // 多行格式：查找结束标记 $$
      let nextLine = startLine + 1;
      let endPos = -1;
      
      while (nextLine < endLine) {
        if (nextLine >= state.bMarks.length) break;
        const linePos = state.bMarks[nextLine]! + state.tShift[nextLine]!;
        const lineMax = state.eMarks[nextLine]!;
        const line = state.src.slice(linePos, lineMax).trim();
        
        if (line === '$$') {
          endPos = nextLine;
          break;
        }
        nextLine++;
      }
      
      if (endPos === -1) return false; // 没找到结束标记
      
      if (!silent) {
        // 计算内容范围
        const contentLine = startLine + 1;
        if (contentLine >= state.bMarks.length) return false;
        
        const contentStart = state.bMarks[contentLine]! + state.tShift[contentLine]!;
        const contentEnd = endPos > startLine + 1 ? state.eMarks[endPos - 1]! : contentStart;
        const content = state.src.slice(contentStart, contentEnd);
        
        const token = state.push('math_block', 'div', 0);
        token.content = content;
        token.markup = '$$';
        token.block = true;
        token.map = [startLine, endPos + 1];
      }
      
      state.line = endPos + 1;
      return true;
    });
    
    // 渲染行内公式
    md.renderer.rules.math_inline = (tokens, idx) => {
      const token = tokens[idx];
      if (!token) return '';
      const content = token.content;
      return `<span class="math-inline" data-math="${escapeHtml(content)}">$${escapeHtml(content)}$</span>`;
    };
    
    // 渲染块级公式
    md.renderer.rules.math_block = (tokens, idx) => {
      const token = tokens[idx];
      if (!token) return '';
      const content = token.content;
      return `<div class="math-block" data-math="${escapeHtml(content)}">$$${escapeHtml(content)}$$</div>`;
    };
  }
};

/**
 * 检测内容是否包含数学公式
 */
export function hasMath(content: string): boolean {
  // 简单检测是否包含 $...
  return /\$[^\$]+\$/.test(content);
}
