# 设计文档

## 概述

本设计在现有的 `run_javascript` 工具中增加 Canvas 绘图能力。通过注入 `getCanvas(width, height)` 全局函数，智能体可以在 JavaScript 代码中创建 Canvas 并进行绘图。脚本执行完成后，如果使用了 Canvas，系统自动将内容导出为 PNG 图像并存储到工件库。

### 技术选型

使用 `canvas` npm 包（node-canvas）在 Node.js 环境中提供 Canvas API。这个库提供了与浏览器 Canvas API 兼容的接口，支持 2D 绘图和 PNG 导出。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Runtime                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              _runJavaScriptTool                      │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │  注入 getCanvas 函数到执行环境               │    │   │
│  │  │  ┌─────────────────────────────────────┐    │    │   │
│  │  │  │  用户代码执行                        │    │    │   │
│  │  │  │  - 调用 getCanvas(w, h)             │    │    │   │
│  │  │  │  - 获取 ctx = canvas.getContext()   │    │    │   │
│  │  │  │  - 绘图操作                          │    │    │   │
│  │  │  └─────────────────────────────────────┘    │    │   │
│  │  │  检查 Canvas 是否被使用                       │    │   │
│  │  │  ┌─────────────────────────────────────┐    │    │   │
│  │  │  │  如果 canvas !== null:              │    │    │   │
│  │  │  │  - 导出为 PNG Buffer                │    │    │   │
│  │  │  │  - 生成工件ID + .png 后缀            │    │    │   │
│  │  │  │  - 保存到 artifacts 目录             │    │    │   │
│  │  │  │  - 返回 images 数组                 │    │    │   │
│  │  │  └─────────────────────────────────────┘    │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 组件与接口

### 1. Runtime._runJavaScriptTool 修改

修改现有的 `_runJavaScriptTool` 方法，增加 Canvas 支持：

```javascript
async _runJavaScriptTool(args, ctx) {
  const code = args?.code;
  const input = args?.input;
  
  // 现有验证逻辑...
  
  // 创建 Canvas 容器（用于跟踪是否使用了 Canvas）
  let canvasInstance = null;
  
  // 定义 getCanvas 函数
  const getCanvas = (width = 800, height = 600) => {
    if (!canvasInstance) {
      const { createCanvas } = require('canvas');
      canvasInstance = createCanvas(width, height);
    }
    return canvasInstance;
  };
  
  try {
    // 注入 getCanvas 到执行环境
    const fn = new Function('input', 'getCanvas', prelude + code);
    let value = fn(input, getCanvas);
    
    // 等待 Promise...
    
    // 如果使用了 Canvas，导出并保存
    let images = null;
    if (canvasInstance) {
      const buffer = canvasInstance.toBuffer('image/png');
      const artifactId = this.artifacts.generateId();
      const fileName = `${artifactId}.png`;
      const filePath = path.resolve(this.artifacts.artifactsDir, fileName);
      
      await writeFile(filePath, buffer);
      
      void this.log.info("保存 Canvas 图像", { 
        fileName,
        width: canvasInstance.width,
        height: canvasInstance.height
      });
      
      images = [fileName];
    }
    
    // 返回结果
    const result = this._toJsonSafeValue(value);
    if (result.error) return result;
    
    if (images) {
      return { result: result.value, images };
    }
    return result.value;
    
  } catch (err) {
    // 错误处理...
  }
}
```

### 2. ArtifactStore 辅助方法

在 ArtifactStore 中添加生成工件ID的方法（如果还没有）：

```javascript
/**
 * 生成工件ID
 * @returns {string} 工件ID
 */
generateId() {
  return randomUUID();
}
```

## 数据模型

### 工具调用结果格式

当使用 Canvas 时，返回格式扩展为：

```javascript
{
  result: any,      // 脚本返回值
  images: string[]  // Canvas 导出的图像文件名数组
}
```

当不使用 Canvas 时，保持原有格式（直接返回脚本返回值）。

### PNG 文件命名

文件名格式：`{artifactId}.png`

示例：`a1b2c3d4-e5f6-7890-abcd-ef1234567890.png`

## 正确性属性

*正确性属性是应该在系统所有有效执行中保持为真的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: Canvas 尺寸正确性

*对于任意* 有效的宽度和高度参数，调用 getCanvas(width, height) 创建的 Canvas 应具有指定的尺寸，且导出的 PNG 图像应具有相同尺寸。

**验证: 需求 1.2, 2.1**

### 属性 2: Canvas 单例性

*对于任意* 脚本，在同一次执行中多次调用 getCanvas 应返回同一个 Canvas 实例（对象引用相等）。

**验证: 需求 1.5**

### 属性 3: 自动导出触发

*对于任意* 调用了 getCanvas 的脚本，执行完成后结果应包含 images 数组；*对于任意* 未调用 getCanvas 的脚本，结果不应包含 images 字段。

**验证: 需求 2.3, 2.4**

### 属性 4: 向后兼容性

*对于任意* 不使用 getCanvas 的脚本，run_javascript 的行为应与修改前完全一致（相同输入产生相同输出）。

**验证: 需求 3.3**

## 错误处理

