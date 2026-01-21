# 工件链接分组显示功能任务列表

## 任务概述

本任务列表将工件链接分组显示功能的实现分解为可执行的具体任务。按照依赖关系和执行顺序组织，遵循"先开发被依赖的，先开发先执行的"原则。

## 任务状态说明

- `[ ]` 未开始
- `[-]` 进行中
- `[x]` 已完成

---

## 阶段1：工件管理器接口实现

### 1. 实现批量元数据获取接口

- [ ] 1.1 在 `ArtifactManager` 类中实现 `getArtifactsMetadata` 方法
  - 文件：`web/js/components/artifact-manager.mjs`
  - 输入：工件ID数组 `string[]`
  - 输出：`Map<string, Object>`，key为工件ID，value为完整元数据对象
  - 使用 `Promise.allSettled` 并发获取元数据
  - 失败的工件不添加到Map中
  - 支持空数组输入，返回空Map

- [ ] 1.2 添加完整的函数注释
  - 说明接口用途、参数、返回值
  - 说明错误处理策略
  - 添加使用示例

- [ ] 1.3 添加错误处理和日志
  - 捕获API调用异常
  - 记录失败的工件ID
  - 使用 `this.logger` 记录调试信息

### 2. 实现MIME类型判断接口

- [ ] 2.1 在 `ArtifactManager` 类中实现 `canOpenMimeType` 静态方法
  - 文件：`web/js/components/artifact-manager.mjs`
  - 输入：MIME类型字符串
  - 输出：布尔值
  - 支持的类型：图片、JSON、文本、代码、HTML、CSS
  - 处理null/undefined输入
  - 大小写不敏感

- [ ] 2.2 定义可打开的MIME类型常量
  - 从 `mime-types.mjs` 导入类型常量
  - 组合成 `OPENABLE_MIME_TYPES` 数组
  - 添加注释说明每种类型

- [ ] 2.3 添加完整的函数注释
  - 说明接口用途、参数、返回值
  - 列出支持的MIME类型
  - 添加使用示例

---

## 阶段2：工件管理器优化

### 3. 优化工件列表加载

- [ ] 3.1 修改 `loadArtifacts` 方法使用批量接口
  - 文件：`web/js/components/artifact-manager.mjs`
  - 收集所有工件ID
  - 调用 `getArtifactsMetadata` 批量获取元数据
  - 合并元数据到工件对象
  - 降级处理：元数据获取失败时使用 `filename` 作为 `name`

- [ ] 3.2 添加性能日志
  - 记录批量获取的工件数量
  - 记录获取成功和失败的数量
  - 记录耗时

### 4. 确认工件名显示

- [ ] 4.1 检查 `_renderIconView` 方法
  - 文件：`web/js/components/artifact-manager.mjs`
  - 确认使用 `item.name` 优先于 `item.actualFilename`
  - 降级顺序：`name` → `actualFilename` → `filename` → `id`

- [ ] 4.2 检查 `_renderDetailView` 方法
  - 文件：`web/js/components/artifact-manager.mjs`
  - 确认使用 `item.name` 优先于 `item.actualFilename`
  - 降级顺序：`name` → `actualFilename` → `filename` → `id`

- [ ] 4.3 检查 `openArtifact` 方法
  - 文件：`web/js/components/artifact-manager.mjs`
  - 确认标题栏使用 `metadata.name`
  - 已正确实现，仅需验证

---

## 阶段3：聊天面板实现

### 5. 实现元数据获取方法

- [ ] 5.1 在 `ChatPanel` 类中添加 `_getArtifactsMetadataMap` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 调用 `ArtifactManager.getInstance().getArtifactsMetadata()`
  - 添加 try-catch 错误处理
  - 失败时返回空Map
  - 添加完整的函数注释

- [ ] 5.2 添加工件ID收集方法 `_collectAllArtifacts`
  - 从工具调用消息中提取所有工件ID
  - 去重
  - 返回工件ID数组

### 6. 实现工件分组逻辑

- [ ] 6.1 在 `ChatPanel` 类中添加 `_groupArtifactsByType` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 输入：工件ID数组、元数据Map
  - 输出：分组对象 `{ images: [], openable: [], downloadOnly: [] }`
  - 使用 `isImageType` 判断图片类型
  - 使用 `ArtifactManager.canOpenMimeType` 判断可打开类型
  - 元数据不存在时归入下载组
  - 添加完整的函数注释

- [ ] 6.2 从 `mime-types.mjs` 导入 `isImageType` 函数
  - 如果不存在则创建该函数
  - 判断MIME类型是否为图片类型

