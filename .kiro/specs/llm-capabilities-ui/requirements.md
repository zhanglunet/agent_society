# Requirements Document

## Introduction

本功能旨在为 LLM 服务设置界面添加模型能力（capabilities）配置项。用户可以在添加或编辑 LLM 服务时，配置模型支持的输入和输出能力类型，如文本、视觉、音频、文件等。这些配置将与后端的 model-capability-routing 功能配合，实现基于模型能力的智能消息路由。

## Glossary

- **LLM_Settings_Modal**: LLM 设置模态框组件，用于配置默认 LLM 参数和管理 LLM 服务列表
- **Capabilities**: 模型能力配置，包含 input（输入能力）和 output（输出能力）两个数组
- **Capability_Type**: 能力类型，包括 text（文本）、vision（视觉）、audio（音频）、file（文件）、structured_output（结构化输出）、tool_calling（工具调用）等
- **Service_Form**: 服务编辑表单，用于添加或编辑 LLM 服务配置

## Requirements

### Requirement 1: 能力配置界面

**User Story:** As a 系统管理员, I want to 在服务编辑表单中配置模型的输入输出能力, so that 系统可以根据能力智能路由请求。

#### Acceptance Criteria

1. WHEN the Service_Form is displayed, THE form SHALL include a capabilities configuration section
2. THE capabilities section SHALL provide separate controls for input and output capabilities
3. THE capabilities section SHALL display standard capability types as selectable options: text, vision, audio, file, structured_output, tool_calling
4. WHEN a user selects capability options, THE form SHALL visually indicate the selected capabilities
5. THE capabilities section SHALL allow multiple selections for both input and output

### Requirement 2: 能力配置的默认值

**User Story:** As a 系统管理员, I want to 新建服务时有合理的默认能力配置, so that 我不需要每次都手动配置基本能力。

#### Acceptance Criteria

1. WHEN creating a new service, THE form SHALL default to text capability for both input and output
2. WHEN editing an existing service without capabilities, THE form SHALL display text as the default capability
3. WHEN editing an existing service with capabilities, THE form SHALL display the configured capabilities

### Requirement 3: 能力配置的保存

**User Story:** As a 系统管理员, I want to 保存服务时能力配置被正确保存, so that 配置能够持久化并生效。

#### Acceptance Criteria

1. WHEN saving a service, THE form SHALL include the capabilities object in the request payload
2. THE capabilities object SHALL contain input and output arrays with selected capability types
3. IF no capabilities are selected, THEN THE form SHALL default to text capability
4. WHEN the service is saved successfully, THE capabilities SHALL be persisted to the configuration

### Requirement 4: 能力配置的显示

**User Story:** As a 系统管理员, I want to 在服务列表中看到服务的能力配置, so that 我可以快速了解每个服务支持的能力。

#### Acceptance Criteria

1. WHEN displaying the service list, THE list item SHALL show the service's capabilities
2. THE capabilities display SHALL distinguish between input and output capabilities
3. THE capabilities display SHALL use clear visual indicators (icons or badges) for each capability type
4. IF a service has no capabilities configured, THE display SHALL show default text capability

### Requirement 5: 用户体验优化

**User Story:** As a 系统管理员, I want to 能力配置界面易于理解和操作, so that 我可以快速完成配置。

#### Acceptance Criteria

1. THE capabilities section SHALL include helpful tooltips or descriptions for each capability type
2. THE capabilities section SHALL be visually organized and not cluttered
3. WHEN hovering over a capability option, THE system SHALL display a brief description of the capability
4. THE capabilities section SHALL be collapsible to reduce visual complexity when not needed

