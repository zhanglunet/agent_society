# 工件链接分组显示功能设计文档

## 1. 设计概述

本设计实现工件链接在聊天面板中的分组显示功能，同时优化工件管理器中工件名称的显示。核心思路是：
1. 工件管理器提供批量元数据获取接口
2. 工件管理器提供MIME类型判断接口
3. 聊天面板根据元数据对工件链接进行分组渲染
4. 工件管理器在列表和查看器中显示工件名

## 2. 架构设计

### 2.1 模块职责划分

```
┌─────────────────────────────────────────────────────────────┐
│                        ChatPanel                             │
│  - 收集工件ID                                                 │
│  - 批量获取元数据                                             │
│  - 根据元数据分组渲染工件链接                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 调用接口
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ArtifactManager                           │
│  - 提供批量元数据获取接口 getArtifactsMetadata(ids)          │
│  - 提供MIME类型判断接口 canOpenMimeType(mimeType)            │
│  - 在列表中显示工件名                                         │
│  - 在查看器标题栏显示工件名                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 使用工具
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    mime-types.mjs                            │
│  - 提供MIME类型常量                                           │
│  - 提供类型判断工具函数                                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流设计

```
工具调用消息 → 提取工件ID列表 → 批量获取元数据 → 分组渲染
     │                                    │
     │                                    ├─ 图片组：显示缩略图
     │                                    ├─ 可打开组：显示链接
     │                                    └─ 下载组：显示下载链接
     │
     └─ 点击链接 → 打开工件管理器 → 显示工件（标题栏显示工件名）
```

## 3. 接口设计

### 3.1 批量元数据获取接口

**接口名称：** `getArtifactsMetadata`

**位置：** `ArtifactManager` 类

**签名：**
```javascript
/**
 * 批量获取工件元数据
 * @param {string[]} artifactIds - 工件ID数组
 * @returns {Promise<Map<string, Object>>} Map对象，key为工件ID，value为元数据对象
 */
async getArtifactsMetadata(artifactIds)
```

**输入：**
- `artifactIds`: 工件ID字符串数组，可以为空数组

**输出：**
- 返回 `Map<string, Object>`
- key: 工件ID字符串
- value: 元数据对象，包含：
  - `id`: 工件ID
  - `name`: 工件名（用户可见）
  - `type`: MIME类型
  - `extension`: 文件扩展名
  - `filename`: 文件名（内部使用）
  - `createdAt`: 创建时间
  - `size`: 文件大小
  - `messageId`: 来源消息ID（可选）
  - `agentId`: 来源智能体ID（可选）

**错误处理：**
- 获取失败的工件在Map中不存在对应的key
- 接口本身不抛出异常，返回部分成功的结果

**实现策略：**
```javascript
async getArtifactsMetadata(artifactIds) {
  const metadataMap = new Map();
  
  if (!artifactIds || artifactIds.length === 0) {
    return metadataMap;
  }
  
  // 并发获取所有工件的元数据
  const results = await Promise.allSettled(
    artifactIds.map(id => this.api.get(`/artifacts/${id}/metadata`))
  );
  
  // 处理结果
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const metadata = result.value;
      metadataMap.set(artifactIds[index], metadata);
    }
    // 失败的不添加到Map中
  });
  
  return metadataMap;
}
```

### 3.2 MIME类型判断接口

**接口名称：** `canOpenMimeType`

**位置：** `ArtifactManager` 类（静态方法）

**签名：**
```javascript
/**
 * 判断指定MIME类型是否可以在工件管理器中打开
 * @param {string} mimeType - MIME类型字符串
 * @returns {boolean} 是否可以打开
 */
