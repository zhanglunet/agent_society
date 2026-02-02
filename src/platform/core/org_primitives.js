import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createNoopModuleLogger } from "../utils/logger/logger.js";

/**
 * 验证岗位数据结构
 * @param {any} role
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateRole(role) {
  const errors = [];
  if (!role || typeof role !== "object") {
    errors.push("岗位必须是对象");
    return { valid: false, errors };
  }
  if (typeof role.id !== "string" || role.id.length === 0) {
    errors.push("岗位ID必须是非空字符串");
  }
  if (typeof role.name !== "string" || role.name.length === 0) {
    errors.push("岗位名称必须是非空字符串");
  }
  if (typeof role.rolePrompt !== "string") {
    errors.push("岗位提示词必须是字符串");
  }
  if (role.orgPrompt !== undefined && role.orgPrompt !== null && typeof role.orgPrompt !== "string") {
    errors.push("岗位组织架构提示词必须是字符串或null");
  }
  // toolGroups 是可选的，如果存在则必须是字符串数组或 null
  if (role.toolGroups !== undefined && role.toolGroups !== null) {
    if (!Array.isArray(role.toolGroups)) {
      errors.push("岗位工具组必须是数组或null");
    } else if (!role.toolGroups.every(g => typeof g === "string")) {
      errors.push("岗位工具组数组元素必须是字符串");
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证智能体数据结构
 * @param {any} agent
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateAgent(agent) {
  const errors = [];
  if (!agent || typeof agent !== "object") {
    errors.push("智能体必须是对象");
    return { valid: false, errors };
  }
  if (typeof agent.id !== "string" || agent.id.length === 0) {
    errors.push("智能体ID必须是非空字符串");
  }
  if (typeof agent.roleId !== "string" || agent.roleId.length === 0) {
    errors.push("智能体roleId必须是非空字符串");
  }
  if (typeof agent.parentAgentId !== "string" || agent.parentAgentId.length === 0) {
    errors.push("智能体parentAgentId必须是非空字符串");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证终止记录数据结构
 * @param {any} termination
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTermination(termination) {
  const errors = [];
  if (!termination || typeof termination !== "object") {
    errors.push("终止记录必须是对象");
    return { valid: false, errors };
  }
  if (typeof termination.agentId !== "string" || termination.agentId.length === 0) {
    errors.push("终止记录agentId必须是非空字符串");
  }
  if (typeof termination.terminatedBy !== "string" || termination.terminatedBy.length === 0) {
    errors.push("终止记录terminatedBy必须是非空字符串");
  }
  if (typeof termination.terminatedAt !== "string" || termination.terminatedAt.length === 0) {
    errors.push("终止记录terminatedAt必须是非空字符串");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证联系人条目数据结构
 * @param {any} contact
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateContactEntry(contact) {
  const errors = [];
  if (!contact || typeof contact !== "object") {
    errors.push("联系人条目必须是对象");
    return { valid: false, errors };
  }
  if (typeof contact.id !== "string" || contact.id.length === 0) {
    errors.push("联系人ID必须是非空字符串");
  }
  if (typeof contact.source !== "string" || contact.source.length === 0) {
    errors.push("联系人来源必须是非空字符串");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证联系人注册表数据结构
 * @param {any} contactRegistries
 * @returns {{valid: boolean, errors: string[], validRegistries: Object<string, any[]>}}
 */
function validateContactRegistries(contactRegistries) {
  const errors = [];
  const validRegistries = {};

  if (contactRegistries === undefined || contactRegistries === null) {
    // contactRegistries 是可选的
    return { valid: true, errors, validRegistries };
  }

  if (typeof contactRegistries !== "object" || Array.isArray(contactRegistries)) {
    errors.push("contactRegistries必须是对象");
    return { valid: false, errors, validRegistries };
  }

  for (const [agentId, contacts] of Object.entries(contactRegistries)) {
    if (!Array.isArray(contacts)) {
      errors.push(`contactRegistries[${agentId}]必须是数组`);
      continue;
    }

    const validContacts = [];
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const result = validateContactEntry(contact);
      if (result.valid) {
        validContacts.push(contact);
      } else {
        errors.push(`contactRegistries[${agentId}][${i}]: ${result.errors.join(", ")}`);
      }
    }
    validRegistries[agentId] = validContacts;
  }

  return { valid: errors.length === 0, errors, validRegistries };
}

