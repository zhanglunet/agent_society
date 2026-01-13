# Requirements Document

## Introduction

本功能旨在为大模型服务配置添加标准化的能力描述，并在调用大模型时根据模型能力智能路由请求。当智能体收到包含特定类型内容（如图片、音频、文件等）的消息时，系统会根据当前智能体使用的模型能力来决定如何处理：如果模型支持该能力则直接处理，否则将内容描述转换为文本形式，让智能体自行决定是否转发给具备相应能力的其他智能体。

## Glossary

- **Model_Capability**: 大模型支持的输入/输出能力类型，如文本对话、视觉理解、音频理解、文件阅读等
- **Capability_Router**: 能力路由器，负责根据模型能力决定如何处理消息内容
- **Content_Adapter**: 内容适配器，负责将不支持的内容类型转换为文本描述
- **LLM_Service**: 大模型服务配置，包含模型的连接信息和能力描述
- **Artifact**: 工件，系统中存储的文件或数据对象
- **Agent**: 智能体，系统中的自主处理单元

## Requirements

### Requirement 1: 模型能力配置

**User Story:** As a 系统管理员, I want to 在配置文件中定义模型的输入输出能力, so that 系统可以根据能力智能路由请求。

#### Acceptance Criteria

1. THE LLM_Service configuration SHALL include a `capabilities` object that describes supported input and output types
2. WHEN a capability is defined, THE configuration SHALL specify whether it is for input, output, or both
3. THE configuration SHALL support the following standard capability types: `text`, `vision`, `audio`, `file`, `structured_output`, `tool_calling`
4. WHEN loading configuration, THE LLM_Service_Registry SHALL validate capability definitions and report invalid entries
5. IF a service configuration lacks capabilities definition, THEN THE system SHALL default to `text` input and output only

### Requirement 2: 能力路由决策

**User Story:** As a 智能体, I want to 根据我使用的模型能力来决定如何处理收到的消息内容, so that 我可以正确处理或转发不支持的内容类型。

#### Acceptance Criteria

1. WHEN a message contains image attachments AND the agent's model supports `vision` capability, THE Capability_Router SHALL include the image data in the LLM request
2. WHEN a message contains image attachments AND the agent's model does NOT support `vision` capability, THE Capability_Router SHALL convert the image to a text description containing artifact reference and metadata
3. WHEN a message contains audio attachments AND the agent's model supports `audio` capability, THE Capability_Router SHALL include the audio data in the LLM request
4. WHEN a message contains audio attachments AND the agent's model does NOT support `audio` capability, THE Capability_Router SHALL convert the audio to a text description containing artifact reference and metadata
5. WHEN a message contains file attachments AND the agent's model supports `file` capability, THE Capability_Router SHALL include the file content in the LLM request
6. WHEN a message contains file attachments AND the agent's model does NOT support `file` capability, THE Capability_Router SHALL convert the file to a text description containing artifact reference, filename, and type

### Requirement 3: 内容适配转换

**User Story:** As a 智能体, I want to 收到清晰的文本描述来了解不支持的内容, so that 我可以决定是否需要转发给其他智能体处理。

#### Acceptance Criteria

1. WHEN converting unsupported content to text, THE Content_Adapter SHALL include the artifact reference ID
2. WHEN converting unsupported content to text, THE Content_Adapter SHALL include the original filename if available
3. WHEN converting unsupported content to text, THE Content_Adapter SHALL include the content type (image/audio/file)
4. WHEN converting unsupported content to text, THE Content_Adapter SHALL include the file size if available
5. WHEN converting unsupported content to text, THE Content_Adapter SHALL include a suggestion to forward to capable agents
6. THE Content_Adapter SHALL format the description in a structured, machine-readable format

### Requirement 4: 智能体能力查询

**User Story:** As a 智能体, I want to 查询其他智能体的模型能力, so that 我可以决定将内容转发给哪个智能体。

#### Acceptance Criteria

1. THE system SHALL provide a method to query available agents by capability type
2. WHEN querying agents by capability, THE system SHALL return a list of agent IDs that support the specified capability
3. THE system SHALL expose capability information through the agent's context
4. WHEN an agent needs to forward content, THE system SHALL provide helper information about which agents can handle specific content types

### Requirement 5: 配置文件格式扩展

**User Story:** As a 系统管理员, I want to 使用清晰的配置格式定义模型能力, so that 配置易于理解和维护。

#### Acceptance Criteria

1. THE `llmservices.json` configuration SHALL support a `capabilities` object with `input` and `output` arrays
2. THE configuration format SHALL be backward compatible with existing configurations
3. IF `capabilities` is not specified, THE system SHALL infer basic text capability
4. THE configuration SHALL support custom capability types beyond the standard set
5. THE configuration template SHALL include examples of capability definitions

### Requirement 6: 运行时能力检查

**User Story:** As a 系统开发者, I want to 在运行时检查模型能力, so that 代码可以根据能力做出正确的处理决策。

#### Acceptance Criteria

1. THE LLM_Service_Registry SHALL provide a method `hasCapability(serviceId, capabilityType, direction)` to check if a service supports a specific capability
2. THE LLM_Service_Registry SHALL provide a method `getCapabilities(serviceId)` to retrieve all capabilities of a service
3. THE Capability_Router SHALL be accessible from the agent's runtime context
4. WHEN checking capabilities, THE system SHALL distinguish between input and output capabilities
