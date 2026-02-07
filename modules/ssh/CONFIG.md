# SSH模块配置说明

## 配置文件位置

配置文件应放置在系统配置目录中，文件名为 `ssh-config.json`。

## 配置文件结构

配置文件包含两部分：
1. 全局配置项：控制SSH模块的行为参数
2. 主机配置：定义可连接的远程主机及其认证信息

## 配置项说明

### 全局配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| maxConnections | number | 10 | 最大并发连接数 |
| connectionTimeout | number | 30000 | 连接超时时间（毫秒） |
| commandTimeout | number | 30000 | 命令执行超时时间（毫秒） |
| idleTimeout | number | 7200000 | 连接空闲超时时间（毫秒），默认2小时 |
| maxOutputSize | number | 10485760 | 最大输出大小（字节，默认10MB） |
| verifyHostKey | boolean | false | 是否验证主机密钥 |
| keepaliveInterval | number | 30000 | SSH协议层保活间隔（毫秒），默认30秒 |
| keepaliveCountMax | number | 20 | 保活失败最大次数，默认20次（总超时约10分钟） |

### 主机配置

每个主机配置包含以下字段：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| description | string | 是 | 主机描述，智能体可见 |
| host | string | 是 | 主机地址（IP或域名） |
| port | number | 是 | SSH端口 |
| username | string | 是 | 登录用户名 |
| password | string | 否 | 密码（密码认证） |
| privateKey | string | 否 | 私钥文件路径（密钥认证） |
| passphrase | string | 否 | 私钥密码（如果私钥有密码保护） |

**注意：** `password` 和 `privateKey` 必须提供其中一个。

## 认证方式

### 密码认证

使用用户名和密码进行认证：

```json
{
  "hosts": {
    "my-server": {
      "description": "我的服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "root",
      "password": "your_password"
    }
  }
}
```

### 密钥认证

使用SSH私钥文件进行认证：

```json
{
  "hosts": {
    "my-server": {
      "description": "我的服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "root",
      "privateKey": "/home/user/.ssh/id_rsa"
    }
  }
}
```

### 带密码的密钥认证

如果私钥文件有密码保护，需要提供 `passphrase`：

```json
{
  "hosts": {
    "my-server": {
      "description": "我的服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "root",
      "privateKey": "/home/user/.ssh/id_rsa",
      "passphrase": "key_password"
    }
  }
}
```

## 主机名称设计

主机名称（如 `production-server`、`dev-server`）是智能体使用的标识符，设计时应：

1. **有意义**：名称应清晰表达主机用途
2. **简洁**：避免过长的名称
3. **规范**：使用小写字母、数字和连字符

**示例：**
- `production-server` - 生产服务器
- `dev-server` - 开发服务器
- `test-db` - 测试数据库服务器
- `backup-01` - 备份服务器1

## 安全建议

1. **文件权限**：配置文件包含敏感信息，应设置适当的文件权限（如 `chmod 600`）
2. **密钥管理**：优先使用密钥认证而非密码认证
3. **密码强度**：如使用密码认证，确保密码足够强
4. **定期更新**：定期更换密码和密钥
5. **备份配置**：妥善保管配置文件备份

## 完整配置示例

参考 `config.template.json` 文件获取完整的配置示例。

## 配置验证

模块启动时会验证配置文件：
- 检查必需字段是否存在
- 验证数据类型是否正确
- 确保每个主机至少有一种认证方式

配置错误会在启动时报告，模块将拒绝启动。

## 智能体可见信息

智能体通过 `ssh_list_hosts` 工具只能看到：
- 主机名称（如 `production-server`）
- 主机描述（如 `生产服务器`）

智能体无法获取：
- IP地址或域名
- 端口号
- 用户名
- 密码或私钥路径

这种设计保护了敏感信息不被大模型感知。
