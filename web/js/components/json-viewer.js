/**
 * JSON查看器组件
 * 显示JSON数据的树状视图，支持展开/折叠、字符串截断和复制功能
 */
class JSONViewer {
  constructor(options = {}) {
    this.container = options.container;
    this.maxStringLength = options.maxStringLength || 100;
    this.expandedNodes = new Set();
  }

  /**
   * 渲染JSON数据
   */
  render(data) {
    this.container.innerHTML = "";
    const tree = document.createElement("div");
    tree.className = "json-tree";
    
    const rootNode = this._createNode("root", data, 0);
    tree.appendChild(rootNode);
    
    this.container.appendChild(tree);
  }

  /**
   * 创建JSON节点
   */
  _createNode(key, value, depth) {
    const nodeId = `node-${Math.random().toString(36).substr(2, 9)}`;
    const node = document.createElement("div");
    node.className = "json-node";
    node.dataset.nodeId = nodeId;
    node.dataset.depth = depth;

    const isObject = value !== null && typeof value === "object";
    const isArray = Array.isArray(value);
    const isExpandable = isObject && (Object.keys(value).length > 0 || isArray && value.length > 0);

    // 创建节点头部
    const header = document.createElement("div");
    header.className = "json-node-header";

    // 展开/折叠按钮
    if (isExpandable) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "json-toggle-btn";
      toggleBtn.textContent = "▶"; // 默认收缩状态
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleNode(nodeId, toggleBtn, content);
      });
      header.appendChild(toggleBtn);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "json-toggle-spacer";
      header.appendChild(spacer);
    }

    // 键名
    if (key !== "root") {
      const keySpan = document.createElement("span");
      keySpan.className = "json-key";
      keySpan.textContent = key;
      header.appendChild(keySpan);

      const colonSpan = document.createElement("span");
      colonSpan.className = "json-colon";
      colonSpan.textContent = ": ";
      header.appendChild(colonSpan);
    }

    // 值
    if (isArray) {
      const typeSpan = document.createElement("span");
      typeSpan.className = "json-type";
      typeSpan.textContent = `Array[${value.length}]`;
      header.appendChild(typeSpan);
    } else if (isObject) {
      const typeSpan = document.createElement("span");
      typeSpan.className = "json-type";
      typeSpan.textContent = `Object{${Object.keys(value).length}}`;
      header.appendChild(typeSpan);
    } else {
      const valueSpan = this._createValueSpan(value);
      header.appendChild(valueSpan);
    }

    // 右键菜单
    header.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this._showContextMenu(e, key, value);
    });

    node.appendChild(header);

    // 创建内容容器
    const content = document.createElement("div");
    content.className = "json-node-content";
    content.style.display = "none";

    if (isExpandable) {
      if (isArray) {
        value.forEach((item, index) => {
          const childNode = this._createNode(`[${index}]`, item, depth + 1);
          content.appendChild(childNode);
        });
      } else {
        Object.entries(value).forEach(([k, v]) => {
          const childNode = this._createNode(k, v, depth + 1);
          content.appendChild(childNode);
        });
      }
    }

    node.appendChild(content);

    // 默认展开第一层
    if (depth === 0 && isExpandable) {
      this.expandedNodes.add(nodeId);
      content.style.display = "block";
      const toggleBtn = header.querySelector(".json-toggle-btn");
      if (toggleBtn) toggleBtn.textContent = "▼";
    }

    return node;
  }

  /**
   * 创建值的span元素
   */
  _createValueSpan(value) {
    const span = document.createElement("span");
    
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
      
      // 如果字符串被截断，添加工具提示
      if (value.length > this.maxStringLength) {
        span.title = value;
        span.style.cursor = "help";
      }
    } else {
      span.className = "json-value";
      span.textContent = String(value);
    }
    
    return span;
  }

  /**
   * 截断长字符串
   */
  _truncateString(str) {
    if (str.length <= this.maxStringLength) {
      return str;
    }
    return str.substring(0, this.maxStringLength) + "...";
  }

  /**
   * 切换节点展开/折叠
   */
  _toggleNode(nodeId, toggleBtn, content) {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
      content.style.display = "none";
      toggleBtn.textContent = "▶";
    } else {
      this.expandedNodes.add(nodeId);
      content.style.display = "block";
      toggleBtn.textContent = "▼";
    }
  }

  /**
   * 显示右键菜单
   */
  _showContextMenu(e, key, value) {
    // 先关闭所有已存在的 JSON 右键菜单
    document.querySelectorAll('.json-context-menu').forEach(menu => {
      menu.remove();
    });
    
    const menu = document.createElement("div");
    menu.className = "json-context-menu";
    menu.style.position = "fixed";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.style.zIndex = "10000";

    const items = [];

    // 复制字段名
    if (key !== "root") {
      items.push({
        label: "复制字段名",
        action: () => this._copyToClipboard(key)
      });
    }

    // 复制字段值
    items.push({
      label: "复制字段值",
      action: () => this._copyToClipboard(this._valueToString(value))
    });

    // 复制对象
    if (typeof value === "object" && value !== null) {
      items.push({
        label: "复制对象",
        action: () => this._copyToClipboard(JSON.stringify(value, null, 2))
      });
    }

    items.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "json-context-menu-item";
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        item.action();
        menu.remove();
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    // 点击外部或右键点击时关闭菜单
    const closeMenu = (evt) => {
      // 如果点击的是菜单内部，不关闭
      if (menu.contains(evt.target)) return;
      menu.remove();
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("contextmenu", closeMenu);
    };
    setTimeout(() => {
      document.addEventListener("click", closeMenu);
      document.addEventListener("contextmenu", closeMenu);
    }, 0);
  }

  /**
   * 将值转换为字符串
   */
  _valueToString(value) {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * 复制到剪贴板
   */
  _copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      // 显示复制成功提示
      const toast = document.createElement("div");
      toast.className = "json-copy-toast";
      toast.textContent = "已复制到剪贴板";
      toast.style.position = "fixed";
      toast.style.bottom = "20px";
      toast.style.right = "20px";
      toast.style.padding = "10px 20px";
      toast.style.backgroundColor = "#07c160";
      toast.style.color = "white";
      toast.style.borderRadius = "4px";
      toast.style.zIndex = "10001";
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 2000);
    }).catch(err => {
      console.error("复制失败", err);
    });
  }
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = JSONViewer;
}
