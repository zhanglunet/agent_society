/**
 * 工件管理器组件
 * 独立浮动窗口，支持图标/详情视图，可放大到全屏
 */
class ArtifactManager {
  constructor(options = {}) {
    this.container = options.container || document.getElementById("artifact-manager");
    this.windowEl = options.windowEl || document.getElementById("artifact-manager-window");
    this.api = options.api || window.API;
    this.logger = options.logger || console;
    
    // 状态
    this.artifacts = [];
    this.filteredArtifacts = [];
    this.selectedArtifact = null;
    this.searchQuery = "";
    this.extensionFilters = new Set();
    this.viewMode = "icon"; // "icon" 或 "detail"
    this.isMaximized = false;
    this.isViewerOpen = false;
    
    // UI组件
    this.listPanel = null;
    this.viewerPanel = null;
    this.searchInput = null;
    this.currentViewer = null;
    
    // 初始化
    this._init();
  }

  /**
   * 初始化组件
   */
  _init() {
    this._createUI();
    this._attachEventListeners();
    this.loadArtifacts();
  }

  /**
   * 创建UI结构
   */
  _createUI() {
    if (!this.container) {
      this.logger.error("工件管理器容器不存在");
      return;
    }

    this.container.innerHTML = `
      <div class="artifact-manager">
        <div class="artifact-manager-header">
          <h2>📦 工件管理器</h2>
          <div class="artifact-window-controls">
            <button class="window-btn maximize-btn" title="最大化/还原">⬜</button>
            <button class="window-btn close-btn" title="关闭">✕</button>
          </div>
        </div>
        
        <div class="artifact-manager-toolbar">
          <input 
            type="text" 
            class="artifact-search-input" 
            placeholder="搜索工件..."
            aria-label="搜索工件"
          >
          <div class="artifact-filter-buttons">
            <button class="filter-btn" data-extension="json" title="JSON文件">JSON</button>
            <button class="filter-btn" data-extension="txt" title="文本文件">TXT</button>
            <button class="filter-btn" data-extension="md" title="Markdown文件">MD</button>
            <button class="filter-btn" data-extension="image" title="图片文件">IMG</button>
          </div>
          <div class="artifact-view-toggle">
            <button class="view-mode-btn active" data-mode="icon" title="图标视图">🖼️</button>
            <button class="view-mode-btn" data-mode="detail" title="详情视图">📋</button>
          </div>
          <button class="clear-filters-btn" title="清除过滤">清除</button>
          <button class="refresh-btn" title="刷新">🔄</button>
        </div>

        <div class="artifact-list icon-view" id="artifact-list">
          <div class="empty-state">加载中...</div>
        </div>
      </div>
      
      <!-- 工件查看器弹窗 -->
      <div class="artifact-viewer-modal hidden">
        <div class="artifact-viewer-dialog">
          <div class="artifact-viewer-header">
            <div class="artifact-info">
              <span class="artifact-name">未选择工件</span>
              <button class="view-source-btn" title="查看来源消息" style="display: none;">查看来源</button>
            </div>
            <div class="artifact-viewer-controls">
              <div class="text-mode-toggle" style="display: none;">
                <button class="text-mode-btn active" data-mode="text">纯文本</button>
                <button class="text-mode-btn" data-mode="markdown">Markdown</button>
              </div>
              <button class="viewer-maximize-btn" title="最大化/还原">⬜</button>
              <button class="close-viewer-btn" title="关闭">✕</button>
            </div>
          </div>
          <div class="artifact-viewer-container" id="artifact-viewer">
            <div class="empty-state">请选择一个工件</div>
          </div>
        </div>
      </div>
    `;

    this.searchInput = this.container.querySelector(".artifact-search-input");
    this.filterButtons = this.container.querySelectorAll(".filter-btn");
    this.viewModeButtons = this.container.querySelectorAll(".view-mode-btn");
    this.clearFiltersBtn = this.container.querySelector(".clear-filters-btn");
    this.refreshBtn = this.container.querySelector(".refresh-btn");
    this.listPanel = this.container.querySelector(".artifact-list");
    this.viewerModal = this.container.querySelector(".artifact-viewer-modal");
    this.viewerPanel = this.container.querySelector("#artifact-viewer");
    this.artifactNameSpan = this.container.querySelector(".artifact-name");
    this.viewSourceBtn = this.container.querySelector(".view-source-btn");
    this.closeViewerBtn = this.container.querySelector(".close-viewer-btn");
    this.maximizeBtn = this.container.querySelector(".maximize-btn");
    this.closeWindowBtn = this.container.querySelector(".close-btn");
    this.textModeToggle = this.container.querySelector(".text-mode-toggle");
    this.textModeButtons = this.container.querySelectorAll(".text-mode-btn");
    this.viewerMaximizeBtn = this.container.querySelector(".viewer-maximize-btn");
    this.viewerDialog = this.container.querySelector(".artifact-viewer-dialog");
    
    // 文本显示模式
    this.textDisplayMode = "text"; // "text" 或 "markdown"
    this.currentTextContent = null; // 当前文本内容
    this.isViewerMaximized = false; // 查看器是否最大化
  }

