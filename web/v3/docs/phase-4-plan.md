# 阶段四：Pinia Store 与 API 接入执行计划

本阶段目标是实现数据驱动的 UI，将静态 Mock 数据替换为受 Pinia 管理的动态状态。

## 1. 基础建设
- [x] 定义全局类型 (`src/types/index.ts`): 定义 `User`, `Org`, `Agent`, `Message` 等核心接口。
- [x] 对接真实服务器 (`src/services/api.ts`): 封装与后端 API 的交互，将后端数据映射到前端领域模型。
- [x] 移除冗余的 Mock 服务: 确保系统完全由真实数据驱动。

## 2. 组件集成步骤 (逐个交付)

### 步骤 4.1: 全局侧栏 (GlobalSidebar) 集成
- [x] **Store 准备**:
    - 实现 `useAppStore`: 管理侧栏收缩状态 (`isSidebarCollapsed`)。
    - 实现 `useOrgStore`: 管理组织列表数据。
- [x] **组件连接**:
    - 将 `GlobalSidebar.vue` 中的静态 `tools` 和 `orgs` 替换为从 Store 获取。
    - 实现侧栏收缩/展开切换逻辑。
    - 实现点击组织项自动开启标签页。

### 步骤 4.2: 标签页系统 (WorkspaceTabs) 集成
- [ ] **Store 准备**:
    - 在 `useAppStore` 中完善 `tabs` 管理逻辑（添加、删除、激活）。
- [ ] **组件连接**:
    - 将 `WorkspaceTabs.vue` 连接到 `appStore.tabs`。
    - 实现标签切换、关闭功能。
    - 处理标签页为空时的展示逻辑。

### 步骤 4.3: 智能体列表 (AgentList) 集成
- [ ] **Store 准备**:
    - 实现 `useAgentStore`: 根据当前激活的组织 ID 加载对应的智能体列表。
- [ ] **组件连接**:
    - 在 `WorkspaceTabs` 内部的 `SplitterPanel` 中接入 `agentStore.agentsByOrgId`。
- [ ] **交付确认**: 切换组织 Tab 时，智能体列表同步更新。

### 步骤 4.4: 聊天区域数据流接入
- [ ] **Store 准备**:
    - 实现 `useChatStore`: 管理消息历史、发送状态。
- [ ] **组件连接**:
    - 接入消息列表渲染和发送逻辑。
- [ ] **交付确认**: 实现完整的数据闭环。

## 3. 验收标准
- 所有 UI 状态均由 Pinia Store 驱动。
- 模拟 API 调用具有延时效果，UI 显示正确的加载状态。
- 刷新页面后，部分状态（如主题、收缩状态）能够恢复。
