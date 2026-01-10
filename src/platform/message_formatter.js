/**
 * 消息格式化器
 * 
 * 负责将消息格式化为智能体可理解的结构化文本。
 * 包含来源标识行、消息内容、回复提示。
 * 支持多模态消息（图片附件）。
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 6.1, 6.2
 */

/**
 * 格式化消息以呈现给智能体
 * @param {Object} message - 原始消息
 * @param {string} message.from - 发送者ID
 * @param {any} message.payload - 消息内容
 * @param {Object} [senderInfo] - 发送者信息
 * @param {string} [senderInfo.role] - 发送者角色名称
 * @returns {string} 格式化后的消息文本
 */
export function formatMessageForAgent(message, senderInfo) {
  const from = message?.from ?? 'unknown';
  const payload = message?.payload;
  const senderRole = senderInfo?.role ?? 'unknown';

  // 生成来源标识行（Requirements 10.3, 10.4）
  let header;
  if (from === 'user') {
    // 用户消息的特殊格式（Requirements 10.4）
    header = '【来自用户的消息】';
  } else {
    // 普通智能体消息格式（Requirements 10.3）
    header = `【来自 ${senderRole}（${from}）的消息】`;
  }

  // 提取消息内容（Requirements 10.2）
  let content;
  let attachmentInfo = '';
  
  if (payload === null || payload === undefined) {
    content = '';
  } else if (typeof payload === 'object') {
    // 优先使用 text 或 content 字段
    const textField = payload.text ?? payload.content ?? '';
    
    // 确保 content 是字符串，如果是对象则序列化
    if (typeof textField === 'string') {
      content = textField;
    } else if (textField === null || textField === undefined) {
      content = '';
    } else {
      // 如果 text/content 是对象（如多模态内容），序列化它
      content = JSON.stringify(textField);
    }
    
    // 处理附件信息
    if (Array.isArray(payload.attachments) && payload.attachments.length > 0) {
      const attachmentDescriptions = payload.attachments.map((att, idx) => {
        const typeLabel = att.type === 'image' ? '图片' : '文件';
        return `  ${idx + 1}. [${typeLabel}] ${att.filename} `;
      });
      attachmentInfo = `\n\n【附件列表】\n${attachmentDescriptions.join('\n')}`;
    }
    
    // 如果没有 text/content 字段且不是附件消息，则序列化整个 payload
    if (!content && !attachmentInfo) {
      content = JSON.stringify(payload);
    }
  } else {
    content = String(payload);
  }

  // 生成回复提示（Requirements 10.5）
  // 用户消息不需要回复提示
  const replyHint = from !== 'user'
    ? `\n如需回复，请使用 send_message(to='${from}', ...)`
    : '';

  // 组合最终格式（Requirements 10.1, 10.2）
  return `${header}\n${content}${attachmentInfo}${replyHint}`;
}

/**
 * 将消息转换为 OpenAI Vision API 格式的多模态内容
 * 用于 LLM 调用时包含图片
 * 
 * @param {string} textContent - 文本内容
 * @param {Array<{type: string, artifactRef: string, filename: string}>} attachments - 附件列表
 * @param {function} getImageBase64 - 获取图片 base64 数据的函数 (artifactRef) => Promise<{data: string, mimeType: string}>
 * @returns {Promise<string|Array>} 纯文本或多模态内容数组
 */
export async function formatMultimodalContent(textContent, attachments, getImageBase64) {
  // 如果没有附件或没有图片附件，返回纯文本
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return textContent;
  }
  
  const imageAttachments = attachments.filter(att => att.type === 'image');
  if (imageAttachments.length === 0) {
    return textContent;
  }
  
  // 构建多模态内容数组
  const content = [];
  
  // 添加文本部分
  if (textContent) {
    content.push({
      type: 'text',
      text: textContent
    });
  }
  
  // 添加图片部分
  for (const att of imageAttachments) {
    try {
      const imageData = await getImageBase64(att.artifactRef);
      if (imageData && imageData.data) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${imageData.mimeType || 'image/jpeg'};base64,${imageData.data}`
          }
        });
      }
    } catch (err) {
      // 图片加载失败，添加错误提示
      content.push({
        type: 'text',
        text: `[图片加载失败: ${att.filename}]`
      });
    }
  }
  
  // 如果只有一个文本元素，返回纯文本
  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }
  
  return content;
}

/**
 * 检查消息是否包含图片附件
 * @param {Object} message - 消息对象
 * @returns {boolean}
 */
export function hasImageAttachments(message) {
  const payload = message?.payload;
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  
  const attachments = payload.attachments;
  if (!Array.isArray(attachments)) {
    return false;
  }
  
  return attachments.some(att => att.type === 'image');
}

/**
 * 获取消息中的图片附件
 * @param {Object} message - 消息对象
 * @returns {Array<{type: string, artifactRef: string, filename: string}>}
 */
export function getImageAttachments(message) {
  const payload = message?.payload;
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  
  const attachments = payload.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  
  return attachments.filter(att => att.type === 'image');
}

