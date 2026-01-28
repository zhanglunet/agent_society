models 文件夹用于存放 GGUF 模型文件（体积较大，不参与构建流程）。

约束：
- 不要把模型放到 src/ 或 dist/ 等构建产物目录
- 静态服务器需要能直接访问本目录下的文件，建议通过相对当前页面目录访问，例如 `models/xxx.gguf`

放置示例：
- 将 `LFM2-700M-Q4_K_M.gguf` 放到 `models/` 下
- 页面里将“模型 URL”填写为：`models/LFM2-700M-Q4_K_M.gguf`
