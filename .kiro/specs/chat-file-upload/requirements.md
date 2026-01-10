# Requirements Document

## Introduction

本功能为聊天界面添加图片和文件上传能力。用户可以在发送消息时附带图片或其他文件，系统会在前端进行格式转换（图片转为JPEG），然后上传到服务器保存为工件，并在调用大模型时携带这些附件。

## Glossary

- **Chat_Input_Area**: 聊天输入区域组件，包含文本输入框、发送按钮和新增的上传按钮
- **Image_Upload_Button**: 图片上传按钮，支持上传 JPEG、PNG、BMP、WebP 格式的图片
- **File_Upload_Button**: 文件上传按钮，支持上传其他类型的文件
- **Image_Converter**: 前端图片格式转换器，将非JPEG格式的图片转换为JPEG格式
- **Upload_Service**: 前端上传服务模块，负责处理文件上传逻辑
- **HTTP_Server**: 后端HTTP服务器，提供文件上传API端点
- **Artifact_Store**: 工件存储服务，负责保存上传的文件并生成元数据
- **LLM_Client**: 大模型客户端，负责调用大模型API并携带附件

## Requirements

### Requirement 1: 图片上传按钮

**User Story:** As a user, I want to upload images in the chat interface, so that I can share visual content with the AI agent.

#### Acceptance Criteria

1. WHEN the chat input area is rendered, THE Chat_Input_Area SHALL display an image upload button with a recognizable icon
2. WHEN a user clicks the image upload button, THE Chat_Input_Area SHALL open a file picker dialog that accepts image files (image/*)
3. WHEN a user selects an image file, THE Image_Converter SHALL verify the browser can decode the image and convert it to JPEG format before upload
4. WHEN an image is selected, THE Chat_Input_Area SHALL display a thumbnail preview of the selected image
5. WHEN multiple images are selected, THE Chat_Input_Area SHALL display all thumbnails and allow individual removal

### Requirement 2: 文件上传按钮

**User Story:** As a user, I want to upload files in the chat interface, so that I can share documents and other files with the AI agent.

#### Acceptance Criteria

1. WHEN the chat input area is rendered, THE Chat_Input_Area SHALL display a file upload button separate from the image upload button
2. WHEN a user clicks the file upload button, THE Chat_Input_Area SHALL open a file picker dialog that accepts common file types
3. WHEN a file is selected, THE Chat_Input_Area SHALL display the file name and size in the attachment preview area
4. WHEN multiple files are selected, THE Chat_Input_Area SHALL display all file names and allow individual removal

### Requirement 3: 前端图片格式转换

**User Story:** As a system, I want to convert uploaded images to JPEG format, so that the server receives a consistent image format.

#### Acceptance Criteria

1. WHEN an image file is selected for upload, THE Image_Converter SHALL verify the browser can decode the image
2. WHEN a non-JPEG image is selected for upload, THE Image_Converter SHALL convert it to JPEG format
3. WHEN a JPEG image is selected for upload, THE Image_Converter SHALL pass it through without conversion
4. WHEN converting an image, THE Image_Converter SHALL preserve reasonable image quality (compression quality >= 0.85)
5. IF the browser cannot decode the selected image, THEN THE Image_Converter SHALL display an error message to the user
6. IF conversion fails, THEN THE Image_Converter SHALL display an error message to the user

### Requirement 4: 文件上传API端点

**User Story:** As a developer, I want a server endpoint to receive uploaded files, so that files can be stored and processed.

#### Acceptance Criteria

1. THE HTTP_Server SHALL provide a POST endpoint at `/api/upload` for file uploads
2. WHEN a file is uploaded, THE HTTP_Server SHALL validate the file size does not exceed the configured limit
3. WHEN a valid file is uploaded, THE HTTP_Server SHALL save the file using the Artifact_Store
4. WHEN a file is saved, THE Artifact_Store SHALL generate metadata including file ID, type, size, and creation timestamp
5. WHEN upload succeeds, THE HTTP_Server SHALL return the artifact reference and metadata in the response
6. IF an upload fails due to invalid file type or size, THEN THE HTTP_Server SHALL return an appropriate error response

### Requirement 5: 消息发送携带附件

**User Story:** As a user, I want my uploaded files to be sent along with my message, so that the AI agent can see and process them.

#### Acceptance Criteria

1. WHEN a user sends a message with attachments, THE Upload_Service SHALL first upload all attachments to the server
2. WHEN all attachments are uploaded, THE Chat_Input_Area SHALL send the message with artifact references
3. WHEN a message with attachments is sent, THE HTTP_Server SHALL store the artifact references in the message payload
4. WHEN displaying a sent message with attachments, THE Chat_Input_Area SHALL show attachment thumbnails or file icons

### Requirement 6: 大模型调用携带附件

**User Story:** As a system, I want to include uploaded files when calling the LLM, so that the AI can process visual and file content.

#### Acceptance Criteria

1. WHEN processing a message with image attachments, THE LLM_Client SHALL include the images in the API request using the appropriate format
2. WHEN processing a message with file attachments, THE LLM_Client SHALL include file content or references as appropriate for the model
3. WHEN the LLM response references an attachment, THE system SHALL correctly associate the response with the original attachment

### Requirement 7: 附件预览和管理

**User Story:** As a user, I want to preview and manage my attachments before sending, so that I can ensure I'm sharing the correct files.

#### Acceptance Criteria

1. WHEN attachments are added, THE Chat_Input_Area SHALL display a preview area above the input field
2. WHEN hovering over an attachment preview, THE Chat_Input_Area SHALL display a remove button
3. WHEN the remove button is clicked, THE Chat_Input_Area SHALL remove the attachment from the pending list
4. WHEN all attachments are removed, THE Chat_Input_Area SHALL hide the preview area
5. WHEN a message is sent successfully, THE Chat_Input_Area SHALL clear all pending attachments

### Requirement 8: 上传进度和状态反馈

**User Story:** As a user, I want to see upload progress and status, so that I know when my files are ready to send.

#### Acceptance Criteria

1. WHILE a file is uploading, THE Upload_Service SHALL display a progress indicator on the attachment preview
2. WHEN an upload completes successfully, THE Upload_Service SHALL update the attachment status to ready
3. IF an upload fails, THEN THE Upload_Service SHALL display an error indicator and allow retry
4. WHILE any attachment is uploading, THE Chat_Input_Area SHALL disable the send button
