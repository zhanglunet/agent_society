/**
 * 主应用模块
 * 管理全局状态、路由、定时轮询
 */

const App = {
  // 应用状态
  currentView: 'list',      // 当前视图 ('list' 或 'overview')
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

  /**
   * 初始化应用
   */
  async init() {
    console.log('智能体对话查看器初始化中...');

    // 初始化所有组件
    Toast.init();
    AgentList.init();
    ChatPanel.init();
    OverviewPanel.init();
    MessageModal.init();
    AgentDetailModal.init();

    // 绑定视图切换按钮
    this.bindViewToggle();

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

    if (listBtn) {
      listBtn.addEventListener('click', () => this.switchToListView());
    }
    if (overviewBtn) {
      overviewBtn.addEventListener('click', () => this.switchToOverviewView());
    }
  },

  /**
   * 切换到列表视图
   */
  switchToListView() {
    this.currentView = 'list';
    this.updateViewToggleButtons();
    OverviewPanel.hide();
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
    OverviewPanel.show();
  },

  /**
   * 更新视图切换按钮状态
   */
  updateViewToggleButtons() {
    const listBtn = document.getElementById('view-list-btn');
    const overviewBtn = document.getElementById('view-overview-btn');

    if (listBtn) {
      listBtn.classList.toggle('active', this.currentView === 'list');
    }
    if (overviewBtn) {
      overviewBtn.classList.toggle('active', this.currentView === 'overview');
    }
  },

  /**
   * 加载初始数据
   */
  async loadInitialData() {
    try {
      // 并行加载智能体、岗位和组织树
      const [agentsRes, rolesRes, treeRes] = await Promise.all([
        API.getAgents(),
        API.getRoles(),
        API.getOrgTree(),
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
      
      // 检查是否有新智能体
      if (newAgents.length !== this.agents.length) {
        this.agents = newAgents;
        this.agentsById.clear();
        this.agents.forEach(agent => {
          this.agentsById.set(agent.id, agent);
        });
        AgentList.setAgents(this.agents);
        OverviewPanel.setAgents(this.agents);
        
        // 更新组织树
        const treeRes = await API.getOrgTree();
        OverviewPanel.setTree(treeRes.tree);
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
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// 导出供其他模块使用
window.App = App;
