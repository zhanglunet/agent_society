/**
 * 模块管理面板组件
 * 显示所有已加载模块，提供统一的模块管理入口
 */

const ModulesPanel = {
  // 组件状态
  modules: [],
  selectedModule: null,
  moduleComponents: new Map(), // 缓存已加载的模块组件

  // DOM 元素引用
  modulesList: null,
  moduleDetail: null,

  /**
   * 初始化组件
   */
  init() {
    this.modulesList = document.getElementById('modules-list');
    this.moduleDetail = document.getElementById('module-detail');
  },

  /**
   * 显示面板时加载模块列表
   */
  async show() {
    await this.loadModules();
  },

  /**
   * 加载模块列表
   */
  async loadModules() {
    if (!this.modulesList) return;

    this.modulesList.innerHTML = '<div class="loading-state">加载中...</div>';

    try {
      const result = await API.getModules();
      this.modules = result.modules || [];
      this.renderModulesList();
      if (!this.selectedModule && this.modules.length > 0) {
        await this.selectModule(this.modules[0].name);
      }
    } catch (err) {
      console.error('加载模块列表失败:', err);
      this.modulesList.innerHTML = `<div class="error-state">加载失败: ${err.message}</div>`;
    }
  },

  /**
   * 渲染模块列表
   */
  renderModulesList() {
    if (!this.modulesList) return;

    if (this.modules.length === 0) {
      this.modulesList.innerHTML = `
        <div class="empty-state">
          <p>暂无已加载的模块</p>
        </div>
      `;
      return;
    }

    const html = `
      <h3 class="modules-title">已加载模块</h3>
      ${this.modules.map(module => `
        <div class="module-item ${this.selectedModule === module.name ? 'selected' : ''}" 
             onclick="ModulesPanel.selectModule('${module.name}')">
          <div class="module-icon">${this.getModuleIcon(module.name)}</div>
          <div class="module-info">
            <div class="module-name">${this.escapeHtml(module.name)}</div>
            <div class="module-tools">${module.toolCount || 0} 个工具</div>
          </div>
          <div class="module-status ${module.hasWebComponent ? 'has-ui' : ''}">
            ${module.hasWebComponent ? '🖥️' : ''}
          </div>
        </div>
      `).join('')}
    `;

    this.modulesList.innerHTML = html;
  },

  /**
   * 获取模块图标
   */
  getModuleIcon(moduleName) {
    const icons = {
      'chrome': '🌐',
      'ssh': '🖧',
      'file': '📁',
      'database': '🗄️',
      'api': '🔗',
      'default': '🔌'
    };
    return icons[moduleName] || icons.default;
  },

  /**
   * 选择模块
   */
  async selectModule(moduleName) {
    this.selectedModule = moduleName;
    this.renderModulesList();
    await this.loadModuleDetail(moduleName);
  },

  /**
   * 加载模块详情
   */
  async loadModuleDetail(moduleName) {
    if (!this.moduleDetail) return;

    this.moduleDetail.innerHTML = '<div class="loading-state">加载模块界面...</div>';

    try {
      // 获取模块的 Web 组件
      const result = await API.getModuleWebComponent(moduleName);
      
      if (result.error || (!result.html && !result.component)) {
        this.moduleDetail.innerHTML = `
          <div class="module-detail-header">
            <h3>${this.getModuleIcon(moduleName)} ${moduleName}</h3>
          </div>
          <div class="module-no-ui">
            <p>此模块没有管理界面</p>
            <p class="hint">模块提供的工具可在智能体对话中使用</p>
          </div>
        `;
        return;
      }

      // 渲染模块的 Web 组件
      this.renderModuleComponent(moduleName, result);
    } catch (err) {
      console.error('加载模块详情失败:', err);
      this.moduleDetail.innerHTML = `<div class="error-state">加载失败: ${err.message}</div>`;
    }
  },

  /**
   * 渲染模块组件
   */
  renderModuleComponent(moduleName, componentData) {
    if (!this.moduleDetail) return;

    const { html, css, js, displayName } = componentData;
    const title = displayName || moduleName;

    // 构建模块详情 HTML
    let detailHtml = `
      <div class="module-detail-header">
        <h3>${this.getModuleIcon(moduleName)} ${this.escapeHtml(title)}</h3>
        <button class="module-refresh-btn" onclick="ModulesPanel.refreshModule('${moduleName}')">刷新</button>
      </div>
      <div class="module-component-container" id="module-container-${moduleName}">
    `;

    // 添加模块的 CSS（使用 scoped 样式）
    if (css) {
      detailHtml += `<style>${css}</style>`;
    }

    // 添加模块的 HTML
    if (html) {
      detailHtml += html;
    }

    detailHtml += '</div>';

    this.moduleDetail.innerHTML = detailHtml;

    // 执行模块的 JavaScript
    if (js) {
      try {
        // 使用 Function 构造器来执行模块 JS，避免全局污染
        const executeModuleJs = new Function(js);
        executeModuleJs();
        
        // 使用通用初始化机制（不再硬编码模块名）
        this.initModulePanel(moduleName);
      } catch (err) {
        console.error('执行模块脚本失败:', err);
        this.showError(`脚本执行失败: ${err.message}`);
      }
    }
  },

  /**
   * 通用模块面板初始化
   * @param {string} moduleName - 模块名称
   */
  async initModulePanel(moduleName) {
    // 将模块名转换为 PascalCase
    const pascalName = this.toPascalCase(moduleName);
    const panelKey = `ModulePanel_${pascalName}`;
    
    // 查找模块面板对象
    const panel = window[panelKey];
    
    if (panel && typeof panel.init === 'function') {
      try {
        await panel.init();
      } catch (err) {
        console.error(`模块 ${moduleName} 初始化失败:`, err);
        this.showError(`模块初始化失败: ${err.message}`);
      }
    }
    // 如果没有找到面板对象，静默跳过（模块可能不需要交互初始化）
  },

  /**
   * 刷新当前模块
   */
  async refreshModule(moduleName) {
    // 清除缓存
    this.moduleComponents.delete(moduleName);
    await this.loadModuleDetail(moduleName);
  },

  /**
   * 显示错误信息
   * @param {string} message - 错误信息
   */
  showError(message) {
    if (this.moduleDetail) {
      this.moduleDetail.innerHTML += `<div class="error-state">${this.escapeHtml(message)}</div>`;
    }
  },

  /**
   * 将 kebab-case 或 snake_case 转换为 PascalCase
   * @param {string} str - 输入字符串
   * @returns {string} PascalCase 格式的字符串
   */
  toPascalCase(str) {
    if (!str) return '';
    return str
      .split(/[-_]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  },

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 导出供其他模块使用
window.ModulesPanel = ModulesPanel;