### 脚本执行错误

保持现有的错误处理逻辑，返回 `{ error: "js_execution_failed", message: "..." }`。

### Canvas 导出错误

如果 Canvas 导出失败，返回：
```javascript
{
  result: scriptResult,  // 脚本执行结果（如果有）
  error: "canvas_export_failed",
  message: "导出失败原因"
}
```

### Canvas 库加载错误

如果 node-canvas 库未安装或加载失败：
```javascript
{
  error: "canvas_not_available",
  message: "Canvas 功能不可用，请安装 canvas 包"
}
```

## 测试策略

### 单元测试

1. **getCanvas 函数注入测试** - 验证函数存在且可调用
2. **默认尺寸测试** - 验证不传参数时使用 800x600
3. **自定义尺寸测试** - 验证传入参数时使用指定尺寸
4. **单例行为测试** - 验证多次调用返回同一实例
5. **自动导出测试** - 验证使用 Canvas 后结果包含 images
6. **无 Canvas 测试** - 验证不使用 Canvas 时保持原有行为
7. **错误处理测试** - 验证各种错误场景的处理

### 绘制图形测试

验证 Canvas 2D 绘图功能的正确性：

1. **绘制矩形测试** - 验证 fillRect 和 strokeRect 正确绘制
   ```javascript
   const canvas = getCanvas(200, 200);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'red';
   ctx.fillRect(10, 10, 100, 100);
   // 验证导出的 PNG 包含红色矩形
   ```

2. **绘制圆形测试** - 验证 arc 和 fill 正确绘制圆形
   ```javascript
   const canvas = getCanvas(200, 200);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'blue';
   ctx.beginPath();
   ctx.arc(100, 100, 50, 0, Math.PI * 2);
   ctx.fill();
   // 验证导出的 PNG 包含蓝色圆形
   ```

3. **绘制文本测试** - 验证 fillText 正确绘制文本
   ```javascript
   const canvas = getCanvas(300, 100);
   const ctx = canvas.getContext('2d');
   ctx.font = '20px Arial';
   ctx.fillStyle = 'black';
   ctx.fillText('Hello Canvas', 50, 50);
   // 验证导出的 PNG 包含文本
   ```

4. **绘制路径测试** - 验证 lineTo 和 stroke 正确绘制线条
   ```javascript
   const canvas = getCanvas(200, 200);
   const ctx = canvas.getContext('2d');
   ctx.strokeStyle = 'green';
   ctx.lineWidth = 2;
   ctx.beginPath();
   ctx.moveTo(10, 10);
   ctx.lineTo(190, 190);
   ctx.stroke();
   // 验证导出的 PNG 包含绿色对角线
   ```

5. **复杂图形测试** - 验证多个绘制操作的组合
   ```javascript
   const canvas = getCanvas(400, 300);
   const ctx = canvas.getContext('2d');
   // 绘制背景
   ctx.fillStyle = 'lightgray';
   ctx.fillRect(0, 0, 400, 300);
   // 绘制矩形
   ctx.fillStyle = 'red';
   ctx.fillRect(50, 50, 100, 100);
   // 绘制圆形
   ctx.fillStyle = 'blue';
   ctx.beginPath();
   ctx.arc(250, 150, 50, 0, Math.PI * 2);
   ctx.fill();
   // 绘制文本
   ctx.fillStyle = 'black';
   ctx.font = '16px Arial';
   ctx.fillText('Complex Drawing', 100, 250);
   // 验证导出的 PNG 包含所有元素
   ```

6. **颜色和样式测试** - 验证颜色、线宽、透明度等样式设置
   ```javascript
   const canvas = getCanvas(200, 200);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';  // 半透明红色
   ctx.fillRect(50, 50, 100, 100);
   ctx.strokeStyle = '#00FF00';  // 绿色
   ctx.lineWidth = 3;
   ctx.strokeRect(10, 10, 180, 180);
   // 验证导出的 PNG 包含正确的颜色和透明度
   ```

7. **图像数据验证测试** - 验证导出的 PNG 文件格式和内容
   ```javascript
   const canvas = getCanvas(100, 100);
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'white';
   ctx.fillRect(0, 0, 100, 100);
   // 验证导出的 PNG：
   // - 文件格式正确（PNG 魔数）
   // - 尺寸为 100x100
   // - 文件大小合理
   ```

### 属性测试

使用 fast-check 进行属性测试，每个属性至少运行 100 次迭代：

1. **属性 1 测试** - 生成随机有效尺寸，验证 Canvas 和 PNG 尺寸一致
2. **属性 2 测试** - 生成随机调用次数，验证返回同一实例
3. **属性 3 测试** - 生成随机脚本（有/无 getCanvas），验证 images 字段存在性
4. **属性 4 测试** - 使用现有测试用例，验证行为不变
5. **属性 5 测试** - 生成随机绘制操作序列，验证 PNG 导出成功且格式正确

### 测试框架

- 测试框架: Vitest（与项目现有测试一致）
- 属性测试库: fast-check
- PNG 验证库: pngjs（用于验证 PNG 文件格式和内容）
- 测试文件: `test/platform/run_javascript_canvas.test.js`
