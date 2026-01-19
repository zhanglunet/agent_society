/**
 * Chrome 模块工具定义
 * 
 * 【工具组说明】chrome 工具组用于模拟人类访问和操作网页，适用于以下场景：
 * - 访问需要 JavaScript 渲染的动态网页
 * - 执行页面交互操作（点击、输入、滚动等）
 * - 获取页面截图或提取页面内容
 * - 获取和保存页面资源（图片、CSS、JS等）
 * - 处理登录、验证码等复杂流程
 * - 爬取需要模拟真实浏览器行为的网站
 * 
 * 【与 http_request 的区别】
 * - http_request：用于调用已知的、确定的 API 接口（REST API、JSON API 等）
 * - chrome 工具组：用于模拟人类浏览网页，处理动态渲染和页面交互
 */

export function getToolDefinitions() {
  return [
    // ==================== 浏览器管理 ====================
    {
      type: "function",
      function: {
        name: "chrome_launch",
        description: "启动一个新的 Chrome 浏览器实例。这是使用 chrome 工具组的第一步，启动后会返回 browserId 用于后续操作。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_close",
        description: "关闭指定的浏览器实例，释放资源。任务完成后应调用此工具关闭浏览器。",
        parameters: {
          type: "object",
          properties: {
            browserId: { type: "string", description: "浏览器实例 ID（由 chrome_launch 返回）" }
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
        description: "在指定浏览器中创建新标签页。返回 tabId 用于后续的页面操作。",
        parameters: {
          type: "object",
          properties: {
            browserId: { type: "string", description: "浏览器实例 ID（由 chrome_launch 返回）" },
            url: { type: "string", description: "初始 URL（可选），不指定则打开空白页" }
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
            tabId: { type: "string", description: "标签页 ID（由 chrome_new_tab 返回）" }
          },
          required: ["tabId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_list_tabs",
        description: "列出指定浏览器的所有标签页，返回每个标签页的 ID、URL 和标题",
        parameters: {
          type: "object",
          properties: {
            browserId: { type: "string", description: "浏览器实例 ID（由 chrome_launch 返回）" }
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
        description: "导航到指定 URL，模拟人类在浏览器地址栏输入网址访问。支持等待页面加载完成。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            url: { type: "string", description: "目标 URL" },
            waitUntil: {
              type: "string",
              enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
              description: "等待条件：load（页面加载完成）、domcontentloaded（DOM 解析完成）、networkidle0（无网络请求）、networkidle2（最多2个网络请求）。默认 load"
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
        description: "获取标签页当前 URL，用于确认页面跳转或检查当前位置",
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
        description: "获取页面截图并保存为 JPEG 图片文件。可截取整个页面或特定元素。返回图片文件路径。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            fullPage: { type: "boolean", description: "是否全页面截图（包括滚动区域），默认 false（仅可视区域）" },
            selector: { type: "string", description: "截取特定元素（CSS 选择器），不指定则截取整个页面" }
          },
          required: ["tabId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_get_text",
        description: "获取页面纯文本内容，自动过滤 HTML 标签。可获取整个页面或特定元素的文本。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "获取特定元素的文本（CSS 选择器），不指定则获取整个页面文本" }
          },
          required: ["tabId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_get_elements",
        description: "获取页面可交互元素的结构化信息（JSON格式）。返回所有可见的文本、链接、按钮、输入框等控件信息，包含元素的选择器、文本内容、类型等，便于智能体分析页面并决策下一步操作（如点击、输入等）。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "限定范围的 CSS 选择器（可选），不指定则获取整个页面的元素" },
            types: { 
              type: "array", 
              items: { 
                type: "string",
                enum: ["link", "button", "input", "text", "image", "select", "textarea", "checkbox", "radio"]
              },
              description: "要获取的元素类型（可选），不指定则获取所有类型。可选值：link（链接）、button（按钮）、input（输入框，自动包含 textarea）、text（文本块）、image（图片）、select（下拉框，自动包含 checkbox 和 radio）、textarea（文本域）、checkbox（复选框）、radio（单选框）"
            },
            maxElements: { type: "number", description: "最大返回元素数量（可选），默认 1000，避免返回过多数据" }
          },
          required: ["tabId"]
        }
      }
    },

    // ==================== 资源管理 ====================
    {
      type: "function",
      function: {
        name: "chrome_get_resources",
        description: "获取页面上的资源列表，包括图片、CSS、JavaScript、视频、音频等。主要用于分析页面资源或批量保存资源。返回资源的URL、类型、尺寸等信息。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            types: {
              type: "array",
              items: {
                type: "string",
                enum: ["image", "background", "css", "script", "video", "audio"]
              },
              description: "要获取的资源类型数组。可选值：image（图片）、background（背景图）、css（样式表）、script（脚本）、video（视频）、audio（音频）。默认只获取 image"
            },
            includeDataUrls: {
              type: "boolean",
              description: "是否包含 data URL（base64编码的内嵌资源），默认 false"
            }
          },
          required: ["tabId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_save_resource",
        description: "保存页面上的资源（如图片）到工件系统，返回工件ID数组。支持一次性保存多个资源。保存后可以在工件管理器中查看和管理。适用于需要持久化保存页面资源的场景。注意：每个保存的资源都需要有意义的名称用于在工件管理器中识别。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            resourceUrls: { 
              type: "array", 
              description: "资源的 URL 数组，每个元素可以是完整 URL 或 data URL。通常从 chrome_get_resources 的结果中获取",
              items: { type: "string" }
            },
            resourceNames: {
              type: "array",
              description: "每个资源对应的名称数组，用于在工件管理器中显示。数组长度必须与 resourceUrls 相同。如果只保存一个资源，可以只提供一个名称。名称应该有意义，便于用户识别资源内容。",
              items: { type: "string" }
            },
            type: { type: "string", description: "资源类型，默认 'image'" }
          },
          required: ["tabId", "resourceUrls", "resourceNames"]
        }
      }
    },

    // ==================== 页面交互 ====================
    {
      type: "function",
      function: {
        name: "chrome_click",
        description: "点击页面元素，模拟人类鼠标点击操作。通过 CSS 选择器定位元素。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "元素 CSS 选择器，如 '#submit-btn'、'.login-button'、'button[type=submit]'" },
            waitForSelector: { type: "boolean", description: "是否等待元素出现后再点击，默认 true" },
            timeoutMs: { type: "number", description: "等待元素出现的超时时间（毫秒），默认 5000" }
          },
          required: ["tabId", "selector"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_click_at",
        description: "在页面指定坐标位置点击，用于无法通过选择器定位的元素或需要精确点击位置的场景。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            x: { type: "number", description: "点击位置的 X 坐标（像素，相对于视口左上角）" },
            y: { type: "number", description: "点击位置的 Y 坐标（像素，相对于视口左上角）" },
            button: { 
              type: "string", 
              enum: ["left", "right", "middle"],
              description: "鼠标按键：left（左键）、right（右键）、middle（中键）。默认 left" 
            },
            clickCount: { type: "number", description: "点击次数，默认 1（双击设为 2）" }
          },
          required: ["tabId", "x", "y"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_type",
        description: "在元素中输入文本（追加模式），模拟人类键盘输入。不会清空原有内容。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "输入框元素 CSS 选择器" },
            text: { type: "string", description: "要输入的文本" },
            delay: { type: "number", description: "按键间隔（毫秒），模拟人类输入速度，默认 0" }
          },
          required: ["tabId", "selector", "text"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_fill",
        description: "清空输入框并填入新文本，相当于先清空再输入。适用于需要替换原有内容的场景。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "输入框元素 CSS 选择器" },
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
        description: "在页面上下文中执行 JavaScript 代码，可访问页面 DOM 和 JavaScript 环境。用于复杂的页面操作或数据提取。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            script: { type: "string", description: "要执行的 JavaScript 代码，可使用 return 返回结果" }
          },
          required: ["tabId", "script"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "chrome_wait_for",
        description: "等待元素出现或满足条件，用于处理动态加载的页面内容。",
        parameters: {
          type: "object",
          properties: {
            tabId: { type: "string", description: "标签页 ID" },
            selector: { type: "string", description: "等待的元素 CSS 选择器" },
            state: {
              type: "string",
              enum: ["attached", "detached", "visible", "hidden"],
              description: "等待的状态：attached（元素存在于 DOM）、detached（元素从 DOM 移除）、visible（元素可见）、hidden（元素隐藏）。默认 visible"
            },
            timeoutMs: { type: "number", description: "超时时间（毫秒），默认 30000" }
          },
          required: ["tabId", "selector"]
        }
      }
    }
  ];
}
