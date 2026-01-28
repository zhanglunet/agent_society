# wllama 静态对话页（独立目录）

这个目录是一个独立的静态网站工程，用于在浏览器里通过 wllama 加载 GGUF 模型，并提供一个基础的对话界面。

## 目录结构

- `index.html`：页面骨架
- `src/`：源码（UI、状态、wllama 封装）
- `test/`：测试目录（预留结构）

## 安装依赖

在当前目录执行（依赖会安装到本目录的 `node_modules/`）：

```powershell
bun install
```

## 运行

开发预览：

```powershell
bun run dev
```

构建静态产物：

```powershell
bun run build
```

构建后产物位于 `dist/`，可被任何静态文件服务器托管。

## 模型加载方式

页面默认通过 URL 加载本地模型文件（避免依赖 Hugging Face 可用性）：

- 把 `LFM2-700M-Q4_K_M.gguf` 放到本目录 `models/` 下
- 页面里“模型 URL”填写：`models/LFM2-700M-Q4_K_M.gguf`（相对当前页面目录）

URL 规则：

- `models/xxx.gguf`：相对当前页面目录（推荐，适合部署到子路径）
- `/models/xxx.gguf`：相对站点根路径（仅当你的服务器这样暴露模型时使用）

注意：模型文件较大，建议使用支持断点续传与合理缓存策略的静态服务器。

开发模式说明：

- `bun run dev` 启动的是 Vite 开发服务器，默认不会自动暴露任意目录下的大文件
- 本工程已在 Vite 配置里增加了 `/models/*` 到本地 `models/` 的映射，因此开发模式下也可以直接通过 `models/xxx.gguf` 加载模型

## 线程与静态服务器

wllama 的多线程版本需要跨域隔离（`crossOriginIsolated === true`），通常要求静态服务器返回：

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

本工程在 Vite 开发服务器与预览服务器中已配置上述响应头；如果你把 `dist/` 部署到其他静态服务器，需要在服务器侧同样配置这些响应头，否则会退化为单线程，推理速度会明显变慢。

线程策略：

- 如果 `crossOriginIsolated` 为 `true`，加载模型时会自动使用 `threads = min(8, hardwareConcurrency)`。
- 否则使用单线程（`threads = 1`）。

## 性能排查（推理明显变慢时）

- 先看页面状态栏：加载完成后会显示 `单线程/多线程`、`threads`、`batch`。如果是单线程，通常是部署服务器没有正确返回 COOP/COEP 响应头。
- 如果生成速度“越生成越慢”，常见原因是 UI 渲染负载过高（每 token 更新导致频繁重排）。本工程已对流式输出做了节流与增量渲染；如果你在本工程之外做二次开发，建议保持同样的策略。
