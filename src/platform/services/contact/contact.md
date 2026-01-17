# 联系人服务模块

## 概述

联系人服务模块负责管理智能体的联系人注册表，实现介绍式通信机制。每个智能体只能与其联系人注册表中的联系人通信。

## 模块职责

### contact_manager.js
- **职责**：联系人注册表管理器
- **主要功能**：
  - 管理智能体的联系人注册表
  - 添加和删除联系人
  - 查询联系人信息
  - 验证通信权限

## 核心概念

### 介绍式通信
- 智能体只能与其联系人注册表中的联系人通信
- 新联系人需要通过现有联系人介绍才能添加
- 确保通信的安全性和可控性

### 联系人信息
每个联系人包含以下信息：
- `agentId`: 智能体 ID
- `name`: 智能体名称
- `role`: 智能体角色
- `introducedBy`: 介绍人 ID（可选）
- `introducedAt`: 介绍时间

## 使用示例

### 创建联系人管理器

```javascript
import { ContactManager } from "./services/contact/contact_manager.js";

const manager = new ContactManager({
  logger: myLogger
});
```

### 管理联系人

```javascript
// 添加联系人
manager.addContact(agentId, {
  agentId: "agent-456",
  name: "开发者",
  role: "developer",
  introducedBy: "agent-123",
  introducedAt: new Date().toISOString()
});

// 检查是否有联系人
const hasContact = manager.hasContact(agentId, "agent-456");

// 获取联系人信息
const contact = manager.getContact(agentId, "agent-456");
if (contact) {
  console.log(`联系人: ${contact.name} (${contact.role})`);
}

// 获取所有联系人
const contacts = manager.getContacts(agentId);
console.log(`联系人数量: ${contacts.length}`);

// 删除联系人
manager.removeContact(agentId, "agent-456");

// 清空联系人列表
manager.clearContacts(agentId);
```

### 验证通信权限

```javascript
// 检查是否可以通信
if (manager.canCommunicate(fromAgentId, toAgentId)) {
  // 发送消息
  await messageBus.send({
    from: fromAgentId,
    to: toAgentId,
    payload: "Hello!"
  });
} else {
  console.error("无权限与该智能体通信");
}
```

## 联系人注册表结构

```javascript
{
  "agent-123": [
    {
      "agentId": "agent-456",
      "name": "开发者",
      "role": "developer",
      "introducedBy": "agent-789",
      "introducedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## 注意事项

1. **介绍机制**：新联系人需要通过现有联系人介绍
2. **双向关系**：添加联系人时，通常需要双向添加
3. **权限验证**：发送消息前应验证通信权限
4. **联系人清理**：智能体终止时应清理其联系人注册表
5. **系统智能体**：user 和 root 智能体通常是默认联系人
