# docs 文件夹说明

## 作用
本文件夹存放 `web/v3` 前端重构项目的所有设计方案、规范文档和技术细节描述。它是整个重构项目的“设计真源”，指导代码实现并确保视觉与交互的一致性。

## 包含文件
- [architecture.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/web/v3/docs/architecture.md): 整体架构设计，包括技术栈选型、目录结构、模块责任划分和构建流程。
- [roadmap.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/web/v3/docs/roadmap.md): 开发路线图，规划了从基础骨架到核心业务的阶段性交付路径。
- [ux-design.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/web/v3/docs/ux-design.md): 用户体验设计，定义页面骨架、布局逻辑、核心交互流程及用户使用用例。
- [theme-spec.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/web/v3/docs/theme-spec.md): 视觉规范落地，详细描述如何利用 PrimeVue 的 Design Tokens 和 Pass Through 实现视觉统一。
- [state-management.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/web/v3/docs/state-management.md): 状态管理设计，定义 Pinia Store 结构、数据流转逻辑、异常处理及异步轮询机制。
- [component-library.md](file:///c:/Users/ASUS/Desktop/ai-build-ai/agents/web/v3/docs/component-library.md): 组件库规范，定义核心 UI 组件的接口、状态转换及职责划分。

## 责任划分
- 设计文档负责定义“做什么”和“怎么做”。
- 源码实现必须严格遵循此处定义的规范。
- 任何重大的技术选型或交互变更应首先在本文档集中更新并确认。
