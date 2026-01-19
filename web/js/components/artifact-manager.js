/**
 * 工件管理器组件
 * 独立浮动窗口，支持图标/详情视图，可放大到全屏
 * 支持左侧边栏显示工件和工作空间列表
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
    
    // 左侧边栏状态
    this.sidebarMode = "artifacts"; // "artifacts" 或 "workspace"
    this.workspaces = [];
    this.selectedWorkspace = null;
    this.workspaceFiles = [];
    this.filteredWorkspaceFiles = [];
    
    // 图片导航相关状态
    this.currentImageIndex = -1;        // 当前图片在列表中的索引
    this.imageList = [];                 // 过滤后的图片列表
    this.thumbnailNavigator = null;      // 缩略图导航器实例
    
    // UI组件
    this.listPanel = null;
    this.viewerPanel = null;
    this.searchInput = null;
    this.currentViewer = null;
    this.sidebarPanel = null;
    
    // 窗口拖拽和调整大小相关状态
    this.isDragging = false;
    this.isResizing = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.windowStartX = 0;
    this.windowStartY = 0;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = 0;
    this.resizeStartHeight = 0;
    this.resizeDirection = null; // 'se', 'sw', 'ne', 'nw', 'n', 's', 'e', 'w'

    // 初始化
    this._init();
  }

  /**
   * 初始化组件
   */
  _init() {
    this._createUI();
    this._attachEventListeners();
    this._attachWindowControlEvents();
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
            <button class="window-btn dock-left-btn" title="紧贴左侧">⬅️</button>
            <button class="window-btn dock-right-btn" title="紧贴右侧">➡️</button>
            <button class="window-btn center-btn" title="居中">🎯</button>
            <button class="window-btn maximize-btn" title="最大化/还原">⬜</button>
            <button class="window-btn close-btn" title="关闭">✕</button>
          </div>
        </div>
        
        <div class="artifact-manager-body">
          <!-- 左侧边栏 -->
          <div class="artifact-sidebar">
            <div class="sidebar-section">
              <div class="sidebar-section-header" data-section="artifacts">
                <span class="sidebar-section-icon">📄</span>
                <span class="sidebar-section-title">工件</span>
                <span class="sidebar-section-count" id="artifacts-count">0</span>
              </div>
            </div>
            <div class="sidebar-section">
              <div class="sidebar-section-header" data-section="workspaces">
                <span class="sidebar-section-icon">📁</span>
                <span class="sidebar-section-title">工作空间</span>
                <span class="sidebar-section-count" id="workspaces-count">0</span>
              </div>
              <div class="sidebar-workspace-list" id="workspace-list">
                <!-- 工作空间列表将通过 JavaScript 动态生成 -->
              </div>
            </div>
          </div>
          
          <!-- 右侧主内容区 -->
          <div class="artifact-main-content">
            <div class="artifact-manager-toolbar">
              <input 
                type="text" 
                class="artifact-search-input" 
                placeholder="搜索..."
                aria-label="搜索"
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

            <div class="artifact-content-header" id="content-header">
              <span class="content-title">全部工件</span>
              <button class="back-to-artifacts-btn hidden" title="返回工件列表">← 返回</button>
            </div>

            <div class="artifact-list icon-view" id="artifact-list">
              <div class="empty-state">加载中...</div>
            </div>
          </div>
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
              <div class="json-mode-toggle" style="display: none;">
                <button class="json-mode-btn active" data-mode="text">文本</button>
                <button class="json-mode-btn" data-mode="json">JSON</button>
              </div>
              <button class="copy-artifact-btn" title="复制内容">📋</button>
              <button class="download-artifact-btn" title="下载">⬇️</button>
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

    // 左侧边栏元素
    this.sidebarPanel = this.container.querySelector(".artifact-sidebar");
    this.workspaceListEl = this.container.querySelector("#workspace-list");
    this.artifactsCountEl = this.container.querySelector("#artifacts-count");
    this.workspacesCountEl = this.container.querySelector("#workspaces-count");
    this.sidebarSectionHeaders = this.container.querySelectorAll(".sidebar-section-header");
    
    // 内容区元素
    this.contentHeader = this.container.querySelector("#content-header");
    this.contentTitleEl = this.container.querySelector(".content-title");
    this.backToArtifactsBtn = this.container.querySelector(".back-to-artifacts-btn");

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
    this.dockLeftBtn = this.container.querySelector(".dock-left-btn");
    this.dockRightBtn = this.container.querySelector(".dock-right-btn");
    this.centerBtn = this.container.querySelector(".center-btn");
    this.headerEl = this.container.querySelector(".artifact-manager-header");
    this.textModeToggle = this.container.querySelector(".text-mode-toggle");
    this.textModeButtons = this.container.querySelectorAll(".text-mode-btn");
    this.jsonModeToggle = this.container.querySelector(".json-mode-toggle");
    this.jsonModeButtons = this.container.querySelectorAll(".json-mode-btn");
    this.copyArtifactBtn = this.container.querySelector(".copy-artifact-btn");
    this.downloadArtifactBtn = this.container.querySelector(".download-artifact-btn");
    this.viewerMaximizeBtn = this.container.querySelector(".viewer-maximize-btn");
    this.viewerDialog = this.container.querySelector(".artifact-viewer-dialog");
    
    // 文本显示模式
    this.textDisplayMode = "text"; // "text" 或 "markdown"
    this.currentTextContent = null; // 当前文本内容
    this.isViewerMaximized = false; // 查看器是否最大化
    
    // JSON显示模式
    this.jsonDisplayMode = "text"; // "text" 或 "json"
    this.currentJsonContent = null; // 当前JSON内容（解析后的对象）
    this.currentJsonRaw = null; // 当前JSON原始文本
  }

  /**
   * 附加事件监听器
   */
  _attachEventListeners() {
    // 左侧边栏区域点击
    this.sidebarSectionHeaders?.forEach(header => {
      header.addEventListener("click", (e) => {
        const section = header.dataset.section;
        if (section === "artifacts") {
          this.switchToArtifactsMode();
        }
        // workspaces 区域点击不切换，只展开/收起列表
      });
    });

    // 返回工件列表按钮
    this.backToArtifactsBtn?.addEventListener("click", () => {
      this.switchToArtifactsMode();
    });

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
      if (this.sidebarMode === "artifacts") {
        this.loadArtifacts();
      } else {
        this.loadWorkspaceFiles(this.selectedWorkspace);
      }
      this.loadWorkspaces(); // 总是刷新工作空间列表
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
        this.navigateToSourceMessage(this.selectedArtifact.messageId, this.selectedArtifact.agentId);
      }
    });

    // 文本模式切换
    this.textModeButtons?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        this.setTextDisplayMode(mode);
      });
    });

    // JSON模式切换
    this.jsonModeButtons?.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        this.setJsonDisplayMode(mode);
      });
    });

    // 查看器最大化/还原
    this.viewerMaximizeBtn?.addEventListener("click", () => {
      this.toggleViewerMaximize();
    });

    // 复制工件内容
    this.copyArtifactBtn?.addEventListener("click", () => {
      this.copyArtifactContent();
    });

    // 下载工件
    this.downloadArtifactBtn?.addEventListener("click", () => {
      this.downloadArtifact();
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
      
      // 图片导航键盘事件（左右方向键）
      this._handleImageNavigationKeys(e);
    });
  }

  /**
   * 切换到工件模式
   */
  switchToArtifactsMode() {
    this.sidebarMode = "artifacts";
    this.selectedWorkspace = null;
    this.contentTitleEl.textContent = "全部工件";
    this.backToArtifactsBtn?.classList.add("hidden");
    this.searchInput.placeholder = "搜索工件...";
    
    // 更新边栏选中状态
    this.sidebarSectionHeaders?.forEach(header => {
      header.classList.toggle("active", header.dataset.section === "artifacts");
    });
    this.workspaceListEl?.querySelectorAll(".workspace-item").forEach(item => {
      item.classList.remove("active");
    });
    
    this._applyFilters();
  }

  /**
   * 切换到工作空间模式
   */
  switchToWorkspaceMode(workspaceId, workspaceName) {
    this.sidebarMode = "workspace";
    this.selectedWorkspace = workspaceId;
    this.contentTitleEl.textContent = `工作空间: ${workspaceName || workspaceId}`;
    this.backToArtifactsBtn?.classList.remove("hidden");
    this.searchInput.placeholder = "搜索文件...";
    
    // 更新边栏选中状态
    this.sidebarSectionHeaders?.forEach(header => {
      header.classList.remove("active");
    });
    this.workspaceListEl?.querySelectorAll(".workspace-item").forEach(item => {
      item.classList.toggle("active", item.dataset.id === workspaceId);
    });
    
    this.loadWorkspaceFiles(workspaceId);
  }

  /**
   * 加载工作空间列表
   */
  async loadWorkspaces() {
    try {
      const response = await this.api.get("/workspaces");
      this.workspaces = response.workspaces || [];
      this.workspacesCountEl.textContent = this.workspaces.length;
      this._renderWorkspaceList();
      this.logger.log("工作空间列表加载完成", { count: this.workspaces.length });
    } catch (err) {
      this.logger.error("加载工作空间列表失败", err);
      this.workspaces = [];
      this.workspacesCountEl.textContent = "0";
      this._renderWorkspaceList();
    }
  }

  /**
   * 渲染工作空间列表
   */
  _renderWorkspaceList() {
    if (!this.workspaceListEl) return;

    if (this.workspaces.length === 0) {
      this.workspaceListEl.innerHTML = '<div class="empty-workspace-list">暂无工作空间</div>';
      return;
    }

    this.workspaceListEl.innerHTML = this.workspaces.map(ws => `
      <div class="workspace-item ${this.selectedWorkspace === ws.id ? 'active' : ''}" 
           data-id="${ws.id}" 
           title="${this._escapeHtml(ws.name || ws.id)}">
        <span class="workspace-icon">📁</span>
        <span class="workspace-name">${this._escapeHtml(this._truncateName(ws.name || ws.id, 20))}</span>
        <span class="workspace-file-count">${ws.fileCount || 0}</span>
      </div>
    `).join("");

    // 绑定点击事件
    this.workspaceListEl.querySelectorAll(".workspace-item").forEach(item => {
      item.addEventListener("click", () => {
        const id = item.dataset.id;
        const ws = this.workspaces.find(w => w.id === id);
        this.switchToWorkspaceMode(id, ws?.name);
      });
    });
  }

  /**
   * 加载工作空间文件列表
   */
  async loadWorkspaceFiles(workspaceId) {
    if (!workspaceId) return;

    try {
      this.listPanel.innerHTML = '<div class="empty-state">加载中...</div>';
      const response = await this.api.get(`/workspaces/${workspaceId}`);
      
      this.workspaceFiles = (response.files || []).map(file => {
        const type = this._getFileTypeFromExtension(file.extension);
        const isImage = this._isImageType(type);
        return {
          ...file,
          id: `${workspaceId}/${file.path}`,
          type,
          actualFilename: file.name,
          filename: file.name,
          createdAt: file.modifiedAt || file.createdAt,
          isWorkspaceFile: true,
          workspaceId,
          // 图片文件需要设置 content 以便显示缩略图
          content: isImage ? file.path : null
        };
      });

      this._applyFilters();
      this.logger.log("工作空间文件加载完成", { workspaceId, count: this.workspaceFiles.length });
    } catch (err) {
      this.logger.error("加载工作空间文件失败", err);
      this.listPanel.innerHTML = '<div class="empty-state error">加载文件失败</div>';
    }
  }

  /**
   * 根据扩展名获取文件类型
   */
  _getFileTypeFromExtension(ext) {
    const extLower = (ext || "").toLowerCase().replace(".", "");
    const typeMap = {
      "js": "javascript",
      "ts": "typescript",
      "json": "json",
      "html": "html",
      "css": "css",
      "md": "markdown",
      "txt": "text",
      "png": "image",
      "jpg": "image",
      "jpeg": "image",
      "gif": "image",
      "webp": "image",
      "svg": "image"
    };
    return typeMap[extLower] || extLower || "file";
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
    if (this.maximizeBtn) {
      this.maximizeBtn.textContent = this.isMaximized ? "❐" : "⬜";
      this.maximizeBtn.title = this.isMaximized ? "还原" : "最大化";
    }
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
    this.currentJsonContent = null;
    this.currentJsonRaw = null;
    
    // 销毁缩略图导航器
    if (this.thumbnailNavigator) {
      this.thumbnailNavigator.destroy();
      this.thumbnailNavigator = null;
    }
    
    // 重置图片导航状态
    this.currentImageIndex = -1;
    this.imageList = [];
    
    // 如果是全屏状态，先移回原位置
    if (this.isViewerMaximized) {
      this.viewerModal?.classList.remove("fullscreen");
      this.container.appendChild(this.viewerModal);
    }
    this.isViewerMaximized = false;
    
    this.viewerDialog?.classList.remove("maximized");
    this.viewerMaximizeBtn.textContent = "⬜";
    this.viewerModal?.classList.add("hidden");
    this.viewerPanel.innerHTML = '<div class="empty-state">请选择一个工件</div>';
    this.artifactNameSpan.textContent = "未选择工件";
    this.viewSourceBtn.style.display = "none";
    this.textModeToggle.style.display = "none";
    this.jsonModeToggle.style.display = "none";
  }

  /**
   * 切换查看器最大化
   */
  toggleViewerMaximize() {
    this.isViewerMaximized = !this.isViewerMaximized;
    
    if (this.isViewerMaximized) {
      // 全屏：将modal移动到body下，脱离transform的影响
      document.body.appendChild(this.viewerModal);
      this.viewerModal?.classList.add("fullscreen");
    } else {
      // 还原：将modal移回原位置
      this.viewerModal?.classList.remove("fullscreen");
      this.container.appendChild(this.viewerModal);
    }
    
    this.viewerDialog?.classList.toggle("maximized", this.isViewerMaximized);
    this.viewerMaximizeBtn.textContent = this.isViewerMaximized ? "❐" : "⬜";
    this.viewerMaximizeBtn.title = this.isViewerMaximized ? "还原" : "最大化";
  }

  /**
   * 复制工件内容到剪贴板
   */
  async copyArtifactContent() {
    if (!this.selectedArtifact) {
      if (window.Toast) window.Toast.warning("没有选中的工件");
      return;
    }

    try {
      let content;
      const type = (this.selectedArtifact.type || "").toLowerCase();
      
      // 图片类型：复制图片 URL 或提示
      if (this._isImageType(type)) {
        const imageUrl = this._getImageUrl(this.selectedArtifact.content);
        if (imageUrl.startsWith("data:")) {
          // base64 图片，复制 data URL
          content = imageUrl;
        } else {
          // 文件路径，构建完整 URL
          content = window.location.origin + imageUrl;
        }
      } else if (this.currentTextContent !== null) {
        // 文本内容
        content = this.currentTextContent;
      } else {
        // JSON 或其他对象内容
        const fullArtifact = await this.api.get(`/artifacts/${this.selectedArtifact.id}`);
        content = typeof fullArtifact.content === "string" 
          ? fullArtifact.content 
          : JSON.stringify(fullArtifact.content, null, 2);
      }

      await navigator.clipboard.writeText(content);
      if (window.Toast) {
        window.Toast.success("已复制到剪贴板");
      }
      this.logger.log("工件内容已复制", { id: this.selectedArtifact.id });
    } catch (err) {
      this.logger.error("复制工件内容失败", err);
      if (window.Toast) {
        window.Toast.error("复制失败");
      }
    }
  }

  /**
   * 下载工件
   */
  async downloadArtifact() {
    if (!this.selectedArtifact) {
      if (window.Toast) window.Toast.warning("没有选中的工件");
      return;
    }

    try {
      const artifact = this.selectedArtifact;
      const displayName = artifact.actualFilename || artifact.filename;
      const type = (artifact.type || "").toLowerCase();
      
      let blob;
      let filename = displayName;

      // 图片类型
      if (this._isImageType(type)) {
        const imageUrl = this._getImageUrl(artifact.content);
        if (imageUrl.startsWith("data:")) {
          // base64 图片
          const response = await fetch(imageUrl);
          blob = await response.blob();
        } else {
          // 文件路径
          const response = await fetch(imageUrl);
          blob = await response.blob();
        }
        // 确保文件名有扩展名
        if (!filename.includes(".")) {
          filename += "." + (type === "image" ? "png" : type);
        }
      } else {
        // 文本或 JSON 内容
        let content;
        if (this.currentTextContent !== null) {
          content = this.currentTextContent;
        } else {
          const fullArtifact = await this.api.get(`/artifacts/${artifact.id}`);
          content = typeof fullArtifact.content === "string" 
            ? fullArtifact.content 
            : JSON.stringify(fullArtifact.content, null, 2);
        }
        
        const mimeType = artifact.extension === ".json" ? "application/json" : "text/plain";
        blob = new Blob([content], { type: mimeType + ";charset=utf-8" });
        
        // 确保文件名有扩展名
        if (!filename.includes(".")) {
          filename += artifact.extension || ".txt";
        }
      }

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (window.Toast) {
        window.Toast.success("下载已开始");
      }
      this.logger.log("工件下载已开始", { id: artifact.id, filename });
    } catch (err) {
      this.logger.error("下载工件失败", err);
      if (window.Toast) {
        window.Toast.error("下载失败");
      }
    }
  }

  /**
   * 设置文本显示模式
   * 对于普通文本：text=纯文本，markdown=Markdown渲染
   * 对于HTML工件：text=源码，markdown=HTML预览
   */
  setTextDisplayMode(mode) {
    this.textDisplayMode = mode;
    this.textModeButtons?.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    
    // 重新渲染内容
    if (this.currentTextContent !== null) {
      // 判断当前工件类型
      const isHtml = this.selectedArtifact && 
                     (this.selectedArtifact.type === "html" || 
                      this.selectedArtifact.type === "text/html");
      
      if (isHtml) {
        // HTML工件：text模式显示源码，markdown模式显示HTML预览
        this.viewerPanel.innerHTML = "";
        if (mode === "text") {
          // 显示HTML源码
          const viewer = new TextViewer({ container: this.viewerPanel });
          viewer.render(this.currentTextContent);
          this.currentViewer = viewer;
        } else {
          // 显示HTML预览
          this._renderHtmlViewer({ content: this.currentTextContent });
        }
      } else {
        // 普通文本工件：使用原有逻辑
        this._renderTextContent(this.currentTextContent);
      }
    }
  }

  /**
   * 设置JSON显示模式
   * @param {string} mode - "text" 或 "json"
   */
  setJsonDisplayMode(mode) {
    this.jsonDisplayMode = mode;
    this.jsonModeButtons?.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    
    // 重新渲染JSON内容
    if (this.currentJsonContent !== null || this.currentJsonRaw !== null) {
      this.viewerPanel.innerHTML = "";
      if (mode === "json") {
        this._renderJsonTreeView(this.currentJsonContent);
      } else {
        this._renderJsonTextView(this.currentJsonRaw);
      }
    }
  }

  /**
   * 渲染JSON树状视图
   * @param {any} data - 解析后的JSON数据
   */
  _renderJsonTreeView(data) {
    const viewer = new JSONViewer({ container: this.viewerPanel });
    viewer.render(data);
    this.currentViewer = viewer;
  }

  /**
   * 渲染JSON文本视图
   * @param {string} content - JSON文本内容
   */
  _renderJsonTextView(content) {
    const maxLength = 5000;
    let displayContent = content || "";
    let isTruncated = false;
    
    if (displayContent.length > maxLength) {
      displayContent = displayContent.substring(0, maxLength);
      isTruncated = true;
    }
    
    const wrapper = document.createElement("div");
    wrapper.className = "json-text-viewer";
    
    const pre = document.createElement("pre");
    pre.className = "json-text-content";
    pre.textContent = displayContent;
    wrapper.appendChild(pre);
    
    if (isTruncated) {
      const truncateInfo = document.createElement("div");
      truncateInfo.className = "json-truncate-info";
      truncateInfo.textContent = `内容已截断，共 ${content.length} 字符，显示前 ${maxLength} 字符`;
      wrapper.appendChild(truncateInfo);
    }
    
    this.viewerPanel.appendChild(wrapper);
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
            // 如果 API 已经返回了元信息，直接使用
            if (artifact.type) {
              const isImage = this._isImageType(artifact.type);
              return {
                ...artifact,
                content: isImage ? artifact.filename : null,
                actualFilename: artifact.filename,
                isWorkspaceFile: false
              };
            }
            
            // JSON 文件：读取内部的业务 type（兼容旧格式）
            if (artifact.extension === ".json") {
              const detail = await this.api.get(`/artifacts/${artifact.id}`);
              return {
                ...artifact,
                type: detail.type || "unknown",
                content: detail.content,
                actualFilename: detail.meta?.name || detail.meta?.filename || detail.meta?.title || artifact.filename || `${detail.type || "artifact"}_${artifact.id.slice(0, 8)}`,
                isWorkspaceFile: false
              };
            }
            // 非 JSON 文件：使用文件扩展名作为类型
            const extType = artifact.extension.replace(".", "").toLowerCase();
            return {
              ...artifact,
              type: extType || "file",
              content: artifact.filename, // 文件名作为内容引用
              actualFilename: artifact.filename,
              isWorkspaceFile: false
            };
          } catch (e) {
            return {
              ...artifact,
              type: artifact.extension?.replace(".", "") || "unknown",
              actualFilename: artifact.filename,
              isWorkspaceFile: false
            };
          }
        })
      );
      
      // 按创建时间降序排列（新的在前）
      this.artifacts = artifactsWithDetails.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      // 更新工件数量
      this.artifactsCountEl.textContent = this.artifacts.length;
      
      this._applyFilters();
      this.logger.log("工件加载完成", { count: this.artifacts.length });
    } catch (err) {
      this.logger.error("加载工件失败", err);
      this.listPanel.innerHTML = '<div class="empty-state error">加载工件失败</div>';
    }
    
    // 同时加载工作空间列表
    this.loadWorkspaces();
  }

  /**
   * 应用搜索和过滤
   */
  _applyFilters() {
    // 根据当前模式选择数据源
    const sourceData = this.sidebarMode === "workspace" ? this.workspaceFiles : this.artifacts;
    
    const filtered = sourceData.filter(item => {
      const displayName = item.actualFilename || item.filename || item.name;
      
      // 搜索过滤
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        const nameMatch = displayName.toLowerCase().includes(query);
        const typeMatch = (item.type || "").toLowerCase().includes(query);
        const pathMatch = (item.path || "").toLowerCase().includes(query);
        if (!nameMatch && !typeMatch && !pathMatch) {
          return false;
        }
      }

      // 扩展名过滤
      if (this.extensionFilters.size > 0) {
        const type = (item.type || "").toLowerCase();
        const content = item.content;
        const isImage = this._isImageType(type);
        const isText = typeof content === "string";
        const isJson = typeof content === "object" && content !== null;
        
        // 对于工作空间文件，使用扩展名判断
        const ext = (item.extension || "").toLowerCase().replace(".", "");
        
        if (!Array.from(this.extensionFilters).some(filter => {
          if (filter === "image") return isImage || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
          if (filter === "json") return (isJson && !isText) || ext === "json";
          if (filter === "txt") return isText || ext === "txt";
          if (filter === "md") return ext === "md" || type === "markdown";
          return type.includes(filter) || ext === filter;
        })) {
          return false;
        }
      }

      return true;
    });

    if (this.sidebarMode === "workspace") {
      this.filteredWorkspaceFiles = filtered;
    } else {
      this.filteredArtifacts = filtered;
    }

    this._renderList();
    
    // 如果查看器打开且正在查看图片，更新图片导航
    if (this.isViewerOpen && this.selectedArtifact && this._isImageType(this.selectedArtifact.type)) {
      this._updateImageNavigation();
    }
  }

  /**
   * 渲染工件列表
   */
  _renderList() {
    const items = this.sidebarMode === "workspace" ? this.filteredWorkspaceFiles : this.filteredArtifacts;
    const sourceData = this.sidebarMode === "workspace" ? this.workspaceFiles : this.artifacts;
    
    if (items.length === 0) {
      // 区分是过滤后为空还是本身就没有数据
      if (sourceData.length === 0) {
        const emptyText = this.sidebarMode === "workspace" ? "暂无文件" : "暂无工件";
        this.listPanel.innerHTML = `<div class="empty-state">${emptyText}</div>`;
      } else {
        this.listPanel.innerHTML = '<div class="empty-state">没有找到匹配的项目</div>';
      }
      return;
    }

    if (this.viewMode === "icon") {
      this._renderIconView(items);
    } else {
      this._renderDetailView(items);
    }

    // 附加点击事件
    this.listPanel.querySelectorAll(".artifact-item").forEach(item => {
      item.addEventListener("dblclick", () => {
        const id = item.dataset.id;
        const targetItem = items.find(a => a.id === id);
        if (targetItem) {
          this.openArtifact(targetItem);
        }
      });
    });

    // 附加来源按钮点击事件
    this.listPanel.querySelectorAll(".artifact-source-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation(); // 阻止冒泡，避免触发双击打开
        const id = btn.dataset.id;
        const targetItem = items.find(a => a.id === id);
        if (targetItem) {
          if (targetItem.isWorkspaceFile) {
            // 工作空间文件：使用文件的元信息
            if (targetItem.messageId) {
              this.navigateToSourceMessage(targetItem.messageId, targetItem.agentId);
            } else {
              if (window.Toast) window.Toast.warning("该文件没有关联的来源消息");
            }
          } else {
            // 普通工件
            await this._navigateToArtifactSource(id);
          }
        }
      });
    });
  }

  /**
   * 渲染图标视图
   */
  _renderIconView(items) {
    this.listPanel.innerHTML = items.map(item => {
      const type = item.type || "unknown";
      const displayName = item.actualFilename || item.filename || item.name;
      const isImage = this._isImageType(type);
      const hasSource = item.messageId || (!item.isWorkspaceFile);
      const sourceBtn = hasSource ? `<button class="artifact-source-btn" data-id="${item.id}" title="跳转到来源消息">↗</button>` : '';
      
      // 图片类型显示缩略图
      if (isImage && item.content) {
        const imageUrl = item.isWorkspaceFile 
          ? `/workspace-files/${item.workspaceId}/${item.path}`
          : this._getImageUrl(item.content);
        return `
          <div class="artifact-item" data-id="${item.id}" title="${this._escapeHtml(displayName)}">
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
        <div class="artifact-item" data-id="${item.id}" title="${this._escapeHtml(displayName)}">
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
  _renderDetailView(items) {
    this.listPanel.innerHTML = `
      <div class="artifact-detail-header">
        <span class="col-name">名称</span>
        <span class="col-type">类型</span>
        <span class="col-size">大小</span>
        <span class="col-date">修改时间</span>
        <span class="col-action"></span>
      </div>
    ` + items.map(item => {
      const type = item.type || "unknown";
      const icon = this._getFileIconByType(type);
      const displayName = item.actualFilename || item.filename || item.name;
      const hasSource = item.messageId || (!item.isWorkspaceFile);
      return `
        <div class="artifact-item" data-id="${item.id}">
          <span class="col-name">
            <span class="artifact-icon-small">${icon}</span>
            ${this._escapeHtml(displayName)}
          </span>
          <span class="col-type">${type}</span>
          <span class="col-size">${this._formatSize(item.size)}</span>
          <span class="col-date">${new Date(item.createdAt || item.modifiedAt).toLocaleString()}</span>
          <span class="col-action">
            ${hasSource ? `<button class="artifact-source-btn" data-id="${item.id}" title="跳转到来源消息">↗</button>` : ''}
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
    const imageTypes = ["image", "png", "jpg", "jpeg", "gif", "webp", "screenshot", "svg"];
    // 已知的代码类型
    const codeTypes = ["javascript", "js", "typescript", "ts", "html", "css", "python", "py", "java", "c", "cpp", "go", "rust", "ruby", "php"];
    
    const lowerType = (type || "").toLowerCase();
    
    if (jsonTypes.includes(lowerType)) return "📄";
    if (textTypes.includes(lowerType)) return "📝";
    if (imageTypes.includes(lowerType)) return "🖼️";
    if (codeTypes.includes(lowerType)) return "💻";
    if (lowerType === "html") return "🌐";
    if (lowerType === "css") return "🎨";
    
    // 默认显示为文档图标
    return "📋";
  }

  /**
   * 检查是否为图片类型
   */
  _isImageType(type) {
    const imageTypes = ["image", "png", "jpg", "jpeg", "gif", "webp", "screenshot", "svg"];
    return imageTypes.includes((type || "").toLowerCase());
  }

  /**
   * 根据工件类型和内容获取查看器类型
   */
  _getViewerType(type, content) {
    const lowerType = (type || "").toLowerCase();
    
    // 图片类型
    if (this._isImageType(lowerType)) return "image";
    
    // HTML 类型使用 iframe 查看器（支持 "html" 和 "text/html" MIME类型）
    if (lowerType === "html" || lowerType === "text/html") return "html";
    
    // JSON 类型检查：通过 type 或 MIME 类型判断
    if (lowerType === "json" || lowerType === "application/json") {
      return "json";
    }
    
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
      const displayName = artifact.actualFilename || artifact.filename || artifact.name;
      this.artifactNameSpan.textContent = displayName;
      this.isViewerOpen = true;
      this.viewerModal?.classList.remove("hidden");
      this.viewerPanel.innerHTML = '<div class="empty-state">加载中...</div>';

      let fullArtifact;
      let metadata = {};
      
      if (artifact.isWorkspaceFile) {
        // 工作空间文件：通过工作空间 API 加载
        const response = await this.api.get(`/workspaces/${artifact.workspaceId}/file?path=${encodeURIComponent(artifact.path)}`);
        fullArtifact = {
          id: artifact.id,
          type: artifact.type,
          content: response.content,
          meta: response.meta
        };
        metadata = {
          messageId: response.messageId,
          agentId: response.agentId
        };
      } else {
        // 普通工件
        const isImage = this._isImageType(artifact.type);
        
        if (isImage) {
          // 图片类型：不需要通过 API 加载内容，直接使用文件名
          // 图片会通过 /artifacts/ 路径直接加载
          fullArtifact = {
            id: artifact.id,
            type: artifact.type,
            content: artifact.filename, // 使用文件名作为内容引用
            extension: artifact.extension
          };
        } else {
          // 非图片类型：通过 API 加载内容
          fullArtifact = await this.api.get(`/artifacts/${artifact.id}`);
        }
        // 加载元数据
        metadata = await this.api.get(`/artifacts/${artifact.id}/metadata`);
      }
      
      this.selectedArtifact.messageId = metadata.messageId;
      this.selectedArtifact.agentId = metadata.agentId;

      // 显示"查看来源"按钮
      if (metadata.messageId) {
        this.viewSourceBtn.style.display = "inline-block";
      } else {
        this.viewSourceBtn.style.display = "none";
      }

      // 更新图片导航状态
      this._updateImageNavigation();

      // 选择合适的查看器（基于 type 和 content）
      const viewerType = this._getViewerType(fullArtifact.type, fullArtifact.content);
      this._displayArtifact(fullArtifact, viewerType);

      this.logger.log("工件已打开", { id: artifact.id, type: fullArtifact.type, viewerType, isWorkspaceFile: artifact.isWorkspaceFile });
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
    
    // 重置 viewerPanel 的样式
    this.viewerPanel.style.display = "";
    this.viewerPanel.style.flexDirection = "";
    this.viewerPanel.style.height = "";
    
    this.textModeToggle.style.display = "none";
    this.jsonModeToggle.style.display = "none";
    this.currentTextContent = null;
    this.currentJsonContent = null;
    this.currentJsonRaw = null;

    if (viewerType === "json") {
      // 使用JSON解析器处理可能的双重编码
      const parseResult = window.JsonParser 
        ? window.JsonParser.parseJsonContent(artifact.content)
        : { data: artifact.content, isValid: true };
      
      // 保存解析后的JSON内容
      this.currentJsonContent = parseResult.data;
      this.currentJsonRaw = typeof artifact.content === "string" 
        ? artifact.content 
        : JSON.stringify(artifact.content, null, 2);
      
      // 如果解析后是对象，格式化为字符串用于文本视图
      if (typeof this.currentJsonContent === "object" && this.currentJsonContent !== null) {
        this.currentJsonRaw = JSON.stringify(this.currentJsonContent, null, 2);
      }
      
      // 显示JSON模式切换按钮
      this.jsonModeToggle.style.display = "flex";
      
      // 根据当前模式渲染
      if (this.jsonDisplayMode === "json") {
        this._renderJsonTreeView(this.currentJsonContent);
      } else {
        this._renderJsonTextView(this.currentJsonRaw);
      }
    } else if (viewerType === "text") {
      // 显示文本模式切换按钮
      this.textModeToggle.style.display = "flex";
      // 更新按钮标签为普通文本模式
      this._updateTextModeButtonLabels("纯文本", "Markdown");
      this.currentTextContent = typeof artifact.content === "string" 
        ? artifact.content 
        : JSON.stringify(artifact.content, null, 2);
      this._renderTextContent(this.currentTextContent);
    } else if (viewerType === "image") {
      // 设置 viewerPanel 为 flex 容器（垂直布局）
      this.viewerPanel.style.display = "flex";
      this.viewerPanel.style.flexDirection = "column";
      this.viewerPanel.style.height = "100%";
      
      // 创建图片查看器容器
      const imageContainer = document.createElement("div");
      imageContainer.className = "image-viewer-container";
      imageContainer.style.position = "relative";
      imageContainer.style.flex = "1";
      imageContainer.style.overflow = "hidden";
      imageContainer.style.minHeight = "0";  // 重要：允许 flex 子元素缩小
      imageContainer.style.padding = "0";    // 移除 padding，避免影响布局
      
      // 渲染图片
      const viewer = new ImageViewer({ 
        container: imageContainer,
        showNavigation: false  // 不使用 ImageViewer 自带的导航
      });
      viewer.render(artifact.content);
      this.currentViewer = viewer;
      
      // 添加左右箭头按钮（只在多张图片时显示）
      if (this.imageList.length > 1) {
        const arrows = this._createNavigationArrows();
        imageContainer.appendChild(arrows);
        
        // 添加滚轮事件监听，用于切换图片
        imageContainer.addEventListener("wheel", (e) => {
          e.preventDefault();
          if (e.deltaY > 0) {
            // 向下滚动，显示下一张
            this._navigateToNextImage();
          } else {
            // 向上滚动，显示上一张
            this._navigateToPreviousImage();
          }
        }, { passive: false });
      }
      
      this.viewerPanel.appendChild(imageContainer);
      
      // 添加缩略图导航栏（只在多张图片时显示）
      if (this.imageList.length > 1) {
        const thumbnailContainer = document.createElement("div");
        thumbnailContainer.className = "thumbnail-navigator-container";
        this.viewerPanel.appendChild(thumbnailContainer);
        
        this.thumbnailNavigator = new ThumbnailNavigator({
          container: thumbnailContainer,
          images: this.imageList,
          currentIndex: this.currentImageIndex,
          thumbnailHeight: 80,
          onSelect: (index) => {
            this._navigateToImage(index);
          }
        });
        this.thumbnailNavigator.render();
      }
    } else if (viewerType === "html") {
      // HTML 文件：支持文本/HTML切换
      // 保存HTML源码
      this.currentTextContent = typeof artifact.content === "string" 
        ? artifact.content 
        : "";
      
      // 显示文本模式切换按钮（用于HTML/文本切换）
      this.textModeToggle.style.display = "flex";
      // 更新按钮标签为HTML模式
      this._updateTextModeButtonLabels("源码", "预览");
      
      // 根据当前模式渲染
      if (this.textDisplayMode === "text") {
        // 文本模式：显示HTML源码
        this._renderTextContent(this.currentTextContent);
      } else {
        // Markdown模式：用作HTML预览模式
        this._renderHtmlViewer(artifact);
      }
    } else {
      this.viewerPanel.innerHTML = `<div class="empty-state error">不支持的文件类型: ${artifact.type || "unknown"}</div>`;
    }
  }

  /**
   * 更新文本模式切换按钮的标签
   * @param {string} textLabel - 文本模式的标签
   * @param {string} markdownLabel - Markdown/预览模式的标签
   */
  _updateTextModeButtonLabels(textLabel, markdownLabel) {
    this.textModeButtons?.forEach(btn => {
      if (btn.dataset.mode === "text") {
        btn.textContent = textLabel;
      } else if (btn.dataset.mode === "markdown") {
        btn.textContent = markdownLabel;
      }
    });
  }

  /**
   * 渲染 HTML 查看器（使用 iframe）
   * 支持两种方式：
   * 1. 工作空间文件：通过文件路径加载
   * 2. 普通工件：通过文件名加载，或使用srcdoc加载HTML内容
   */
  _renderHtmlViewer(artifact) {
    const wrapper = document.createElement("div");
    wrapper.className = "html-viewer-wrapper";
    
    // 创建 iframe
    const iframe = document.createElement("iframe");
    iframe.className = "html-viewer-iframe";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
    iframe.setAttribute("title", artifact.actualFilename || artifact.filename || "HTML Preview");
    
    // 添加加载状态
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "html-viewer-loading";
    loadingOverlay.textContent = "加载中...";
    
    // 判断加载方式
    if (this.selectedArtifact?.isWorkspaceFile) {
      // 工作空间文件：通过文件路径加载
      const htmlUrl = `/workspace-files/${this.selectedArtifact.workspaceId}/${this.selectedArtifact.path}`;
      iframe.src = htmlUrl;
    } else if (typeof artifact.content === "string" && artifact.content.includes("<")) {
      // 普通工件且content是HTML源码：使用srcdoc直接加载
      iframe.srcdoc = artifact.content;
      // srcdoc加载很快，直接隐藏加载提示
      setTimeout(() => {
        loadingOverlay.style.display = "none";
      }, 100);
    } else {
      // 普通工件且content是文件名：通过URL加载
      const htmlUrl = `/artifacts/${artifact.content || artifact.filename || this.selectedArtifact.filename}`;
      iframe.src = htmlUrl;
    }
    
    // iframe加载事件
    iframe.addEventListener("load", () => {
      loadingOverlay.style.display = "none";
    });
    
    iframe.addEventListener("error", () => {
      loadingOverlay.textContent = "加载失败";
      loadingOverlay.classList.add("error");
    });
    
    wrapper.appendChild(loadingOverlay);
    wrapper.appendChild(iframe);
    this.viewerPanel.appendChild(wrapper);
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
   * @param {string} messageId - 消息 ID
   * @param {string} [agentId] - 智能体 ID（可选，如果提供则直接跳转到该智能体）
   */
  navigateToSourceMessage(messageId, agentId = null) {
    this.hide();
    const event = new CustomEvent("navigateToMessage", { detail: { messageId, agentId } });
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
      if (metadata?.agentId) {
        // 优先使用 agentId 直接跳转到智能体
        this.navigateToSourceMessage(metadata.messageId, metadata.agentId);
      } else if (metadata?.messageId) {
        // 兼容旧数据：只有 messageId 时通过搜索查找智能体
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

  // ========== 图片导航相关方法 ==========

  /**
   * 获取过滤后的图片列表
   * 根据当前模式（工件/工作空间）和过滤条件获取所有图片
   * @returns {Array} 图片列表
   */
  _getFilteredImages() {
    // 根据当前模式选择数据源
    const sourceData = this.sidebarMode === "workspace" 
      ? this.filteredWorkspaceFiles 
      : this.filteredArtifacts;
    
    // 只保留图片类型
    return sourceData.filter(item => {
      const type = (item.type || "").toLowerCase();
      return this._isImageType(type);
    });
  }

  /**
   * 更新图片导航状态
   * 在图片列表或过滤条件变化后调用
   */
  _updateImageNavigation() {
    // 获取最新的图片列表
    this.imageList = this._getFilteredImages();
    
    // 如果当前工件是图片，找到它的索引
    if (this.selectedArtifact && this._isImageType(this.selectedArtifact.type)) {
      this.currentImageIndex = this.imageList.findIndex(
        img => img.id === this.selectedArtifact.id
      );
    } else {
      this.currentImageIndex = -1;
    }
    
    // 更新缩略图导航器
    if (this.thumbnailNavigator && this.imageList.length > 0) {
      this.thumbnailNavigator.setImages(this.imageList);
      if (this.currentImageIndex >= 0) {
        this.thumbnailNavigator.setCurrentIndex(this.currentImageIndex);
      }
    }
  }

  /**
   * 切换到指定索引的图片
   * @param {number} index - 目标图片索引
   */
  async _navigateToImage(index) {
    // 边界检查
    if (index < 0 || index >= this.imageList.length) {
      return;
    }
    
    // 获取目标图片
    const targetImage = this.imageList[index];
    if (!targetImage) return;
    
    // 更新当前索引
    this.currentImageIndex = index;
    
    // 更新选中的工件
    this.selectedArtifact = targetImage;
    
    // 更新查看器标题
    const displayName = targetImage.actualFilename || targetImage.filename || targetImage.name;
    this.artifactNameSpan.textContent = displayName;
    
    // 加载并显示图片
    try {
      let fullArtifact;
      let metadata = {};
      
      if (targetImage.isWorkspaceFile) {
        // 工作空间文件
        const response = await this.api.get(
          `/workspaces/${targetImage.workspaceId}/file?path=${encodeURIComponent(targetImage.path)}`
        );
        fullArtifact = {
          id: targetImage.id,
          type: targetImage.type,
          content: response.content,
          meta: response.meta
        };
        metadata = {
          messageId: response.messageId,
          agentId: response.agentId
        };
      } else {
        // 普通工件
        fullArtifact = {
          id: targetImage.id,
          type: targetImage.type,
          content: targetImage.filename,
          extension: targetImage.extension
        };
        metadata = await this.api.get(`/artifacts/${targetImage.id}/metadata`);
      }
      
      // 更新元数据
      this.selectedArtifact.messageId = metadata.messageId;
      this.selectedArtifact.agentId = metadata.agentId;
      
      // 更新"查看来源"按钮
      if (metadata.messageId) {
        this.viewSourceBtn.style.display = "inline-block";
      } else {
        this.viewSourceBtn.style.display = "none";
      }
      
      // 重新渲染图片查看器
      this._displayArtifact(fullArtifact, "image");
      
      // 更新缩略图导航器
      if (this.thumbnailNavigator) {
        this.thumbnailNavigator.setCurrentIndex(index);
        this.thumbnailNavigator.scrollToCurrent();
      }
      
    } catch (err) {
      this.logger.error("切换图片失败", err);
      if (window.Toast) {
        window.Toast.error("切换图片失败");
      }
    }
  }

  /**
   * 切换到上一张图片
   * 支持循环切换（第一张 → 最后一张）
   */
  _navigateToPreviousImage() {
    if (this.imageList.length === 0) return;
    
    // 循环：第一张 → 最后一张
    const newIndex = this.currentImageIndex === 0 
      ? this.imageList.length - 1 
      : this.currentImageIndex - 1;
    
    this._navigateToImage(newIndex);
  }

  /**
   * 切换到下一张图片
   * 支持循环切换（最后一张 → 第一张）
   */
  _navigateToNextImage() {
    if (this.imageList.length === 0) return;
    
    // 循环：最后一张 → 第一张
    const newIndex = this.currentImageIndex === this.imageList.length - 1 
      ? 0 
      : this.currentImageIndex + 1;
    
    this._navigateToImage(newIndex);
  }

  /**
   * 处理图片导航键盘事件
   * @param {KeyboardEvent} event - 键盘事件
   */
  _handleImageNavigationKeys(event) {
    // 只在查看器打开且查看图片时响应
    if (!this.isViewerOpen || !this.selectedArtifact) {
      return;
    }
    
    // 检查是否为图片类型
    if (!this._isImageType(this.selectedArtifact.type)) {
      return;
    }
    
    // 检查是否有多张图片
    if (this.imageList.length <= 1) {
      return;
    }
    
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this._navigateToPreviousImage();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this._navigateToNextImage();
    }
  }

  /**
   * 创建导航箭头按钮
   * @returns {HTMLElement} 箭头容器元素
   */
  _createNavigationArrows() {
    const arrows = document.createElement("div");
    arrows.className = "image-navigation-arrows";
    arrows.innerHTML = `
      <button class="nav-arrow nav-arrow-left" title="上一张 (←)">
        <span>‹</span>
      </button>
      <button class="nav-arrow nav-arrow-right" title="下一张 (→)">
        <span>›</span>
      </button>
    `;
    
    // 绑定事件
    const leftArrow = arrows.querySelector(".nav-arrow-left");
    const rightArrow = arrows.querySelector(".nav-arrow-right");
    
    leftArrow.addEventListener("click", () => {
      this._navigateToPreviousImage();
    });
    
    rightArrow.addEventListener("click", () => {
      this._navigateToNextImage();
    });
    
    return arrows;
  }

  // ========== 窗口控制相关方法 ==========

  /**
   * 附加窗口控制事件监听器
   * 包括拖拽移动、调整大小、位置控制等功能
   */
  _attachWindowControlEvents() {
    // 窗口位置控制按钮
    this.dockLeftBtn?.addEventListener("click", () => {
      this.dockToLeft();
    });

    this.dockRightBtn?.addEventListener("click", () => {
      this.dockToRight();
    });

    this.centerBtn?.addEventListener("click", () => {
      this.centerWindow();
    });

    // 标题栏拖拽移动
    this.headerEl?.addEventListener("mousedown", (e) => {
      this._startDragging(e);
    });

    // 添加调整大小的拖拽区域
    this._createResizeHandles();

    // 全局鼠标事件
    document.addEventListener("mousemove", (e) => {
      this._handleMouseMove(e);
    });

    document.addEventListener("mouseup", (e) => {
      this._handleMouseUp(e);
    });

    // 防止拖拽时选中文本
    this.headerEl?.addEventListener("selectstart", (e) => {
      if (this.isDragging) {
        e.preventDefault();
      }
    });
  }

  /**
   * 创建调整大小的拖拽区域
   * 在窗口四个角和四条边添加不可见的拖拽手柄
   */
  _createResizeHandles() {
    if (!this.windowEl) return;

    // 创建调整大小手柄的HTML
    const resizeHandles = `
      <div class="resize-handle resize-n" data-direction="n"></div>
      <div class="resize-handle resize-s" data-direction="s"></div>
      <div class="resize-handle resize-e" data-direction="e"></div>
      <div class="resize-handle resize-w" data-direction="w"></div>
      <div class="resize-handle resize-ne" data-direction="ne"></div>
      <div class="resize-handle resize-nw" data-direction="nw"></div>
      <div class="resize-handle resize-se" data-direction="se"></div>
      <div class="resize-handle resize-sw" data-direction="sw"></div>
    `;

    // 添加到窗口元素
    this.windowEl.insertAdjacentHTML("beforeend", resizeHandles);

    // 绑定调整大小事件
    this.windowEl.querySelectorAll(".resize-handle").forEach(handle => {
      handle.addEventListener("mousedown", (e) => {
        this._startResizing(e, handle.dataset.direction);
      });
    });
  }

  /**
   * 开始拖拽窗口
   * @param {MouseEvent} e - 鼠标事件
   */
  _startDragging(e) {
    if (this.isMaximized) return; // 最大化状态不允许拖拽

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    // 获取窗口当前位置
    const rect = this.windowEl.getBoundingClientRect();
    this.windowStartX = rect.left;
    this.windowStartY = rect.top;

    // 添加拖拽样式
    this.windowEl.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";

    e.preventDefault();
  }

  /**
   * 开始调整窗口大小
   * @param {MouseEvent} e - 鼠标事件
   * @param {string} direction - 调整方向
   */
  _startResizing(e, direction) {
    if (this.isMaximized) return; // 最大化状态不允许调整大小

    this.isResizing = true;
    this.resizeDirection = direction;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;

    // 获取窗口当前尺寸和位置
    const rect = this.windowEl.getBoundingClientRect();
    this.windowStartX = rect.left;
    this.windowStartY = rect.top;
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;

    // 添加调整大小样式
    this.windowEl.classList.add("resizing");
    document.body.style.userSelect = "none";
    document.body.style.cursor = this._getResizeCursor(direction);

    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * 处理鼠标移动事件
   * @param {MouseEvent} e - 鼠标事件
   */
  _handleMouseMove(e) {
    if (this.isDragging) {
      this._handleDragging(e);
    } else if (this.isResizing) {
      this._handleResizing(e);
    }
  }

  /**
   * 处理窗口拖拽
   * @param {MouseEvent} e - 鼠标事件
   */
  _handleDragging(e) {
    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    const newX = this.windowStartX + deltaX;
    const newY = this.windowStartY + deltaY;

    // 限制窗口不能拖出屏幕边界
    const maxX = window.innerWidth - 100; // 至少保留100px可见
    const maxY = window.innerHeight - 50; // 至少保留50px可见
    const minX = -this.windowEl.offsetWidth + 100;
    const minY = 0;

    const constrainedX = Math.max(minX, Math.min(maxX, newX));
    const constrainedY = Math.max(minY, Math.min(maxY, newY));

    this.windowEl.style.left = constrainedX + "px";
    this.windowEl.style.top = constrainedY + "px";
    this.windowEl.style.transform = "none";
  }

  /**
   * 处理窗口大小调整
   * @param {MouseEvent} e - 鼠标事件
   */
  _handleResizing(e) {
    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;

    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let newX = this.windowStartX;
    let newY = this.windowStartY;

    // 最小尺寸限制
    const minWidth = 400;
    const minHeight = 300;

    // 根据调整方向计算新的尺寸和位置
    switch (this.resizeDirection) {
      case "n":
        newHeight = this.resizeStartHeight - deltaY;
        newY = this.windowStartY + deltaY;
        break;
      case "s":
        newHeight = this.resizeStartHeight + deltaY;
        break;
      case "e":
        newWidth = this.resizeStartWidth + deltaX;
        break;
      case "w":
        newWidth = this.resizeStartWidth - deltaX;
        newX = this.windowStartX + deltaX;
        break;
      case "ne":
        newWidth = this.resizeStartWidth + deltaX;
        newHeight = this.resizeStartHeight - deltaY;
        newY = this.windowStartY + deltaY;
        break;
      case "nw":
        newWidth = this.resizeStartWidth - deltaX;
        newHeight = this.resizeStartHeight - deltaY;
        newX = this.windowStartX + deltaX;
        newY = this.windowStartY + deltaY;
        break;
      case "se":
        newWidth = this.resizeStartWidth + deltaX;
        newHeight = this.resizeStartHeight + deltaY;
        break;
      case "sw":
        newWidth = this.resizeStartWidth - deltaX;
        newHeight = this.resizeStartHeight + deltaY;
        newX = this.windowStartX + deltaX;
        break;
    }

    // 应用最小尺寸限制
    if (newWidth < minWidth) {
      if (this.resizeDirection.includes("w")) {
        newX = this.windowStartX + (this.resizeStartWidth - minWidth);
      }
      newWidth = minWidth;
    }

    if (newHeight < minHeight) {
      if (this.resizeDirection.includes("n")) {
        newY = this.windowStartY + (this.resizeStartHeight - minHeight);
      }
      newHeight = minHeight;
    }

    // 限制窗口不能超出屏幕边界
    const maxWidth = window.innerWidth - newX;
    const maxHeight = window.innerHeight - newY;

    newWidth = Math.min(newWidth, maxWidth);
    newHeight = Math.min(newHeight, maxHeight);

    // 应用新的尺寸和位置
    this.windowEl.style.width = newWidth + "px";
    this.windowEl.style.height = newHeight + "px";
    this.windowEl.style.left = newX + "px";
    this.windowEl.style.top = newY + "px";
    this.windowEl.style.transform = "none";
  }

  /**
   * 处理鼠标释放事件
   * @param {MouseEvent} e - 鼠标事件
   */
  _handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.windowEl.classList.remove("dragging");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    if (this.isResizing) {
      this.isResizing = false;
      this.resizeDirection = null;
      this.windowEl.classList.remove("resizing");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }

  /**
   * 获取调整大小时的鼠标样式
   * @param {string} direction - 调整方向
   * @returns {string} CSS cursor 值
   */
  _getResizeCursor(direction) {
    const cursors = {
      "n": "n-resize",
      "s": "s-resize",
      "e": "e-resize",
      "w": "w-resize",
      "ne": "ne-resize",
      "nw": "nw-resize",
      "se": "se-resize",
      "sw": "sw-resize"
    };
    return cursors[direction] || "default";
  }

  /**
   * 将窗口停靠到左侧
   * 窗口占据屏幕左半部分，底部留出空间显示输入框
   */
  dockToLeft() {
    if (this.isMaximized) {
      this.toggleMaximize(); // 先退出最大化
    }

    const padding = 20;
    const bottomSpace = 120; // 底部留出空间给输入框
    const width = (window.innerWidth / 2) - (padding * 1.5);
    const height = window.innerHeight - (padding * 2) - bottomSpace;

    this.windowEl.style.left = padding + "px";
    this.windowEl.style.top = padding + "px";
    this.windowEl.style.width = width + "px";
    this.windowEl.style.height = height + "px";
    this.windowEl.style.transform = "none";
  }

  /**
   * 将窗口停靠到右侧
   * 窗口占据屏幕右半部分，底部留出空间显示输入框
   */
  dockToRight() {
    if (this.isMaximized) {
      this.toggleMaximize(); // 先退出最大化
    }

    const padding = 20;
    const bottomSpace = 120; // 底部留出空间给输入框
    const width = (window.innerWidth / 2) - (padding * 1.5);
    const height = window.innerHeight - (padding * 2) - bottomSpace;
    const left = (window.innerWidth / 2) + (padding / 2);

    this.windowEl.style.left = left + "px";
    this.windowEl.style.top = padding + "px";
    this.windowEl.style.width = width + "px";
    this.windowEl.style.height = height + "px";
    this.windowEl.style.transform = "none";
  }

  /**
   * 将窗口居中显示
   * 恢复到默认大小并居中
   */
  centerWindow() {
    if (this.isMaximized) {
      this.toggleMaximize(); // 先退出最大化
    }

    const defaultWidth = 800;
    const defaultHeight = 600;

    this.windowEl.style.width = defaultWidth + "px";
    this.windowEl.style.height = defaultHeight + "px";
    this.windowEl.style.left = "50%";
    this.windowEl.style.top = "50%";
    this.windowEl.style.transform = "translate(-50%, -50%)";
  }
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = ArtifactManager;
}
