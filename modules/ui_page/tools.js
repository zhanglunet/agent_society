export function getToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "ui_page_eval_js",
        description: "在本软件 Web UI 页面上下文执行 JavaScript，可直接访问 window/document，并返回可序列化结果。执行产生的页面改动仅存在于页面内存态，刷新会丢失。注意，这是用户正在与智能体交互的界面，修改要慎重，一定要慎重，不要随便删除内容，不要轻易覆盖内容。制作用户友好的界面，不要遮挡用户操作。最好将你要绘制的内容放在可移动的小窗口里。对于短期的功能必须提供退出功能。这个运行的代码，如果用户需要重复执行，可以原样保存成文件，用户可以手动执行。必须原样保存，不需要做任何修改，用户才能执行得到同样的结果。",
        parameters: {
          type: "object",
          properties: {
            script: { type: "string", description: "要执行的 JavaScript 代码，可使用 return 返回结果；可直接访问 window/document" },
            timeoutMs: { type: "number", description: "等待前端回传结果的超时时间（毫秒），默认 100000", default: 100000 }
          },
          required: ["script"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "ui_page_get_content",
        description: "获取本软件 Web UI 页面内容（HTML/文本/结构化摘要）。返回内容会按 maxChars 截断，避免上下文过大。",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "可选：限定范围的 CSS 选择器，不传则以整个 document 为范围" },
            format: { type: "string", enum: ["html", "text", "summary"], description: "返回格式：html/text/summary（结构化摘要）", default: "summary" },
            maxChars: { type: "number", description: "返回内容的最大字符数，默认 20000", default: 20000 },
            timeoutMs: { type: "number", description: "等待前端回传结果的超时时间（毫秒），默认 10000", default: 10000 }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "ui_page_dom_patch",
        description: "对本软件 Web UI 页面执行结构化 DOM/CSS 临时修改（补丁式）。修改只存在于页面内存态，刷新会丢失。",
        parameters: {
          type: "object",
          properties: {
            operations: {
              type: "array",
              description: "补丁操作列表，按顺序执行。每项：{op, selector?, value?, name?, position?}。op 支持：setText/setHtml/setAttr/remove/insertAdjacentHtml/addClass/removeClass/injectCss",
              items: {
                type: "object",
                properties: {
                  op: { type: "string" },
                  selector: { type: "string" },
                  name: { type: "string" },
                  value: { type: "string" },
                  position: { type: "string", enum: ["beforebegin", "afterbegin", "beforeend", "afterend"] }
                },
                required: ["op"]
              }
            },
            timeoutMs: { type: "number", description: "等待前端回传结果的超时时间（毫秒），默认 10000", default: 10000 }
          },
          required: ["operations"]
        }
      }
    }
  ];
}

