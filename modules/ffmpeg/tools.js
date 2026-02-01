export function getToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "ffmpeg_run",
        description:
          "执行 ffmpeg 命令（异步）。参数 command 是完整的 ffmpeg 参数字符串（不含程序名 ffmpeg 本身）。命令中的文件路径应为相对于工作区的相对路径。ffmpeg 将在工作区根目录下执行。注意：在 ffmpeg_task_status 显示 completed 之前，输出文件可能不完整，不应当作为最终结果使用。",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description:
                "完整的 ffmpeg 参数字符串。例如：'-i input.mp4 -c:v libx264 -preset fast output.mp4'。命令中的路径必须是相对于工作区的相对路径。"
            }
          },
          required: ["command"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "ffmpeg_task_status",
        description: "查询 ffmpeg 异步任务状态与进度。completed 时输出文件才可视为完整结果；failed 时会返回 failure（包含错误码与 stderrTail）以及日志路径。",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "任务ID（由 ffmpeg_run 返回）" }
          },
          required: ["taskId"]
        }
      }
    }
  ];
}
