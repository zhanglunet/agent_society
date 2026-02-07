# automation 模块

## 综述

自动化控制模块，为智能体提供鼠标键盘控制和无障碍接口（UI Automation）交互能力。

## 功能

- **鼠标控制**：移动、点击、拖拽、滚轮
- **键盘控制**：按键、组合键、输入文本
- **屏幕操作**：截屏、获取屏幕尺寸、获取像素颜色
- **无障碍接口**：遍历控件树、查找控件、获取控件属性、控件交互
- **等待机制**：等待控件出现/消失、等待特定条件
- **权限控制**：可配置允许/禁止的操作类型

## 安全警告

⚠️ **此模块具有高风险性，启用时请务必谨慎：**
- 智能体可以实际控制鼠标键盘，可能影响用户正常操作
- 建议仅在受控环境中使用
- 可以通过配置限制允许的操作范围

## 文件结构

```
modules/automation/
├── automation.md          # 本说明文档
├── index.js              # 模块入口
├── tools.js              # 工具定义
├── input_controller.js   # 鼠标键盘控制服务
├── accessibility.js      # 无障碍接口服务
├── screen_service.js     # 屏幕操作服务
├── permission_guard.js   # 权限守卫
├── config_manager.js     # 配置管理
└── web/                  # 前端管理界面
    ├── panel.html
    ├── panel.css
    └── panel.js
```

## 配置

配置文件路径：`config/automation.local.json`

```json
{
  "enabled": true,
  "allowMouse": true,
  "allowKeyboard": true,
  "allowAccessibility": true,
  "restrictedRegions": [
    { "x": 0, "y": 0, "width": 100, "height": 30, "reason": "系统菜单栏" }
  ],
  "requireConfirmation": false,
  "logAllActions": true
}
```

## 启用模块

在 `config/app.local.json` 中添加：

```json
{
  "modules": {
    "automation": {
      "enabled": true,
      "allowMouse": true,
      "allowKeyboard": true,
      "allowAccessibility": true
    }
  }
}
```

## 智能体工具

### 鼠标控制

- `automation_mouse_move` - 移动鼠标到指定位置
- `automation_mouse_click` - 点击鼠标
- `automation_mouse_double_click` - 双击鼠标
- `automation_mouse_right_click` - 右键点击
- `automation_mouse_drag` - 拖拽
- `automation_mouse_scroll` - 滚轮滚动
- `automation_mouse_get_position` - 获取鼠标位置

### 键盘控制

- `automation_key_press` - 按下按键
- `automation_key_combination` - 组合键
- `automation_type_text` - 输入文本
- `automation_key_hold` - 按住按键
- `automation_key_release` - 释放按键

### 屏幕操作

- `automation_screen_capture` - 屏幕截图
- `automation_screen_get_size` - 获取屏幕尺寸
- `automation_screen_get_pixel` - 获取像素颜色

### 无障碍接口

- `automation_find_control` - 查找控件
- `automation_get_control_tree` - 获取控件树
- `automation_control_click` - 点击控件
- `automation_control_get_property` - 获取控件属性
- `automation_control_set_focus` - 设置焦点
- `automation_control_get_children` - 获取子控件
- `automation_control_send_text` - 向控件发送文本

### 截图

- `automation_screenshot_region` - 截取屏幕指定区域并保存到工作区
  - 参数：`x`, `y`, `width`, `height`, `destPath`
  - 返回：`{ ok: true, files: [{ path, mimeType: "image/jpeg", size }] }`
  
- `automation_screenshot_control` - 截取指定控件并保存到工作区
  - 参数：`automationId` 或 `name`, `destPath`, `margin`
  - 返回：`{ ok: true, files: [{ path, mimeType: "image/jpeg", size }], control: {...} }`

### 等待

- `automation_wait_for_control` - 等待控件出现
- `automation_wait_for_timeout` - 固定时长等待

## 控件属性

通过无障碍接口获取的控件包含以下属性：

- `name` - 控件名称/文本
- `controlType` - 控件类型（button、edit、window 等）
- `automationId` - 自动化ID
- `className` - 类名
- `boundingRectangle` - 边界矩形 {x, y, width, height}
- `value` - 当前值
- `isEnabled` - 是否启用
- `isVisible` - 是否可见
- `hasKeyboardFocus` - 是否有键盘焦点
- `processId` - 所属进程ID
- `processName` - 所属进程名

## 使用示例

```javascript
// 查找记事本窗口并输入文本
const notepad = await automation_find_control({
  controlType: "window",
  name: "无标题 - 记事本"
});

if (notepad.success) {
  // 点击编辑区域
  await automation_control_click({
    controlId: notepad.control.automationId,
    controlType: "edit"
  });
  
  // 输入文本
  await automation_type_text({ text: "Hello World" });
}
```

## 依赖

- Windows: 使用 `ffi-napi` 和 `ref-napi` 调用 Windows UI Automation API
- 鼠标键盘: 使用 `@nut-tree-fork/nut-js` 或 `robotjs`

## 注意事项

1. Windows 系统需要启用无障碍功能
2. 某些应用可能需要以管理员权限运行才能被自动化控制
3. 建议在开发环境中充分测试后再部署到生产环境
