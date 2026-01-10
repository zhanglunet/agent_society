# Requirements Document

## Introduction

本功能为智能体对话查看器添加一个大模型（LLM）设置页面，允许用户配置 LLM 连接参数和管理多个 LLM 服务。该页面在以下情况下自动弹出：
1. 首次启动时（没有 `app.local.json` 配置文件）
2. LLM 连接错误时

用户可以通过该页面：
- 配置默认 LLM 的 baseURL、model、apiKey 和 maxConcurrentRequests 参数
- 管理 `llmservices.json` 中的多个 LLM 服务（添加、修改、删除）
- 所有配置修改即刻生效

保存时，系统会将 `app.json` 复制到 `app.local.json`，并将用户输入的 LLM 参数替换进去。LLM 服务配置保存到 `llmservices.local.json`。

## Glossary

- **LLM_Settings_Page**: 大模型设置页面组件，用于配置 LLM 连接参数和管理 LLM 服务
- **LLM_Config**: 默认 LLM 配置对象，包含 baseURL、model、apiKey、maxConcurrentRequests 字段
- **LLM_Service**: LLM 服务对象，包含 id、name、baseURL、model、apiKey、maxConcurrentRequests、capabilityTags、description 字段
- **Config_Service**: 配置服务，负责读取和保存配置文件
- **HTTP_Server**: HTTP 服务器组件，提供配置相关的 API 端点
- **LLM_Client**: LLM 客户端，负责与大模型服务通信
- **LLM_Service_Registry**: LLM 服务注册表，管理多个 LLM 服务实例

## Requirements

### Requirement 1: LLM 设置页面 UI

**User Story:** 作为用户，我希望有一个设置页面来配置大模型参数，以便我可以连接到不同的 LLM 服务。

#### Acceptance Criteria

1. THE LLM_Settings_Page SHALL display a modal dialog with input fields for baseURL, model, apiKey, and maxConcurrentRequests
2. THE LLM_Settings_Page SHALL pre-populate input fields with current configuration values when available
3. WHEN the user clicks the save button, THE LLM_Settings_Page SHALL validate that baseURL and model fields are not empty
4. WHEN validation fails, THE LLM_Settings_Page SHALL display appropriate error messages for invalid fields
5. THE LLM_Settings_Page SHALL include a cancel button to close the dialog without saving
6. THE LLM_Settings_Page SHALL mask the apiKey input field for security

### Requirement 2: 首次启动自动弹出

**User Story:** 作为首次使用的用户，我希望系统自动弹出设置页面，以便我可以配置 LLM 连接参数。

#### Acceptance Criteria

1. WHEN the application starts and app.local.json does not exist, THE LLM_Settings_Page SHALL automatically open
2. WHEN app.local.json exists, THE LLM_Settings_Page SHALL NOT automatically open on startup
3. THE HTTP_Server SHALL provide an API endpoint to check if app.local.json exists

### Requirement 3: 连接错误自动弹出

**User Story:** 作为用户，当 LLM 连接失败时，我希望系统自动弹出设置页面，以便我可以修正配置。

#### Acceptance Criteria

1. WHEN an LLM connection error occurs, THE HTTP_Server SHALL emit a connection error event
2. WHEN a connection error event is received, THE LLM_Settings_Page SHALL automatically open
3. THE LLM_Settings_Page SHALL display the error message when opened due to a connection error
4. THE HTTP_Server SHALL provide an API endpoint to report LLM connection status

### Requirement 4: 配置保存

**User Story:** 作为用户，我希望保存我的 LLM 配置，以便系统在下次启动时使用这些设置。

#### Acceptance Criteria

1. WHEN the user saves the configuration, THE Config_Service SHALL copy app.json to app.local.json if app.local.json does not exist
2. WHEN the user saves the configuration, THE Config_Service SHALL update only the llm section in app.local.json
3. THE Config_Service SHALL preserve all other configuration fields in app.local.json when updating
4. WHEN the configuration is saved successfully, THE LLM_Settings_Page SHALL close and display a success notification
5. IF the configuration save fails, THEN THE LLM_Settings_Page SHALL display an error message and remain open

### Requirement 5: 配置读取 API

**User Story:** 作为前端应用，我需要获取当前的 LLM 配置，以便在设置页面中显示。

#### Acceptance Criteria

1. THE HTTP_Server SHALL provide a GET /api/config/llm endpoint to retrieve current LLM configuration
2. WHEN returning the configuration, THE HTTP_Server SHALL mask the apiKey value for security (show only last 4 characters)
3. THE HTTP_Server SHALL return the configuration from app.local.json if it exists, otherwise from app.json

