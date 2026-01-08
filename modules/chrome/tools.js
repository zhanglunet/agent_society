/**
 * Chrome 模块工具定义
 */

export function getToolDefinitions() {
  return [
    // ==================== 浏览器管理 ====================
    {
      type: "function",
      function: {
        name: "chrome_launch",
        description: "启动一个新的 Chrome 无头浏览器实例",
        parameters: {
          type: "object",
          properties: {
            headless: {
              type: "boolean",
              description: "是否使用无头模式，默认 true"
            },
            args: {
              type: "array",
              items: { type: "string" },
              description: "Chrome 启动参数"
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_close",
        description: "关闭指定的浏览器实例",
        parameters: {
          type: "object",
          properties: {
            browserId: { type: "string", description: "浏览器实例 ID" }
          },
          required: ["browserId"]
        }
      }
    },

    // ==================== 标签页管理 ====================
    {
      type: "function",
      function: {
        name: "chrome_new_tab",
        description: "在指定浏览器中创建新标签页",
        parameters: {
          type: "object",
          properties: {
            browserId: { type: "string", description: "浏览器实例 ID" },
            url: { type: "string", description: "初始 URL（可选）" }
          },
          required: ["browserId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_close_tab",
        description: "关闭指定的标签页",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" }
          },
          required: ["tabId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_list_tabs",
        description: "列出指定浏览器的所有标签页",
        parameters: {
          type: "object",
          properties: {
            browserId: { type: "string", description: "浏览器实例 ID" }
          },
          required: ["browserId"]
        }
      }
    },

    // ==================== 页面导航 ====================
    {
      type: "function",
      function: {
        name: "chrome_navigate",
        description: "导航到指定 URL",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            url: { type: "string", description: "目标 URL" },
            waitUntil: {
              type: "string",
              enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
              description: "等待条件，默认 load"
            },
            timeoutMs: { type: "number", description: "超时时间（毫秒），默认 30000" }
          },
          required: ["tabId", "url"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_get_url",
        description: "获取标签页当前 URL",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" }
          },
          required: ["tabId"]
        }
      }
    },

    // ==================== 内容获取 ====================
    {
      type: "function",
      function: {
        name: "chrome_screenshot",
        description: "获取页面截图并保存为 JPEG 图片文件。返回图片文件路径。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            fullPage: { type: "boolean", description: "是否全页面截图，默认 false" },
            selector: { type: "string", description: "截取特定元素（CSS 选择器）" }
          },
          required: ["tabId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_get_text",
        description: "获取页面纯文本内容",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "获取特定元素的文本（CSS 选择器）" }
          },
          required: ["tabId"]
        }
      }
    },

    // ==================== 页面交互 ====================
    {
      type: "function",
      function: {
        name: "chrome_click",
        description: "点击页面元素",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "元素 CSS 选择器" },
            waitForSelector: { type: "boolean", description: "是否等待元素出现，默认 true" },
            timeoutMs: { type: "number", description: "等待超时（毫秒），默认 5000" }
          },
          required: ["tabId", "selector"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_type",
        description: "在元素中输入文本（追加模式）",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "元素 CSS 选择器" },
            text: { type: "string", description: "要输入的文本" },
            delay: { type: "number", description: "按键间隔（毫秒），默认 0" }
          },
          required: ["tabId", "selector", "text"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_fill",
        description: "清空输入框并填入新文本",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "元素 CSS 选择器" },
            value: { type: "string", description: "要填入的值" }
          },
          required: ["tabId", "selector", "value"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_evaluate",
        description: "在页面上下文中执行 JavaScript 代码",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            script: { type: "string", description: "要执行的 JavaScript 代码" }
          },
          required: ["tabId", "script"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_wait_for",
        description: "等待元素出现或满足条件",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "等待的元素 CSS 选择器" },
            state: {
              type: "string",
              enum: ["attached", "detached", "visible", "hidden"],
              description: "等待的状态，默认 visible"
            },
            timeoutMs: { type: "number", description: "超时时间（毫秒），默认 30000" }
          },
          required: ["tabId", "selector"]
        }
      }
    }
  ];
}
