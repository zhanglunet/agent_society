# Requirements Document

## Introduction

本功能优化 `get_artifact` 工具函数在读取二进制内容时的处理策略。当前实现将二进制内容编码为 base64 字符串返回在文本字段中，这导致两个问题：
1. Base64 编码占用大量 token
2. 大模型需要通过图片或文件接口接收二进制内容，而非文本字段

本功能将根据模型能力和文件类型，智能路由二进制内容到正确的消息字段（image_url、file 或文本描述）。

## Glossary

- **Artifact_Store**: 工件存储服务，负责保存和读取工件文件
- **Tool_Executor**: 工具执行器，负责执行智能体调用的工具函数
- **LLM_Service_Registry**: LLM 服务注册表，管理模型配置和能力信息
- **Capability_Router**: 能力路由器，根据模型能力决定内容处理方式
- **Binary_Content**: 二进制内容，包括图片、音频、视频等非文本文件
- **Vision_Capability**: 视觉能力，模型支持理解图片内容的能力
- **File_Capability**: 文件能力，模型支持读取文件内容的能力
- **Image_URL_Field**: 多模态消息中用于传递图片的字段格式
- **MIME_Type**: 媒体类型标识符，用于识别文件类型

## Requirements

### Requirement 1: 二进制内容类型检测

**User Story:** As a system, I want to accurately detect binary content types, so that I can route them to the appropriate message field.

#### Acceptance Criteria

1. WHEN the Artifact_Store reads an artifact, THE Capability_Router SHALL detect whether the content is binary or text
2. WHEN the content is binary, THE Capability_Router SHALL identify the specific binary type (image, audio, video, document, other)
3. WHEN the content is an image, THE Capability_Router SHALL identify the image format (jpeg, png, gif, webp, etc.) from MIME_Type or file extension
4. THE Capability_Router SHALL use metadata (MIME_Type, filename, extension) as primary detection method
5. IF metadata is unavailable, THEN THE Capability_Router SHALL use content-based detection as fallback

### Requirement 2: 模型能力查询

**User Story:** As a system, I want to query model capabilities before routing content, so that I can determine the best way to deliver binary content.

#### Acceptance Criteria

1. WHEN processing binary content, THE Tool_Executor SHALL query the current agent's LLM service capabilities via LLM_Service_Registry
2. THE Capability_Router SHALL check if the model supports Vision_Capability for image content
3. THE Capability_Router SHALL check if the model supports File_Capability for non-image binary content
4. WHEN capabilities cannot be determined, THE Capability_Router SHALL assume only text capability is available

### Requirement 3: 图片内容路由

**User Story:** As a system, I want to route image content to the image_url field when the model supports vision, so that the model can properly understand the image.

#### Acceptance Criteria

1. WHEN the content is an image AND the model supports Vision_Capability, THE Capability_Router SHALL return the image in Image_URL_Field format
2. THE Image_URL_Field SHALL contain the base64-encoded image data with proper MIME_Type prefix
3. THE Image_URL_Field format SHALL be: `{ type: "image_url", image_url: { url: "data:{mimeType};base64,{base64Data}" } }`
4. WHEN the content is an image AND the model does NOT support Vision_Capability, THE Capability_Router SHALL return a text description instead of the image data

### Requirement 4: 非图片二进制内容路由

**User Story:** As a system, I want to route non-image binary content appropriately based on model capabilities, so that the model can access the content if supported.

#### Acceptance Criteria

1. WHEN the content is non-image binary AND the model supports File_Capability, THE Capability_Router SHALL return the content in file field format
2. WHEN the content is non-image binary AND the model does NOT support File_Capability, THE Capability_Router SHALL return a text description instead of the binary data
3. THE text description SHALL include the filename, file type, and file size
4. THE text description SHALL indicate that the current model does not support reading this file type

### Requirement 5: 文本内容处理

**User Story:** As a system, I want to continue returning text content in the text field, so that text artifacts work as expected.

#### Acceptance Criteria

1. WHEN the content is text, THE Capability_Router SHALL return it in the text content field
2. THE Capability_Router SHALL NOT encode text content as base64
3. THE Capability_Router SHALL preserve the original text encoding (UTF-8)

### Requirement 6: 二进制内容永不进入文本字段

**User Story:** As a system, I want to ensure binary content never appears in text fields, so that token usage is optimized and content is properly formatted.

#### Acceptance Criteria

1. THE Capability_Router SHALL NOT return base64-encoded binary content in text fields
2. WHEN binary content cannot be routed to image_url or file fields, THE Capability_Router SHALL return only a text description
3. THE text description SHALL NOT contain the actual binary data
4. THE text description SHALL inform the user about the file and suggest using a capable model

### Requirement 7: 工具返回格式

**User Story:** As a developer, I want the get_artifact tool to return a structured response, so that the runtime can properly format the message for the LLM.

#### Acceptance Criteria

1. THE Tool_Executor SHALL return a structured object with content routing information from get_artifact tool
2. THE response SHALL include: contentType (text/image/binary), content (actual content or description), and routing metadata
3. WHEN content is routed to image_url, THE Tool_Executor SHALL include the formatted Image_URL_Field object in the response
4. WHEN content is routed to file, THE Tool_Executor SHALL include the formatted file object in the response
5. WHEN content is described as text, THE Tool_Executor SHALL include only the text description in the response

### Requirement 8: 错误处理

**User Story:** As a system, I want to handle edge cases gracefully, so that the system remains stable.

#### Acceptance Criteria

1. IF the artifact does not exist, THEN THE Artifact_Store SHALL return null with appropriate error message
2. IF the artifact metadata is corrupted, THEN THE Capability_Router SHALL attempt content-based detection
3. IF content detection fails, THEN THE Capability_Router SHALL treat the content as unknown binary and return a text description
4. IF capability query fails, THEN THE Capability_Router SHALL assume text-only capability and return text descriptions for all binary content
