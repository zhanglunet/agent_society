/**
 * SSH工具定义
 * 
 * 职责：
 * - 定义所有SSH工具的接口规范
 * - 提供工具描述和参数定义
 * - 为大模型提供工具使用指导
 */

/**
 * 获取工具定义列表
 * @returns {Array} 工具定义数组
 */
export function getToolDefinitions() {
  return [
    // 连接管理
    {
      type: 'function',
      function: {
        name: 'ssh_list_hosts',
        description: '列出已配置的SSH主机',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_connect',
        description: '建立SSH连接',
        parameters: {
          type: 'object',
          properties: {
            hostName: {
              type: 'string',
              description: '主机名称（配置文件中定义的标识符）'
            }
          },
          required: ['hostName']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_disconnect',
        description: '断开SSH连接',
        parameters: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: '连接ID'
            }
          },
          required: ['connectionId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_list_connections',
        description: '列出所有活动的SSH连接',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    },

    // 交互式会话
    {
      type: 'function',
      function: {
        name: 'ssh_shell_create',
        description: '创建交互式shell会话',
        parameters: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: '连接ID'
            }
          },
          required: ['connectionId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_shell_send',
        description: '在shell会话中发送命令（异步，立即返回）',
        parameters: {
          type: 'object',
          properties: {
            shellId: {
              type: 'string',
              description: '会话ID'
            },
            command: {
              type: 'string',
              description: '要执行的命令'
            }
          },
          required: ['shellId', 'command']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_shell_read',
        description: '读取shell会话输出窗口（从指定偏移位置读取最多5000字符）。如果连续多次读到空字符串，请向前移动偏移位置，看看是否错过了什么重要信息。',
        parameters: {
          type: 'object',
          properties: {
            shellId: {
              type: 'string',
              description: '会话ID'
            },
            offset: {
              type: 'number',
              description: '文件偏移位置（字节数）'
            }
          },
          required: ['shellId', 'offset']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_shell_close',
        description: '关闭shell会话',
        parameters: {
          type: 'object',
          properties: {
            shellId: {
              type: 'string',
              description: '会话ID'
            }
          },
          required: ['shellId']
        }
      }
    },

    // 文件传输
    {
      type: 'function',
      function: {
        name: 'ssh_upload',
        description: '上传文件到远程服务器（异步，立即返回任务ID）传输过程不要停止连接或会话，否则文件不完整',
        parameters: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: '连接ID'
            },
            path: {
              type: 'string',
              description: '工作区文件路径'
            },
            remotePath: {
              type: 'string',
              description: '远程文件路径'
            }
          },
          required: ['connectionId', 'path', 'remotePath']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_download',
        description: '从远程服务器下载文件（异步，立即返回任务ID）传输过程不要停止连接或会话，否则文件不完整',
        parameters: {
          type: 'object',
          properties: {
            connectionId: {
              type: 'string',
              description: '连接ID'
            },
            remotePath: {
              type: 'string',
              description: '远程文件路径'
            },
            path: {
              type: 'string',
              description: '下载到工作区的路径'
            }
          },
          required: ['connectionId', 'remotePath', 'path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_transfer_status',
        description: '查询文件传输任务状态',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: '任务ID'
            }
          },
          required: ['taskId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'ssh_transfer_cancel',
        description: '取消文件传输任务',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: '任务ID'
            }
          },
          required: ['taskId']
        }
      }
    }
  ];
}