/**
 * 验证完整的组织状态数据结构
 * @param {any} data
 * @returns {{valid: boolean, errors: string[], validRoles: any[], validAgents: any[], validTerminations: any[], validContactRegistries: Object<string, any[]>}}
 */
function validateOrgState(data) {
  const errors = [];
  const validRoles = [];
  const validAgents = [];
  const validTerminations = [];
  let validContactRegistries = {};

  if (!data || typeof data !== "object") {
    errors.push("组织状态必须是对象");
    return { valid: false, errors, validRoles, validAgents, validTerminations, validContactRegistries };
  }

  // 验证roles数组
  if (!Array.isArray(data.roles)) {
    errors.push("roles必须是数组");
  } else {
    for (let i = 0; i < data.roles.length; i++) {
      const role = data.roles[i];
      const result = validateRole(role);
      if (result.valid) {
        validRoles.push(role);
      } else {
        errors.push(`roles[${i}]: ${result.errors.join(", ")}`);
      }
    }
  }

  // 验证agents数组
  if (!Array.isArray(data.agents)) {
    errors.push("agents必须是数组");
  } else {
    for (let i = 0; i < data.agents.length; i++) {
      const agent = data.agents[i];
      const result = validateAgent(agent);
      if (result.valid) {
        validAgents.push(agent);
      } else {
        errors.push(`agents[${i}]: ${result.errors.join(", ")}`);
      }
    }
  }

  // 验证terminations数组
  if (data.terminations !== undefined && !Array.isArray(data.terminations)) {
    errors.push("terminations必须是数组");
  } else if (Array.isArray(data.terminations)) {
    for (let i = 0; i < data.terminations.length; i++) {
      const termination = data.terminations[i];
      const result = validateTermination(termination);
      if (result.valid) {
        validTerminations.push(termination);
      } else {
        errors.push(`terminations[${i}]: ${result.errors.join(", ")}`);
      }
    }
  }

  // 验证contactRegistries对象
  const contactResult = validateContactRegistries(data.contactRegistries);
  if (!contactResult.valid) {
    errors.push(...contactResult.errors);
  }
  validContactRegistries = contactResult.validRegistries;

  return { 
    valid: errors.length === 0, 
    errors, 
    validRoles, 
    validAgents, 
    validTerminations,
    validContactRegistries
  };
}

