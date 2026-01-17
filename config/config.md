# config

## 综述
该目录用于集中存放项目配置文件与模板，并按配置域划分子目录。

## 文件列表
- app.json: 功能：存放 JSON 配置或数据。责任：为 app.json 提供结构化内容。内部结构：顶层字段包括 promptsDir、artifactsDir、runtimeDir、loggingConfigPath、maxSteps、maxToolRounds、httpPort、llm、contextLimit、modules。
- app.local.json: 功能：存放 JSON 配置或数据。责任：为 app.local.json 提供结构化内容。内部结构：顶层字段包括 promptsDir、artifactsDir、runtimeDir、loggingConfigPath、maxSteps、maxToolRounds、httpPort、llm、contextLimit、modules。
- app_template.json: 功能：存放 JSON 配置或数据。责任：为 app_template.json 提供结构化内容。内部结构：顶层字段包括 promptsDir、artifactsDir、runtimeDir、loggingConfigPath、maxSteps、maxToolRounds、llm、contextLimit。
- config.md: 功能：本目录说明文档。责任：描述目录综述、文件列表与子目录列表。内部结构：包含“综述 / 文件列表 / 子目录列表”三部分。
- llmservices.local.json: 功能：存放 JSON 配置或数据。责任：为 llmservices.local.json 提供结构化内容。内部结构：顶层字段包括 services。
- llmservices_template.json: 功能：存放 JSON 配置或数据。责任：为 llmservices_template.json 提供结构化内容。内部结构：顶层字段包括 services。
- logging.json: 功能：存放 JSON 配置或数据。责任：为 logging.json 提供结构化内容。内部结构：顶层字段包括 enabled、logsDir、defaultLevel、levels。

## 子目录列表
- （无）
