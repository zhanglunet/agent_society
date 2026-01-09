# Requirements Document

## Introduction

本功能为智能体平台增加多场景化大模型服务选择能力。系统将支持配置多个具有不同能力特征的大模型服务（如高智能、编程、视觉理解、音频模型、多模态、低成本、人性化、游戏化等），并在创建岗位时自动根据岗位提示词智能匹配最合适的大模型服务。

## Glossary

- **LLM_Service**: 大语言模型服务，包含 baseURL、model、apiKey 等连接配置以及能力标签描述
- **LLM_Service_Registry**: 大模型服务注册表，存储在 llmservices.json 配置文件中的所有可用大模型服务
- **Default_LLM**: 默认大模型服务，用于执行模型选择判断的基础模型，配置在 app.json 中
- **Capability_Tag**: 能力标签，用自然语言描述大模型的特长领域（如"视觉理解"、"编程"、"高智能"等）
- **Model_Selector**: 模型选择器，根据岗位提示词分析并选择最合适大模型服务的组件
- **Role_Prompt**: 岗位提示词，描述岗位职责和能力要求的文本
- **Selection_Prompt_Template**: 模型选择提示词模板，用于指导默认大模型进行模型选择判断的提示词文件

## Requirements

### Requirement 1: LLM 服务配置文件

**User Story:** As a 系统管理员, I want to 在独立配置文件中定义多个场景化大模型服务, so that 系统可以根据不同场景选择合适的模型。

#### Acceptance Criteria

1. THE Config_Loader SHALL 优先加载 config/llmservices.local.json 配置文件
2. WHEN llmservices.local.json 文件不存在, THEN THE Config_Loader SHALL 回退加载 config/llmservices.json
3. WHEN 两个配置文件都不存在, THEN THE Config_Loader SHALL 使用空服务列表继续运行
4. THE LLM_Service_Registry SHALL 存储每个服务的 id、name、baseURL、model、apiKey、capabilityTags 和 description 字段
5. WHEN 配置文件包含无效的服务条目, THEN THE Config_Loader SHALL 跳过该条目并记录警告日志
6. THE LLM_Service_Registry SHALL 支持通过 id 或 capabilityTags 查询服务

### Requirement 2: 模型选择提示词模板

**User Story:** As a 系统管理员, I want to 配置模型选择的提示词模板, so that 可以自定义模型选择的判断逻辑。

#### Acceptance Criteria

1. THE Prompt_Loader SHALL 加载 config/prompts/model_selector.txt 提示词模板文件
2. THE Selection_Prompt_Template SHALL 包含占位符用于插入岗位提示词和可用服务列表
3. WHEN 模板文件不存在, THEN THE Prompt_Loader SHALL 使用内置默认模板
4. THE Selection_Prompt_Template SHALL 指导 LLM 输出结构化的选择结果（JSON 格式）

### Requirement 3: 岗位创建时的模型选择

**User Story:** As a 智能体, I want to 在创建岗位时自动选择合适的大模型服务, so that 新岗位可以使用最适合其职责的模型。

#### Acceptance Criteria

1. WHEN 创建岗位且 LLM_Service_Registry 包含至少一个有效服务, THEN THE Model_Selector SHALL 调用 Default_LLM 进行模型选择
2. WHEN LLM_Service_Registry 为空或未配置任何服务, THEN THE Model_Selector SHALL 跳过选择流程并直接使用 Default_LLM
3. THE Model_Selector SHALL 将岗位提示词和可用服务列表传递给 Default_LLM
4. WHEN Default_LLM 返回选择结果, THEN THE Model_Selector SHALL 解析并验证选择的服务 ID
5. IF 选择的服务 ID 无效, THEN THE Model_Selector SHALL 回退使用 Default_LLM
6. THE Role SHALL 存储选中的 llmServiceId 字段
7. IF 模型选择过程发生异常, THEN THE Model_Selector SHALL 记录错误日志并回退使用 Default_LLM

### Requirement 4: 智能体使用岗位指定的模型

**User Story:** As a 智能体, I want to 使用岗位指定的大模型服务进行对话, so that 我的响应质量与岗位职责匹配。

#### Acceptance Criteria

1. WHEN 智能体处理消息, THEN THE Runtime SHALL 根据岗位的 llmServiceId 获取对应的 LLM_Service
2. IF 岗位未指定 llmServiceId, THEN THE Runtime SHALL 使用 Default_LLM
3. IF 指定的 llmServiceId 对应的服务不可用, THEN THE Runtime SHALL 回退使用 Default_LLM 并记录警告
4. THE Runtime SHALL 为每个 LLM_Service 维护独立的 LlmClient 实例

### Requirement 5: 模型选择结果的序列化

**User Story:** As a 系统, I want to 持久化岗位的模型选择结果, so that 重启后智能体仍使用正确的模型。

#### Acceptance Criteria

1. THE OrgPrimitives SHALL 在岗位数据中存储 llmServiceId 字段
2. WHEN 加载组织状态, THEN THE OrgPrimitives SHALL 恢复岗位的 llmServiceId
3. THE llmServiceId 字段 SHALL 为可选字段，缺失时表示使用默认模型