static canOpenMimeType(mimeType)
```

**输入：**
- `mimeType`: MIME类型字符串，如 "image/png", "application/json"

**输出：**
- `boolean`: true表示可以打开，false表示不能打开

**支持的类型：**
```javascript
// 可以打开的类型
const OPENABLE_MIME_TYPES = [
  // 图片类型
  ...IMAGE_MIME_TYPES,
  // JSON类型
  ...JSON_MIME_TYPES,
  // 文本类型
  ...TEXT_MIME_TYPES,
  // 代码类型
  ...CODE_MIME_TYPES,
  // HTML和CSS
  HTML_MIME_TYPE,
  CSS_MIME_TYPE
];
```

**实现策略：**
```javascript
static canOpenMimeType(mimeType) {
  if (!mimeType) return false;
  
  const lowerType = mimeType.toLowerCase();
  
  // 检查是否在支持列表中
  const OPENABLE_MIME_TYPES = [
    ...IMAGE_MIME_TYPES,
    ...JSON_MIME_TYPES,
    ...TEXT_MIME_TYPES,
    ...CODE_MIME_TYPES,
    HTML_MIME_TYPE,
    CSS_MIME_TYPE
  ];
  
  return OPENABLE_MIME_TYPES.some(type => 
    lowerType === type.toLowerCase() || lowerType.startsWith(type.toLowerCase())
  );
}
```

## 4. 聊天面板实现设计

### 4.1 工件ID收集

**位置：** `ChatPanel.renderToolCallGroupArtifacts`

**实现：**
```javascript
renderToolCallGroupArtifacts(toolCallMessages) {
  // 收集所有工件ID
  const allArtifactIds = this._collectAllArtifacts(toolCallMessages);
  
  if (allArtifactIds.length === 0) return '';
  
  // 批量获取元数据
  const metadataMap = await this._getArtifactsMetadataMap(allArtifactIds);
  
  // 分组渲染
  return this._renderArtifactGroups(allArtifactIds, metadataMap);
}
```

### 4.2 元数据获取

**新增方法：** `_getArtifactsMetadataMap`

```javascript
/**
 * 批量获取工件元数据
 * @param {string[]} artifactIds - 工件ID数组
 * @returns {Promise<Map<string, Object>>} 元数据Map
 * @private
 */
async _getArtifactsMetadataMap(artifactIds) {
  try {
    const manager = ArtifactManager.getInstance();
    return await manager.getArtifactsMetadata(artifactIds);
  } catch (error) {
    console.error('[ChatPanel] 获取工件元数据失败:', error);
    return new Map();
  }
}
```

### 4.3 工件分组

**新增方法：** `_groupArtifactsByType`

```javascript
/**
 * 根据元数据将工件分组
 * @param {string[]} artifactIds - 工件ID数组
 * @param {Map<string, Object>} metadataMap - 元数据Map
 * @returns {Object} 分组结果
 * @private
 */
_groupArtifactsByType(artifactIds, metadataMap) {
  const groups = {
    images: [],      // 图片类型
    openable: [],    // 可打开类型
    downloadOnly: [] // 仅下载类型
  };
  
  artifactIds.forEach(id => {
    const metadata = metadataMap.get(id);
    
    if (!metadata) {
      // 元数据获取失败，归入下载组
      groups.downloadOnly.push({ id, name: id, type: null });
      return;
    }
    
    const mimeType = metadata.type;
    
    // 判断类型
    if (isImageType(mimeType)) {
      groups.images.push({ id, metadata });
    } else if (ArtifactManager.canOpenMimeType(mimeType)) {
      groups.openable.push({ id, metadata });
    } else {
      groups.downloadOnly.push({ id, metadata });
    }
  });
  
  return groups;
}
```

### 4.4 分组渲染

**新增方法：** `_renderArtifactGroups`

```javascript
/**
 * 渲染分组后的工件
 * @param {string[]} artifactIds - 工件ID数组
 * @param {Map<string, Object>} metadataMap - 元数据Map
 * @returns {string} HTML字符串
 * @private
 */
