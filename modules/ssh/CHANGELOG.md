# SSH模块变更日志

## [未发布] - 2026-01-24

### 新增
- SSH连接管理功能
  - 列出已配置的主机（ssh_list_hosts）
  - 建立SSH连接（ssh_connect）
  - 断开SSH连接（ssh_disconnect）
  - 列出所有活动连接（ssh_list_connections）
  - 支持密码认证和密钥认证
  - 连接超时控制
  - 完整的错误处理

- Shell会话管理功能
  - 创建交互式shell会话（ssh_shell_create）
  - 异步发送命令（ssh_shell_send）
  - 窗口读取输出（ssh_shell_read）
  - 关闭shell会话（ssh_shell_close）
  - 输出保存到本地文件
  - 支持从指定偏移位置读取
  - 窗口大小5000字符

- 文件传输功能
  - 异步上传文件（ssh_upload）
  - 异步下载文件（ssh_download）
  - 查询传输状态（ssh_transfer_status）
  - 取消传输任务（ssh_transfer_cancel）
  - 传输进度跟踪
  - 自动清理已完成任务

### 技术特性
- 使用ES模块语法
- 使用`node:` 前缀导入内置模块，确保Bun和Node.js兼容
- 模块化设计，职责清晰
- 完整的错误处理和日志记录
- 资源自动清理

### 文档
- 模块说明文档（ssh.md）
- 使用指南（README.md）
- 配置说明（CONFIG.md）
- 设计文档（.kiro/specs/ssh-module/design.md）
- 需求文档（.kiro/specs/ssh-module/requirements.md）

### 测试
- 连接功能测试（test/ssh/test_connect.js）
- 综合功能测试（test/ssh/test_all_features.js）

### 修复
- 修复长期使用后连接断开问题
  - 将 `keepaliveCountMax` 从 3 增加到 20
  - 总超时时间从 90 秒延长到约 10 分钟
  - 避免短暂网络抖动导致连接断开

- 修复内存泄漏问题
  - `connection_manager.js`: 连接失败时清理 SSH 客户端事件监听器
  - `shell_manager.js`: Shell 关闭时清理流事件监听器和写入流资源
  - `file_transfer.js`: 修复 `checkStalled` 定时器泄漏，确保传输完成后清理
  - `file_transfer.js`: 添加 SFTP 会话过期检查，清理无效连接的缓存会话

### 待完善
- 单元测试覆盖
- 性能优化
- API文档

## 版本说明

版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)规范。

格式：主版本号.次版本号.修订号

- 主版本号：不兼容的API修改
- 次版本号：向下兼容的功能性新增
- 修订号：向下兼容的问题修正
