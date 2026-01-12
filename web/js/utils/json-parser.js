/**
 * JSON内容解析器
 * 处理双重编码的JSON字符串，确保返回正确的JSON对象
 */

/**
 * 解析JSON内容，处理双重编码情况
 * @param {any} content - 原始内容（可能是对象或字符串）
 * @param {number} maxDepth - 最大递归深度，防止无限循环
 * @returns {{data: any, isValid: boolean, error?: string, wasDoubleEncoded: boolean}}
 */
function parseJsonContent(content, maxDepth = 10) {
  // 防止无限递归
  if (maxDepth <= 0) {
    return { 
      data: content, 
      isValid: false, 
      error: "达到最大解析深度",
      wasDoubleEncoded: false 
    };
  }

  // 如果是 null 或 undefined，直接返回
  if (content === null || content === undefined) {
    return { data: content, isValid: true, wasDoubleEncoded: false };
  }

  // 如果已经是对象或数组，直接返回
  if (typeof content === "object") {
    return { data: content, isValid: true, wasDoubleEncoded: false };
  }

  // 如果是字符串，尝试解析
  if (typeof content === "string") {
    // 空字符串直接返回
    if (content.trim() === "") {
      return { data: content, isValid: true, wasDoubleEncoded: false };
    }

    try {
      const parsed = JSON.parse(content);
      
      // 如果解析结果还是字符串，可能是双重编码，递归解析
      if (typeof parsed === "string") {
        const result = parseJsonContent(parsed, maxDepth - 1);
        return {
          ...result,
          wasDoubleEncoded: true
        };
      }
      
      // 解析成功，返回对象/数组
      return { 
        data: parsed, 
        isValid: true, 
        wasDoubleEncoded: false 
      };
    } catch (e) {
      // JSON解析失败，返回原始字符串
      return { 
        data: content, 
        isValid: false, 
        error: e.message,
        wasDoubleEncoded: false 
      };
    }
  }

  // 其他类型（number, boolean等）直接返回
  return { data: content, isValid: true, wasDoubleEncoded: false };
}

/**
 * 格式化JSON为字符串（用于文本视图）
 * @param {any} data - JSON数据
 * @param {number} indent - 缩进空格数
 * @returns {string}
 */
function formatJsonString(data, indent = 2) {
  if (typeof data === "string") {
    // 如果已经是字符串，尝试解析后格式化
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, indent);
    } catch {
      return data;
    }
  }
  return JSON.stringify(data, null, indent);
}

/**
 * 检测内容是否为JSON类型
 * @param {string} extension - 文件扩展名
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
function isJsonType(extension, mimeType) {
  const jsonExtensions = [".json"];
  const jsonMimeTypes = ["application/json", "text/json"];
  
  const ext = (extension || "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  
  return jsonExtensions.includes(ext) || jsonMimeTypes.includes(mime);
}

// 导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseJsonContent, formatJsonString, isJsonType };
}

// 浏览器环境下挂载到 window
if (typeof window !== "undefined") {
  window.JsonParser = { parseJsonContent, formatJsonString, isJsonType };
}