_renderArtifactGroups(artifactIds, metadataMap) {
  const groups = this._groupArtifactsByType(artifactIds, metadataMap);
  
  let html = '<div class="tool-call-group-artifacts">';
  html += '<div class="tool-call-group-artifacts-label">创建的工件:</div>';
  
  // 渲染图片组
  if (groups.images.length > 0) {
    html += '<div class="artifact-group artifact-group-images">';
    html += '<div class="artifact-group-label">图片:</div>';
    html += '<div class="artifact-thumbnails">';
    groups.images.forEach(({ id, metadata }) => {
      html += this._renderImageThumbnail(id, metadata);
    });
    html += '</div></div>';
  }
  
  // 渲染可打开组
  if (groups.openable.length > 0) {
    html += '<div class="artifact-group artifact-group-openable">';
    html += '<div class="artifact-group-label">可打开:</div>';
    html += '<div class="artifact-links">';
    groups.openable.forEach(({ id, metadata }) => {
      html += this._renderOpenableLink(id, metadata);
    });
    html += '</div></div>';
  }
  
  // 渲染下载组
  if (groups.downloadOnly.length > 0) {
    html += '<div class="artifact-group artifact-group-download">';
    html += '<div class="artifact-group-label">下载:</div>';
    html += '<div class="artifact-links">';
    groups.downloadOnly.forEach(({ id, metadata }) => {
      html += this._renderDownloadLink(id, metadata);
    });
    html += '</div></div>';
  }
  
  html += '</div>';
  return html;
}
```

### 4.5 各类型渲染方法

```javascript
/**
 * 渲染图片缩略图
 * @param {string} id - 工件ID
 * @param {Object} metadata - 元数据
 * @returns {string} HTML字符串
 * @private
 */
_renderImageThumbnail(id, metadata) {
  const name = metadata.name || id;
  const imageUrl = `/artifacts/${this.escapeHtml(id)}`;
  
  return `
    <div class="artifact-thumbnail-item" title="${this.escapeHtml(name)}">
      <img 
        class="artifact-thumbnail-img" 
        src="${imageUrl}" 
        alt="${this.escapeHtml(name)}"
        data-artifact-id="${this.escapeHtml(id)}"
        onerror="this.parentElement.innerHTML='<span class=\\'thumbnail-error\\'>🖼️</span>'"
      />
      <div class="artifact-thumbnail-name">${this.escapeHtml(this._truncateName(name, 15))}</div>
    </div>
  `;
}

/**
 * 渲染可打开链接
 * @param {string} id - 工件ID
 * @param {Object} metadata - 元数据
 * @returns {string} HTML字符串
 * @private
 */
_renderOpenableLink(id, metadata) {
  const name = metadata.name || id;
  const icon = getFileIconByMimeType(metadata.type);
  
  return `
    <a 
      class="artifact-link artifact-link-openable" 
      href="/artifacts/${this.escapeHtml(id)}" 
      title="${this.escapeHtml(name)}"
      data-artifact-id="${this.escapeHtml(id)}"
    >
      <span class="artifact-link-icon">${icon}</span>
      <span class="artifact-link-name">${this.escapeHtml(name)}</span>
    </a>
  `;
}

/**
 * 渲染下载链接
 * @param {string} id - 工件ID
 * @param {Object} metadata - 元数据
 * @returns {string} HTML字符串
 * @private
 */
_renderDownloadLink(id, metadata) {
  const name = metadata ? metadata.name : id;
  const icon = metadata ? getFileIconByMimeType(metadata.type) : '📄';
  
  return `
    <a 
      class="artifact-link artifact-link-download" 
      href="/artifacts/${this.escapeHtml(id)}" 
      download
      title="下载: ${this.escapeHtml(name)}"
      data-artifact-id="${this.escapeHtml(id)}"
    >
      <span class="artifact-link-icon">${icon}</span>
      <span class="artifact-link-name">${this.escapeHtml(name)}</span>
      <span class="artifact-link-download-icon">⬇️</span>
    </a>
  `;
}

/**
 * 截断名称
 * @param {string} name - 名称
 * @param {number} maxLen - 最大长度
 * @returns {string} 截断后的名称
 * @private
 */
