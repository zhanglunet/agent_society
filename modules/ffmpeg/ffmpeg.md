# FFmpeg 模块

## 模块概述
FFmpeg 模块为系统提供音视频处理命令执行能力。工具以异步任务方式运行，调用方通过 taskId 查询进度与结果。

## 核心功能
- 执行 FFmpeg 命令（异步）：返回 taskId
- 查询任务状态：返回运行状态、进度片段、日志工件ID
- 管理界面：创建任务与查看任务列表

## 异步约束
- 在 ffmpeg_task_status 显示 completed 之前，输出文件可能是不完整的，不应当作为最终结果使用。

## 工具列表
- ffmpeg_run
- ffmpeg_task_status

## ffmpeg_run 调用参数与规则
- 参数：`command`（字符串）
- command：不包含程序名的完整参数字符串。命令中的文件路径应为相对于工作区的相对路径。
- FFmpeg 将在工作区根目录下执行，因此相对路径将正确指向工作区内的文件。
- 注意：系统不再自动解析路径或猜测输出路径。调用方应确保命令中的路径正确。

## 目录结构
```
modules/ffmpeg/
├── index.js
├── tools.js
├── ffmpeg_manager.js
├── ffmpeg.md
└── web/
    ├── panel.html
    ├── panel.js
    └── panel.css
```