  /**
   * 附加事件监听器
   */
  _attachEventListeners() {
    // 搜索
    this.searchInput?.addEventListener("input", (e) => {
      this.searchQuery = e.target.value;
      this._applyFilters();
    });

    // 过滤
    this.filterButtons?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const ext = e.target.dataset.extension;
        if (this.extensionFilters.has(ext)) {
          this.extensionFilters.delete(ext);
          e.target.classList.remove("active");
        } else {
          this.extensionFilters.add(ext);
          e.target.classList.add("active");
        }
        this._applyFilters();
      });
    });

    // 视图模式切换
    this.viewModeButtons?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        this.setViewMode(mode);
      });
    });

    // 清除过滤
    this.clearFiltersBtn?.addEventListener("click", () => {
      this.searchQuery = "";
      this.extensionFilters.clear();
      this.searchInput.value = "";
      this.filterButtons.forEach(btn => btn.classList.remove("active"));
      this._applyFilters();
    });

    // 刷新
    this.refreshBtn?.addEventListener("click", () => {
      this.loadArtifacts();
    });

    // 关闭查看器
    this.closeViewerBtn?.addEventListener("click", () => {
      this.closeViewer();
    });

    // 点击遮罩关闭查看器
    this.viewerModal?.addEventListener("click", (e) => {
      if (e.target === this.viewerModal) {
        this.closeViewer();
      }
    });

    // 查看来源
    this.viewSourceBtn?.addEventListener("click", () => {
      if (this.selectedArtifact?.messageId) {
        this.navigateToSourceMessage(this.selectedArtifact.messageId);
      }
    });

    // 文本模式切换
    this.textModeButtons?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        this.setTextDisplayMode(mode);
      });
    });

    // 查看器最大化/还原
    this.viewerMaximizeBtn?.addEventListener("click", () => {
      this.toggleViewerMaximize();
    });

    // 最大化/还原
    this.maximizeBtn?.addEventListener("click", () => {
      this.toggleMaximize();
    });

    // 关闭窗口
    this.closeWindowBtn?.addEventListener("click", () => {
      this.hide();
    });

    // ESC键关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.isViewerOpen) {
          this.closeViewer();
        } else if (this.isVisible()) {
          this.hide();
        }
      }
    });
  }

  /**
   * 设置视图模式
   */
  setViewMode(mode) {
    this.viewMode = mode;
    this.viewModeButtons?.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    
    if (this.listPanel) {
      this.listPanel.classList.remove("icon-view", "detail-view");
      this.listPanel.classList.add(mode === "icon" ? "icon-view" : "detail-view");
    }
    
    this._renderList();
  }

  /**
   * 切换最大化
   */
  toggleMaximize() {
    this.isMaximized = !this.isMaximized;
    this.windowEl?.classList.toggle("maximized", this.isMaximized);
    this.maximizeBtn.textContent = this.isMaximized ? "❐" : "⬜";
    this.maximizeBtn.title = this.isMaximized ? "还原" : "最大化";
  }

  /**
   * 显示窗口
   */
  show() {
    this.windowEl?.classList.remove("hidden");
    this.loadArtifacts();
  }

  /**
   * 隐藏窗口
   */
  hide() {
    this.windowEl?.classList.add("hidden");
    this.closeViewer();
  }

  /**
   * 检查是否可见
   */
  isVisible() {
    return this.windowEl && !this.windowEl.classList.contains("hidden");
  }

  /**
   * 关闭查看器
   */
  closeViewer() {
    this.isViewerOpen = false;
    this.selectedArtifact = null;
    this.currentTextContent = null;
    this.isViewerMaximized = false;
    this.viewerDialog?.classList.remove("maximized");
    this.viewerMaximizeBtn.textContent = "⬜";
    this.viewerModal?.classList.add("hidden");
    this.viewerPanel.innerHTML = '<div class="empty-state">请选择一个工件</div>';
    this.artifactNameSpan.textContent = "未选择工件";
    this.viewSourceBtn.style.display = "none";
    this.textModeToggle.style.display = "none";
  }

  /**
   * 切换查看器最大化
   */
  toggleViewerMaximize() {
    this.isViewerMaximized = !this.isViewerMaximized;
    this.viewerDialog?.classList.toggle("maximized", this.isViewerMaximized);
    this.viewerMaximizeBtn.textContent = this.isViewerMaximized ? "❐" : "⬜";
    this.viewerMaximizeBtn.title = this.isViewerMaximized ? "还原" : "最大化";
  }

  /**
   * 设置文本显示模式
   */
  setTextDisplayMode(mode) {
    this.textDisplayMode = mode;
    this.textModeButtons?.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    
    // 重新渲染文本内容
    if (this.currentTextContent !== null) {
      this._renderTextContent(this.currentTextContent);
    }
  }

  /**
   * 加载所有工件
   */
  async loadArtifacts() {
    try {
      this.listPanel.innerHTML = '<div class="empty-state">加载中...</div>';
      const response = await this.api.get("/artifacts");
      
      // 加载每个工件的详细信息
      const artifactsWithDetails = await Promise.all(
        (response.artifacts || []).map(async (artifact) => {
          try {
            // JSON 文件：读取内部的业务 type
            if (artifact.extension === ".json") {
              const detail = await this.api.get(`/artifacts/${artifact.id}`);
              return {
                ...artifact,
                type: detail.type || "unknown",
                content: detail.content,
                actualFilename: detail.meta?.filename || detail.meta?.name || detail.meta?.title || `${detail.type || "artifact"}_${artifact.id.slice(0, 8)}`
              };
            }
            // 非 JSON 文件：使用文件扩展名作为类型
            const extType = artifact.extension.replace(".", "").toLowerCase();
            return {
              ...artifact,
              type: extType || "file",
              content: artifact.filename, // 文件名作为内容引用
              actualFilename: artifact.filename
            };
          } catch (e) {
            return {
              ...artifact,
              type: artifact.extension?.replace(".", "") || "unknown",
              actualFilename: artifact.filename
            };
          }
        })
      );
      
      // 按创建时间降序排列（新的在前）
      this.artifacts = artifactsWithDetails.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      this._applyFilters();
      this.logger.log("工件加载完成", { count: this.artifacts.length });
    } catch (err) {
      this.logger.error("加载工件失败", err);
      this.listPanel.innerHTML = '<div class="empty-state error">加载工件失败</div>';
    }
  }

  /**
   * 应用搜索和过滤
   */
  _applyFilters() {
    this.filteredArtifacts = this.artifacts.filter(artifact => {
      const displayName = artifact.actualFilename || artifact.filename;
      
      // 搜索过滤
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        const nameMatch = displayName.toLowerCase().includes(query);
        const typeMatch = (artifact.type || "").toLowerCase().includes(query);
        if (!nameMatch && !typeMatch) {
          return false;
        }
      }

      // 扩展名过滤
      if (this.extensionFilters.size > 0) {
        const type = (artifact.type || "").toLowerCase();
        const content = artifact.content;
        const isImage = this._isImageType(type);
        const isText = typeof content === "string";
        const isJson = typeof content === "object" && content !== null;
        
        if (!Array.from(this.extensionFilters).some(filter => {
          if (filter === "image") return isImage;
          if (filter === "json") return isJson && !isText;
          if (filter === "txt" || filter === "md") return isText;
          return type.includes(filter);
        })) {
          return false;
        }
      }

      return true;
    });

    this._renderList();
  }

  /**
   * 渲染工件列表
   */
  _renderList() {
    if (this.filteredArtifacts.length === 0) {
      // 区分是过滤后为空还是本身就没有工件
      if (this.artifacts.length === 0) {
        this.listPanel.innerHTML = '<div class="empty-state">暂无工件</div>';
      } else {
        this.listPanel.innerHTML = '<div class="empty-state">没有找到匹配的工件</div>';
      }
      return;
    }

    if (this.viewMode === "icon") {
      this._renderIconView();
    } else {
      this._renderDetailView();
    }

    // 附加点击事件
    this.listPanel.querySelectorAll(".artifact-item").forEach(item => {
      item.addEventListener("dblclick", () => {
        const id = item.dataset.id;
        const artifact = this.filteredArtifacts.find(a => a.id === id);
        if (artifact) {
          this.openArtifact(artifact);
        }
      });
    });

    // 附加来源按钮点击事件
    this.listPanel.querySelectorAll(".artifact-source-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation(); // 阻止冒泡，避免触发双击打开
        const id = btn.dataset.id;
        await this._navigateToArtifactSource(id);
      });
    });
  }

  /**
   * 渲染图标视图
   */
  _renderIconView() {
    this.listPanel.innerHTML = this.filteredArtifacts.map(artifact => {
      const type = artifact.type || "unknown";
      const displayName = artifact.actualFilename || artifact.filename;
      const isImage = this._isImageType(type);
      const sourceBtn = `<button class="artifact-source-btn" data-id="${artifact.id}" title="跳转到来源消息">↗</button>`;
      
      // 图片类型显示缩略图
      if (isImage && artifact.content) {
        const imageUrl = this._getImageUrl(artifact.content);
        return `
          <div class="artifact-item" data-id="${artifact.id}" title="${this._escapeHtml(displayName)}">
            <div class="artifact-thumbnail">
              <img src="${imageUrl}" alt="${this._escapeHtml(displayName)}" onerror="this.parentElement.innerHTML='🖼️'">
            </div>
            <div class="artifact-item-name">${this._escapeHtml(this._truncateName(displayName, 20))}</div>
            ${sourceBtn}
          </div>
        `;
      }
      
      // 非图片类型显示图标
      const icon = this._getFileIconByType(type);
      return `
        <div class="artifact-item" data-id="${artifact.id}" title="${this._escapeHtml(displayName)}">
          <div class="artifact-icon">${icon}</div>
          <div class="artifact-item-name">${this._escapeHtml(this._truncateName(displayName, 20))}</div>
          ${sourceBtn}
        </div>
      `;
    }).join("");
  }

  /**
   * 渲染详情视图
   */
  _renderDetailView() {
    this.listPanel.innerHTML = `
      <div class="artifact-detail-header">
        <span class="col-name">名称</span>
        <span class="col-type">类型</span>
        <span class="col-size">大小</span>
        <span class="col-date">创建时间</span>
        <span class="col-action"></span>
      </div>
    ` + this.filteredArtifacts.map(artifact => {
      const type = artifact.type || "unknown";
      const icon = this._getFileIconByType(type);
      const displayName = artifact.actualFilename || artifact.filename;
      return `
        <div class="artifact-item" data-id="${artifact.id}">
          <span class="col-name">
            <span class="artifact-icon-small">${icon}</span>
            ${this._escapeHtml(displayName)}
          </span>
          <span class="col-type">${type}</span>
          <span class="col-size">${this._formatSize(artifact.size)}</span>
          <span class="col-date">${new Date(artifact.createdAt).toLocaleString()}</span>
          <span class="col-action">
            <button class="artifact-source-btn" data-id="${artifact.id}" title="跳转到来源消息">↗</button>
          </span>
        </div>
      `;
    }).join("");
  }

  /**
   * 根据类型获取文件图标
   */
  _getFileIconByType(type) {
    // 已知的 JSON 数据类型
    const jsonTypes = ["json", "config", "settings", "data"];
    // 已知的文本/Markdown 类型
    const textTypes = ["text", "txt", "markdown", "md", "book_chapter", "chapter", "document", "article", "note"];
    // 已知的图片类型
    const imageTypes = ["image", "png", "jpg", "jpeg", "gif", "webp", "screenshot"];
    
    const lowerType = (type || "").toLowerCase();
    
    if (jsonTypes.includes(lowerType)) return "📄";
    if (textTypes.includes(lowerType)) return "📝";
    if (imageTypes.includes(lowerType)) return "🖼️";
    
    // 默认显示为文档图标
    return "📋";
  }

  /**
   * 检查是否为图片类型
   */
  _isImageType(type) {
    const imageTypes = ["image", "png", "jpg", "jpeg", "gif", "webp", "screenshot"];
    return imageTypes.includes((type || "").toLowerCase());
  }

  /**
   * 根据工件类型和内容获取查看器类型
   */
  _getViewerType(type, content) {
    const lowerType = (type || "").toLowerCase();
    
    // 图片类型
    if (this._isImageType(lowerType)) return "image";
    
    // 检查内容类型
    if (typeof content === "string") {
      // 字符串内容使用文本查看器
      return "text";
    } else if (typeof content === "object" && content !== null) {
      // 对象内容使用 JSON 查看器
      return "json";
    }
    
    return "text"; // 默认使用文本查看器
  }

  /**
   * 截断文件名
   */
  _truncateName(name, maxLen) {
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 3) + "...";
  }

  /**
   * 获取图片 URL
   * @param {string} content - 图片内容（可能是文件名、base64 或完整 URL）
   */
  _getImageUrl(content) {
    if (!content) return "";
    // 已经是 base64 或完整 URL
    if (content.startsWith("data:") || content.startsWith("http://") || content.startsWith("https://")) {
      return content;
    }
    // 文件名，构建 artifacts 路径
    return `/artifacts/${content}`;
  }

  /**
   * 打开工件
   */
  async openArtifact(artifact) {
    try {
      this.selectedArtifact = artifact;
      const displayName = artifact.actualFilename || artifact.filename;
      this.artifactNameSpan.textContent = displayName;
      this.isViewerOpen = true;
      this.viewerModal?.classList.remove("hidden");
      this.viewerPanel.innerHTML = '<div class="empty-state">加载中...</div>';

      let fullArtifact;
      let metadata = {};
      
      // JSON 文件：通过 API 加载内容
      if (artifact.extension === ".json") {
        fullArtifact = await this.api.get(`/artifacts/${artifact.id}`);
        // 加载元数据
        metadata = await this.api.get(`/artifacts/${artifact.id}/metadata`);
      } else {
        // 非 JSON 文件：直接使用文件信息
        fullArtifact = {
          id: artifact.id,
          type: artifact.type,
          content: artifact.filename,
          meta: {}
        };
      }
      
      this.selectedArtifact.messageId = metadata.messageId;

      // 显示"查看来源"按钮
      if (metadata.messageId) {
        this.viewSourceBtn.style.display = "inline-block";
      } else {
        this.viewSourceBtn.style.display = "none";
      }

      // 选择合适的查看器（基于 type 和 content）
      const viewerType = this._getViewerType(fullArtifact.type, fullArtifact.content);
      this._displayArtifact(fullArtifact, viewerType);

      this.logger.log("工件已打开", { id: artifact.id, type: fullArtifact.type, viewerType });
    } catch (err) {
      this.logger.error("打开工件失败", err);
      this.viewerPanel.innerHTML = '<div class="empty-state error">加载工件失败</div>';
    }
  }

  /**
   * 显示工件
   */
  _displayArtifact(artifact, viewerType) {
    this.viewerPanel.innerHTML = "";
    this.textModeToggle.style.display = "none";
    this.currentTextContent = null;

    if (viewerType === "json") {
      const viewer = new JSONViewer({ container: this.viewerPanel });
      viewer.render(artifact.content);
      this.currentViewer = viewer;
    } else if (viewerType === "text") {
      // 显示文本模式切换按钮
      this.textModeToggle.style.display = "flex";
      this.currentTextContent = typeof artifact.content === "string" 
        ? artifact.content 
        : JSON.stringify(artifact.content, null, 2);
      this._renderTextContent(this.currentTextContent);
    } else if (viewerType === "image") {
      const viewer = new ImageViewer({ container: this.viewerPanel });
      viewer.render(artifact.content);
      this.currentViewer = viewer;
    } else {
      this.viewerPanel.innerHTML = `<div class="empty-state error">不支持的文件类型: ${artifact.type || "unknown"}</div>`;
    }
  }

  /**
   * 渲染文本内容（纯文本或 Markdown）
   */
  _renderTextContent(content) {
    this.viewerPanel.innerHTML = "";
    
    if (this.textDisplayMode === "markdown") {
      // Markdown 渲染
      const wrapper = document.createElement("div");
      wrapper.className = "markdown-viewer";
      wrapper.innerHTML = this._renderMarkdown(content);
      this.viewerPanel.appendChild(wrapper);
    } else {
      // 纯文本渲染
      const viewer = new TextViewer({ container: this.viewerPanel });
      viewer.render(content);
      this.currentViewer = viewer;
    }
  }

  /**
   * 简单的 Markdown 渲染
   */
  _renderMarkdown(text) {
    // 转义 HTML
    let html = this._escapeHtml(text);
    
    // 代码块 ```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    
    // 行内代码 `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // 粗体和斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    
    // 水平线
    html = html.replace(/^---$/gm, '<hr>');
    
    // 段落（连续的非空行）
    html = html.replace(/^(?!<[huplo]|<li|<hr|<pre)(.+)$/gm, '<p>$1</p>');
    
    // 换行
    html = html.replace(/\n/g, '');
    
    return html;
  }

  /**
   * 导航到源消息
   */
  navigateToSourceMessage(messageId) {
    this.hide();
    const event = new CustomEvent("navigateToMessage", { detail: { messageId } });
    window.dispatchEvent(event);
  }

  /**
   * 根据工件 ID 导航到来源消息
   */
  async _navigateToArtifactSource(artifactId) {
    try {
      this.logger.log("正在获取工件元数据", { artifactId });
      const metadata = await this.api.get(`/artifacts/${artifactId}/metadata`);
      this.logger.log("获取到工件元数据", { artifactId, metadata });
      if (metadata?.messageId) {
        this.navigateToSourceMessage(metadata.messageId);
      } else {
        this.logger.warn("该工件没有关联的来源消息", { artifactId });
        // 显示提示
        if (window.Toast) {
          window.Toast.warning("该工件没有关联的来源消息");
        }
      }
    } catch (err) {
      this.logger.error("获取工件元数据失败", err);
      if (window.Toast) {
        window.Toast.error("获取工件元数据失败");
      }
    }
  }

  /**
   * 格式化文件大小
   */
  _formatSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  }

  /**
   * 转义HTML
   */
  _escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = ArtifactManager;
}
