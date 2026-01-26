/**
 * LLM 设置模态框组件
 * 用于配置默认 LLM 参数和管理 LLM 服务列表
 */

/**
 * 标准能力类型定义
 */
const STANDARD_CAPABILITIES = {
  input: [
    { value: 'text', label: '文本', icon: '📝', description: '文本对话' },
    { value: 'vision', label: '视觉', icon: '👁️', description: '视觉理解（图片）' },
    { value: 'audio', label: '音频', icon: '🎵', description: '音频理解' },
    { value: 'file', label: '文件', icon: '📄', description: '文件阅读' }
  ],
  output: [
    { value: 'text', label: '文本', icon: '📝', description: '文本输出' },
    { value: 'structured_output', label: '结构化', icon: '📊', description: '结构化输出（JSON）' },
    { value: 'tool_calling', label: '工具', icon: '🔧', description: '工具调用' }
  ]
};

/**
 * 默认能力配置
 */
const DEFAULT_CAPABILITIES = {
  input: ['text'],
  output: ['text']
};

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
  maxTokensInput: null,
  
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
  serviceMaxTokensInput: null,
  serviceCapabilityTagsInput: null,
  serviceDescriptionInput: null,
  
  // 能力配置元素
  serviceCapabilitiesSection: null,
  capabilitiesToggleBtn: null,
  
  // 默认配置能力配置元素
  defaultCapabilitiesSection: null,
  defaultCapabilitiesToggleBtn: null,
  defaultInputCapabilitiesContainer: null,
  defaultOutputCapabilitiesContainer: null,
  
  // 状态
  isOpen: false,
  errorMessage: null,
  config: null,
  services: [],
  editingServiceId: null, // 正在编辑的服务 ID（null 表示新增）

  orgTemplates: [],
  filteredOrgTemplates: [],
  selectedOrgTemplateName: null,
  selectedOrgTemplateOrgLoaded: false,

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
            <button class="llm-tab-btn" data-tab="org-templates">组织模板</button>
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
              <div class="form-group">
                <label for="llm-max-tokens">最大生成 Token 数</label>
                <input type="number" id="llm-max-tokens" min="1" placeholder="4096">
                <span class="form-hint">限制模型单次响应的最大 token 数，留空使用 API 默认值</span>
              </div>
              
              <!-- 默认模型能力配置区域 -->
              <div class="capabilities-section" id="default-capabilities-section">
                <div class="capabilities-header">
                  <label>模型能力配置</label>
                  <button type="button" class="capabilities-toggle-btn" id="default-capabilities-toggle-btn" title="展开/折叠">▼</button>
                </div>
                <div class="capabilities-content">
                  <!-- 输入能力 -->
                  <div class="capability-group">
                    <span class="capability-group-label">输入能力</span>
                    <div class="capability-checkboxes" id="default-input-capabilities">
                      <!-- 动态生成 -->
                    </div>
                  </div>
                  <!-- 输出能力 -->
                  <div class="capability-group">
                    <span class="capability-group-label">输出能力</span>
                    <div class="capability-checkboxes" id="default-output-capabilities">
                      <!-- 动态生成 -->
                    </div>
                  </div>
                </div>
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
                <div class="form-group">
                  <label for="service-max-tokens">最大生成 Token 数</label>
                  <input type="number" id="service-max-tokens" min="1" placeholder="4096">
                  <span class="form-hint">限制模型单次响应的最大 token 数，留空使用 API 默认值</span>
                </div>
                <div class="form-group">
                  <label for="service-capability-tags">能力标签</label>
                  <input type="text" id="service-capability-tags" placeholder="编程, 逻辑推理">
                  <span class="form-hint">用逗号分隔，用于模型选择时的标签显示</span>
                </div>
                
                <!-- 模型能力配置区域 -->
                <div class="capabilities-section" id="service-capabilities-section">
                  <div class="capabilities-header">
                    <label>模型能力配置</label>
                    <button type="button" class="capabilities-toggle-btn" id="capabilities-toggle-btn" title="展开/折叠">▼</button>
                  </div>
                  <div class="capabilities-content">
                    <!-- 输入能力 -->
                    <div class="capability-group">
                      <span class="capability-group-label">输入能力</span>
                      <div class="capability-checkboxes" id="input-capabilities">
                        <!-- 动态生成 -->
                      </div>
                    </div>
                    <!-- 输出能力 -->
                    <div class="capability-group">
                      <span class="capability-group-label">输出能力</span>
                      <div class="capability-checkboxes" id="output-capabilities">
                        <!-- 动态生成 -->
                      </div>
                    </div>
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

          <div class="llm-tab-content" data-tab="org-templates">
            <div class="org-templates-layout">
              <div class="org-templates-sidebar">
                <div class="org-templates-toolbar">
                  <input id="org-templates-search" type="text" placeholder="搜索 orgName / info..." />
                  <button id="org-templates-refresh-btn" class="btn-secondary" type="button">刷新</button>
                </div>
                <div id="org-templates-list" class="org-templates-list"></div>
                <div class="org-templates-create">
                  <input id="org-templates-new-name" type="text" placeholder="orgName（字母数字_-）" />
                  <button id="org-templates-create-btn" class="btn-primary" type="button">新增</button>
                </div>
              </div>
              <div class="org-templates-editor">
                <div class="org-templates-editor-header">
                  <div>当前：<span id="org-templates-current-name">-</span></div>
                  <div class="org-templates-editor-actions">
                    <button id="org-templates-rename-btn" class="btn-secondary" type="button" disabled>重命名</button>
                    <button id="org-templates-save-all-btn" class="btn-primary" type="button" disabled>保存全部</button>
                    <button id="org-templates-delete-btn" class="btn-danger" type="button" disabled>删除</button>
                  </div>
                </div>
                <div class="org-templates-editor-section">
                  <div class="org-templates-editor-section-header">
                    <div class="org-templates-editor-section-title">info.md</div>
                    <button id="org-templates-save-info-btn" class="btn-primary" type="button" disabled>保存</button>
                  </div>
                  <textarea id="org-templates-info-md" rows="10" placeholder="简介（用于匹配）..." disabled></textarea>
                </div>
                <div class="org-templates-editor-section">
                  <div class="org-templates-editor-section-header">
                    <div class="org-templates-editor-section-title">org.md</div>
                    <div class="org-templates-editor-section-actions">
                      <button id="org-templates-load-org-btn" class="btn-secondary" type="button" disabled>重新加载</button>
                      <button id="org-templates-save-org-btn" class="btn-primary" type="button" disabled>保存</button>
                    </div>
                  </div>
                  <textarea id="org-templates-org-md" rows="14" placeholder="完整组织架构内容（提示词）..." disabled></textarea>
                </div>
              </div>
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
    this.maxTokensInput = this.overlay.querySelector('#llm-max-tokens');
    
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
    this.serviceMaxTokensInput = this.overlay.querySelector('#service-max-tokens');
    this.serviceCapabilityTagsInput = this.overlay.querySelector('#service-capability-tags');
    this.serviceDescriptionInput = this.overlay.querySelector('#service-description');
    this.cancelServiceBtn = this.overlay.querySelector('#cancel-service-btn');
    
    // 能力配置元素
    this.serviceCapabilitiesSection = this.overlay.querySelector('#service-capabilities-section');
    this.capabilitiesToggleBtn = this.overlay.querySelector('#capabilities-toggle-btn');
    this.inputCapabilitiesContainer = this.overlay.querySelector('#input-capabilities');
    this.outputCapabilitiesContainer = this.overlay.querySelector('#output-capabilities');
    
    // 默认配置能力配置元素
    this.defaultCapabilitiesSection = this.overlay.querySelector('#default-capabilities-section');
    this.defaultCapabilitiesToggleBtn = this.overlay.querySelector('#default-capabilities-toggle-btn');
    this.defaultInputCapabilitiesContainer = this.overlay.querySelector('#default-input-capabilities');
    this.defaultOutputCapabilitiesContainer = this.overlay.querySelector('#default-output-capabilities');

    this.orgTemplatesSearchInput = this.overlay.querySelector('#org-templates-search');
    this.orgTemplatesRefreshBtn = this.overlay.querySelector('#org-templates-refresh-btn');
    this.orgTemplatesList = this.overlay.querySelector('#org-templates-list');
    this.orgTemplatesNewNameInput = this.overlay.querySelector('#org-templates-new-name');
    this.orgTemplatesCreateBtn = this.overlay.querySelector('#org-templates-create-btn');
    this.orgTemplatesCurrentName = this.overlay.querySelector('#org-templates-current-name');
    this.orgTemplatesRenameBtn = this.overlay.querySelector('#org-templates-rename-btn');
    this.orgTemplatesSaveAllBtn = this.overlay.querySelector('#org-templates-save-all-btn');
    this.orgTemplatesDeleteBtn = this.overlay.querySelector('#org-templates-delete-btn');
    this.orgTemplatesInfoTextarea = this.overlay.querySelector('#org-templates-info-md');
    this.orgTemplatesSaveInfoBtn = this.overlay.querySelector('#org-templates-save-info-btn');
    this.orgTemplatesOrgTextarea = this.overlay.querySelector('#org-templates-org-md');
    this.orgTemplatesLoadOrgBtn = this.overlay.querySelector('#org-templates-load-org-btn');
    this.orgTemplatesSaveOrgBtn = this.overlay.querySelector('#org-templates-save-org-btn');
    
    // 初始化能力配置复选框
    this._initCapabilitiesCheckboxes();
    this._initDefaultCapabilitiesCheckboxes();
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
    
    // 能力配置区域折叠/展开
    this.capabilitiesToggleBtn.addEventListener('click', () => this._toggleCapabilitiesSection());
    this.serviceCapabilitiesSection.querySelector('.capabilities-header').addEventListener('click', (e) => {
      if (e.target !== this.capabilitiesToggleBtn) {
        this._toggleCapabilitiesSection();
      }
    });
    
    // 默认配置能力配置区域折叠/展开
    this.defaultCapabilitiesToggleBtn.addEventListener('click', () => this._toggleDefaultCapabilitiesSection());
    this.defaultCapabilitiesSection.querySelector('.capabilities-header').addEventListener('click', (e) => {
      if (e.target !== this.defaultCapabilitiesToggleBtn) {
        this._toggleDefaultCapabilitiesSection();
      }
    });

    this.orgTemplatesRefreshBtn.addEventListener('click', () => this._loadOrgTemplates());
    this.orgTemplatesSearchInput.addEventListener('input', () => this._applyOrgTemplatesFilter());
    this.orgTemplatesCreateBtn.addEventListener('click', () => this._createOrgTemplate());
    this.orgTemplatesRenameBtn.addEventListener('click', () => this._renameSelectedOrgTemplate());
    this.orgTemplatesSaveAllBtn.addEventListener('click', () => this._saveAllSelectedOrgTemplate());
    this.orgTemplatesDeleteBtn.addEventListener('click', () => this._deleteSelectedOrgTemplate());
    this.orgTemplatesSaveInfoBtn.addEventListener('click', () => this._saveSelectedOrgTemplateInfo());
    this.orgTemplatesLoadOrgBtn.addEventListener('click', () => this._loadSelectedOrgTemplateOrg());
    this.orgTemplatesSaveOrgBtn.addEventListener('click', () => this._saveSelectedOrgTemplateOrg());

    this.orgTemplatesList.addEventListener('click', (e) => {
      const item = e.target.closest?.('.org-templates-item');
      const orgName = item?.dataset?.orgName;
      if (orgName) {
        this._selectOrgTemplate(orgName);
      }
    });
  },
  
  /**
   * 初始化能力配置复选框
   */
  _initCapabilitiesCheckboxes() {
    // 生成输入能力复选框
    this.inputCapabilitiesContainer.innerHTML = STANDARD_CAPABILITIES.input.map(cap => `
      <label class="capability-checkbox" title="${cap.description}">
        <input type="checkbox" value="${cap.value}" data-direction="input">
        <span class="capability-icon">${cap.icon}</span>
        <span class="capability-name">${cap.value}</span>
      </label>
    `).join('');
    
    // 生成输出能力复选框
    this.outputCapabilitiesContainer.innerHTML = STANDARD_CAPABILITIES.output.map(cap => `
      <label class="capability-checkbox" title="${cap.description}">
        <input type="checkbox" value="${cap.value}" data-direction="output">
        <span class="capability-icon">${cap.icon}</span>
        <span class="capability-name">${cap.value}</span>
      </label>
    `).join('');
  },
  
  /**
   * 初始化默认配置能力配置复选框
   */
  _initDefaultCapabilitiesCheckboxes() {
    // 生成默认配置输入能力复选框
    this.defaultInputCapabilitiesContainer.innerHTML = STANDARD_CAPABILITIES.input.map(cap => `
      <label class="capability-checkbox" title="${cap.description}">
        <input type="checkbox" value="${cap.value}" data-direction="input">
        <span class="capability-icon">${cap.icon}</span>
        <span class="capability-name">${cap.value}</span>
      </label>
    `).join('');
    
    // 生成默认配置输出能力复选框
    this.defaultOutputCapabilitiesContainer.innerHTML = STANDARD_CAPABILITIES.output.map(cap => `
      <label class="capability-checkbox" title="${cap.description}">
        <input type="checkbox" value="${cap.value}" data-direction="output">
        <span class="capability-icon">${cap.icon}</span>
        <span class="capability-name">${cap.value}</span>
      </label>
    `).join('');
  },
  
  /**
   * 切换能力配置区域展开/折叠
   */
  _toggleCapabilitiesSection() {
    this.serviceCapabilitiesSection.classList.toggle('collapsed');
  },
  
  /**
   * 切换默认配置能力配置区域展开/折叠
   */
  _toggleDefaultCapabilitiesSection() {
    this.defaultCapabilitiesSection.classList.toggle('collapsed');
  },
  
  /**
   * 获取选中的能力配置
   * @returns {{input: string[], output: string[]}}
   */
  _getSelectedCapabilities() {
    const inputCaps = Array.from(this.inputCapabilitiesContainer.querySelectorAll('input:checked'))
      .map(cb => cb.value);
    const outputCaps = Array.from(this.outputCapabilitiesContainer.querySelectorAll('input:checked'))
      .map(cb => cb.value);
    
    // 如果没有选择任何能力，使用默认值
    return {
      input: inputCaps.length > 0 ? inputCaps : DEFAULT_CAPABILITIES.input,
      output: outputCaps.length > 0 ? outputCaps : DEFAULT_CAPABILITIES.output
    };
  },
  
  /**
   * 设置能力配置（用于编辑时回显）
   * @param {object} capabilities - 能力配置对象
   */
  _setCapabilities(capabilities) {
    const caps = capabilities || DEFAULT_CAPABILITIES;
    const inputCaps = caps.input || DEFAULT_CAPABILITIES.input;
    const outputCaps = caps.output || DEFAULT_CAPABILITIES.output;
    
    // 设置输入能力复选框
    this.inputCapabilitiesContainer.querySelectorAll('input').forEach(cb => {
      cb.checked = inputCaps.includes(cb.value);
    });
    
    // 设置输出能力复选框
    this.outputCapabilitiesContainer.querySelectorAll('input').forEach(cb => {
      cb.checked = outputCaps.includes(cb.value);
    });
  },
  
  /**
   * 获取默认配置选中的能力配置
   * @returns {{input: string[], output: string[]}}
   */
  _getDefaultSelectedCapabilities() {
    const inputCaps = Array.from(this.defaultInputCapabilitiesContainer.querySelectorAll('input:checked'))
      .map(cb => cb.value);
    const outputCaps = Array.from(this.defaultOutputCapabilitiesContainer.querySelectorAll('input:checked'))
      .map(cb => cb.value);
    
    // 如果没有选择任何能力，使用默认值
    return {
      input: inputCaps.length > 0 ? inputCaps : DEFAULT_CAPABILITIES.input,
      output: outputCaps.length > 0 ? outputCaps : DEFAULT_CAPABILITIES.output
    };
  },
  
  /**
   * 设置默认配置能力配置（用于加载时回显）
   * @param {object} capabilities - 能力配置对象
   */
  _setDefaultCapabilities(capabilities) {
    const caps = capabilities || DEFAULT_CAPABILITIES;
    const inputCaps = caps.input || DEFAULT_CAPABILITIES.input;
    const outputCaps = caps.output || DEFAULT_CAPABILITIES.output;
    
    // 设置默认配置输入能力复选框
    this.defaultInputCapabilitiesContainer.querySelectorAll('input').forEach(cb => {
      cb.checked = inputCaps.includes(cb.value);
    });
    
    // 设置默认配置输出能力复选框
    this.defaultOutputCapabilitiesContainer.querySelectorAll('input').forEach(cb => {
      cb.checked = outputCaps.includes(cb.value);
    });
  },
  
  /**
   * 渲染能力徽章（用于服务列表显示）
   * @param {object} capabilities - 能力配置对象
   * @returns {string} HTML 字符串
   */
  _renderCapabilityBadges(capabilities) {
    const caps = capabilities || DEFAULT_CAPABILITIES;
    const inputCaps = caps.input || DEFAULT_CAPABILITIES.input;
    const outputCaps = caps.output || DEFAULT_CAPABILITIES.output;
    
    // 获取能力图标
    const getIcon = (value, direction) => {
      const list = direction === 'input' ? STANDARD_CAPABILITIES.input : STANDARD_CAPABILITIES.output;
      const cap = list.find(c => c.value === value);
      return cap ? cap.icon : '❓';
    };
    
    // 获取能力描述
    const getDescription = (value, direction) => {
      const list = direction === 'input' ? STANDARD_CAPABILITIES.input : STANDARD_CAPABILITIES.output;
      const cap = list.find(c => c.value === value);
      return cap ? cap.description : value;
    };
    
    const inputBadges = inputCaps.map(cap => 
      `<span class="capability-badge input" title="输入: ${getDescription(cap, 'input')}">${getIcon(cap, 'input')}</span>`
    ).join('');
    
    const outputBadges = outputCaps.map(cap => 
      `<span class="capability-badge output" title="输出: ${getDescription(cap, 'output')}">${getIcon(cap, 'output')}</span>`
    ).join('');
    
    return `
      <div class="service-capabilities">
        ${inputBadges}
        <span class="capability-divider">→</span>
        ${outputBadges}
      </div>
    `;
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

    if (tabName === 'org-templates') {
      this._loadOrgTemplates();
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
      this.maxTokensInput.value = this.config.maxTokens || '';
      
      // 设置默认配置的能力配置
      this._setDefaultCapabilities(this.config.capabilities);
    } catch (err) {
      console.error('加载 LLM 配置失败:', err);
      // 如果加载失败，保持表单为空，设置默认能力
      this._setDefaultCapabilities(DEFAULT_CAPABILITIES);
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
          ${this._renderCapabilityBadges(service.capabilities)}
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
      this.serviceMaxTokensInput.value = service.maxTokens || '';
      this.serviceCapabilityTagsInput.value = (service.capabilityTags || []).join(', ');
      this.serviceDescriptionInput.value = service.description || '';
      
      // 设置能力配置
      this._setCapabilities(service.capabilities);
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
      this.serviceMaxTokensInput.value = '';
      this.serviceCapabilityTagsInput.value = '';
      this.serviceDescriptionInput.value = '';
      
      // 设置默认能力配置
      this._setCapabilities(DEFAULT_CAPABILITIES);
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
      maxConcurrentRequests: parseInt(this.maxConcurrentInput.value) || 2,
      capabilities: this._getDefaultSelectedCapabilities()
    };
    
    // maxTokens 只有输入了值才设置
    const maxTokensValue = parseInt(this.maxTokensInput.value);
    if (maxTokensValue > 0) {
      config.maxTokens = maxTokensValue;
    }
    
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
      capabilityTags: this.serviceCapabilityTagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(t => t),
      capabilities: this._getSelectedCapabilities(),
      description: this.serviceDescriptionInput.value.trim()
    };
    
    // maxTokens 只有输入了值才设置
    const maxTokensValue = parseInt(this.serviceMaxTokensInput.value);
    if (maxTokensValue > 0) {
      service.maxTokens = maxTokensValue;
    }
    
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

  async _loadOrgTemplates() {
    try {
      const result = await API.getOrgTemplates();
      this.orgTemplates = Array.isArray(result?.templates) ? result.templates : [];
      this._applyOrgTemplatesFilter();

      if (this.selectedOrgTemplateName) {
        const stillExists = this.orgTemplates.some(t => t.orgName === this.selectedOrgTemplateName);
        if (!stillExists) {
          this._resetOrgTemplateEditor();
        }
      } else {
        const first = this.filteredOrgTemplates[0]?.orgName ?? null;
        if (first) {
          await this._selectOrgTemplate(first);
        }
      }
    } catch (err) {
      Toast.error(`加载组织模板失败: ${err.message}`);
    }
  },

  _applyOrgTemplatesFilter() {
    const q = (this.orgTemplatesSearchInput.value || '').trim().toLowerCase();
    this.filteredOrgTemplates = q
      ? this.orgTemplates.filter(t => (t.orgName || '').toLowerCase().includes(q) || (t.infoMd || '').toLowerCase().includes(q))
      : this.orgTemplates.slice();
    this._renderOrgTemplatesList();
  },

  _renderOrgTemplatesList() {
    const items = this.filteredOrgTemplates.map(t => {
      const active = t.orgName === this.selectedOrgTemplateName ? ' active' : '';
      const excerpt = (t.infoMd || '').replace(/\s+/g, ' ').slice(0, 120);
      return `
        <div class="org-templates-item${active}" data-org-name="${this._escapeHtml(t.orgName)}">
          <div class="org-templates-item-name">${this._escapeHtml(t.orgName)}</div>
          <div class="org-templates-item-excerpt">${this._escapeHtml(excerpt)}</div>
        </div>
      `;
    }).join('');
    this.orgTemplatesList.innerHTML = items || `<div class="org-templates-empty">没有组织模板</div>`;
  },

  async _selectOrgTemplate(orgName) {
    this.selectedOrgTemplateName = orgName;
    this.selectedOrgTemplateOrgLoaded = false;
    this.orgTemplatesCurrentName.textContent = orgName;
    this.orgTemplatesDeleteBtn.disabled = false;
    this.orgTemplatesRenameBtn.disabled = false;
    this.orgTemplatesSaveInfoBtn.disabled = true;
    this.orgTemplatesSaveAllBtn.disabled = true;
    this.orgTemplatesLoadOrgBtn.disabled = true;
    this.orgTemplatesSaveOrgBtn.disabled = true;

    this.orgTemplatesInfoTextarea.value = '加载中...';
    this.orgTemplatesInfoTextarea.disabled = true;
    this.orgTemplatesOrgTextarea.value = '加载中...';
    this.orgTemplatesOrgTextarea.disabled = true;

    const [infoRes, orgRes] = await Promise.allSettled([
      API.getOrgTemplateInfo(orgName),
      API.getOrgTemplateOrg(orgName)
    ]);

    if (infoRes.status === 'fulfilled') {
      this.orgTemplatesInfoTextarea.value = infoRes.value?.infoMd ?? '';
      this.orgTemplatesInfoTextarea.disabled = false;
      this.orgTemplatesSaveInfoBtn.disabled = false;
    } else {
      this.orgTemplatesInfoTextarea.value = '';
      this.orgTemplatesInfoTextarea.disabled = false;
      Toast.error(`加载 info.md 失败: ${infoRes.reason?.message ?? 'unknown error'}`);
    }

    if (orgRes.status === 'fulfilled') {
      this.orgTemplatesOrgTextarea.value = orgRes.value?.orgMd ?? '';
      this.orgTemplatesOrgTextarea.disabled = false;
      this.orgTemplatesSaveOrgBtn.disabled = false;
      this.selectedOrgTemplateOrgLoaded = true;
    } else {
      this.orgTemplatesOrgTextarea.value = '';
      this.orgTemplatesOrgTextarea.disabled = true;
      Toast.warning(`org.md 未加载：${orgRes.reason?.message ?? 'unknown error'}`);
    }

    this.orgTemplatesLoadOrgBtn.disabled = false;
    this.orgTemplatesSaveAllBtn.disabled = !this.selectedOrgTemplateOrgLoaded;
    this._renderOrgTemplatesList();
  },

  async _loadSelectedOrgTemplateOrg() {
    const orgName = this.selectedOrgTemplateName;
    if (!orgName) return;
    try {
      const result = await API.getOrgTemplateOrg(orgName);
      this.orgTemplatesOrgTextarea.value = result?.orgMd ?? '';
      this.orgTemplatesOrgTextarea.disabled = false;
      this.orgTemplatesSaveOrgBtn.disabled = false;
      this.selectedOrgTemplateOrgLoaded = true;
      this.orgTemplatesSaveAllBtn.disabled = false;
    } catch (err) {
      Toast.error(`加载 org.md 失败: ${err.message}`);
    }
  },

  async _saveSelectedOrgTemplateInfo() {
    const orgName = this.selectedOrgTemplateName;
    if (!orgName) return;
    try {
      await API.updateOrgTemplateInfo(orgName, this.orgTemplatesInfoTextarea.value ?? '');
      Toast.success('info.md 已保存');
      await this._loadOrgTemplates();
      this._renderOrgTemplatesList();
    } catch (err) {
      Toast.error(`保存 info.md 失败: ${err.message}`);
    }
  },

  async _saveSelectedOrgTemplateOrg() {
    const orgName = this.selectedOrgTemplateName;
    if (!orgName) return;
    if (!this.selectedOrgTemplateOrgLoaded) {
      Toast.warning('请先加载 org.md');
      return;
    }
    try {
      await API.updateOrgTemplateOrg(orgName, this.orgTemplatesOrgTextarea.value ?? '');
      Toast.success('org.md 已保存');
    } catch (err) {
      Toast.error(`保存 org.md 失败: ${err.message}`);
    }
  },

  async _saveAllSelectedOrgTemplate() {
    const orgName = this.selectedOrgTemplateName;
    if (!orgName) return;
    if (!this.selectedOrgTemplateOrgLoaded) {
      await this._loadSelectedOrgTemplateOrg();
      if (!this.selectedOrgTemplateOrgLoaded) return;
    }
    try {
      await Promise.all([
        API.updateOrgTemplateInfo(orgName, this.orgTemplatesInfoTextarea.value ?? ''),
        API.updateOrgTemplateOrg(orgName, this.orgTemplatesOrgTextarea.value ?? '')
      ]);
      Toast.success('已保存');
      await this._loadOrgTemplates();
    } catch (err) {
      Toast.error(`保存失败: ${err.message}`);
    }
  },

  async _renameSelectedOrgTemplate() {
    const orgName = this.selectedOrgTemplateName;
    if (!orgName) return;
    const next = window.prompt('输入新的 orgName（字母数字_-）', orgName);
    const newOrgName = (next || '').trim();
    if (!newOrgName || newOrgName === orgName) return;
    try {
      await API.renameOrgTemplate(orgName, newOrgName);
      Toast.success('已重命名');
      await this._loadOrgTemplates();
      await this._selectOrgTemplate(newOrgName);
    } catch (err) {
      Toast.error(`重命名失败: ${err.message}`);
    }
  },

  async _createOrgTemplate() {
    const orgName = (this.orgTemplatesNewNameInput.value || '').trim();
    if (!orgName) {
      Toast.warning('请输入 orgName');
      return;
    }
    try {
      await API.createOrgTemplate(orgName);
      this.orgTemplatesNewNameInput.value = '';
      Toast.success('组织模板已创建');
      await this._loadOrgTemplates();
      await this._selectOrgTemplate(orgName);
    } catch (err) {
      Toast.error(`创建组织模板失败: ${err.message}`);
    }
  },

  async _deleteSelectedOrgTemplate() {
    const orgName = this.selectedOrgTemplateName;
    if (!orgName) return;
    const ok = window.confirm(`确定删除组织模板 "${orgName}" 吗？该目录下的 info.md 与 org.md 将被删除。`);
    if (!ok) return;
    try {
      await API.deleteOrgTemplate(orgName);
      Toast.success('组织模板已删除');
      this._resetOrgTemplateEditor();
      await this._loadOrgTemplates();
    } catch (err) {
      Toast.error(`删除组织模板失败: ${err.message}`);
    }
  },

  _resetOrgTemplateEditor() {
    this.selectedOrgTemplateName = null;
    this.selectedOrgTemplateOrgLoaded = false;
    this.orgTemplatesCurrentName.textContent = '-';
    this.orgTemplatesRenameBtn.disabled = true;
    this.orgTemplatesSaveAllBtn.disabled = true;
    this.orgTemplatesDeleteBtn.disabled = true;
    this.orgTemplatesInfoTextarea.value = '';
    this.orgTemplatesInfoTextarea.disabled = true;
    this.orgTemplatesSaveInfoBtn.disabled = true;
    this.orgTemplatesOrgTextarea.value = '';
    this.orgTemplatesOrgTextarea.disabled = true;
    this.orgTemplatesLoadOrgBtn.disabled = true;
    this.orgTemplatesSaveOrgBtn.disabled = true;
    this._renderOrgTemplatesList();
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
