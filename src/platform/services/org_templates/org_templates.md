本文件夹用于实现“组织架构模板仓库”的后端存取能力。

包含内容：
- org_template_repository.js：基于文件系统的组织模板仓库实现。约定目录结构为 org/[orgName]/info.md 与 org/[orgName]/org.md。提供列出模板简介、读取/写入单文件、新增/删除模板目录等能力，供 HTTP API 与智能体工具复用。

