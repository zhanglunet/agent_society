/**
 * Automation 工具定义
 * 
 * 职责：
 * - 定义所有自动化工具的接口规范
 * - 提供工具描述和参数定义
 * - 为大模型提供工具使用指导
 */

/**
 * 获取工具定义列表
 * @returns {Array} 工具定义数组
 */
export function getToolDefinitions() {
  return [
    // ========== 鼠标控制 ==========
    {
      type: "function",
      function: {
        name: "automation_mouse_move",
        description: "移动鼠标到指定屏幕坐标位置。坐标系原点在屏幕左上角，x向右增加，y向下增加。",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "目标X坐标（像素）"
            },
            y: {
              type: "number",
              description: "目标Y坐标（像素）"
            }
          },
          required: ["x", "y"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_mouse_click",
        description: "在指定位置点击鼠标。如果不指定坐标，则在当前位置点击。",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "点击位置的X坐标（可选，默认当前位置）"
            },
            y: {
              type: "number",
              description: "点击位置的Y坐标（可选，默认当前位置）"
            },
            button: {
              type: "string",
              enum: ["left", "right", "middle"],
              description: "鼠标按钮，默认为 left",
              default: "left"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_mouse_double_click",
        description: "在指定位置双击鼠标左键。",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "双击位置的X坐标（可选）"
            },
            y: {
              type: "number",
              description: "双击位置的Y坐标（可选）"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_mouse_drag",
        description: "从起始位置拖拽鼠标到目标位置。",
        parameters: {
          type: "object",
          properties: {
            fromX: {
              type: "number",
              description: "起始X坐标"
            },
            fromY: {
              type: "number",
              description: "起始Y坐标"
            },
            toX: {
              type: "number",
              description: "目标X坐标"
            },
            toY: {
              type: "number",
              description: "目标Y坐标"
            }
          },
          required: ["fromX", "fromY", "toX", "toY"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_mouse_scroll",
        description: "滚动鼠标滚轮。",
        parameters: {
          type: "object",
          properties: {
            delta: {
              type: "number",
              description: "滚动量，正数向上滚动，负数向下滚动"
            }
          },
          required: ["delta"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_mouse_get_position",
        description: "获取鼠标当前位置。返回 {x, y} 坐标。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },

    // ========== 键盘控制 ==========
    {
      type: "function",
      function: {
        name: "automation_key_press",
        description: "按下并释放一个按键。支持所有标准按键名称。常用键：enter, escape, tab, space, backspace, delete, up, down, left, right, f1-f12, a-z, 0-9",
        parameters: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "按键名称"
            }
          },
          required: ["key"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_key_combination",
        description: "按下组合键（如 Ctrl+C）。按键按数组顺序按下，倒序释放。",
        parameters: {
          type: "object",
          properties: {
            keys: {
              type: "array",
              items: { type: "string" },
              description: "按键名称数组，如 [\"ctrl\", \"c\"]"
            }
          },
          required: ["keys"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_type_text",
        description: "输入文本字符串。支持普通文本和部分特殊字符。",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "要输入的文本"
            }
          },
          required: ["text"]
        }
      }
    },

    // ========== 屏幕操作 ==========
    {
      type: "function",
      function: {
        name: "automation_screen_get_size",
        description: "获取屏幕尺寸。返回 {width, height}。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_screen_get_info",
        description: "获取屏幕综合信息，包括尺寸、鼠标位置等。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },

    // ========== 无障碍接口 ==========
    {
      type: "function",
      function: {
        name: "automation_find_control",
        description: "根据条件查找屏幕上的控件。支持按控件类型、名称、ID等查找。",
        parameters: {
          type: "object",
          properties: {
            controlType: {
              type: "string",
              enum: ["button", "edit", "window", "pane", "document", "list", "listItem", "tree", "treeItem", "tab", "tabItem", "menu", "menuItem", "toolBar", "statusBar", "comboBox", "checkBox", "radioButton", "text"],
              description: "控件类型"
            },
            name: {
              type: "string",
              description: "控件名称（支持通配符 *）"
            },
            automationId: {
              type: "string",
              description: "控件自动化ID"
            },
            className: {
              type: "string",
              description: "控件类名"
            },
            processName: {
              type: "string",
              description: "所属进程名"
            },
            timeout: {
              type: "number",
              description: "查找超时时间（毫秒），默认5000",
              default: 5000
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_get_control_tree",
        description: "获取屏幕上的控件树。可以指定最大深度限制返回数据量。",
        parameters: {
          type: "object",
          properties: {
            maxDepth: {
              type: "number",
              description: "遍历最大深度，默认3",
              default: 3
            },
            processName: {
              type: "string",
              description: "筛选指定进程的控件（可选）"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_control_get_children",
        description: "获取指定控件的子控件列表。",
        parameters: {
          type: "object",
          properties: {
            automationId: {
              type: "string",
              description: "父控件自动化ID"
            },
            name: {
              type: "string",
              description: "父控件名称（如未提供ID则使用名称）"
            },
            maxDepth: {
              type: "number",
              description: "遍历深度，默认3层",
              default: 3
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_control_click",
        description: "点击指定控件。优先使用控件的 Invoke 模式，如果不支持则点击控件中心点。",
        parameters: {
          type: "object",
          properties: {
            automationId: {
              type: "string",
              description: "控件自动化ID"
            },
            name: {
              type: "string",
              description: "控件名称（如未提供ID则使用名称）"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_control_set_focus",
        description: "将焦点设置到指定控件。",
        parameters: {
          type: "object",
          properties: {
            automationId: {
              type: "string",
              description: "控件自动化ID"
            },
            name: {
              type: "string",
              description: "控件名称（如未提供ID则使用名称）"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_control_send_text",
        description: "向可编辑控件（如文本框）发送文本。优先使用 Value 模式设置值，如果不支持则发送按键。",
        parameters: {
          type: "object",
          properties: {
            automationId: {
              type: "string",
              description: "控件自动化ID"
            },
            name: {
              type: "string",
              description: "控件名称（如未提供ID则使用名称）"
            },
            text: {
              type: "string",
              description: "要发送的文本"
            }
          },
          required: ["text"]
        }
      }
    },

    // ========== 截图 ==========
    {
      type: "function",
      function: {
        name: "automation_screenshot_region",
        description: "截取屏幕上指定区域的图像并保存到工作区。返回符合 files 字段要求的格式，可用于后续附件处理。",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "截图区域左上角的X坐标"
            },
            y: {
              type: "number",
              description: "截图区域左上角的Y坐标"
            },
            width: {
              type: "number",
              description: "截图区域宽度（像素）"
            },
            height: {
              type: "number",
              description: "截图区域高度（像素）"
            },
            destPath: {
              type: "string",
              description: "工作区内的目标相对路径，如 \"screenshots/region.jpg\"（会自动添加 .jpg 扩展名）"
            }
          },
          required: ["x", "y", "width", "height", "destPath"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_screenshot_control",
        description: "截取指定控件的图像并保存到工作区。会先查找控件位置，然后截取控件所在区域。返回符合 files 字段要求的格式。",
        parameters: {
          type: "object",
          properties: {
            automationId: {
              type: "string",
              description: "控件自动化ID（优先使用）"
            },
            name: {
              type: "string",
              description: "控件名称（当未提供 automationId 时使用）"
            },
            destPath: {
              type: "string",
              description: "工作区内的目标相对路径，如 \"screenshots/button.jpg\"（会自动添加 .jpg 扩展名）"
            },
            margin: {
              type: "number",
              description: "截图边距（像素），在控件四周添加额外空间，默认为 0",
              default: 0
            }
          },
          required: ["destPath"]
        }
      }
    },

    // ========== 等待 ==========
    {
      type: "function",
      function: {
        name: "automation_wait_for_control",
        description: "等待指定条件的控件出现。如果在超时时间内找到控件则立即返回。",
        parameters: {
          type: "object",
          properties: {
            controlType: {
              type: "string",
              description: "控件类型"
            },
            name: {
              type: "string",
              description: "控件名称（支持通配符）"
            },
            automationId: {
              type: "string",
              description: "控件自动化ID"
            },
            timeout: {
              type: "number",
              description: "超时时间（毫秒），默认10000",
              default: 10000
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "automation_wait",
        description: "等待指定的固定时长。用于在操作之间添加延迟。",
        parameters: {
          type: "object",
          properties: {
            milliseconds: {
              type: "number",
              description: "等待时长（毫秒）"
            }
          },
          required: ["milliseconds"]
        }
      }
    }
  ];
}

export default getToolDefinitions;
