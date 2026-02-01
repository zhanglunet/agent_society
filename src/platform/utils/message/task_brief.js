/**
 * TaskBrief 数据结构和验证逻辑
 * 
 * Task Brief 是父智能体创建子智能体时必须提供的结构化任务说明，
 * 确保子智能体获得完整的任务上下文。
 */

/**
 * TaskBrief 必填字段列表
 */
const REQUIRED_FIELDS = [
  'objective',
  'constraints',
  'inputs',
  'outputs',
  'completion_criteria'
];

/**
 * 验证 TaskBrief 必填字段
 * @param {any} taskBrief - 待验证的 TaskBrief 对象
 * @returns {{valid: boolean, errors: string[]}} 验证结果
 */
export function validateTaskBrief(taskBrief) {
  const errors = [];

  // 检查 taskBrief 是否为有效对象
  if (!taskBrief || typeof taskBrief !== 'object') {
    errors.push('TaskBrief 必须是对象');
    return { valid: false, errors };
  }

  // 检查必填字段
  for (const field of REQUIRED_FIELDS) {
    if (taskBrief[field] === undefined || taskBrief[field] === null) {
      errors.push(`缺少必填字段: ${field}`);
    }
  }

  // 验证 constraints 必须是数组
  if (taskBrief.constraints !== undefined && taskBrief.constraints !== null) {
    if (!Array.isArray(taskBrief.constraints)) {
      taskBrief.constraints = [JSON.stringify(taskBrief.constraints)];
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 格式化 TaskBrief 为可注入上下文的文本
 * @param {Object} taskBrief - TaskBrief 对象
 * @returns {string} 格式化后的文本
 */
export function formatTaskBrief(taskBrief) {
  if (!taskBrief || typeof taskBrief !== 'object') {
    return '';
  }

  const lines = ['【任务委托书 Task Brief】', ''];

  // 目标描述
  if (taskBrief.objective) {
    lines.push('## 目标描述');
    lines.push(taskBrief.objective);
    lines.push('');
  }

  // 技术约束
  if (taskBrief.constraints && Array.isArray(taskBrief.constraints)) {
    lines.push('## 技术约束');
    for (const constraint of taskBrief.constraints) {
      lines.push(`- ${constraint}`);
    }
    lines.push('');
  }

  // 输入说明
  if (taskBrief.inputs) {
    lines.push('## 输入说明');
    lines.push(taskBrief.inputs);
    lines.push('');
  }

  // 输出要求
  if (taskBrief.outputs) {
    lines.push('## 输出要求');
    lines.push(taskBrief.outputs);
    lines.push('');
  }

  // 完成标准
  if (taskBrief.completion_criteria) {
    lines.push('## 完成标准');
    lines.push(taskBrief.completion_criteria);
    lines.push('');
  }

  // 可选字段：协作联系人
  if (taskBrief.collaborators && Array.isArray(taskBrief.collaborators) && taskBrief.collaborators.length > 0) {
    lines.push('## 协作联系人');
    for (const collab of taskBrief.collaborators) {
      lines.push(`- ${collab.role || collab.agentId}: ${collab.description || '无描述'}`);
    }
    lines.push('');
  }

  // 可选字段：参考资料
  if (taskBrief.references && Array.isArray(taskBrief.references) && taskBrief.references.length > 0) {
    lines.push('## 参考资料');
    for (const ref of taskBrief.references) {
      lines.push(`- ${ref}`);
    }
    lines.push('');
  }

  // 可选字段：优先级
  if (taskBrief.priority) {
    lines.push('## 优先级');
    lines.push(taskBrief.priority);
    lines.push('');
  }

  return lines.join('\n');
}