_truncateName(name, maxLen) {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 3) + '...';
}
```

## 5. 工件管理器实现设计

### 5.1 列表显示工件名

**修改位置：** `ArtifactManager._renderIconView` 和 `_renderDetailView`

**当前问题：** 使用 `actualFilename` 或 `filename`，应该优先使用 `name`

**修改方案：**
```javascript
// 在 _renderIconView 和 _renderDetailView 中
const displayName = item.name || item.actualFilename || item.filename || item.id;
```

### 5.2 查看器标题栏显示工件名

**修改位置：** `ArtifactManager.openArtifact`

**当前实现：** 已经在使用 `metadata.name`

**确认：** 代码已正确实现
```javascript
// 在 openArtifact 方法中
this.artifactNameSpan.textContent = metadata.name;
```

### 5.3 loadArtifacts优化

**修改位置：** `ArtifactManager.loadArtifacts`

**当前问题：** 逐个获取工件详情，效率低

**优化方案：**
```javascript
async loadArtifacts() {
  try {
    this.listPanel.innerHTML = '<div class="empty-state">加载中...</div>';
    const response = await this.api.get("/artifacts");
    
    // 收集所有工件ID
    const artifactIds = (response.artifacts || []).map(a => a.id);
    
    // 批量获取元数据
    const metadataMap = await this.getArtifactsMetadata(artifactIds);
    
    // 合并元数据
    const artifactsWithDetails = (response.artifacts || []).map(artifact => {
      const metadata = metadataMap.get(artifact.id);
      
      if (metadata) {
        return {
          ...artifact,
          ...metadata,
          isWorkspaceFile: false
        };
      }
      
      // 降级：使用原始数据
      return {
        ...artifact,
        name: artifact.filename,
        isWorkspaceFile: false
      };
    });
    
    // 按创建时间降序排列
    this.artifacts = artifactsWithDetails.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    this.artifactsCountEl.textContent = this.artifacts.length;
    this._applyFilters();
    this.logger.log("工件加载完成", { count: this.artifacts.length });
  } catch (err) {
    this.logger.error("加载工件失败", err);
    this.listPanel.innerHTML = '<div class="empty-state error">加载工件失败</div>';
  }
  
  this.loadWorkspaces();
}
```

## 6. CSS样式设计

### 6.1 工件分组样式

```css
/* 工件分组容器 */
.tool-call-group-artifacts {
  margin-top: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.tool-call-group-artifacts-label {
  font-weight: 600;
  margin-bottom: 8px;
  color: #495057;
}

/* 工件组 */
.artifact-group {
  margin-bottom: 12px;
}

.artifact-group:last-child {
  margin-bottom: 0;
}

.artifact-group-label {
  font-size: 12px;
  font-weight: 500;
  color: #6c757d;
  margin-bottom: 6px;
}

/* 图片缩略图 */
.artifact-thumbnails {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.artifact-thumbnail-item {
  width: 100px;
  text-align: center;
  cursor: pointer;
}

.artifact-thumbnail-img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #dee2e6;
}

.artifact-thumbnail-img:hover {
  border-color: #007bff;
  box-shadow: 0 2px 4px rgba(0,123,255,0.2);
}

.artifact-thumbnail-name {
  font-size: 11px;
  color: #6c757d;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumbnail-error {
  display: inline-block;
  width: 100px;
  height: 100px;
  line-height: 100px;
  font-size: 32px;
  background: #e9ecef;
  border-radius: 4px;
}

/* 工件链接 */
.artifact-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.artifact-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  text-decoration: none;
  font-size: 13px;
  transition: background-color 0.2s;
}

.artifact-link-openable {
  color: #007bff;
  background: #e7f3ff;
}

.artifact-link-openable:hover {
  background: #cce5ff;
}

.artifact-link-download {
  color: #6c757d;
  background: #e9ecef;
}

.artifact-link-download:hover {
  background: #dee2e6;
}

.artifact-link-icon {
  font-size: 16px;
}

