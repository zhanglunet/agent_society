# Requirements Document

## Introduction

本需求文档描述两个功能改进：
1. 聊天界面支持图片缩略图展示和点击放大功能
2. 修复 Chrome 模块管理面板无法加载数据的问题

## Glossary

- **Chat_Panel**: 聊天面板组件，负责显示智能体之间的对话消息
- **Message**: 消息对象，包含发送者、接收者、内容和附件等信息
- **Image_Viewer**: 图片查看器组件，用于展示图片缩略图和放大预览
- **Chrome_Module_Panel**: Chrome 浏览器管理面板，用于管理浏览器实例和标签页
- **Modules_Panel**: 模块管理面板组件，负责加载和显示各模块的管理界面
- **images**: 统一的图片路径数组字段名，用于存储消息中的图片文件路径

## Requirements

### Requirement 1: 消息图片字段统一化

**User Story:** As a developer, I want to use a unified field name for image paths in messages, so that the codebase is consistent and maintainable.

#### Acceptance Criteria

1. THE Message SHALL use `images` as the field name to store an array of image file paths
2. WHEN a screenshot is taken successfully, THE System SHALL store the image path in the `images` array field
3. THE System SHALL NOT use field names like `screenshot_path` or similar variations for image paths
4. WHEN multiple images are associated with a message, THE System SHALL store all paths in the same `images` array

### Requirement 2: 聊天界面图片缩略图展示

**User Story:** As a user, I want to see image thumbnails in chat messages, so that I can quickly preview images without leaving the chat interface.

#### Acceptance Criteria

1. WHEN a message contains images (via the `images` field), THE Chat_Panel SHALL display thumbnails for each image
2. THE Chat_Panel SHALL render image thumbnails with a maximum width of 200px and maximum height of 150px
3. WHEN an image fails to load, THE Chat_Panel SHALL display a placeholder with an error indicator
4. THE Chat_Panel SHALL display thumbnails in a horizontal layout when multiple images exist in a single message

### Requirement 3: 图片点击放大功能

**User Story:** As a user, I want to click on image thumbnails to view them in full size, so that I can see image details clearly.

#### Acceptance Criteria

1. WHEN a user clicks on an image thumbnail, THE Image_Viewer SHALL display the image in a modal overlay
2. THE Image_Viewer SHALL display the image at its original size or fit to screen (whichever is smaller)
3. WHEN the modal is open, THE Image_Viewer SHALL close when the user clicks outside the image or presses Escape
4. THE Image_Viewer SHALL provide a close button in the modal for accessibility
5. WHEN multiple images exist in a message, THE Image_Viewer SHALL support navigation between images using arrow buttons or keyboard arrows

### Requirement 4: Chrome 模块面板数据加载修复

**User Story:** As a user, I want the Chrome module panel to load and display browser information correctly, so that I can manage browser instances effectively.

#### Acceptance Criteria

1. WHEN the Chrome module panel is opened, THE Modules_Panel SHALL successfully load and initialize the ChromePanel component
2. WHEN the ChromePanel initializes, THE System SHALL correctly call the `/api/modules/chrome/browsers` endpoint
3. IF no browser instances exist, THE Chrome_Module_Panel SHALL display "暂无浏览器实例" instead of staying in "加载中" state
4. IF an error occurs during loading, THE Chrome_Module_Panel SHALL display the error message to the user
5. WHEN the API returns browser data, THE Chrome_Module_Panel SHALL render the browser list correctly
6. THE Chrome_Module_Panel SHALL complete initialization within 5 seconds or display a timeout error

### Requirement 5: 模块 Web 组件加载机制改进

**User Story:** As a developer, I want the module web component loading to be robust and generic, so that module panels initialize correctly without hardcoding specific module logic.

#### Acceptance Criteria

1. THE Modules_Panel SHALL NOT contain any hardcoded module-specific initialization logic (e.g., `ChromePanel.init()`)
2. WHEN loading a module's web component, THE Modules_Panel SHALL use a generic initialization mechanism
3. THE System SHALL define a standard interface for module web components to self-initialize
4. WHEN a module's JavaScript is loaded, THE System SHALL automatically detect and call the module's init function via a standard naming convention or exported interface
5. THE Modules_Panel SHALL ensure DOM elements are ready before triggering module initialization
6. IF initialization fails, THE Modules_Panel SHALL display a meaningful error message instead of staying in loading state

### Requirement 6: 模块 Web 组件自初始化标准

**User Story:** As a module developer, I want a standard way to define my module's initialization, so that the Modules_Panel can load any module without special handling.

#### Acceptance Criteria

1. THE System SHALL define a standard global object naming convention for module panels (e.g., `window.ModulePanel_{moduleName}`)
2. WHEN a module's web component is loaded, THE module's JavaScript SHALL register itself using the standard naming convention
3. THE module's registered object SHALL expose an `init()` method that the Modules_Panel can call
4. WHEN the Modules_Panel loads a module, THE System SHALL look up the module's panel object by the standard naming convention and call its `init()` method
5. IF a module does not register a panel object, THE Modules_Panel SHALL assume the module has no interactive initialization required