function formatLocalTimestamp(date = new Date()) {
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

/**
 * 最小组织原语：创建岗位与创建智能体实例，并将组织状态持久化到 data/runtime。
 */
export class OrgPrimitives {
  /**
   * @param {{runtimeDir:string, logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}} options
   */
  constructor(options) {
    this.runtimeDir = options.runtimeDir;
    this._roles = new Map();
    this._agents = new Map();
    this._terminations = [];
    this._contactRegistries = {}; // agentId -> ContactEntry[]
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 初始化运行时目录。
   * @returns {Promise<void>}
   */
  async ensureReady() {
    await mkdir(this.runtimeDir, { recursive: true });
  }

  /**
   * 加载已存在的组织状态（如果存在）。
   * 包含数据结构验证，无效数据将被跳过。
   * @returns {Promise<{loaded: boolean, errors: string[]}>}
   */
  async loadIfExists() {
    await this.ensureReady();
    const filePath = path.resolve(this.runtimeDir, "org.json");
    try {
      const raw = await readFile(filePath, "utf8");
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        void this.log.error("组织状态JSON解析失败", { filePath, error: parseErr.message });
        return { loaded: false, errors: ["JSON解析失败: " + parseErr.message] };
      }
      
      // 验证数据结构
      const validation = validateOrgState(data);
      if (!validation.valid) {
        void this.log.warn("组织状态数据结构验证有错误，将使用有效数据", { 
          filePath, 
          errors: validation.errors,
          validRoles: validation.validRoles.length,
          validAgents: validation.validAgents.length,
          validTerminations: validation.validTerminations.length
        });
      }
      
      // 使用验证后的有效数据
      this._roles = new Map(validation.validRoles.filter((r) => r?.id !== "root").map((r) => [r.id, r]));
      this._agents = new Map(validation.validAgents.filter((a) => a?.id !== "root").map((a) => [a.id, a]));
      this._terminations = validation.validTerminations;
      this._contactRegistries = validation.validContactRegistries || {};
      
      void this.log.info("加载组织状态成功", { 
        roles: this._roles.size, 
        agents: this._agents.size, 
        terminations: this._terminations.length,
        contactRegistries: Object.keys(this._contactRegistries).length,
        validationErrors: validation.errors.length
      });
      
      return { loaded: true, errors: validation.errors };
    } catch (err) {
      void this.log.warn("组织状态不存在或不可读取，已跳过加载", { filePath, error: err.message });
      return { loaded: false, errors: [err.message] };
    }
  }

  /**
   * 持久化组织状态（原子性写入）。
   * 使用临时文件+重命名策略确保原子性。
   * 在Windows上如果重命名失败，会回退到直接写入。
   * @returns {Promise<void>}
   */
  async persist() {
    await this.ensureReady();
    const filePath = path.resolve(this.runtimeDir, "org.json");
    const tempFilePath = path.resolve(this.runtimeDir, `org.json.tmp.${randomUUID()}`);
    const data = {
      roles: Array.from(this._roles.values()).filter((r) => r?.id !== "root"),
      agents: Array.from(this._agents.values()).filter((a) => a?.id !== "root"),
      terminations: this._terminations,
      contactRegistries: this._contactRegistries
    };
    
    try {
      // 先写入临时文件
      await writeFile(tempFilePath, JSON.stringify(data, null, 2), "utf8");
      
      try {
        // 尝试原子性重命名
        await rename(tempFilePath, filePath);
      } catch (renameErr) {
        // Windows上可能因为文件锁定而失败，回退到直接写入
        if (renameErr.code === "EPERM" || renameErr.code === "EBUSY") {
          void this.log.warn("原子重命名失败，回退到直接写入", { error: renameErr.message });
          await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
          // 清理临时文件
          try {
            await unlink(tempFilePath);
          } catch {
            // 忽略清理错误
          }
        } else {
          throw renameErr;
        }
      }
      
      void this.log.debug("持久化组织状态完成", { filePath, roles: this._roles.size, agents: this._agents.size, terminations: this._terminations.length, contactRegistries: Object.keys(this._contactRegistries).length });
    } catch (err) {
      // 清理临时文件（如果存在）
      try {
        await unlink(tempFilePath);
      } catch {
        // 忽略清理错误
      }
      void this.log.error("持久化组织状态失败", { filePath, error: err.message });
      throw err;
    }
  }

  /**
   * 创建岗位（Role）。
   * @param {{name:string, rolePrompt:string, orgPrompt?:string|null, createdBy?:string, llmServiceId?:string, toolGroups?:string[]}} input
   * @returns {Promise<{id:string, name:string, rolePrompt:string, orgPrompt:string|null, llmServiceId:string|null, toolGroups:string[]|null}>}
   */
  async createRole(input) {
    const existing = this.findRoleByName(input.name);
    if (existing && existing.status !== "deleted") {
      void this.log.warn("岗位已存在，已复用", { id: existing.id, name: existing.name });
      return existing;
    }
    const id = randomUUID();
    const role = {
      id,
      name: input.name,
      rolePrompt: input.rolePrompt,
      orgPrompt: input.orgPrompt ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: formatLocalTimestamp(),
      status: "active",  // 默认状态为活跃
      llmServiceId: input.llmServiceId ?? null,  // 指定的 LLM 服务 ID
      toolGroups: Array.isArray(input.toolGroups) ? input.toolGroups : null  // 工具组列表，null 表示使用默认（全部工具组）
    };
    this._roles.set(id, role);
    await this.persist();
    void this.log.info("创建岗位", { id, name: role.name, createdBy: role.createdBy, llmServiceId: role.llmServiceId, toolGroups: role.toolGroups });
    return role;
  }

  /**
   * 更新岗位信息。
   * @param {string} roleId - 岗位ID
   * @param {{rolePrompt?: string, orgPrompt?: string|null, llmServiceId?: string|null, toolGroups?: string[]|null}} updates - 要更新的字段
   * @returns {Promise<{id:string, name:string, rolePrompt:string, orgPrompt:string|null, llmServiceId:string|null, toolGroups:string[]|null}|null>}
   */
  async updateRole(roleId, updates) {
    const role = this._roles.get(roleId);
    if (!role) {
      void this.log.warn("更新岗位失败：岗位不存在", { roleId });
      return null;
    }
    
    // 更新允许修改的字段
    if (updates.rolePrompt !== undefined && typeof updates.rolePrompt === "string") {
      role.rolePrompt = updates.rolePrompt;
    }

    if (updates.orgPrompt !== undefined) {
      if (updates.orgPrompt === null) {
        role.orgPrompt = null;
      } else if (typeof updates.orgPrompt === "string") {
        role.orgPrompt = updates.orgPrompt;
      }
    }
    
    // 更新 LLM 服务 ID（允许设置为 null 表示使用默认服务）
    if (updates.llmServiceId !== undefined) {
      role.llmServiceId = updates.llmServiceId === "" ? null : (updates.llmServiceId ?? null);
    }
    
    // 更新工具组列表（允许设置为 null 表示使用默认的全部工具组）
    if (updates.toolGroups !== undefined) {
      if (Array.isArray(updates.toolGroups)) {
        // 空数组也视为 null（使用默认的全部工具组）
        role.toolGroups = updates.toolGroups.length > 0 ? updates.toolGroups : null;
      } else {
        role.toolGroups = null;
      }
    }
    
    role.updatedAt = formatLocalTimestamp();
    
    await this.persist();
    void this.log.info("更新岗位", { id: roleId, name: role.name, llmServiceId: role.llmServiceId, toolGroups: role.toolGroups });
    return role;
  }

  /**
   * 创建智能体实例（Agent Instance），必须绑定岗位 roleId。
   * @param {{roleId:string, parentAgentId?:string, name?:string|null}} input
   * @returns {Promise<{id:string, roleId:string, parentAgentId:string|null, status:string, name?:string|null}>}
   */
  async createAgent(input) {
    const id = randomUUID();
    const parentAgentId = input.parentAgentId;
    if (
      typeof parentAgentId !== "string" ||
      parentAgentId.length === 0 ||
      parentAgentId === "null" ||
      parentAgentId === "undefined"
    ) {
      throw new Error("invalid_parentAgentId");
    }
    
    const name =
      input && typeof input.name === "string"
        ? (input.name.trim() ? input.name.trim() : null)
        : null;
    
    const agent = {
      id,
      roleId: input.roleId,
      parentAgentId,
      createdAt: formatLocalTimestamp(),
      status: "active",  // 默认状态为活跃
      name
    };
    this._agents.set(id, agent);
    await this.persist();
    void this.log.info("创建智能体元数据", { id, roleId: agent.roleId, parentAgentId: agent.parentAgentId, status: agent.status, name: agent.name });
    return agent;
  }

  /**
   * 设置智能体姓名（持久化到 org.json）。
   * @param {string} agentId
   * @param {string|null} name - 传 null 或空字符串表示清除
   * @returns {Promise<{id:string, roleId:string, parentAgentId:string|null, status:string, name?:string|null}|null>}
   */
  async setAgentName(agentId, name) {
    if (!agentId || typeof agentId !== "string") {
      throw new Error("invalid_agentId");
    }
    
    const agent = this._agents.get(agentId);
    if (!agent) return null;
    
    if (typeof name === "string" && name.trim()) {
      agent.name = name.trim();
    } else {
      agent.name = null;
    }
    
    await this.persist();
    void this.log.info("更新智能体姓名", { agentId, name: agent.name });
    return agent;
  }

  /**
   * 获取岗位信息。
   * @param {string} roleId
   * @returns {any|null}
   */
  getRole(roleId) {
    return this._roles.get(roleId) ?? null;
  }

  /**
   * 根据岗位名查找岗位（最小实现，用于演示）。
   * @param {string} name
   * @returns {any|null}
   */
  findRoleByName(name) {
    for (const r of this._roles.values()) {
      if (r.name === name) return r;
    }
    return null;
  }

  /**
   * 记录智能体终止事件。
   * 会级联标记所有子智能体为已终止状态。
   * @param {string} agentId - 被终止的智能体ID
   * @param {string} terminatedBy - 执行终止的智能体ID
   * @param {string} [reason] - 终止原因
   * @returns {Promise<{agentId:string, terminatedBy:string, terminatedAt:string, reason:string|null}>}
   */
  async recordTermination(agentId, terminatedBy, reason) {
    const termination = {
      agentId,
      terminatedBy,
      terminatedAt: formatLocalTimestamp(),
      reason: reason ?? null
    };
    this._terminations.push(termination);
    
    // 更新智能体状态为已终止
    const agent = this._agents.get(agentId);
    if (agent) {
      agent.terminatedAt = termination.terminatedAt;
      agent.status = "terminated";
    }
    
    // 级联终止所有子智能体
    const cascadeTerminated = [];
    for (const [id, childAgent] of this._agents) {
      if (childAgent.parentAgentId === agentId && childAgent.status !== "terminated") {
        const childTermination = {
          agentId: id,
          terminatedBy: agentId,
          terminatedAt: termination.terminatedAt,
          reason: "父智能体已终止（级联终止）"
        };
        this._terminations.push(childTermination);
        childAgent.terminatedAt = childTermination.terminatedAt;
        childAgent.status = "terminated";
        cascadeTerminated.push(id);
        
        // 递归处理孙子智能体
        await this._cascadeTerminateChildren(id, childTermination.terminatedAt);
      }
    }
    
    if (cascadeTerminated.length > 0) {
      void this.log.info("级联终止子智能体", { 
        parentAgentId: agentId, 
        cascadeTerminated,
        count: cascadeTerminated.length 
      });
    }
    
    await this.persist();
    void this.log.info("记录智能体终止", { agentId, terminatedBy, reason: reason ?? null, cascadeCount: cascadeTerminated.length });
    return termination;
  }

  /**
   * 递归级联终止子智能体（内部方法）。
   * @param {string} parentId - 父智能体ID
   * @param {string} terminatedAt - 终止时间
   * @returns {Promise<void>}
   * @private
   */
  async _cascadeTerminateChildren(parentId, terminatedAt) {
    for (const [id, childAgent] of this._agents) {
      if (childAgent.parentAgentId === parentId && childAgent.status !== "terminated") {
        const childTermination = {
          agentId: id,
          terminatedBy: parentId,
          terminatedAt,
          reason: "父智能体已终止（级联终止）"
        };
        this._terminations.push(childTermination);
        childAgent.terminatedAt = terminatedAt;
        childAgent.status = "terminated";
        
        // 递归处理更深层的子智能体
        await this._cascadeTerminateChildren(id, terminatedAt);
      }
    }
  }

  /**
   * 删除岗位（软删除）。
   * 会级联终止该岗位上的所有智能体，并递归删除子岗位。
   * @param {string} roleId - 要删除的岗位ID
   * @param {string} deletedBy - 执行删除的用户或智能体ID
   * @param {string} [reason] - 删除原因
   * @returns {Promise<{roleId:string, deletedBy:string, deletedAt:string, reason:string|null, affectedAgents:string[], affectedRoles:string[]}>}
   */
  async deleteRole(roleId, deletedBy, reason) {
    const role = this._roles.get(roleId);
    if (!role) {
      throw new Error(`岗位不存在: ${roleId}`);
    }

    const deletedAt = formatLocalTimestamp();
    const affectedAgents = [];
    const affectedRoles = [];

    // 1. 终止该岗位上的所有智能体
    const agentIdsToDelete = [];
    for (const [agentId, agent] of this._agents) {
      if (agent.roleId === roleId && agent.status !== "terminated") {
        agentIdsToDelete.push(agentId);
      }
    }

    for (const agentId of agentIdsToDelete) {
      await this.recordTermination(agentId, deletedBy, `岗位已删除: ${role.name}`);
      affectedAgents.push(agentId);
    }

    // 2. 递归删除子岗位（通过智能体的父子关系推断岗位层级）
    await this._cascadeDeleteChildRoles(roleId, deletedBy, deletedAt, affectedAgents, affectedRoles);

    // 3. 标记岗位为已删除
    role.status = "deleted";
    role.deletedAt = deletedAt;
    role.deletedBy = deletedBy;
    role.deleteReason = reason ?? null;
    
    affectedRoles.push(roleId);

    await this.persist();
    void this.log.info("删除岗位", { 
      roleId, 
      roleName: role.name, 
      deletedBy, 
      reason: reason ?? null,
      affectedAgentsCount: affectedAgents.length,
      affectedRolesCount: affectedRoles.length
    });

    return {
      roleId,
      deletedBy,
      deletedAt,
      reason: reason ?? null,
      affectedAgents,
      affectedRoles
    };
  }

  /**
   * 递归删除子岗位（内部方法）。
   * @param {string} parentRoleId - 父岗位ID
   * @param {string} deletedBy - 执行删除的用户或智能体ID
   * @param {string} deletedAt - 删除时间
   * @param {string[]} affectedAgents - 受影响的智能体列表
   * @param {string[]} affectedRoles - 受影响的岗位列表
   * @returns {Promise<void>}
   * @private
   */
  async _cascadeDeleteChildRoles(parentRoleId, deletedBy, deletedAt, affectedAgents, affectedRoles) {
    // 找到该岗位下的智能体创建的子岗位
    const parentAgents = [];
    for (const [agentId, agent] of this._agents) {
      if (agent.roleId === parentRoleId) {
        parentAgents.push(agentId);
      }
    }

    // 找到这些智能体创建的子智能体的岗位
    const childRoleIds = new Set();
    for (const parentAgentId of parentAgents) {
      for (const [childAgentId, childAgent] of this._agents) {
        if (childAgent.parentAgentId === parentAgentId && childAgent.roleId !== parentRoleId) {
          childRoleIds.add(childAgent.roleId);
        }
      }
    }

    // 递归删除子岗位
    for (const childRoleId of childRoleIds) {
      const childRole = this._roles.get(childRoleId);
      if (childRole && childRole.status !== "deleted") {
        // 终止该子岗位上的所有智能体
        const childAgentIdsToDelete = [];
        for (const [agentId, agent] of this._agents) {
          if (agent.roleId === childRoleId && agent.status !== "terminated") {
            childAgentIdsToDelete.push(agentId);
          }
        }

        for (const agentId of childAgentIdsToDelete) {
          await this.recordTermination(agentId, deletedBy, `父岗位已删除（级联删除）`);
          affectedAgents.push(agentId);
        }

        // 标记子岗位为已删除
        childRole.status = "deleted";
        childRole.deletedAt = deletedAt;
        childRole.deletedBy = deletedBy;
        childRole.deleteReason = "父岗位已删除（级联删除）";
        affectedRoles.push(childRoleId);

        // 递归处理更深层的子岗位
        await this._cascadeDeleteChildRoles(childRoleId, deletedBy, deletedAt, affectedAgents, affectedRoles);
      }
    }
  }

  /**
   * 获取智能体元数据。
   * @param {string} agentId
   * @returns {any|null}
   */
  getAgent(agentId) {
    return this._agents.get(agentId) ?? null;
  }

  /**
   * 重置为空状态。
   * 清空所有内存中的数据，但不删除持久化文件。
   * @returns {void}
   */
  resetToEmpty() {
    this._roles = new Map();
    this._agents = new Map();
    this._terminations = [];
    this._contactRegistries = {};
    void this.log.info("组织状态已重置为空");
  }

  /**
   * 加载组织状态，如果损坏则重置为空状态。
   * 这是推荐的启动时加载方法。
   * @returns {Promise<{loaded: boolean, reset: boolean, errors: string[]}>}
   */
  async loadOrReset() {
    const result = await this.loadIfExists();
    
    // 如果加载失败（文件不存在或完全损坏），以空状态启动
    if (!result.loaded) {
      void this.log.error("组织状态损坏或不存在，以空状态启动", { errors: result.errors });
      this.resetToEmpty();
      return { loaded: false, reset: true, errors: result.errors };
    }
    
    // 如果加载成功但有验证错误，记录警告但继续使用有效数据
    if (result.errors.length > 0) {
      void this.log.warn("组织状态部分损坏，已跳过无效数据", { 
        errorCount: result.errors.length,
        errors: result.errors 
      });
    }
    
    return { loaded: true, reset: false, errors: result.errors };
  }

  /**
   * 检查组织状态是否损坏。
   * @returns {Promise<{corrupted: boolean, errors: string[]}>}
   */
  async checkCorruption() {
    const filePath = path.resolve(this.runtimeDir, "org.json");
    try {
      const raw = await readFile(filePath, "utf8");
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        return { corrupted: true, errors: ["JSON解析失败: " + parseErr.message] };
      }
      
      const validation = validateOrgState(data);
      return { corrupted: !validation.valid, errors: validation.errors };
    } catch (err) {
      // 文件不存在不算损坏
      if (err.code === "ENOENT") {
        return { corrupted: false, errors: [] };
      }
      return { corrupted: true, errors: [err.message] };
    }
  }

  /**
   * 列出所有岗位（用于调试）。
   * @returns {{id: string, name: string, rolePrompt: string, createdBy: string|null, createdAt: string}[]}
   */
  listRoles() {
    return Array.from(this._roles.values());
  }

  /**
   * 列出所有智能体（用于调试）。
   * @returns {{id: string, roleId: string, parentAgentId: string, createdAt: string, terminatedAt?: string, status?: string}[]}
   */
  listAgents() {
    return Array.from(this._agents.values());
  }

  /**
   * 列出所有终止记录（用于调试）。
   * @returns {{agentId: string, terminatedBy: string, terminatedAt: string, reason: string|null}[]}
   */
  listTerminations() {
    return [...this._terminations];
  }

  /**
   * 获取组织状态摘要（用于调试）。
   * @returns {{roleCount: number, agentCount: number, terminationCount: number, activeAgentCount: number}}
   */
  getSummary() {
    const agents = this.listAgents();
    const activeAgents = agents.filter(a => a.status !== "terminated");
    return {
      roleCount: this._roles.size,
      agentCount: this._agents.size,
      terminationCount: this._terminations.length,
      activeAgentCount: activeAgents.length,
      contactRegistryCount: Object.keys(this._contactRegistries).length
    };
  }

  /**
   * 保存联系人注册表数据。
   * @param {string} agentId - 智能体ID
   * @param {Array<{id: string, role?: string, source: string, addedAt?: string, description?: string, interfaceSpec?: object, introducedBy?: string}>} contacts - 联系人列表
   * @returns {Promise<void>}
   */
  async saveContactRegistry(agentId, contacts) {
    if (!agentId || typeof agentId !== "string") {
      throw new Error("invalid_agentId");
    }
    if (!Array.isArray(contacts)) {
      throw new Error("contacts_must_be_array");
    }
    
    this._contactRegistries[agentId] = contacts;
    await this.persist();
    void this.log.debug("保存联系人注册表", { agentId, contactCount: contacts.length });
  }

  /**
   * 加载联系人注册表数据。
   * @param {string} agentId - 智能体ID
   * @returns {Array<{id: string, role?: string, source: string, addedAt?: string, description?: string, interfaceSpec?: object, introducedBy?: string}>}
   */
  loadContactRegistry(agentId) {
    return this._contactRegistries[agentId] || [];
  }

  /**
   * 删除联系人注册表数据。
   * @param {string} agentId - 智能体ID
   * @returns {Promise<void>}
   */
  async removeContactRegistry(agentId) {
    if (this._contactRegistries[agentId]) {
      delete this._contactRegistries[agentId];
      await this.persist();
      void this.log.debug("删除联系人注册表", { agentId });
    }
  }

  /**
   * 获取所有联系人注册表数据。
   * @returns {Object<string, Array>}
   */
  getAllContactRegistries() {
    return { ...this._contactRegistries };
  }
}
