# chrome_save_resource 前端集成说明

## 工件缩略图显示机制

### 概述

聊天界面在压缩的工具调用组之后会显示一个工件缩略图列表，展示所有连续工具调用过程中生成的工件。

### 前端识别机制

前端代码（`web/js/components/chat-panel.mjs`）通过以下方式识别工具调用中创建的图片：

```javascript
// 从工具调用消息中提取图片
for (const message of toolCallMessages) {
  let images = [];
  
  if (message.payload) {
    // 方式1: 直接从 payload.images 获取
    if (Array.isArray(message.payload.images)) {
      images = message.payload.images;
    } 
    // 方式2: 从 payload.result.images 获取
    else if (message.payload.result && Array.isArray(message.payload.result.images)) {
      images = message.payload.result.images;
    }
  }
  
  allImages.push(...images);
}
```

### chrome_save_resource 的返回值结构

为了让前端能够识别并显示保存的工件，`chrome_save_resource` 的返回值包含 `images` 字段：

```javascript
{
  ok: true,
  artifactIds: ['abc123', 'def456'],           // 工件ID（不含扩展名）
  images: ['abc123.jpg', 'def456.png'],        // 完整文件名（含扩展名）
  successCount: 2,
  failureCount: 0,
  totalCount: 2
}
```

### 关键点

1. **`images` 字段是必需的**
   - 前端通过 `payload.result.images` 数组来识别图片
   - 数组中的每个元素是完整的文件名（包含扩展名）

2. **文件名格式**
   - 格式：`{artifactId}.{extension}`
   - 示例：`abc123-def456-ghi789.jpg`

3. **只包含成功的工件**
   - `images` 数组只包含成功保存的工件
   - 失败的资源不会出现在 `images` 数组中

4. **显示路径**
   - 前端会自动添加 `/artifacts/` 前缀
   - 最终路径：`/artifacts/abc123.jpg`

## 与 chrome_screenshot 的对比

### chrome_screenshot 返回值

```javascript
{
  ok: true,
  images: ['screenshot-123.jpg'],  // 单个截图
  url: 'https://example.com',
  title: '页面标题',
  fullPage: false
}
```

### chrome_save_resource 返回值

```javascript
{
  ok: true,
  artifactIds: ['resource-1', 'resource-2'],
  images: ['resource-1.jpg', 'resource-2.png'],  // 多个资源
  successCount: 2,
  failureCount: 0,
  totalCount: 2
}
```

两者都通过 `images` 字段提供文件名数组，前端处理方式完全一致。

## 前端渲染示例

```html
<!-- 工具调用组的工件缩略图 -->
<div class="tool-call-group-artifacts">
  <div class="tool-call-group-artifacts-label">创建的工件:</div>
  <div class="message-images">
    <img 
      class="message-thumbnail" 
      src="/artifacts/abc123.jpg" 
      alt="工件 1"
      onclick="ImageViewer.show(['abc123.jpg', 'def456.png'], 0)"
    />
    <img 
      class="message-thumbnail" 
      src="/artifacts/def456.png" 
      alt="工件 2"
      onclick="ImageViewer.show(['abc123.jpg', 'def456.png'], 1)"
    />
  </div>
</div>
```

## 测试验证

### 验证步骤

1. 调用 `chrome_save_resource` 保存多个资源
2. 检查返回值中的 `images` 字段
3. 在聊天界面查看工具调用组
4. 确认缩略图正确显示

### 预期结果

- 工具调用组下方显示"创建的工件:"标签
- 显示所有成功保存的图片缩略图
- 点击缩略图可以打开图片查看器
- 失败的资源不会显示缩略图

## 故障排查

### 问题：缩略图不显示

**可能原因**：
1. 返回值中缺少 `images` 字段
2. `images` 数组为空
3. 文件名格式不正确（缺少扩展名）
4. 工件文件不存在

**解决方法**：
1. 检查 `saveResource` 方法的返回值
2. 确认 `filePaths` 数组正确填充
3. 验证文件名包含正确的扩展名
4. 检查工件是否成功保存到 `agent-society-data/artifacts/` 目录

### 问题：部分图片不显示

**可能原因**：
1. 部分资源保存失败
2. 文件扩展名识别错误

**解决方法**：
1. 检查 `errors` 数组了解失败原因
2. 验证资源 URL 的格式识别逻辑
3. 确认 `filePaths` 数组中失败位置为 `null`

## 相关文件

- `web/js/components/chat-panel.mjs` - 前端渲染逻辑
- `modules/chrome/page_actions.js` - 后端实现
- `modules/chrome/SAVE_RESOURCE_USAGE.md` - 使用说明
- `modules/chrome/CHANGELOG.md` - 变更日志
