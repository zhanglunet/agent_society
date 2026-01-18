# Chrome 模块变更日志

## [2026-01-18] 管理面板标签页列表UI修复

### Fixed
- 修复标签页列表只能显示一个标签页的问题
- 修复长URL导致横向滚动的问题
- 添加文本截断和tooltip显示完整内容

### Changed
- `modules/chrome/web/panel.css`: 添加滚动和文本截断样式
  - 为 `.browser-list` 和 `.tab-list` 添加最大高度限制和垂直滚动支持
  - 为 `.browser-item` 和 `.tab-item` 添加 `min-width: 0` 支持flex收缩
  - 为 `.browser-info` 和 `.tab-info` 添加溢出隐藏
  - 为文本元素添加截断样式（`white-space: nowrap`、`overflow: hidden`、`text-overflow: ellipsis`）
- `modules/chrome/web/panel.js`: 为长文本添加title属性
  - 在 `renderTabList` 方法中为标题和URL添加 `title` 属性
  - 在 `renderBrowserList` 方法中为浏览器ID添加 `title` 属性

### Technical Details
- 列表容器最大高度设置为 400px
- 超出内容通过垂直滚动查看
- 长文本显示省略号，鼠标悬停显示完整内容
- 保持原有交互功能和样式风格不变

---

## [2026-01-18] chrome_save_resource 批量保存功能

### 变更内容

#### 1. 参数变更
- **修改前**: `resourceUrl` (string) - 单个资源URL
- **修改后**: `resourceUrls` (array) - 资源URL数组

#### 2. 返回值变更
- **修改前**:
  ```javascript
  {
    ok: true,
    artifactId: 'artifact-123',
    filename: 'artifact-123.jpg',
    resourceUrl: 'https://example.com/image.jpg',
    format: 'jpg'
  }
  ```

- **修改后**:
  ```javascript
  {
    ok: true,
    artifactIds: ['artifact-123', 'artifact-456', null],
    images: ['artifact-123.jpg', 'artifact-456.png'],  // 新增：用于前端显示
    successCount: 2,
    failureCount: 1,
    totalCount: 3,
    errors: [
      {
        index: 2,
        resourceUrl: 'https://example.com/not-found.jpg',
        error: 'fetch_resource_failed',
        message: '404 Not Found'
      }
    ]
  }
  ```

#### 3. 功能增强
- 支持一次性保存多个资源
- 部分失败不影响其他资源的保存
- 返回详细的成功/失败统计
- 提供每个失败资源的错误详情
- **新增 `images` 字段**：包含成功保存的图片文件名数组，用于前端聊天界面显示缩略图

#### 4. 向后兼容性
- 仍然支持传入单个URL（作为数组的唯一元素）
- 返回值结构保持一致，只是将单个值改为数组

### 修改的文件
1. `modules/chrome/tools.js` - 工具定义
   - 参数 `resourceUrl` 改为 `resourceUrls` (array)
   - 更新描述说明支持批量保存

2. `modules/chrome/page_actions.js` - 核心实现
   - `saveResource` 方法重构为支持数组参数
   - 添加批量处理逻辑
   - 添加错误收集和统计

3. `modules/chrome/index.js` - 调用入口
   - 更新参数传递：`args.resourceUrl` → `args.resourceUrls`

### 新增文件
1. `modules/chrome/SAVE_RESOURCE_USAGE.md` - 使用说明文档
2. `test/modules/chrome_save_resource.test.js` - 单元测试
3. `modules/chrome/CHANGELOG.md` - 本变更日志

### 测试覆盖
- 单个资源保存（向后兼容）
- 多个资源批量保存
- 部分失败场景
- data URL 支持
- 空数组错误处理
- 缺少上下文错误处理
- 无效标签页错误处理

### 使用示例

#### 迁移指南

**旧代码**:
```javascript
// 保存单个资源
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrl: 'https://example.com/image.jpg'
});
console.log(result.artifactId);
```

**新代码**:
```javascript
// 保存单个资源（向后兼容）
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: ['https://example.com/image.jpg']
});
console.log(result.artifactIds[0]);

// 批量保存多个资源
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg'
  ]
});
console.log(`成功: ${result.successCount}, 失败: ${result.failureCount}`);
```

### 性能影响
- 批量保存时按顺序处理，不会并发请求
- 单个资源失败不影响后续资源
- 建议每批处理 10-20 个资源以保持稳定性

### 注意事项
1. 参数名称从 `resourceUrl` 改为 `resourceUrls`（复数形式）
2. 返回值中的 `artifactId` 改为 `artifactIds` 数组
3. 失败的资源在 `artifactIds` 数组中对应位置为 `null`
4. 通过 `errors` 数组可以获取每个失败资源的详细信息
