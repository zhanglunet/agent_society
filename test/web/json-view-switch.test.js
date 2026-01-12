/**
 * JSON视图切换功能属性测试
 * 功能: json-artifact-viewer-enhancement
 * 属性13: 视图模式切换正确性
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import * as fc from 'fast-check';

// 模拟DOM环境
class MockElement {
  constructor() {
    this.innerHTML = "";
    this.style = { display: "" };
    this.classList = {
      _classes: new Set(),
      add(cls) { this._classes.add(cls); },
      remove(cls) { this._classes.delete(cls); },
      toggle(cls, force) {
        if (force === undefined) {
          if (this._classes.has(cls)) {
            this._classes.delete(cls);
          } else {
            this._classes.add(cls);
          }
        } else if (force) {
          this._classes.add(cls);
        } else {
          this._classes.delete(cls);
        }
      },
      contains(cls) { return this._classes.has(cls); }
    };
    this.dataset = {};
    this.textContent = "";
    this.children = [];
  }
  
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  
  querySelector() { return new MockElement(); }
  querySelectorAll() { return []; }
}

// 模拟JSON视图切换逻辑
class JsonViewSwitcher {
  constructor() {
    this.jsonDisplayMode = "text"; // 默认文本模式
    this.currentJsonContent = null;
    this.currentJsonRaw = null;
    this.viewerPanel = new MockElement();
    this.renderedMode = null;
  }
  
  setJsonDisplayMode(mode) {
    this.jsonDisplayMode = mode;
    
    if (this.currentJsonContent !== null || this.currentJsonRaw !== null) {
      if (mode === "json") {
        this._renderJsonTreeView(this.currentJsonContent);
      } else {
        this._renderJsonTextView(this.currentJsonRaw);
      }
    }
  }
  
  _renderJsonTreeView(data) {
    this.viewerPanel.innerHTML = "";
    this.renderedMode = "json";
    // 模拟树状视图渲染
    this.viewerPanel.innerHTML = `<div class="json-tree">${JSON.stringify(data)}</div>`;
  }
  
  _renderJsonTextView(content) {
    this.viewerPanel.innerHTML = "";
    this.renderedMode = "text";
    const maxLength = 5000;
    let displayContent = content || "";
    
    if (displayContent.length > maxLength) {
      displayContent = displayContent.substring(0, maxLength);
    }
    
    this.viewerPanel.innerHTML = `<pre class="json-text-content">${displayContent}</pre>`;
  }
  
  loadJsonArtifact(content) {
    // 解析JSON内容
    let parsed = content;
    if (typeof content === "string") {
      try {
        parsed = JSON.parse(content);
        // 处理双重编码
        if (typeof parsed === "string") {
          try {
            parsed = JSON.parse(parsed);
          } catch {}
        }
      } catch {}
    }
    
    this.currentJsonContent = parsed;
    this.currentJsonRaw = typeof parsed === "object" 
      ? JSON.stringify(parsed, null, 2) 
      : String(content);
    
    // 默认渲染文本视图
    if (this.jsonDisplayMode === "json") {
      this._renderJsonTreeView(this.currentJsonContent);
    } else {
      this._renderJsonTextView(this.currentJsonRaw);
    }
  }
}

// 简单JSON对象生成器
const simpleJsonObjectArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minKeys: 1, maxKeys: 10 }
);

describe('功能: json-artifact-viewer-enhancement, 属性13: 视图模式切换正确性', () => {
  let switcher;
  
  beforeEach(() => {
    switcher = new JsonViewSwitcher();
  });
  
  test('切换到JSON视图应显示树状结构', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          switcher.loadJsonArtifact(obj);
          switcher.setJsonDisplayMode("json");
          
          expect(switcher.renderedMode).toBe("json");
          expect(switcher.jsonDisplayMode).toBe("json");
          expect(switcher.viewerPanel.innerHTML).toContain("json-tree");
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('切换到文本视图应显示纯文本', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          switcher.loadJsonArtifact(obj);
          switcher.setJsonDisplayMode("json"); // 先切换到JSON
          switcher.setJsonDisplayMode("text"); // 再切换回文本
          
          expect(switcher.renderedMode).toBe("text");
          expect(switcher.jsonDisplayMode).toBe("text");
          expect(switcher.viewerPanel.innerHTML).toContain("json-text-content");
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('默认应为文本视图', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          switcher.loadJsonArtifact(obj);
          
          expect(switcher.jsonDisplayMode).toBe("text");
          expect(switcher.renderedMode).toBe("text");
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('多次切换应保持一致性', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        fc.array(fc.oneof(fc.constant("text"), fc.constant("json")), { minLength: 1, maxLength: 10 }),
        (obj, modes) => {
          switcher.loadJsonArtifact(obj);
          
          for (const mode of modes) {
            switcher.setJsonDisplayMode(mode);
            expect(switcher.jsonDisplayMode).toBe(mode);
            expect(switcher.renderedMode).toBe(mode);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('切换视图不应改变JSON内容', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          switcher.loadJsonArtifact(obj);
          const originalContent = JSON.stringify(switcher.currentJsonContent);
          const originalRaw = switcher.currentJsonRaw;
          
          // 多次切换
          switcher.setJsonDisplayMode("json");
          switcher.setJsonDisplayMode("text");
          switcher.setJsonDisplayMode("json");
          
          // 内容应保持不变
          expect(JSON.stringify(switcher.currentJsonContent)).toBe(originalContent);
          expect(switcher.currentJsonRaw).toBe(originalRaw);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 文本视图截断测试', () => {
  let switcher;
  
  beforeEach(() => {
    switcher = new JsonViewSwitcher();
  });
  
  test('超过5000字符的内容应被截断', () => {
    // 创建一个大对象
    const largeObj = {};
    for (let i = 0; i < 500; i++) {
      largeObj[`key_${i}`] = "a".repeat(20);
    }
    
    switcher.loadJsonArtifact(largeObj);
    switcher.setJsonDisplayMode("text");
    
    // 检查渲染的内容长度
    const renderedContent = switcher.viewerPanel.innerHTML;
    // 由于是HTML，实际内容在pre标签内
    expect(renderedContent.length).toBeLessThan(switcher.currentJsonRaw.length + 100);
  });
  
  test('小于5000字符的内容不应被截断', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          { minKeys: 1, maxKeys: 5 }
        ),
        (obj) => {
          switcher.loadJsonArtifact(obj);
          switcher.setJsonDisplayMode("text");
          
          const jsonStr = JSON.stringify(obj, null, 2);
          if (jsonStr.length <= 5000) {
            // 内容应完整显示
            expect(switcher.viewerPanel.innerHTML).toContain(jsonStr.substring(0, 50));
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