.artifact-link-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-link-download-icon {
  font-size: 14px;
  opacity: 0.7;
}
```

## 7. 错误处理

### 7.1 元数据获取失败

**场景：** 批量获取元数据时部分工件失败

**处理：**
- 失败的工件不在Map中
- 渲染时检查元数据是否存在
- 降级显示工件ID和下载链接

### 7.2 缩略图加载失败

**场景：** 图片工件的缩略图加载失败

**处理：**
- 使用 `onerror` 事件
- 显示占位图标 🖼️
- 保持可点击状态

### 7.3 接口调用失败

**场景：** 工件管理器接口调用失败

**处理：**
```javascript
async _getArtifactsMetadataMap(artifactIds) {
  try {
    const manager = ArtifactManager.getInstance();
    return await manager.getArtifactsMetadata(artifactIds);
  } catch (error) {
    console.error('[ChatPanel] 获取工件元数据失败:', error);
    // 返回空Map，降级处理
    return new Map();
  }
}
```

## 8. 性能优化

### 8.1 批量请求

- 使用 `Promise.allSettled` 并发获取元数据
- 避免串行请求导致的性能问题

### 8.2 缓存策略

**可选优化：** 在ChatPanel中缓存元数据

```javascript
// ChatPanel中添加缓存
_metadataCache: new Map(),

async _getArtifactsMetadataMap(artifactIds) {
  // 过滤已缓存的ID
  const uncachedIds = artifactIds.filter(id => !this._metadataCache.has(id));
  
  if (uncachedIds.length > 0) {
    const manager = ArtifactManager.getInstance();
    const newMetadata = await manager.getArtifactsMetadata(uncachedIds);
    
    // 更新缓存
    newMetadata.forEach((metadata, id) => {
      this._metadataCache.set(id, metadata);
    });
  }
  
  // 返回所有请求的元数据
  const result = new Map();
  artifactIds.forEach(id => {
    if (this._metadataCache.has(id)) {
      result.set(id, this._metadataCache.get(id));
    }
  });
  
  return result;
}
```

### 8.3 懒加载

**可选优化：** 图片缩略图懒加载

```javascript
// 使用 Intersection Observer
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      observer.unobserve(img);
    }
  });
});
```

## 9. 测试计划

### 9.1 单元测试

- `getArtifactsMetadata` 接口测试
  - 空数组输入
  - 单个ID
  - 多个ID
  - 部分失败场景
  
- `canOpenMimeType` 接口测试
  - 各种MIME类型
  - null/undefined输入
  - 大小写敏感性

- 分组逻辑测试
  - 纯图片
  - 混合类型
  - 全部不可打开

### 9.2 集成测试

- 聊天面板渲染测试
  - 工具调用消息包含工件
  - 元数据获取失败
  - 缩略图加载失败

- 工件管理器测试
  - 列表显示工件名
  - 查看器标题显示工件名
  - 批量加载性能

### 9.3 用户体验测试

- 加载速度测试
- 视觉效果测试
- 交互响应测试
- 错误提示测试

## 10. 实施步骤

### 阶段1：工件管理器接口实现
1. 实现 `getArtifactsMetadata` 方法
2. 实现 `canOpenMimeType` 静态方法
3. 单元测试

### 阶段2：工件管理器优化
1. 修改 `loadArtifacts` 使用批量接口
2. 确认列表和查看器显示工件名
3. 集成测试

### 阶段3：聊天面板实现
1. 实现元数据获取方法
2. 实现分组逻辑
3. 实现各类型渲染方法
4. 修改 `renderToolCallGroupArtifacts`

### 阶段4：样式和优化
1. 添加CSS样式
2. 错误处理完善
3. 性能优化（可选）
4. 用户体验测试

## 11. 风险与缓解

### 11.1 性能风险

**风险：** 大量工件时批量请求可能较慢

**缓解：**
- 限制单次请求的工件数量
- 实现缓存机制
- 使用懒加载

### 11.2 兼容性风险

**风险：** 旧版本API可能不支持元数据接口

**缓解：**
- 降级处理，使用工件ID
- 错误捕获和日志记录
- 渐进式增强

### 11.3 UI风险

**风险：** 分组显示可能占用过多空间

**缓解：**
- 合理的间距和布局
- 可折叠的分组
- 限制缩略图数量

## 12. 后续优化方向

- 实现元数据缓存机制
- 支持更多文件类型的预览
- 添加工件链接的批量操作
- 实现工件链接的拖拽排序
- 支持工件链接的搜索和过滤
