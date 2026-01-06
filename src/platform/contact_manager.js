/**
 * ContactManager - 联系人注册表管理器
 * 
 * 负责管理所有智能体的联系人注册表，实现介绍式通信机制。
 * 每个智能体只能与其 Contact_Registry 中的联系人通信。
 */

import { createNoopModuleLogger } from "./logger.js";

/**
 * 联系人注册表管理器
 */
export class ContactManager {
  /**
   * @param {{logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}}} options
   */
  constructor(options = {}) {
    /** @type {Map<string, Map<string, ContactEntry>>} agentId -> contactId -> ContactEntry */
    this._registries = new Map();
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 为智能体初始化联系人注册表
   * @param {string} agentId - 智能体ID
   * @param {string|null} parentAgentId - 父智能体ID（root 和 user 为 null）
   * @param {Array<{agentId: string, role: string, description?: string, interfaceSpec?: object}>} collaborators - 预设协作者列表
   */
  initRegistry(agentId, parentAgentId, collaborators = []) {
    const registry = new Map();
    const now = this._formatTimestamp();

    // 处理 root 和 user 的特殊情况
    if (agentId === 'root') {
      // root 智能体只能与 user 通信
      registry.set('user', {
        id: 'user',
        role: 'user',
        source: 'system',
        addedAt: now
      });
    } else if (agentId === 'user') {
      // user 只能与 root 通信
      registry.set('root', {
        id: 'root',
        role: 'root',
        source: 'system',
        addedAt: now
      });
    } else if (parentAgentId) {
      // 普通智能体自动包含父智能体
      registry.set(parentAgentId, {
        id: parentAgentId,
        role: this._getAgentRole(parentAgentId),
        source: 'parent',
        addedAt: now
      });
    }

    // 添加预设协作者
    for (const collab of collaborators) {
      if (collab && collab.agentId) {
        registry.set(collab.agentId, {
          id: collab.agentId,
          role: collab.role || 'unknown',
          description: collab.description,
          interfaceSpec: collab.interfaceSpec,
          source: 'preset',
          addedAt: now
        });
      }
    }

    this._registries.set(agentId, registry);
    
    void this.log.debug("初始化联系人注册表", {
      agentId,
      parentAgentId,
      collaboratorCount: collaborators.length,
      contactCount: registry.size
    });
  }

  /**
   * 检查联系人是否在注册表中（仅用于查询，不用于发送验证）
   * 注意：此方法不用于阻止消息发送，智能体可以向任何已存在的智能体发送消息
   * @param {string} fromAgentId - 发送者ID
   * @param {string} toAgentId - 接收者ID
   * @returns {{inRegistry: boolean, error?: string}}
   */
  isContactKnown(fromAgentId, toAgentId) {
    const registry = this._registries.get(fromAgentId);
    
    if (!registry) {
      return { inRegistry: false, error: 'sender_not_found' };
    }
    
    if (!registry.has(toAgentId)) {
      return { inRegistry: false, error: 'unknown_contact' };
    }
    
    return { inRegistry: true };
  }

  /**
   * @deprecated 使用 isContactKnown 代替。此方法保留仅为向后兼容。
   * 检查是否可以发送消息（始终返回 allowed: true，不做实际验证）
   * @param {string} fromAgentId - 发送者ID
   * @param {string} toAgentId - 接收者ID
   * @returns {{allowed: boolean}}
   */
  canSendMessage(fromAgentId, toAgentId) {
    // 不再验证联系人注册表，始终允许发送
    return { allowed: true };
  }

  /**
   * 添加联系人
   * @param {string} agentId - 智能体ID
   * @param {{id: string, role?: string, description?: string, interfaceSpec?: object, source?: string, introducedBy?: string}} contact - 联系人信息
   */
  addContact(agentId, contact) {
    const registry = this._registries.get(agentId);
    
    if (!registry) {
      void this.log.warn("添加联系人失败：智能体注册表不存在", { agentId, contactId: contact?.id });
      return;
    }
    
    if (!contact || !contact.id) {
      void this.log.warn("添加联系人失败：联系人信息无效", { agentId, contact });
      return;
    }

    const entry = {
      id: contact.id,
      role: contact.role || 'unknown',
      source: contact.source || 'manual',
      addedAt: this._formatTimestamp()
    };

    // 可选字段
    if (contact.description) {
      entry.description = contact.description;
    }
    if (contact.interfaceSpec) {
      entry.interfaceSpec = contact.interfaceSpec;
    }
    if (contact.introducedBy) {
      entry.introducedBy = contact.introducedBy;
    }

    registry.set(contact.id, entry);
    
    void this.log.debug("添加联系人", {
      agentId,
      contactId: contact.id,
      source: entry.source
    });
  }

  /**
   * 获取联系人信息
   * @param {string} agentId - 智能体ID
   * @param {string} contactId - 联系人ID
   * @returns {ContactEntry|null}
   */
  getContact(agentId, contactId) {
    const registry = this._registries.get(agentId);
    return registry?.get(contactId) ?? null;
  }

  /**
   * 列出所有联系人
   * @param {string} agentId - 智能体ID
   * @returns {ContactEntry[]}
   */
  listContacts(agentId) {
    const registry = this._registries.get(agentId);
    return registry ? Array.from(registry.values()) : [];
  }

  /**
   * 检查智能体是否有注册表
   * @param {string} agentId - 智能体ID
   * @returns {boolean}
   */
  hasRegistry(agentId) {
    return this._registries.has(agentId);
  }

  /**
   * 删除智能体的注册表（用于智能体终止时清理）
   * @param {string} agentId - 智能体ID
   */
  removeRegistry(agentId) {
    this._registries.delete(agentId);
    void this.log.debug("删除联系人注册表", { agentId });
  }

  /**
   * 获取所有注册表数据（用于持久化）
   * @returns {Object<string, ContactEntry[]>}
   */
  getAllRegistries() {
    const result = {};
    for (const [agentId, registry] of this._registries) {
      result[agentId] = Array.from(registry.values());
    }
    return result;
  }

  /**
   * 从持久化数据恢复注册表
   * @param {Object<string, ContactEntry[]>} data - 持久化的注册表数据
   */
  loadFromData(data) {
    if (!data || typeof data !== 'object') {
      return;
    }

    for (const [agentId, contacts] of Object.entries(data)) {
      if (!Array.isArray(contacts)) {
        continue;
      }

      const registry = new Map();
      for (const contact of contacts) {
        if (contact && contact.id) {
          registry.set(contact.id, contact);
        }
      }
      this._registries.set(agentId, registry);
    }

    void this.log.info("从持久化数据恢复联系人注册表", {
      agentCount: this._registries.size
    });
  }

  /**
   * 获取智能体角色名（内部辅助方法）
   * @param {string} agentId - 智能体ID
   * @returns {string}
   * @private
   */
  _getAgentRole(agentId) {
    // 特殊智能体
    if (agentId === 'root') return 'root';
    if (agentId === 'user') return 'user';
    
    // 普通智能体需要从外部获取角色信息
    // 这里返回 unknown，实际使用时应该通过 OrgPrimitives 获取
    return 'unknown';
  }

  /**
   * 格式化时间戳
   * @returns {string}
   * @private
   */
  _formatTimestamp() {
    const date = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    const pad3 = (n) => String(n).padStart(3, "0");

    const yyyy = date.getFullYear();
    const MM = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    const SSS = pad3(date.getMilliseconds());

    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const offH = pad2(Math.floor(abs / 60));
    const offM = pad2(abs % 60);

    return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}.${SSS}${sign}${offH}:${offM}`;
  }
}

/**
 * @typedef {Object} ContactEntry
 * @property {string} id - 智能体ID
 * @property {string} role - 角色名称
 * @property {string} [description] - 协作说明
 * @property {Object} [interfaceSpec] - 接口规格说明
 * @property {string} source - 来源（system/parent/preset/introduction/first_message）
 * @property {string} [introducedBy] - 介绍人ID（如果是通过介绍获得）
 * @property {string} addedAt - 添加时间
 */
