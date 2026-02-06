/**
 * LocalFile 工具定义
 * 
 * 职责：
 * - 定义所有本地文件工具的接口规范
 * - 提供工具描述和参数定义
 * - 为大模型提供工具使用指导
 */

/**
 * 获取工具定义列表
 * @returns {Array} 工具定义数组
 */
export function getToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "localfile_read",
        description: "读取本地文件系统中被授权的文件内容。只能读取已授权文件夹内的文件。返回文件内容和元数据。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "文件的绝对路径（如 /home/user/documents/file.txt）"
            },
            encoding: {
              type: "string",
              description: "文件编码，默认为 utf8",
              default: "utf8"
            }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "localfile_write",
        description: "向本地文件系统写入文件。只能写入已授权且有写入权限的文件夹。如果文件不存在会自动创建，目录不存在会自动创建。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "文件的绝对路径（如 /home/user/documents/file.txt）"
            },
            content: {
              type: "string",
              description: "要写入的文件内容"
            },
            encoding: {
              type: "string",
              description: "文件编码，默认为 utf8",
              default: "utf8"
            }
          },
          required: ["path", "content"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "localfile_list",
        description: "列出本地文件系统中被授权目录的内容。返回目录中的文件和子目录列表。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "目录的绝对路径（如 /home/user/documents）"
            }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "localfile_copy_to_workspace",
        description: "将本地文件系统中的文件复制到当前工作区。源文件必须在已授权的文件夹内。适用于将外部文件引入当前任务进行处理。",
        parameters: {
          type: "object",
          properties: {
            sourcePath: {
              type: "string",
              description: "源文件的绝对路径（本地文件系统中）"
            },
            destPath: {
              type: "string",
              description: "目标路径（在工作区内的相对路径，如 data/input.txt）"
            }
          },
          required: ["sourcePath", "destPath"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "localfile_copy_from_workspace",
        description: "将工作区中的文件复制到本地文件系统。目标位置必须在已授权且有写入权限的文件夹内。适用于将处理结果保存到外部位置。",
        parameters: {
          type: "object",
          properties: {
            sourcePath: {
              type: "string",
              description: "源文件的相对路径（在工作区内，如 output/result.txt）"
            },
            destPath: {
              type: "string",
              description: "目标文件的绝对路径（本地文件系统中）"
            }
          },
          required: ["sourcePath", "destPath"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "localfile_check_permission",
        description: "检查指定路径的读写权限。返回当前智能体对该路径是否有读取和写入权限。可用于在执行操作前预先检查。",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要检查的绝对路径"
            }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "localfile_list_authorized_folders",
        description: "列出所有已授权的文件夹及其权限。返回用户配置的可访问文件夹列表，包括每个文件夹的读写权限。",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    }
  ];
}

export default getToolDefinitions;
