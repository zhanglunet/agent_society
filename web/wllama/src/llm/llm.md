llm 文件夹封装与大模型推理相关的逻辑，目标是把 @wllama/wllama 的使用细节限制在本目录内。

文件职责：
- wllamaEngine.ts：wllama 初始化、HF 加载模型、chat 生成与卸载的统一封装