### Requirement 6: 配置保存 API

**User Story:** 作为前端应用，我需要保存用户输入的 LLM 配置。

#### Acceptance Criteria

1. THE HTTP_Server SHALL provide a POST /api/config/llm endpoint to save LLM configuration
2. WHEN receiving a save request, THE HTTP_Server SHALL validate that baseURL and model are non-empty strings
3. IF validation fails, THEN THE HTTP_Server SHALL return a 400 error with validation details
4. WHEN the configuration is saved, THE HTTP_Server SHALL reload the LLM client with new settings
5. THE HTTP_Server SHALL return a success response with the saved configuration (apiKey masked)

### Requirement 7: 配置存在性检查 API

**User Story:** 作为前端应用，我需要检查是否存在本地配置文件，以决定是否自动弹出设置页面。

#### Acceptance Criteria

1. THE HTTP_Server SHALL provide a GET /api/config/status endpoint
2. THE endpoint SHALL return whether app.local.json exists
3. THE endpoint SHALL return the current LLM connection status (connected/disconnected/error)

### Requirement 8: 手动打开设置页面

**User Story:** 作为用户，我希望能够随时手动打开设置页面来修改配置。

#### Acceptance Criteria

1. THE LLM_Settings_Page SHALL be accessible via a settings button in the UI header
2. WHEN the settings button is clicked, THE LLM_Settings_Page SHALL open with current configuration values

### Requirement 9: LLM 服务列表管理

**User Story:** 作为用户，我希望能够查看和管理多个 LLM 服务配置，以便为不同任务使用不同的模型。

#### Acceptance Criteria

1. THE LLM_Settings_Page SHALL display a list of all configured LLM services from llmservices.json
2. WHEN displaying a service, THE LLM_Settings_Page SHALL show the service name, model, and description
3. THE LLM_Settings_Page SHALL provide a button to add a new LLM service
4. THE LLM_Settings_Page SHALL provide edit and delete buttons for each existing service
5. THE LLM_Settings_Page SHALL mask apiKey values in the service list for security

### Requirement 10: 添加 LLM 服务

**User Story:** 作为用户，我希望能够添加新的 LLM 服务配置。

#### Acceptance Criteria

1. WHEN the user clicks the add service button, THE LLM_Settings_Page SHALL display a form with fields for id, name, baseURL, model, apiKey, maxConcurrentRequests, capabilityTags, and description
2. WHEN the user submits the form, THE Config_Service SHALL validate that id, name, baseURL, and model are non-empty
3. IF validation passes, THEN THE Config_Service SHALL add the new service to llmservices.local.json
4. WHEN a service is added, THE LLM_Service_Registry SHALL immediately register the new service
5. IF the service id already exists, THEN THE LLM_Settings_Page SHALL display an error message

### Requirement 11: 修改 LLM 服务

**User Story:** 作为用户，我希望能够修改现有的 LLM 服务配置。

#### Acceptance Criteria

1. WHEN the user clicks the edit button for a service, THE LLM_Settings_Page SHALL display a form pre-populated with the service's current values
2. WHEN the user submits the form, THE Config_Service SHALL validate the updated values
3. IF validation passes, THEN THE Config_Service SHALL update the service in llmservices.local.json
4. WHEN a service is updated, THE LLM_Service_Registry SHALL immediately reload the service with new settings

### Requirement 12: 删除 LLM 服务

**User Story:** 作为用户，我希望能够删除不需要的 LLM 服务配置。

#### Acceptance Criteria

1. WHEN the user clicks the delete button for a service, THE LLM_Settings_Page SHALL display a confirmation dialog
2. WHEN the user confirms deletion, THE Config_Service SHALL remove the service from llmservices.local.json
3. WHEN a service is deleted, THE LLM_Service_Registry SHALL immediately unregister the service
4. IF the service is currently in use by any role, THEN THE LLM_Settings_Page SHALL warn the user before deletion

### Requirement 13: 配置即刻生效

**User Story:** 作为用户，我希望配置修改后立即生效，无需重启应用。

#### Acceptance Criteria

1. WHEN the default LLM configuration is saved, THE LLM_Client SHALL immediately use the new settings
2. WHEN an LLM service is added, modified, or deleted, THE LLM_Service_Registry SHALL immediately reflect the changes
3. THE HTTP_Server SHALL provide an API to trigger configuration reload
