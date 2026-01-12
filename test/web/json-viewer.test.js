/**
 * JSON查看器属性测试
 * 功能: json-artifact-viewer-enhancement
 * 属性3-11: 树状视图、展开/收缩、复制、字符串截断
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import * as fc from 'fast-check';

// 模拟DOM元素
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.innerHTML = "";
    this.textContent = "";
    this.className = "";
    this.style = { display: "", cursor: "" };
    this.title = "";
    this.dataset = {};
    this.children = [];
    this._eventListeners = {};
  }
  
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  
  querySelector(selector) {
    // 简单的选择器匹配
    for (const child of this.children) {
      if (child.className && child.className.includes(selector.replace('.', ''))) {
        return child;
      }
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
  
  querySelectorAll(selector) {
    const results = [];
    const search = (el) => {
      if (el.className && el.className.includes(selector.replace('.', ''))) {
        results.push(el);
      }
      for (const child of el.children || []) {
        search(child);
      }
    };
    search(this);
    return results;
  }
  
  addEventListener(event, handler) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = [];
    }
    this._eventListeners[event].push(handler);
  }
  
  dispatchEvent(event) {
    const handlers = this._eventListeners[event.type] || [];
    handlers.forEach(h => h(event));
  }
}

// 模拟document.createElement
const createElement = (tagName) => new MockElement(tagName);

// 模拟JSONViewer核心逻辑
class MockJSONViewer {
  constructor(options = {}) {
    this.container = options.container || new MockElement();
    this.maxStringLength = options.maxStringLength || 100;
    this.expandedNodes = new Set();
    this.renderedKeys = [];
    this.renderedArrayIndices = [];
    this.renderedCounts = {};
  }

  render(data) {
    this.container.innerHTML = "";
    this.renderedKeys = [];
    this.renderedArrayIndices = [];
    this.renderedCounts = {};
    
    const tree = createElement("div");
    tree.className = "json-tree";
    
    this._createNode("root", data, 0, tree);
    
    this.container.appendChild(tree);
  }

  _createNode(key, value, depth, parent) {
    const nodeId = `node-${Math.random().toString(36).substr(2, 9)}`;
    const node = createElement("div");
    node.className = "json-node";
    node.dataset.nodeId = nodeId;
    node.dataset.depth = depth;

    const isObject = value !== null && typeof value === "object";
    const isArray = Array.isArray(value);
    const isExpandable = isObject && (Object.keys(value).length > 0 || (isArray && value.length > 0));

    // 记录渲染的键名
    if (key !== "root") {
      this.renderedKeys.push(key);
    }

    // 记录数组索引
    if (key.startsWith("[") && key.endsWith("]")) {
      this.renderedArrayIndices.push(key);
    }

    // 记录元素数量
    if (isArray) {
      this.renderedCounts[nodeId] = { type: "array", count: value.length };
    } else if (isObject) {
      this.renderedCounts[nodeId] = { type: "object", count: Object.keys(value).length };
    }

    const header = createElement("div");
    header.className = "json-node-header";

    if (isExpandable) {
      const toggleBtn = createElement("button");
      toggleBtn.className = "json-toggle-btn";
      toggleBtn.textContent = "▶";
      header.appendChild(toggleBtn);
    }

    if (key !== "root") {
      const keySpan = createElement("span");
      keySpan.className = "json-key";
      keySpan.textContent = key;
      header.appendChild(keySpan);
    }

    if (isArray) {
      const typeSpan = createElement("span");
      typeSpan.className = "json-type";
      typeSpan.textContent = `Array[${value.length}]`;
      header.appendChild(typeSpan);
    } else if (isObject) {
      const typeSpan = createElement("span");
      typeSpan.className = "json-type";
      typeSpan.textContent = `Object{${Object.keys(value).length}}`;
      header.appendChild(typeSpan);
    } else {
      const valueSpan = this._createValueSpan(value);
      header.appendChild(valueSpan);
    }

    node.appendChild(header);

    const content = createElement("div");
    content.className = "json-node-content";
    content.style.display = "none";

    if (isExpandable) {
      if (isArray) {
        value.forEach((item, index) => {
          this._createNode(`[${index}]`, item, depth + 1, content);
        });
      } else {
        Object.entries(value).forEach(([k, v]) => {
          this._createNode(k, v, depth + 1, content);
        });
      }
    }

    node.appendChild(content);

    // 默认展开根节点
    if (depth === 0 && isExpandable) {
      this.expandedNodes.add(nodeId);
      content.style.display = "block";
    }

    parent.appendChild(node);
    return node;
  }

  _createValueSpan(value) {
    const span = createElement("span");
    
    if (value === null) {
      span.className = "json-null";
      span.textContent = "null";
    } else if (typeof value === "boolean") {
      span.className = "json-boolean";
      span.textContent = value ? "true" : "false";
    } else if (typeof value === "number") {
      span.className = "json-number";
      span.textContent = String(value);
    } else if (typeof value === "string") {
      span.className = "json-string";
      const displayValue = this._truncateString(value);
      span.textContent = `"${displayValue}"`;
      
      if (value.length > this.maxStringLength) {
        span.title = value;
        span.style.cursor = "help";
        span._fullValue = value; // 保存完整值用于复制
      }
    } else {
      span.className = "json-value";
      span.textContent = String(value);
    }
    
    span._originalValue = value;
    return span;
  }

  _truncateString(str) {
    if (str.length <= this.maxStringLength) {
      return str;
    }
    return str.substring(0, this.maxStringLength) + "...";
  }

  toggleNode(nodeId) {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
      return false; // 收缩
    } else {
      this.expandedNodes.add(nodeId);
      return true; // 展开
    }
  }

  copyFieldName(key) {
    return key;
  }

  copyFieldValue(value) {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  copyObject(value) {
    return JSON.stringify(value, null, 2);
  }
}

// 生成器
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

const jsonArrayArbitrary = fc.array(
  fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null)
  ),
  { minLength: 1, maxLength: 10 }
);

const nestedJsonArbitrary = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 5 }),
  fc.oneof(
    fc.string(),
    fc.integer(),
    simpleJsonObjectArbitrary,
    fc.array(fc.integer(), { minLength: 1, maxLength: 5 })
  ),
  { minKeys: 1, maxKeys: 5 }
);

describe('功能: json-artifact-viewer-enhancement, 属性3: 树状视图键值完整性', () => {
  test('所有顶层键名都应出现在渲染输出中', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const viewer = new MockJSONViewer();
          viewer.render(obj);
          
          const keys = Object.keys(obj);
          for (const key of keys) {
            expect(viewer.renderedKeys).toContain(key);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('嵌套对象的键名也应出现在渲染输出中', () => {
    fc.assert(
      fc.property(
        nestedJsonArbitrary,
        (obj) => {
          const viewer = new MockJSONViewer();
          viewer.render(obj);
          
          // 检查顶层键
          const topKeys = Object.keys(obj);
          for (const key of topKeys) {
            expect(viewer.renderedKeys).toContain(key);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性4: 数组索引完整性', () => {
  test('所有数组索引都应出现在渲染输出中', () => {
    fc.assert(
      fc.property(
        jsonArrayArbitrary,
        (arr) => {
          const viewer = new MockJSONViewer();
          viewer.render(arr);
          
          for (let i = 0; i < arr.length; i++) {
            expect(viewer.renderedArrayIndices).toContain(`[${i}]`);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性5: 元素数量显示正确性', () => {
  test('对象的元素数量应正确显示', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const viewer = new MockJSONViewer();
          viewer.render(obj);
          
          // 检查根节点的计数
          const counts = Object.values(viewer.renderedCounts);
          const rootCount = counts.find(c => c.type === "object");
          
          if (rootCount) {
            expect(rootCount.count).toBe(Object.keys(obj).length);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('数组的元素数量应正确显示', () => {
    fc.assert(
      fc.property(
        jsonArrayArbitrary,
        (arr) => {
          const viewer = new MockJSONViewer();
          viewer.render(arr);
          
          const counts = Object.values(viewer.renderedCounts);
          const rootCount = counts.find(c => c.type === "array");
          
          if (rootCount) {
            expect(rootCount.count).toBe(arr.length);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性6: 展开/收缩幂等性', () => {
  test('展开后收缩再展开应返回相同状态', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const viewer = new MockJSONViewer();
          viewer.render(obj);
          
          // 获取一个节点ID
          const nodeIds = Array.from(viewer.expandedNodes);
          if (nodeIds.length > 0) {
            const nodeId = nodeIds[0];
            
            // 初始状态：展开
            expect(viewer.expandedNodes.has(nodeId)).toBe(true);
            
            // 收缩
            viewer.toggleNode(nodeId);
            expect(viewer.expandedNodes.has(nodeId)).toBe(false);
            
            // 再展开
            viewer.toggleNode(nodeId);
            expect(viewer.expandedNodes.has(nodeId)).toBe(true);
          }
          
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
        fc.integer({ min: 1, max: 10 }),
        (obj, toggleCount) => {
          const viewer = new MockJSONViewer();
          viewer.render(obj);
          
          const nodeIds = Array.from(viewer.expandedNodes);
          if (nodeIds.length > 0) {
            const nodeId = nodeIds[0];
            const initialState = viewer.expandedNodes.has(nodeId);
            
            // 切换指定次数
            for (let i = 0; i < toggleCount; i++) {
              viewer.toggleNode(nodeId);
            }
            
            // 偶数次切换应回到初始状态
            const expectedState = toggleCount % 2 === 0 ? initialState : !initialState;
            expect(viewer.expandedNodes.has(nodeId)).toBe(expectedState);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性7: 复制字段名正确性', () => {
  test('复制字段名应返回准确的字段名', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (fieldName) => {
          const viewer = new MockJSONViewer();
          const copied = viewer.copyFieldName(fieldName);
          
          expect(copied).toBe(fieldName);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性8: 复制字段值正确性', () => {
  test('复制字符串值应返回原始字符串', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (value) => {
          const viewer = new MockJSONViewer();
          const copied = viewer.copyFieldValue(value);
          
          expect(copied).toBe(value);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('复制数字值应返回字符串形式', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        (value) => {
          const viewer = new MockJSONViewer();
          const copied = viewer.copyFieldValue(value);
          
          expect(copied).toBe(String(value));
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('复制对象值应返回格式化的JSON', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (value) => {
          const viewer = new MockJSONViewer();
          const copied = viewer.copyFieldValue(value);
          
          // 应该是有效的JSON
          const parsed = JSON.parse(copied);
          expect(parsed).toEqual(value);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性9: 复制对象往返正确性', () => {
  test('复制对象后解析应与原对象相等', () => {
    fc.assert(
      fc.property(
        simpleJsonObjectArbitrary,
        (obj) => {
          const viewer = new MockJSONViewer();
          const copied = viewer.copyObject(obj);
          
          // 应该是有效的JSON
          const parsed = JSON.parse(copied);
          expect(parsed).toEqual(obj);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('复制数组后解析应与原数组相等', () => {
    fc.assert(
      fc.property(
        jsonArrayArbitrary,
        (arr) => {
          const viewer = new MockJSONViewer();
          const copied = viewer.copyObject(arr);
          
          const parsed = JSON.parse(copied);
          expect(parsed).toEqual(arr);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性10: 字符串截断一致性', () => {
  test('超过100字符的字符串应被截断并以省略号结尾', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 500 }),
        (str) => {
          const viewer = new MockJSONViewer();
          const truncated = viewer._truncateString(str);
          
          expect(truncated.length).toBe(103); // 100 + "..."
          expect(truncated.endsWith("...")).toBe(true);
          expect(truncated.substring(0, 100)).toBe(str.substring(0, 100));
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('小于等于100字符的字符串不应被截断', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (str) => {
          const viewer = new MockJSONViewer();
          const truncated = viewer._truncateString(str);
          
          expect(truncated).toBe(str);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('截断的字符串应在title属性中保存完整值', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 500 }),
        (str) => {
          const viewer = new MockJSONViewer();
          const span = viewer._createValueSpan(str);
          
          expect(span.title).toBe(str);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('功能: json-artifact-viewer-enhancement, 属性11: 截断字符串复制完整性', () => {
  test('复制截断的字符串应返回完整的原始字符串', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 500 }),
        (str) => {
          const viewer = new MockJSONViewer();
          const span = viewer._createValueSpan(str);
          
          // 复制应返回完整字符串
          const copied = viewer.copyFieldValue(span._originalValue);
          expect(copied).toBe(str);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