### 7. 实现各类型渲染方法

- [ ] 7.1 实现 `_renderImageThumbnail` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 输入：工件ID、元数据
  - 输出：HTML字符串
  - 显示缩略图（100x100px）
  - 显示工件名（截断至15字符）
  - 添加 `onerror` 处理显示占位图标
  - 添加 `data-artifact-id` 属性
  - 添加完整的函数注释

- [ ] 7.2 实现 `_renderOpenableLink` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 输入：工件ID、元数据
  - 输出：HTML字符串
  - 显示文件图标和工件名
  - 添加 `data-artifact-id` 属性
  - 使用 `getFileIconByMimeType` 获取图标
  - 添加完整的函数注释

- [ ] 7.3 实现 `_renderDownloadLink` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 输入：工件ID、元数据
  - 输出：HTML字符串
  - 显示文件图标、工件名和下载图标
  - 添加 `download` 属性
  - 添加 `data-artifact-id` 属性
  - 元数据不存在时使用工件ID作为名称
  - 添加完整的函数注释

- [ ] 7.4 实现 `_truncateName` 辅助方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 输入：名称字符串、最大长度
  - 输出：截断后的字符串
  - 超长时添加 "..." 后缀
  - 添加完整的函数注释

- [ ] 7.5 实现 `getFileIconByMimeType` 辅助函数
  - 文件：`web/js/utils/mime-types.mjs` 或 `chat-panel.mjs`
  - 根据MIME类型返回对应的emoji图标
  - 支持常见类型：图片、JSON、文本、代码等
  - 默认返回 📄

### 8. 实现分组渲染主方法

- [ ] 8.1 实现 `_renderArtifactGroups` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 输入：工件ID数组、元数据Map
  - 输出：HTML字符串
  - 调用 `_groupArtifactsByType` 分组
  - 按顺序渲染三个分组：图片、可打开、下载
  - 每个分组有标签和内容区域
  - 空分组不显示
  - 添加完整的函数注释

### 9. 修改工具调用渲染方法

- [ ] 9.1 修改 `renderToolCallGroupArtifacts` 方法
  - 文件：`web/js/components/chat-panel.mjs`
  - 位置：约1070-1880行
  - 收集所有工件ID
  - 调用 `_getArtifactsMetadataMap` 获取元数据
  - 调用 `_renderArtifactGroups` 渲染分组
  - 保持异步处理
  - 添加错误处理

- [ ] 9.2 处理异步渲染
  - 方法改为 `async`
  - 调用处添加 `await`
  - 确保不阻塞其他消息渲染

---

## 阶段4：样式和测试

### 10. 添加CSS样式

- [ ] 10.1 添加工件分组容器样式
  - 文件：`web/css/chat-panel.css` 或相关CSS文件
  - `.tool-call-group-artifacts` 容器样式
  - `.tool-call-group-artifacts-label` 标签样式
  - 背景色、圆角、内边距

- [ ] 10.2 添加工件组样式
  - `.artifact-group` 组容器样式
  - `.artifact-group-label` 组标签样式
  - 组之间的间距

- [ ] 10.3 添加图片缩略图样式
  - `.artifact-thumbnails` 容器样式（flex布局）
  - `.artifact-thumbnail-item` 项样式
  - `.artifact-thumbnail-img` 图片样式（100x100px，圆角，边框）
  - `.artifact-thumbnail-name` 名称样式
  - `.thumbnail-error` 错误占位样式
  - hover效果

- [ ] 10.4 添加工件链接样式
  - `.artifact-links` 容器样式
  - `.artifact-link` 基础链接样式
  - `.artifact-link-openable` 可打开链接样式（蓝色背景）
  - `.artifact-link-download` 下载链接样式（灰色背景）
  - `.artifact-link-icon` 图标样式
  - `.artifact-link-name` 名称样式（截断）
  - `.artifact-link-download-icon` 下载图标样式
  - hover效果

### 11. 功能测试

- [ ] 11.1 测试批量元数据获取接口
  - 空数组输入
  - 单个工件ID
  - 多个工件ID
  - 部分工件不存在
  - API调用失败

- [ ] 11.2 测试MIME类型判断接口
  - 图片类型
  - JSON类型
  - 文本类型
  - 代码类型
  - 不支持的类型
  - null/undefined输入

- [ ] 11.3 测试工件分组逻辑
  - 纯图片工件
  - 纯可打开工件
  - 纯下载工件
  - 混合类型工件
  - 元数据缺失的工件

