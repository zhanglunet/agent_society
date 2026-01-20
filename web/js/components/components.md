# components

## 综述
该目录存放 Web UI 的组件脚本，覆盖主页面的主要交互区域（智能体列表、对话面板、总览、模块管理）与多个弹窗（消息/智能体/岗位详情、错误提示、LLM 设置），并包含附件与工件管理相关的界面逻辑。

组件脚本以传统 <script> 方式加载（非 ES Module）。多数组件以对象字面量方式定义，并在末尾通过 window.* 暴露给其他脚本使用；少数组件以 class 声明，作为全局构造器供调用方 new 使用，同时保留 module.exports 以便在测试或其他运行环境复用。

## 文件列表
- agent-detail-modal.js: 功能：智能体详情弹窗。责任：展示单个智能体的属性、调试信息、统计数据与 system prompt，并支持设置智能体自定义名称。内部结构：定义 AgentDetailModal 对象；init 负责绑定弹窗事件；show 负责从 App 获取智能体并并行加载统计与 system prompt；renderContent 渲染 HTML；hide 关闭弹窗；包含 loadAgentStats、loadAgentSystemPrompt、formatTime、escapeHtml 等辅助方法；末尾通过 window.AgentDetailModal 暴露。
- agent-list.js: 功能：智能体列表面板。责任：渲染左侧智能体列表，支持搜索筛选、排序、显示新消息标记，并提供删除智能体与中断 LLM 调用入口。内部结构：定义 AgentList 对象；维护 agents/filteredAgents/selectedAgentId 等状态；init 绑定输入与按钮事件；setAgents 更新数据并触发筛选排序；applyFilterAndSort 组合过滤与排序；render 输出列表；updateSelection 与 markNewMessage 提供外部状态更新入口；末尾通过 window.AgentList 暴露。
- artifact-manager.mjs: 功能：工件管理器窗口。责任：在独立浮动窗口中展示工件列表与详情，并提供按扩展名筛选、搜索、视图切换、最大化/关闭，以及工作空间文件浏览能力。内部结构：定义 ArtifactManager 类；构造函数接收 container/windowEl/api/logger；_init 负责创建 UI、绑定事件并加载数据；包含 loadArtifacts、loadWorkspaces、render 列表与详情等方法；在浏览器脚本环境下作为全局构造器使用，并保留 CommonJS 导出（module.exports）。
- attachment-manager.js: 功能：消息附件管理器。责任：管理待发送附件队列，处理上传进度、就绪/失败状态，并渲染输入框上方的附件预览区。内部结构：定义 AttachmentManager 对象；attachments 保存附件状态；init 绑定预览容器与状态回调；add/remove 维护附件列表；setProgress/setReady/setError 更新状态；getArtifactRefs 汇总可发送的 artifactRef；render 负责输出预览 HTML；末尾通过 window.AttachmentManager 暴露。
- chat-panel.mjs: 功能：对话面板。责任：展示与当前选中智能体的消息列表，支持发送文本与附件消息，支持查看消息详情与工具调用参数/结果展开，并处理附件上传流程与错误提示。内部结构：定义 ChatPanel 对象；维护 messages、messagesById、thinkingMap 与上传状态；init 绑定输入框与按钮事件并初始化 AttachmentManager；setAgent/setMessages/appendMessage 负责更新渲染；scrollToMessage 与 toggleToolDetails 提供交互入口；依赖 window.API、Toast、MessageModal、AttachmentManager 等全局对象；末尾通过 window.ChatPanel 暴露。
- components.md: 功能：本目录说明文档。责任：描述本目录的综述、文件列表与子目录列表。内部结构：包含“综述 / 文件列表 / 子目录列表”。
- error-modal.js: 功能：错误弹窗。责任：以持久弹窗形式展示错误信息，支持复制详细信息与手动关闭，并提供从消息 payload 检测错误的入口。内部结构：定义 ErrorModal 对象；init 创建 DOM 并绑定事件；show/hide 控制显示；_formatErrorDetails/_copyErrorInfo 等辅助方法；checkAndShowError 从消息中提取错误并弹窗；末尾通过 window.ErrorModal 暴露。
- image-viewer.js: 功能：图片查看器。责任：在容器内展示图片信息与缩略图，并提供灯箱预览（缩放、拖拽、键盘切换）。内部结构：定义 ImageViewer 类；render 渲染缩略图与提示；_getImageSrc 统一图片来源处理；通过全局函数实现灯箱交互；保留 CommonJS 导出（module.exports）。
- json-viewer.js: 功能：JSON 树查看器。责任：以树形结构展示 JSON，支持展开/折叠、字符串截断与右键复制等交互。内部结构：定义 JSONViewer 类；render 生成根节点；_createNode 递归创建节点；_toggleNode 控制展开状态；包含右键菜单与复制辅助逻辑；保留 CommonJS 导出（module.exports）。
- llm-settings-modal.js: 功能：LLM 设置模态框。责任：管理默认 LLM 配置与多服务列表配置，支持新增/编辑/删除服务与能力标签配置，并在连接错误时作为配置入口展示。内部结构：定义 STANDARD_CAPABILITIES/DEFAULT_CAPABILITIES 常量；定义 LlmSettingsModal 对象；init 负责创建 DOM 与绑定事件；open/close 控制显示；包含表单校验、配置加载与保存（调用 window.API）等方法；末尾通过 window.LlmSettingsModal 暴露。
- message-modal.js: 功能：消息详情弹窗。责任：展示单条消息的技术数据（ID、发送者、时间、payload 等），用于排查与查看完整内容。内部结构：定义 MessageModal 对象；init 绑定遮罩/按钮/ESC 关闭事件；show 从 ChatPanel.messagesById 取消息并渲染；renderContent 输出字段与 JSON 高亮；末尾通过 window.MessageModal 暴露。
- modules-panel.js: 功能：模块管理面板。责任：展示已加载模块列表，加载模块的 Web 组件并渲染到面板中，并提供刷新入口。内部结构：定义 ModulesPanel 对象；init 绑定 DOM；show/loadModules 拉取模块列表；loadModuleDetail 获取模块 Web 组件数据；renderModuleComponent 负责注入 HTML/CSS 并执行 JS，然后调用 initModulePanel 做统一初始化；末尾通过 window.ModulesPanel 暴露。
- overview.js: 功能：总览面板。责任：展示岗位统计、岗位从属关系树与组织树，并提供岗位详情与删除岗位入口。内部结构：定义 OverviewPanel 对象；init 绑定 DOM；setAgents/setRoles/setTree/setRoleTree 更新数据；show/hide 控制面板切换；render 触发三块区域渲染；末尾通过 window.OverviewPanel 暴露。
- role-detail-modal.js: 功能：岗位详情弹窗。责任：展示岗位属性、职责提示词、绑定的 LLM 服务与工具组配置，并展示该岗位下智能体列表，支持跳转智能体详情。内部结构：定义 RoleDetailModal 对象；init 创建 DOM 并绑定事件；loadLlmServices/loadToolGroups 缓存基础数据；showByRoleId/show 控制显示与加载；renderContent 渲染编辑表单与列表；末尾通过 window.RoleDetailModal 暴露。
- text-viewer.js: 功能：文本查看器。责任：在容器内显示纯文本，包含行号并同步滚动，便于查看日志与文本工件内容。内部结构：定义 TextViewer 类；render 构建行号区与内容区并绑定滚动同步；保留 CommonJS 导出（module.exports）。
- toast.js: 功能：Toast 通知。责任：以短提示方式反馈操作结果与状态。内部结构：定义 Toast 对象；init 创建容器；show/success/error/warning/info 负责创建提示并定时移除；末尾通过 window.Toast 暴露。

## 子目录列表
- （无）
