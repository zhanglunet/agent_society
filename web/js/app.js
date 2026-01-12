/**
 * 主应用模块
 * 管理全局状态、路由、定时轮询
 */

const App = {
  // 应用状态
  currentView: 'list',      // 当前视图 ('list', 'overview', 'modules')
  selectedAgentId: null,    // 当前选中的智能体 ID
  agents: [],               // 所有智能体
  agentsById: new Map(),    // 智能体 ID 索引
  roles: [],                // 所有岗位
  pollInterval: 2000,       // 轮询间隔（毫秒）
  pollTimer: null,          // 轮询定时器
  lastMessageCounts: new Map(), // 上次各智能体的消息数量
  consecutiveErrors: 0,     // 连续错误计数
  maxBackoffInterval: 30000, // 最大退避间隔（30秒）
  isPollingPaused: false,   // 轮询是否暂停
  _isSelecting: false,      // 是否正在选择智能体（防止递归）
  artifactManager: null,    // 工件管理器实例

  /**
   * 初始化应用
   */
  async init() {
    console.log('智能体对话查看器初始化中...');

    // 初始化所有组件
    Toast.init();
    ErrorModal.init();
    LlmSettingsModal.init();
    AgentList.init();
    ChatPanel.init();
    OverviewPanel.init();
    ModulesPanel.init();
    MessageModal.init();
    AgentDetailModal.init();
    RoleDetailModal.init();

    // 绑定视图切换按钮
    this.bindViewToggle();

    // 检查配置状态，决定是否自动弹出设置页面
    await this.checkConfigStatus();

    // 加载初始数据
    await this.loadInitialData();

    // 启动轮询
    this.startPolling();

    console.log('智能体对话查看器初始化完成');
  },

  /**
   * 绑定视图切换按钮事件
   */
  bindViewToggle() {
    const listBtn = document.getElementById('view-list-btn');
    const overviewBtn = document.getElementById('view-overview-btn');
    const modulesBtn = document.getElementById('view-modules-btn');
    const openArtifactsBtn = document.getElementById('open-artifacts-btn');
    const openSettingsBtn = document.getElementById('open-settings-btn');

    if (listBtn) {
      listBtn.addEventListener('click', () => this.switchToListView());
    }
    if (overviewBtn) {
      overviewBtn.addEventListener('click', () => this.switchToOverviewView());
    }
    if (modulesBtn) {
      modulesBtn.addEventListener('click', () => this.switchToModulesView());
    }
    if (openArtifactsBtn) {
      openArtifactsBtn.addEventListener('click', () => this.openArtifactManager());
    }
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => this.openSettings());
    }

    // 监听导航到消息事件（从工件管理器触发）
    window.addEventListener('navigateToMessage', (e) => {
      this.handleNavigateToMessage(e.detail.messageId, e.detail.agentId);
    });
  },

  /**
   * 切换到列表视图
   */
  switchToListView() {
    this.currentView = 'list';
    this.updateViewToggleButtons();
    OverviewPanel.hide();
    this.hideModulesPanel();
  },

  /**
   * 切换到列表视图并设置筛选关键词
   * @param {string} filterKeyword - 筛选关键词（岗位名称）
   */
  switchToListViewWithFilter(filterKeyword) {
    this.switchToListView();
    AgentList.setFilterKeyword(filterKeyword);
  },

  /**
   * 切换到总览视图
   */
  switchToOverviewView() {
    this.currentView = 'overview';
    this.updateViewToggleButtons();
    this.hideModulesPanel();
    OverviewPanel.show();
  },

  /**
   * 切换到模块管理视图
   */
  switchToModulesView() {
    this.currentView = 'modules';
    this.updateViewToggleButtons();
    OverviewPanel.hide();
    this.showModulesPanel();
  },

  /**
   * 打开工件管理器窗口
   */
  openArtifactManager() {
    if (!this.artifactManager) {
      this.artifactManager = new ArtifactManager({
        container: document.getElementById('artifact-manager'),
        windowEl: document.getElementById('artifact-manager-window'),
        api: API,
        logger: console
      });
    }
    this.artifactManager.show();
  },

  /**
   * 打开 LLM 设置页面
   * @param {object} options - 可选参数
   * @param {string} options.errorMessage - 错误消息
   */
  openSettings(options = {}) {
    LlmSettingsModal.open(options);
  },

  /**
   * 检查配置状态，决定是否自动弹出设置页面
   */
  async checkConfigStatus() {
    try {
      const status = await API.getConfigStatus();
      
      // 首次启动（没有 app.local.json）时自动弹出设置页面
      if (!status.hasLocalConfig) {
        console.log('首次启动，自动打开 LLM 设置页面');
        this.openSettings({ errorMessage: '首次启动，请配置 LLM 连接参数' });
        return;
      }
      
      // LLM 连接错误时自动弹出设置页面
      if (status.llmStatus === 'error' && status.lastError) {
        console.log('LLM 连接错误，自动打开设置页面');
        this.openSettings({ errorMessage: `LLM 连接错误: ${status.lastError}` });
      }
    } catch (err) {
      // 配置状态检查失败，不影响正常使用
      console.warn('检查配置状态失败:', err);
    }
  },

  /**
   * 显示模块管理面板
   */
  showModulesPanel() {
    const agentList = document.getElementById('agent-list');
    const toolbar = document.querySelector('.sidebar-toolbar');
    const modulesPanel = document.getElementById('modules-panel');
    
    if (agentList) agentList.classList.add('hidden');
    if (toolbar) toolbar.classList.add('hidden');
    if (modulesPanel) {
      modulesPanel.classList.remove('hidden');
      ModulesPanel.show();
    }
  },

  /**
   * 隐藏模块管理面板
   */
  hideModulesPanel() {
    const agentList = document.getElementById('agent-list');
    const toolbar = document.querySelector('.sidebar-toolbar');
    const modulesPanel = document.getElementById('modules-panel');
    
    if (agentList) agentList.classList.remove('hidden');
    if (toolbar) toolbar.classList.remove('hidden');
    if (modulesPanel) modulesPanel.classList.add('hidden');
  },

  /**
   * 处理导航到消息事件
   * @param {string} messageId - 消息 ID
   * @param {string} [agentId] - 智能体 ID（可选）
   */
  async handleNavigateToMessage(messageId, agentId = null) {
    try {
      // 如果提供了 agentId，直接跳转到该智能体
      if (agentId) {
        this.switchToListView();
        await this.selectAgentAndScrollToMessage(agentId, messageId);
        return;
      }
      
      // 兼容旧逻辑：查找包含该消息的智能体
      for (const agent of this.agents) {
        const res = await API.getAgentMessages(agent.id);
        const messages = res.messages || [];
        const message = messages.find(m => m.id === messageId);
        
        if (message) {
          // 切换到列表视图
          this.switchToListView();
          // 选择智能体并滚动到消息
          await this.selectAgentAndScrollToMessage(agent.id, messageId);
          return;
        }
      }
      
      Toast.warning('未找到对应的消息');
    } catch (error) {
      console.error('导航到消息失败:', error);
      Toast.error('导航到消息失败');
    }
  },

  /**
   * 更新视图切换按钮状态
   */
  updateViewToggleButtons() {
    const listBtn = document.getElementById('view-list-btn');
    const overviewBtn = document.getElementById('view-overview-btn');
    const modulesBtn = document.getElementById('view-modules-btn');

    if (listBtn) {
      listBtn.classList.toggle('active', this.currentView === 'list');
    }
    if (overviewBtn) {
      overviewBtn.classList.toggle('active', this.currentView === 'overview');
    }
    if (modulesBtn) {
      modulesBtn.classList.toggle('active', this.currentView === 'modules');
    }
  },

  /**
   * 加载初始数据
   */
  async loadInitialData() {
    try {
      // 并行加载智能体、岗位、组织树和岗位树
      const [agentsRes, rolesRes, treeRes, roleTreeRes] = await Promise.all([
        API.getAgents(),
        API.getRoles(),
        API.getOrgTree(),
        API.getRoleTree(),
      ]);

      // 更新智能体数据
      this.agents = agentsRes.agents || [];
      this.agentsById.clear();
      this.agents.forEach(agent => {
        this.agentsById.set(agent.id, agent);
      });

      // 更新岗位数据
      this.roles = rolesRes.roles || [];

      // 更新组件
      AgentList.setAgents(this.agents);
      OverviewPanel.setAgents(this.agents);
      OverviewPanel.setRoles(this.roles);
      OverviewPanel.setTree(treeRes.tree);
      OverviewPanel.setRoleTree(roleTreeRes.tree);

      // 默认选择第一个智能体
      if (this.agents.length > 0 && !this.selectedAgentId) {
        // 按创建时间升序排序后选择第一个
        const sorted = SortUtils.sortByCreatedAt(this.agents, 'asc');
        this.selectAgent(sorted[0].id);
      }

    } catch (error) {
      console.error('加载初始数据失败:', error);
      Toast.error('加载数据失败，请刷新页面重试');
    }
  },

  /**
   * 选择智能体
   * @param {string} agentId - 智能体 ID
   */
  async selectAgent(agentId) {
    // 防止重复选择同一个智能体
    if (this.selectedAgentId === agentId && this._isSelecting) {
      return;
    }
    
    this._isSelecting = true;
    this.selectedAgentId = agentId;
    
    // 更新智能体列表选中状态（不触发回调）
    AgentList.updateSelection(agentId);

    // 获取智能体对象
    const agent = this.agentsById.get(agentId);
    ChatPanel.setAgent(agent);

    // 加载消息
    await this.loadMessages(agentId);
    this._isSelecting = false;
  },

  /**
   * 选择智能体并滚动到指定消息
   * @param {string} agentId - 智能体 ID
   * @param {string} messageId - 消息 ID
   */
  async selectAgentAndScrollToMessage(agentId, messageId) {
    await this.selectAgent(agentId);
    // 延迟滚动，确保消息已渲染
    setTimeout(() => {
      ChatPanel.scrollToMessage(messageId);
    }, 100);
  },

  /**
   * 加载指定智能体的消息
   * @param {string} agentId - 智能体 ID
   */
  async loadMessages(agentId) {
    try {
      const res = await API.getAgentMessages(agentId);
      const messages = res.messages || [];
      
      // 更新消息计数
      this.lastMessageCounts.set(agentId, messages.length);
      
      // 重置错误计数（请求成功）
      this.consecutiveErrors = 0;
      
      ChatPanel.setMessages(messages);
    } catch (error) {
      console.warn(`加载智能体 ${agentId} 的消息失败:`, error.message || error);
      // 只在首次失败时显示 Toast，避免刷屏
      if (this.consecutiveErrors === 0) {
        Toast.error('加载消息失败，将自动重试');
      }
      this.consecutiveErrors++;
    }
  },

  /**
   * 智能体选择回调（供 AgentList 调用）
   * @param {string} agentId - 智能体 ID
   */
  onAgentSelected(agentId) {
    this.selectAgent(agentId);
  },

  /**
   * 启动轮询
   */
  startPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.isPollingPaused = false;
    this.scheduleNextPoll();
  },

  /**
   * 调度下一次轮询（支持退避）
   */
  scheduleNextPoll() {
    if (this.isPollingPaused) return;
    
    // 根据连续错误次数计算退避间隔
    const backoffMultiplier = Math.min(Math.pow(2, this.consecutiveErrors), 15);
    const interval = Math.min(this.pollInterval * backoffMultiplier, this.maxBackoffInterval);
    
    this.pollTimer = setTimeout(() => {
      this.poll();
    }, interval);
  },

  /**
   * 停止轮询
   */
  stopPolling() {
    this.isPollingPaused = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  },

  /**
   * 执行一次轮询
   */
  async poll() {
    if (this.isPollingPaused) return;
    
    try {
      // 更新智能体列表
      const agentsRes = await API.getAgents();
      const newAgents = agentsRes.agents || [];
      
      // 请求成功，重置错误计数
      this.consecutiveErrors = 0;
      
      // 检查是否有变化（数量变化或运算状态变化）
      const hasChanges = this.hasAgentChanges(newAgents);
      
      if (hasChanges) {
        const isNewAgent = newAgents.length !== this.agents.length;
        this.agents = newAgents;
        this.agentsById.clear();
        this.agents.forEach(agent => {
          this.agentsById.set(agent.id, agent);
        });
        AgentList.setAgents(this.agents);
        OverviewPanel.setAgents(this.agents);
        
        // 只在有新智能体时更新岗位和组织树
        if (isNewAgent) {
          const [rolesRes, treeRes, roleTreeRes] = await Promise.all([
            API.getRoles(),
            API.getOrgTree(),
            API.getRoleTree(),
          ]);
          this.roles = rolesRes.roles || [];
          OverviewPanel.setRoles(this.roles);
          OverviewPanel.setTree(treeRes.tree);
          OverviewPanel.setRoleTree(roleTreeRes.tree);
        }
      }

      // 更新当前选中智能体的消息
      if (this.selectedAgentId) {
        const messagesRes = await API.getAgentMessages(this.selectedAgentId);
        const messages = messagesRes.messages || [];
        const lastCount = this.lastMessageCounts.get(this.selectedAgentId) || 0;
        
        if (messages.length > lastCount) {
          // 有新消息，追加到列表
          const newMessages = messages.slice(lastCount);
          newMessages.forEach(msg => {
            ChatPanel.appendMessage(msg);
          });
          this.lastMessageCounts.set(this.selectedAgentId, messages.length);
        }
      }

      // 检查其他智能体是否有新消息（限制并发）
      await this.checkNewMessages();

      // 检查 LLM 连接状态
      await this.checkLlmStatus();
      
      // 检查错误和重试事件
      await this.checkEvents();

    } catch (error) {
      this.consecutiveErrors++;
      // 只在首次错误或错误次数变化时打印日志，避免刷屏
      if (this.consecutiveErrors === 1 || this.consecutiveErrors % 5 === 0) {
        console.warn(`轮询失败 (连续 ${this.consecutiveErrors} 次):`, error.message || error);
      }
    } finally {
      // 调度下一次轮询
      this.scheduleNextPoll();
    }
  },

  /**
   * 检查其他智能体是否有新消息
   * 限制并发请求数量，避免请求风暴
   */
  async checkNewMessages() {
    // 只检查非当前选中的智能体，且限制最多检查 5 个
    const agentsToCheck = this.agents
      .filter(agent => agent.id !== this.selectedAgentId)
      .slice(0, 5);

    // 串行检查，避免并发请求过多
    for (const agent of agentsToCheck) {
      try {
        const res = await API.getAgentMessages(agent.id);
        const messages = res.messages || [];
        const lastCount = this.lastMessageCounts.get(agent.id) || 0;

        if (messages.length > lastCount) {
          // 有新消息，标记该智能体
          AgentList.markNewMessage(agent.id);
          this.lastMessageCounts.set(agent.id, messages.length);
        }
      } catch (error) {
        // 单个智能体请求失败，跳过继续
        break; // 如果有错误，停止检查其他智能体
      }
    }
  },

  /**
   * 检查 LLM 连接状态，错误时自动弹出设置页面
   */
  async checkLlmStatus() {
    try {
      const status = await API.getConfigStatus();
      
      // LLM 连接错误时自动弹出设置页面（如果设置页面未打开）
      if (status.llmStatus === 'error' && status.lastError && !LlmSettingsModal.isOpen) {
        console.log('检测到 LLM 连接错误，自动打开设置页面');
        this.openSettings({ errorMessage: `LLM 连接错误: ${status.lastError}` });
      }
    } catch (err) {
      // 状态检查失败，忽略
    }
  },

  /**
   * 检查智能体列表是否有变化（数量、状态或运算状态）
   * @param {Array} newAgents - 新的智能体列表
   * @returns {boolean} 是否有变化
   */
  hasAgentChanges(newAgents) {
    // 数量变化
    if (newAgents.length !== this.agents.length) {
      return true;
    }
    
    // 检查每个智能体的状态是否有变化
    for (const newAgent of newAgents) {
      const oldAgent = this.agentsById.get(newAgent.id);
      if (!oldAgent) {
        return true;
      }
      // 检查运算状态变化
      if (oldAgent.computeStatus !== newAgent.computeStatus) {
        return true;
      }
      // 检查其他状态变化
      if (oldAgent.status !== newAgent.status) {
        return true;
      }
    }
    
    return false;
  },

  // 上次检查事件的时间戳（初始化为当前时间，避免显示历史事件）
  _lastEventCheckTime: new Date().toISOString(),

  /**
   * 检查错误和重试事件
   */
  async checkEvents() {
    try {
      const result = await API.getEvents(this._lastEventCheckTime);
      this._lastEventCheckTime = result.timestamp;
      
      // 处理错误事件
      if (result.errors && result.errors.length > 0) {
        console.log('[checkEvents] 收到错误事件:', result.errors);
        for (const error of result.errors) {
          // 用户中断不是严重错误，使用 Toast 警告提示
          if (error.errorType === 'llm_call_aborted') {
            const agentName = this._getAgentDisplayName(error.agentId);
            Toast.warning(`${agentName} 的 LLM 调用已被中断`, 3000);
            continue;
          }
          
          // 其他错误显示错误弹窗
          if (window.ErrorModal) {
            window.ErrorModal.show({
              title: this._getErrorTitle(error.errorType),
              message: error.message,
              errorType: error.errorType,
              agentId: error.agentId,
              originalError: error.originalError,
              errorName: error.errorName,
              taskId: error.taskId,
              originalMessageId: error.originalMessageId,
              timestamp: error.timestamp
            });
          }
        }
      }
      
      // 处理重试事件
      if (result.retries && result.retries.length > 0) {
        console.log('[checkEvents] 收到重试事件:', result.retries);
        for (const retry of result.retries) {
          const agentName = this._getAgentDisplayName(retry.agentId);
          
          if (retry.isFinalFailure) {
            // 最后一次尝试也失败了，显示错误提示
            Toast.error(`${agentName} LLM 调用失败 (${retry.attempt}/${retry.maxRetries})，所有重试已用尽`, 8000);
          } else {
            // 还有重试机会，显示重试提示
            Toast.warning(`${agentName} LLM 调用失败，正在重试 (${retry.attempt}/${retry.maxRetries})...`, 5000);
          }
        }
      }
    } catch (err) {
      // 事件检查失败，忽略
      console.warn('检查事件失败:', err);
    }
  },

  /**
   * 获取错误标题
   * @param {string} errorType - 错误类型
   * @returns {string} 错误标题
   */
  _getErrorTitle(errorType) {
    const titles = {
      'llm_call_failed': 'LLM 调用失败',
      'llm_call_aborted': 'LLM 调用已中断',
      'context_limit_exceeded': '上下文超出限制',
      'max_tool_rounds_exceeded': '工具调用次数超限',
      'agent_message_processing_failed': '智能体处理异常',
      'network_error': '网络错误',
      'api_error': 'API 错误'
    };
    return titles[errorType] || '发生错误';
  },

  /**
   * 获取智能体显示名称
   * @param {string} agentId - 智能体 ID
   * @returns {string} 显示名称
   */
  _getAgentDisplayName(agentId) {
    if (!agentId) return '未知';
    if (agentId === 'user' || agentId === 'root') {
      return agentId;
    }
    const agent = this.agentsById.get(agentId);
    if (agent) {
      if (agent.customName) {
        return agent.customName;
      }
      if (agent.roleName) {
        return `${agent.roleName}（${agentId}）`;
      }
    }
    return agentId;
  },
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// 导出供其他模块使用
window.App = App;