- [ ] 11.4 测试聊天面板渲染
  - 包含工件的工具调用消息
  - 图片缩略图显示
  - 可打开链接显示
  - 下载链接显示
  - 工件名显示正确
  - 点击链接行为正确

- [ ] 11.5 测试工件管理器
  - 列表显示工件名
  - 查看器标题显示工件名
  - 批量加载性能
  - 元数据获取失败的降级处理

### 12. 错误处理和边界测试

- [ ] 12.1 测试元数据获取失败
  - API返回错误
  - 网络超时
  - 部分工件失败
  - 降级显示工件ID

- [ ] 12.2 测试缩略图加载失败
  - 图片不存在
  - 图片格式错误
  - 显示占位图标
  - 保持可点击

- [ ] 12.3 测试工件名显示
  - 正常工件名
  - 超长工件名截断
  - 工件名为空
  - 工件名包含特殊字符（HTML转义）

### 13. 性能和用户体验测试

- [ ] 13.1 测试加载性能
  - 大量工件时的加载速度
  - 批量请求的并发性能
  - 渲染性能

- [ ] 13.2 测试视觉效果
  - 分组显示清晰
  - 样式美观
  - 响应式布局
  - 不同主题下的显示

- [ ] 13.3 测试交互体验
  - 点击响应及时
  - hover效果流畅
  - 错误提示友好
  - 加载状态明确

---

## 可选优化任务

### 14. 性能优化（可选）

- [ ]* 14.1 实现元数据缓存
  - 在 `ChatPanel` 中添加 `_metadataCache` Map
  - 缓存已获取的元数据
  - 避免重复请求

- [ ]* 14.2 实现图片懒加载
  - 使用 `Intersection Observer`
  - 图片进入视口时才加载
  - 提升初始渲染性能

- [ ]* 14.3 限制单次请求数量
  - 工件数量过多时分批请求
  - 避免单次请求过大

### 15. 功能增强（可选）

- [ ]* 15.1 添加工件链接的tooltip
  - 显示完整工件名
  - 显示文件大小
  - 显示创建时间

- [ ]* 15.2 支持更多文件类型预览
  - PDF预览
  - 视频预览
  - 音频预览

- [ ]* 15.3 添加工件链接的批量操作
  - 全部下载
  - 全部打开
  - 复制链接

---

## 任务依赖关系

```
阶段1（工件管理器接口）
  ├─ 任务1: 批量元数据获取接口
  └─ 任务2: MIME类型判断接口
      │
      ▼
阶段2（工件管理器优化）
  ├─ 任务3: 优化工件列表加载（依赖任务1）
  └─ 任务4: 确认工件名显示
      │
      ▼
阶段3（聊天面板实现）
  ├─ 任务5: 元数据获取方法（依赖任务1）
  ├─ 任务6: 工件分组逻辑（依赖任务2）
  ├─ 任务7: 各类型渲染方法（依赖任务6）
  ├─ 任务8: 分组渲染主方法（依赖任务7）
  └─ 任务9: 修改工具调用渲染（依赖任务5、8）
      │
      ▼
阶段4（样式和测试）
  ├─ 任务10: CSS样式
  ├─ 任务11: 功能测试（依赖所有前置任务）
  ├─ 任务12: 错误处理测试（依赖所有前置任务）
  └─ 任务13: 性能和体验测试（依赖所有前置任务）
```

---

## 实施建议

1. **严格按阶段顺序执行**：每个阶段完成后再进入下一阶段
2. **小步快跑**：每完成一个任务就进行单元测试
3. **及时集成**：完成一个模块后立即接入系统测试
4. **保持沟通**：遇到问题及时反馈，不要自作主张修改需求
5. **代码审查**：每个阶段完成后进行代码审查
6. **文档同步**：代码修改后及时更新注释和文档

---

## 预估工作量

- 阶段1：2-3小时
- 阶段2：1-2小时
- 阶段3：4-5小时
- 阶段4：2-3小时
- 总计：9-13小时

---

## 验收标准

完成所有必需任务（非可选任务）后，需满足以下验收标准：

1. ✅ 工件管理器提供批量元数据获取接口
2. ✅ 工件管理器提供MIME类型判断接口
3. ✅ 聊天面板中图片工件显示缩略图
4. ✅ 聊天面板中可打开工件显示为链接，显示工件名
5. ✅ 聊天面板中不可打开工件显示为下载链接，显示工件名
6. ✅ 工件管理器列表显示工件名
7. ✅ 工件查看器标题栏显示工件名
8. ✅ 所有功能测试通过
9. ✅ 错误处理完善，有合理的降级方案
10. ✅ 代码注释完整，符合项目规范
