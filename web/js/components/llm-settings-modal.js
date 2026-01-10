/**
 * LLM 设置模态框组件
 * 用于配置默认 LLM 参数和管理 LLM 服务列表
 */

const LlmSettingsModal = {
  // DOM 元素引用
  overlay: null,
  content: null,
  closeBtn: null,
  
  // 表单元素
  baseUrlInput: null,
  modelInput: null,
  apiKeyInput: null,
  maxConcurrentInput: null,
  
  // 服务列表元素
  serviceList: null,
  addServiceBtn: null,
  
  // 服务编辑表单元素
  serviceForm: null,
  serviceIdInput: null,
  serviceNameInput: null,
  serviceBaseUrlInput: null,
  serviceModelInput: null,
  serviceApiKeyInput: null,
  serviceMaxConcurrentInput: null,
  serviceCapabilityTagsInput: null,
  serviceDescriptionInput: null,
  
  // 状态
  isOpen: false,
  errorMessage: null,
  config: null,
  services: [],
  editingServiceId: null, // 正在编辑的服务 ID（null 表示新增）

  /**
   * 初始化组件
   */
  init() {
    this._createModal();
    this._bindEvents();
  },

  /**
   * 创建弹窗 DOM 结构
   */
  _createModal() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'llm-settings-modal';
    this.overlay.className = 'modal-overlay hidden';
    
    this.overlay.innerHTML = `
      <div class="modal-content llm-settings-modal">
        <div class="modal-header">
          <h3>🔧 LLM 设置</h3>
          <button class="modal-close-btn" title="关闭">&times;</button>
        </div>
        <div class="modal-body llm-settings-body">
          <!-- 错误提示 -->
          <div class="llm-settings-error hidden"></div>
          
          <!-- 标签页导航 -->
          <div class="llm-settings-tabs">
            <button class="llm-tab-btn active" data-tab="default">默认配置</button>
            <button class="llm-tab-btn" data-tab="services">服务管理</button>
          </div>
          
          <!-- 默认配置标签页 -->
          <div class="llm-tab-content active" data-tab="default">
            <form id="llm-config-form" class="llm-config-form">
              <div class="form-group">
                <label for="llm-base-url">Base URL <span class="required">*</span></label>
                <input type="text" id="llm-base-url" placeholder="http://127.0.0.1:1234/v1" required>
                <span class="form-error"></span>
              </div>
              <div class="form-group">
                <label for="llm-model">Model <span class="required">*</span></label>
                <input type="text" id="llm-model" placeholder="gpt-4" required>
                <span class="form-error"></span>
              </div>
              <div class="form-group">
                <label for="llm-api-key">API Key</label>
                <input type="password" id="llm-api-key" placeholder="sk-...">
                <span class="form-hint">留空表示不修改</span>
              </div>
              <div class="form-group">
                <label for="llm-max-concurrent">最大并发请求数</label>
                <input type="number" id="llm-max-concurrent" min="1" max="10" value="2">
              </div>
              <div class="form-actions">
                <button type="submit" class="btn-primary">保存配置</button>
              </div>
            </form>
          </div>
          
          <!-- 服务管理标签页 -->
          <div class="llm-tab-content" data-tab="services">
            <div class="llm-services-header">
              <span class="llm-services-count">共 0 个服务</span>
              <button id="add-service-btn" class="btn-secondary">+ 添加服务</button>
            </div>
            <div id="llm-service-list" class="llm-service-list">
              <!-- 服务列表将通过 JavaScript 动态生成 -->
            </div>
            
            <!-- 服务编辑表单（默认隐藏） -->
            <div id="service-form-container" class="service-form-container hidden">
              <h4 id="service-form-title">添加服务</h4>
              <form id="service-form" class="llm-config-form">
                <div class="form-row">
                  <div class="form-group">
                    <label for="service-id">服务 ID <span class="required">*</span></label>
                    <input type="text" id="service-id" placeholder="my-model" required>
                    <span class="form-error"></span>
                  </div>
                  <div class="form-group">
                    <label for="service-name">显示名称 <span class="required">*</span></label>
                    <input type="text" id="service-name" placeholder="我的模型" required>
                    <span class="form-error"></span>
                  </div>
                </div>
                <div class="form-group">
                  <label for="service-base-url">Base URL <span class="required">*</span></label>
                  <input type="text" id="service-base-url" placeholder="https://api.example.com/v1" required>
                  <span class="form-error"></span>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="service-model">Model <span class="required">*</span></label>
                    <input type="text" id="service-model" placeholder="gpt-4" required>
                    <span class="form-error"></span>
                  </div>
                  <div class="form-group">
                    <label for="service-api-key">API Key</label>
                    <input type="password" id="service-api-key" placeholder="sk-...">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="service-max-concurrent">最大并发</label>
                    <input type="number" id="service-max-concurrent" min="1" max="10" value="2">
                  </div>
                  <div class="form-group">
                    <label for="service-capability-tags">能力标签</label>
                    <input type="text" id="service-capability-tags" placeholder="编程, 逻辑推理">
                    <span class="form-hint">用逗号分隔</span>
                  </div>
                </div>
                <div class="form-group">
                  <label for="service-description">描述</label>
                  <textarea id="service-description" rows="2" placeholder="服务描述..."></textarea>
                </div>
                <div class="form-actions">
                  <button type="button" id="cancel-service-btn" class="btn-secondary">取消</button>
                  <button type="submit" class="btn-primary">保存服务</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.overlay);
    
    // 获取元素引用
    this.content = this.overlay.querySelector('.modal-content');
    this.closeBtn = this.overlay.querySelector('.modal-close-btn');
    this.errorDiv = this.overlay.querySelector('.llm-settings-error');
    
    // 默认配置表单
    this.configForm = this.overlay.querySelector('#llm-config-form');
    this.baseUrlInput = this.overlay.querySelector('#llm-base-url');
    this.modelInput = this.overlay.querySelector('#llm-model');
    this.apiKeyInput = this.overlay.querySelector('#llm-api-key');
    this.maxConcurrentInput = this.overlay.querySelector('#llm-max-concurrent');
    
    // 服务管理
    this.serviceList = this.overlay.querySelector('#llm-service-list');
    this.addServiceBtn = this.overlay.querySelector('#add-service-btn');
    this.servicesCount = this.overlay.querySelector('.llm-services-count');
    
    // 服务编辑表单
    this.serviceFormContainer = this.overlay.querySelector('#service-form-container');
    this.serviceFormTitle = this.overlay.querySelector('#service-form-title');
    this.serviceForm = this.overlay.querySelector('#service-form');
    this.serviceIdInput = this.overlay.querySelector('#service-id');
    this.serviceNameInput = this.overlay.querySelector('#service-name');
    this.serviceBaseUrlInput = this.overlay.querySelector('#service-base-url');
    this.serviceModelInput = this.overlay.querySelector('#service-model');
    this.serviceApiKeyInput = this.overlay.querySelector('#service-api-key');
    this.serviceMaxConcurrentInput = this.overlay.querySelector('#service-max-concurrent');
    this.serviceCapabilityTagsInput = this.overlay.querySelector('#service-capability-tags');
    this.serviceDescriptionInput = this.overlay.querySelector('#service-description');
    this.cancelServiceBtn = this.overlay.querySelector('#cancel-service-btn');
  },

  /**
   * 绑定事件
   */
  _bindEvents() {
    // 关闭按钮
    this.closeBtn.addEventListener('click', () => this.close());
    
    // 点击覆盖层关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });
    
    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
    
    // 标签页切换
    this.overlay.querySelectorAll('.llm-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._switchTab(e.target.dataset.tab));
    });
    
    // 默认配置表单提交
    this.configForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveConfig();
    });
    
    // 添加服务按钮
    this.addServiceBtn.addEventListener('click', () => this._showServiceForm(null));
    
    // 服务表单提交
    this.serviceForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveService();
    });
    
    // 取消服务编辑
    this.cancelServiceBtn.addEventListener('click', () => this._hideServiceForm());
  },

  /**
   * 切换标签页
   * @param {string} tabName - 标签页名称
   */
  _switchTab(tabName) {
    // 更新标签按钮状态
    this.overlay.querySelectorAll('.llm-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // 更新标签内容显示
    this.overlay.querySelectorAll('.llm-tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.tab === tabName);
    });
    
    // 切换到服务管理时加载服务列表
    if (tabName === 'services') {
      this._loadServices();
    }
  },

  /**
   * 打开设置对话框
   * @param {object} options - 可选参数
   * @param {string} options.errorMessage - 错误消息（连接错误时显示）
   */
  async open(options = {}) {
    this.isOpen = true;
    this.errorMessage = options.errorMessage || null;
    
    // 显示错误消息
    if (this.errorMessage) {
      this.errorDiv.textContent = this.errorMessage;
      this.errorDiv.classList.remove('hidden');
    } else {
      this.errorDiv.classList.add('hidden');
    }
    
    // 加载配置
    await this._loadConfig();
    
    // 显示弹窗
    this.overlay.classList.remove('hidden');
    
    // 聚焦到第一个输入框
    this.baseUrlInput.focus();
  },

  /**
   * 关闭设置对话框
   */
  close() {
    this.isOpen = false;
    this.overlay.classList.add('hidden');
    this._hideServiceForm();
    this._clearErrors();
  },

  /**
   * 加载当前配置
   */
  async _loadConfig() {
    try {
      const result = await API.getLlmConfig();
      this.config = result.llm;
      
      // 填充表单
      this.baseUrlInput.value = this.config.baseURL || '';
      this.modelInput.value = this.config.model || '';
      this.apiKeyInput.value = ''; // API Key 不回显，显示占位符
      this.apiKeyInput.placeholder = this.config.apiKey ? `当前: ${this.config.apiKey}` : 'sk-...';
      this.maxConcurrentInput.value = this.config.maxConcurrentRequests || 2;
    } catch (err) {
      console.error('加载 LLM 配置失败:', err);
      // 如果加载失败，保持表单为空
    }
  },

  /**
   * 加载服务列表
   */
  async _loadServices() {
    try {
      const result = await API.getLlmServicesConfig();
      this.services = result.services || [];
      this._renderServiceList();
    } catch (err) {
      console.error('加载 LLM 服务列表失败:', err);
      this.services = [];
      this._renderServiceList();
    }
  },

  /**
   * 渲染服务列表
   */
  _renderServiceList() {
    this.servicesCount.textContent = `共 ${this.services.length} 个服务`;
    
    if (this.services.length === 0) {
      this.serviceList.innerHTML = `
        <div class="empty-state">
          <p>暂无 LLM 服务配置</p>
          <p>点击"添加服务"按钮创建新服务</p>
        </div>
      `;
      return;
    }
    
    this.serviceList.innerHTML = this.services.map(service => `
      <div class="llm-service-item" data-id="${service.id}">
        <div class="service-info">
          <div class="service-name">${this._escapeHtml(service.name || service.id)}</div>
          <div class="service-details">
            <span class="service-model">${this._escapeHtml(service.model)}</span>
            <span class="service-url">${this._escapeHtml(service.baseURL)}</span>
          </div>
          ${service.capabilityTags && service.capabilityTags.length > 0 ? `
            <div class="service-tags">
              ${service.capabilityTags.map(tag => `<span class="tag">${this._escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="service-actions">
          <button class="btn-icon edit-service-btn" title="编辑">✏️</button>
          <button class="btn-icon delete-service-btn" title="删除">🗑️</button>
        </div>
      </div>
    `).join('');
    
    // 绑定编辑和删除按钮事件
    this.serviceList.querySelectorAll('.edit-service-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serviceId = e.target.closest('.llm-service-item').dataset.id;
        this._showServiceForm(serviceId);
      });
    });
    
    this.serviceList.querySelectorAll('.delete-service-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serviceId = e.target.closest('.llm-service-item').dataset.id;
        this._deleteService(serviceId);
      });
    });
  },

  /**
   * 显示服务编辑表单
   * @param {string|null} serviceId - 服务 ID（null 表示新增）
   */
  _showServiceForm(serviceId) {
    this.editingServiceId = serviceId;
    this._clearServiceFormErrors();
    
    if (serviceId) {
      // 编辑模式
      const service = this.services.find(s => s.id === serviceId);
      if (!service) return;
      
      this.serviceFormTitle.textContent = '编辑服务';
      this.serviceIdInput.value = service.id;
      this.serviceIdInput.disabled = true; // ID 不可修改
      this.serviceNameInput.value = service.name || '';
      this.serviceBaseUrlInput.value = service.baseURL || '';
      this.serviceModelInput.value = service.model || '';
      this.serviceApiKeyInput.value = '';
      this.serviceApiKeyInput.placeholder = service.apiKey ? `当前: ${service.apiKey}` : 'sk-...';
      this.serviceMaxConcurrentInput.value = service.maxConcurrentRequests || 2;
      this.serviceCapabilityTagsInput.value = (service.capabilityTags || []).join(', ');
      this.serviceDescriptionInput.value = service.description || '';
    } else {
      // 新增模式
      this.serviceFormTitle.textContent = '添加服务';
      this.serviceIdInput.value = '';
      this.serviceIdInput.disabled = false;
      this.serviceNameInput.value = '';
      this.serviceBaseUrlInput.value = '';
      this.serviceModelInput.value = '';
      this.serviceApiKeyInput.value = '';
      this.serviceApiKeyInput.placeholder = 'sk-...';
      this.serviceMaxConcurrentInput.value = 2;
      this.serviceCapabilityTagsInput.value = '';
      this.serviceDescriptionInput.value = '';
    }
    
    this.serviceFormContainer.classList.remove('hidden');
    this.serviceIdInput.focus();
  },

  /**
   * 隐藏服务编辑表单
   */
  _hideServiceForm() {
    this.serviceFormContainer.classList.add('hidden');
    this.editingServiceId = null;
    this._clearServiceFormErrors();
  },

  /**
   * 验证默认配置表单
   * @returns {{valid: boolean, errors: object}}
   */
  _validateConfig() {
    const errors = {};
    
    if (!this.baseUrlInput.value.trim()) {
      errors.baseURL = 'Base URL 不能为空';
    }
    
    if (!this.modelInput.value.trim()) {
      errors.model = 'Model 不能为空';
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  },

  /**
   * 验证服务表单
   * @returns {{valid: boolean, errors: object}}
   */
  _validateServiceForm() {
    const errors = {};
    
    if (!this.serviceIdInput.value.trim()) {
      errors.id = '服务 ID 不能为空';
    }
    
    if (!this.serviceNameInput.value.trim()) {
      errors.name = '显示名称不能为空';
    }
    
    if (!this.serviceBaseUrlInput.value.trim()) {
      errors.baseURL = 'Base URL 不能为空';
    }
    
    if (!this.serviceModelInput.value.trim()) {
      errors.model = 'Model 不能为空';
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  },

  /**
   * 保存默认配置
   */
  async _saveConfig() {
    this._clearErrors();
    
    const validation = this._validateConfig();
    if (!validation.valid) {
      this._showErrors(validation.errors);
      return;
    }
    
    const config = {
      baseURL: this.baseUrlInput.value.trim(),
      model: this.modelInput.value.trim(),
      maxConcurrentRequests: parseInt(this.maxConcurrentInput.value) || 2
    };
    
    // 只有输入了新的 API Key 才更新
    if (this.apiKeyInput.value) {
      config.apiKey = this.apiKeyInput.value;
    }
    
    try {
      const result = await API.saveLlmConfig(config);
      if (result.ok) {
        Toast.success('LLM 配置已保存');
        // 更新 API Key 占位符
        if (result.llm && result.llm.apiKey) {
          this.apiKeyInput.placeholder = `当前: ${result.llm.apiKey}`;
          this.apiKeyInput.value = '';
        }
      }
    } catch (err) {
      console.error('保存 LLM 配置失败:', err);
      Toast.error('保存配置失败: ' + err.message);
    }
  },

  /**
   * 保存服务
   */
  async _saveService() {
    this._clearServiceFormErrors();
    
    const validation = this._validateServiceForm();
    if (!validation.valid) {
      this._showServiceFormErrors(validation.errors);
      return;
    }
    
    const service = {
      id: this.serviceIdInput.value.trim(),
      name: this.serviceNameInput.value.trim(),
      baseURL: this.serviceBaseUrlInput.value.trim(),
      model: this.serviceModelInput.value.trim(),
      maxConcurrentRequests: parseInt(this.serviceMaxConcurrentInput.value) || 2,
      capabilityTags: this.serviceCapabilityTagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(t => t),
      description: this.serviceDescriptionInput.value.trim()
    };
    
    // 只有输入了新的 API Key 才更新
    if (this.serviceApiKeyInput.value) {
      service.apiKey = this.serviceApiKeyInput.value;
    }
    
    try {
      let result;
      if (this.editingServiceId) {
        // 更新服务
        result = await API.updateLlmServiceConfig(this.editingServiceId, service);
      } else {
        // 添加服务
        result = await API.addLlmServiceConfig(service);
      }
      
      if (result.ok) {
        Toast.success(this.editingServiceId ? '服务已更新' : '服务已添加');
        this._hideServiceForm();
        await this._loadServices();
      }
    } catch (err) {
      console.error('保存服务失败:', err);
      Toast.error('保存服务失败: ' + err.message);
    }
  },

  /**
   * 删除服务
   * @param {string} serviceId - 服务 ID
   */
  async _deleteService(serviceId) {
    const service = this.services.find(s => s.id === serviceId);
    if (!service) return;
    
    if (!confirm(`确定要删除服务 "${service.name || serviceId}" 吗？`)) {
      return;
    }
    
    try {
      const result = await API.deleteLlmServiceConfig(serviceId);
      if (result.ok) {
        Toast.success('服务已删除');
        await this._loadServices();
      }
    } catch (err) {
      console.error('删除服务失败:', err);
      Toast.error('删除服务失败: ' + err.message);
    }
  },

  /**
   * 显示表单错误
   * @param {object} errors - 错误对象
   */
  _showErrors(errors) {
    if (errors.baseURL) {
      this.baseUrlInput.parentElement.querySelector('.form-error').textContent = errors.baseURL;
      this.baseUrlInput.classList.add('error');
    }
    if (errors.model) {
      this.modelInput.parentElement.querySelector('.form-error').textContent = errors.model;
      this.modelInput.classList.add('error');
    }
  },

  /**
   * 清除表单错误
   */
  _clearErrors() {
    this.configForm.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    this.configForm.querySelectorAll('input.error').forEach(el => el.classList.remove('error'));
  },

  /**
   * 显示服务表单错误
   * @param {object} errors - 错误对象
   */
  _showServiceFormErrors(errors) {
    const fieldMap = {
      id: this.serviceIdInput,
      name: this.serviceNameInput,
      baseURL: this.serviceBaseUrlInput,
      model: this.serviceModelInput
    };
    
    for (const [field, message] of Object.entries(errors)) {
      const input = fieldMap[field];
      if (input) {
        input.parentElement.querySelector('.form-error').textContent = message;
        input.classList.add('error');
      }
    }
  },

  /**
   * 清除服务表单错误
   */
  _clearServiceFormErrors() {
    this.serviceForm.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    this.serviceForm.querySelectorAll('input.error, textarea.error').forEach(el => el.classList.remove('error'));
  },

  /**
   * HTML 转义
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   */
  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// 导出供其他模块使用
window.LlmSettingsModal = LlmSettingsModal;
