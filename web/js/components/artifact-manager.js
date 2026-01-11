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
    
    // UI组件
    this.listPanel = null;
    this.viewerPanel = null;
    this.searchInput = null;
    this.currentViewer = null;
    this.sidebarPanel = null;
    
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
    this.textModeToggle = this.container.querySelector(".text-mode-toggle");
    this.textModeButtons = this.container.querySelectorAll(".text-mode-btn");
    this.copyArtifactBtn = this.container.querySelector(".copy-artifact-btn");
    this.downloadArtifactBtn = this.container.querySelector(".download-artifact-btn");
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
                actualFilename: detail.meta?.filename || detail.meta?.name || detail.meta?.title || `${detail.type || "artifact"}_${artifact.id.slice(0, 8)}`,
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
    
    // HTML 类型使用 iframe 查看器
    if (lowerType === "html") return "html";
    
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
    } else if (viewerType === "html") {
      // HTML 文件使用 iframe 预览
      this._renderHtmlViewer(artifact);
    } else {
      this.viewerPanel.innerHTML = `<div class="empty-state error">不支持的文件类型: ${artifact.type || "unknown"}</div>`;
    }
  }

  /**
   * 渲染 HTML 查看器（使用 iframe）
   */
  _renderHtmlViewer(artifact) {
    const wrapper = document.createElement("div");
    wrapper.className = "html-viewer-wrapper";
    
    // 创建 iframe
    const iframe = document.createElement("iframe");
    iframe.className = "html-viewer-iframe";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
    iframe.setAttribute("title", artifact.actualFilename || artifact.filename || "HTML Preview");
    
    // 获取 HTML 文件的 URL
    let htmlUrl;
    if (this.selectedArtifact?.isWorkspaceFile) {
      // 工作空间文件
      htmlUrl = `/workspace-files/${this.selectedArtifact.workspaceId}/${this.selectedArtifact.path}`;
    } else {
      // 普通工件
      htmlUrl = `/artifacts/${artifact.content || artifact.filename}`;
    }
    
    iframe.src = htmlUrl;
    
    // 添加加载状态
    const loadingOverlay = document.createElement("div");
    loadingOverlay.className = "html-viewer-loading";
    loadingOverlay.textContent = "加载中...";
    
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
    
    // 保存当前文本内容以便复制（HTML 源码）
    if (typeof artifact.content === "string" && artifact.content.includes("<")) {
      this.currentTextContent = artifact.content;
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
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = ArtifactManager;
}
