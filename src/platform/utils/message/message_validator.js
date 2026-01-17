/**
 * 消息类型验证器
 * 
 * 负责验证消息格式是否符合 message_type 的要求。
 * 支持的消息类型：task_assignment、introduction_request、introduction_response、
 * collaboration_request、collaboration_response、status_report、general
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

/**
 * 消息类型枚举
 */
export const MessageType = {
  TASK_ASSIGNMENT: 'task_assignment',
  STATUS_REPORT: 'status_report',
  INTRODUCTION_REQUEST: 'introduction_request',
  INTRODUCTION_RESPONSE: 'introduction_response',
  COLLABORATION_REQUEST: 'collaboration_request',
  COLLABORATION_RESPONSE: 'collaboration_response',
  GENERAL: 'general'
};

/**
 * 所有有效的消息类型列表
 */
export const VALID_MESSAGE_TYPES = Object.values(MessageType);

/**
 * 验证 task_assignment 消息格式
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTaskAssignment(payload) {
  const errors = [];
  
  // task_assignment 需要包含 TaskBrief 结构（Requirements 8.2）
  const taskBrief = payload?.taskBrief ?? payload?.task_brief ?? payload;
  
  if (!taskBrief || typeof taskBrief !== 'object') {
    errors.push('task_assignment 消息必须包含 TaskBrief 结构');
    return { valid: false, errors };
  }
  
  // 验证 TaskBrief 必填字段
  const requiredFields = ['objective', 'constraints', 'inputs', 'outputs', 'completion_criteria'];
  for (const field of requiredFields) {
    if (taskBrief[field] === undefined || taskBrief[field] === null) {
      errors.push(`TaskBrief 缺少必填字段: ${field}`);
    }
  }
  
  // 验证 constraints 必须是数组
  if (taskBrief.constraints !== undefined && taskBrief.constraints !== null) {
    if (!Array.isArray(taskBrief.constraints)) {
      errors.push('TaskBrief.constraints 必须是数组');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * 验证 introduction_request 消息格式
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateIntroductionRequest(payload) {
  const errors = [];
  
  // introduction_request 需要包含 reason 和 required_capability 字段（Requirements 8.3）
  if (!payload || typeof payload !== 'object') {
    errors.push('introduction_request 消息必须是对象');
    return { valid: false, errors };
  }
  
  if (payload.reason === undefined || payload.reason === null || payload.reason === '') {
    errors.push('introduction_request 消息缺少必填字段: reason');
  }
  
  if (payload.required_capability === undefined || payload.required_capability === null || payload.required_capability === '') {
    errors.push('introduction_request 消息缺少必填字段: required_capability');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * 验证 introduction_response 消息格式
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateIntroductionResponse(payload) {
  const errors = [];
  
  // introduction_response 需要包含目标智能体信息（Requirements 8.4）
  if (!payload || typeof payload !== 'object') {
    errors.push('introduction_response 消息必须是对象');
    return { valid: false, errors };
  }
  
  // 目标智能体ID（支持多种字段名）
  const targetAgentId = payload.targetAgentId ?? payload.target_agent_id ?? payload.agentId ?? payload.agent_id;
  if (targetAgentId === undefined || targetAgentId === null || targetAgentId === '') {
    errors.push('introduction_response 消息缺少目标智能体ID（targetAgentId）');
  }
  
  // 角色名称（可选但推荐）
  // const roleName = payload.roleName ?? payload.role_name ?? payload.role;
  
  // Interface_Spec（可选）
  // const interfaceSpec = payload.interfaceSpec ?? payload.interface_spec;
  
  return { valid: errors.length === 0, errors };
}

/**
 * 验证 status_report 消息格式
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateStatusReport(payload) {
  const errors = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('status_report 消息必须是对象');
    return { valid: false, errors };
  }
  
  // status_report 应该包含状态信息
  const status = payload.status ?? payload.text ?? payload.content ?? payload.message;
  if (status === undefined || status === null) {
    errors.push('status_report 消息缺少状态内容');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * 验证 collaboration_request 消息格式
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateCollaborationRequest(payload) {
  const errors = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('collaboration_request 消息必须是对象');
    return { valid: false, errors };
  }
  
  // collaboration_request 应该包含请求内容
  const request = payload.request ?? payload.text ?? payload.content ?? payload.message;
  if (request === undefined || request === null) {
    errors.push('collaboration_request 消息缺少请求内容');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * 验证 collaboration_response 消息格式
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateCollaborationResponse(payload) {
  const errors = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('collaboration_response 消息必须是对象');
    return { valid: false, errors };
  }
  
  // collaboration_response 应该包含响应内容
  const response = payload.response ?? payload.text ?? payload.content ?? payload.message;
  if (response === undefined || response === null) {
    errors.push('collaboration_response 消息缺少响应内容');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * 验证消息格式是否符合 message_type 的要求
 * @param {any} payload - 消息 payload
 * @returns {{valid: boolean, errors: string[], message_type: string|null}}
 */
export function validateMessageFormat(payload) {
  // 如果 payload 为空或不是对象，返回有效（general 类型）
  if (!payload || typeof payload !== 'object') {
    return { valid: true, errors: [], message_type: null };
  }
  
  const messageType = payload.message_type ?? payload.messageType;
  
  // 如果没有指定 message_type，视为 general 类型，不需要验证
  if (messageType === undefined || messageType === null) {
    return { valid: true, errors: [], message_type: null };
  }
  
  // 验证 message_type 是否为有效值
  if (!VALID_MESSAGE_TYPES.includes(messageType)) {
    return { 
      valid: false, 
      errors: [`无效的 message_type: ${messageType}，有效值为: ${VALID_MESSAGE_TYPES.join(', ')}`],
      message_type: messageType
    };
  }
  
  // 根据 message_type 进行具体验证
  let result;
  switch (messageType) {
    case MessageType.TASK_ASSIGNMENT:
      result = validateTaskAssignment(payload);
      break;
    case MessageType.INTRODUCTION_REQUEST:
      result = validateIntroductionRequest(payload);
      break;
    case MessageType.INTRODUCTION_RESPONSE:
      result = validateIntroductionResponse(payload);
      break;
    case MessageType.STATUS_REPORT:
      result = validateStatusReport(payload);
      break;
    case MessageType.COLLABORATION_REQUEST:
      result = validateCollaborationRequest(payload);
      break;
    case MessageType.COLLABORATION_RESPONSE:
      result = validateCollaborationResponse(payload);
      break;
    case MessageType.GENERAL:
      // general 类型不需要特殊验证
      result = { valid: true, errors: [] };
      break;
    default:
      result = { valid: true, errors: [] };
  }
  
  return { ...result, message_type: messageType };
}

/**
 * 检查消息类型是否有效
 * @param {string} messageType - 消息类型
 * @returns {boolean}
 */
export function isValidMessageType(messageType) {
  return VALID_MESSAGE_TYPES.includes(messageType);
}
