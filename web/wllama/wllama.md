本文件夹是一个独立的静态网站工程目录，用于在浏览器中通过 @wllama/wllama 加载 GGUF 模型，并提供对话界面。

包含内容：
- index.html：页面入口
- package.json / tsconfig.json / vite.config.ts：本目录独立的构建与开发配置
- models/：模型文件目录（不参与构建，HTTP 可直接访问）
- src/：站点源码（UI、状态、wllama 调用封装）
- test/：测试目录（预留结构，保持与 src/ 对应的子目录）
- README.md：安装、运行与使用说明

约束：
- 不依赖或修改本仓库其他目录的代码与资源
- 依赖通过本目录的 node_modules 安装与管理
