# chrome_save_resource 使用说明

## 功能概述

`chrome_save_resource` 工具用于将页面上的资源（如图片）保存到工件系统。支持单个或批量保存多个资源。

## 参数说明

- `tabId` (必需): 标签页 ID
- `resourceUrls` (必需): 资源 URL 数组，每个元素可以是：
  - 完整的 HTTP/HTTPS URL
  - data URL (base64 编码)
- `filename` (可选): 自定义文件名，仅在保存单个资源时有效
- `type` (可选): 资源类型，默认为 'image'

## 返回值

```javascript
{
  ok: true,
  artifactIds: ['artifact-id-1', 'artifact-id-2', null],  // 工件ID数组，失败的为null
  images: ['artifact-id-1.jpg', 'artifact-id-2.png'],     // 成功保存的图片文件名数组（用于前端显示）
  successCount: 2,      // 成功保存的数量
  failureCount: 1,      // 失败的数量
  totalCount: 3,        // 总数量
  errors: [             // 错误详情（如果有）
    {
      index: 2,
      resourceUrl: 'https://example.com/not-found.jpg',
      error: 'fetch_resource_failed',
      message: '404 Not Found'
    }
  ]
}
```

**字段说明**：
- `artifactIds`: 所有资源对应的工件ID数组，失败的位置为 `null`
- `images`: 成功保存的图片文件名数组（包含扩展名），用于前端显示缩略图
- `successCount`: 成功保存的资源数量
- `failureCount`: 保存失败的资源数量
- `totalCount`: 总资源数量
- `errors`: 失败资源的详细错误信息（可选）

## 使用示例

### 示例 1: 保存单个资源

```javascript
// 向后兼容：传入单个 URL 字符串
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: ['https://example.com/image.jpg']
});

console.log(result.artifactIds[0]); // 'artifact-abc123'
```

### 示例 2: 批量保存多个资源

```javascript
// 先获取页面上的所有图片
const resources = await chrome_list_resources({
  tabId: 'tab-123',
  types: ['image']
});

// 提取所有图片的 URL
const imageUrls = resources.resources.map(r => r.src);

// 批量保存
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: imageUrls
});

console.log(`成功保存 ${result.successCount} 个图片`);
console.log(`失败 ${result.failureCount} 个图片`);

// 处理成功保存的工件
result.artifactIds.forEach((id, index) => {
  if (id) {
    console.log(`图片 ${index}: ${id}`);
  }
});
```

### 示例 3: 保存特定图片

```javascript
// 获取页面资源
const resources = await chrome_get_resources({
  tabId: 'tab-123',
  types: ['image']
});

// 筛选可见的大图片
const largeImages = resources.resources
  .filter(r => r.visible && r.width > 200 && r.height > 200)
  .map(r => r.src);

// 保存筛选后的图片
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: largeImages
});
```

### 示例 4: 处理部分失败

```javascript
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg'
  ]
});

if (result.failureCount > 0) {
  console.log('部分资源保存失败：');
  result.errors.forEach(err => {
    console.log(`- 索引 ${err.index}: ${err.resourceUrl}`);
    console.log(`  错误: ${err.message}`);
  });
}

// 获取成功保存的工件ID
const successfulIds = result.artifactIds.filter(id => id !== null);
console.log(`成功保存的工件: ${successfulIds.join(', ')}`);
```

### 示例 5: 保存 data URL

```javascript
// 从 canvas 获取 data URL
const dataUrl = await chrome_evaluate({
  tabId: 'tab-123',
  script: `
    const canvas = document.querySelector('canvas');
    return canvas.toDataURL('image/png');
  `
});

// 保存 data URL
const result = await chrome_save_resource({
  tabId: 'tab-123',
  resourceUrls: [dataUrl.result]
});
```

## 错误处理

### 常见错误

1. **context_required**: 缺少运行时上下文
   - 原因：工具需要在 Agent 运行时环境中调用
   - 解决：确保在正确的上下文中调用

2. **empty_urls**: 资源 URL 数组为空
   - 原因：传入的 `resourceUrls` 数组长度为 0
   - 解决：确保数组至少包含一个 URL

3. **tab_not_found**: 标签页不存在
   - 原因：指定的 `tabId` 无效或标签页已关闭
   - 解决：使用 `chrome_list_tabs` 检查有效的标签页

4. **fetch_resource_failed**: 获取资源失败
   - 原因：网络错误、资源不存在、跨域限制等
   - 解决：检查资源 URL 是否有效，考虑使用 data URL

5. **invalid_data_url**: 无效的 data URL
   - 原因：data URL 格式不正确
   - 解决：确保 data URL 格式为 `data:image/xxx;base64,xxx`

## 性能考虑

- 批量保存时，资源是按顺序逐个处理的
- 对于大量资源，建议分批处理（每批 10-20 个）
- 大文件可能需要较长时间，注意超时设置
- 失败的资源不会中断整个流程，会继续处理后续资源

## 最佳实践

1. **先获取后保存**: 使用 `chrome_list_resources` 获取资源列表，然后选择性保存
2. **过滤资源**: 根据尺寸、可见性等条件过滤资源，避免保存不必要的内容
3. **错误处理**: 检查返回值中的 `errors` 字段，处理失败的情况
4. **批量处理**: 对于大量资源，分批调用以提高稳定性
5. **检查结果**: 使用 `successCount` 和 `failureCount` 验证保存结果
