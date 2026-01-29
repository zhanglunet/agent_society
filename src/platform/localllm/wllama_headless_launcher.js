import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const DEFAULT_WLLAMA_QUERY =
  "ctx=4096&predict=1024&temp=0.7&top_k=40&top_p=0.9&stream=1&model=../models/LFM2-700M-Q4_K_M.gguf&autoload=1";

let _browserRef = null;
let _pageRef = null;
let _pendingChat = null;
let _onLLMResultExposed = false;
let _sigintRegistered = false;
let _sigtermRegistered = false;
const _LLM_ERROR_PREFIX = "__LLM_ERROR__:";

export function buildWllamaHeadlessUrl(options = {}) {
  const port = options.port ?? 3000;
  const query = options.query ?? DEFAULT_WLLAMA_QUERY;
  return `http://localhost:${port}/web/wllama/dist/index.html?${query}`;
}

export function findChromeExecutablePath(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.existsSyncFn ?? existsSync;

  const fromEnv = env?.CHROME_EXECUTABLE_PATH;
  if (typeof fromEnv === "string" && fromEnv.trim() && exists(fromEnv)) {
    return fromEnv;
  }

  if (platform === "win32") {
    const paths = [
      env?.["PROGRAMFILES(X86)"] && `${env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
      env?.PROGRAMFILES && `${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      env?.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    ].filter(Boolean);
    for (const p of paths) {
      if (exists(p)) return p;
    }
    return null;
  }

  if (platform === "darwin") {
    const macPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return exists(macPath) ? macPath : null;
  }

  const linuxPaths = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  for (const p of linuxPaths) {
    if (exists(p)) return p;
  }
  return null;
}

export async function launchWllamaHeadless(options = {}) {
  const logger = options.logger ?? null;

  if (process.env.AGENT_SOCIETY_WLLAMA_HEADLESS === "0") {
    void logger?.info?.("Wllama headless 启动已禁用", { env: "AGENT_SOCIETY_WLLAMA_HEADLESS=0" });
    return { ok: true, skipped: true };
  }

  if (_browserRef && _pageRef) {
    return { ok: true, alreadyRunning: true, url: options.url ?? buildWllamaHeadlessUrl({ port: options.port, query: options.query }) };
  }

  const url = options.url ?? buildWllamaHeadlessUrl({ port: options.port, query: options.query });
  const chromePath = options.chromeExecutablePath ?? findChromeExecutablePath(options);

  if (!chromePath) {
    void logger?.warn?.("未找到 Chrome 可执行文件，跳过 Wllama headless 启动");
    return { ok: false, error: "chrome_not_found" };
  }

  const headless = options.headless ?? true;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 15000;

  try {
    void logger?.info?.("启动 Wllama headless Chrome", { chromePath, url, headless });

    const browser = await puppeteer.launch({
      headless: headless ? "new" : false,
      executablePath: chromePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ]
    });

    _browserRef = browser;

    const page = await browser.newPage();
    _pageRef = page;
    if (!_onLLMResultExposed) {
      await page.exposeFunction("onLLMResult", (text) => {
        _handleLLMResult(text);
      });
      _onLLMResultExposed = true;
    }
    page.setDefaultNavigationTimeout(navigationTimeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(() => typeof globalThis.llmChat === "function", { timeout: navigationTimeoutMs })
      .catch(() => {});

    void logger?.info?.("Wllama headless 页面已打开", { url, headless });

    _registerShutdownHandlers(logger);

    return { ok: true, url };
  } catch (err) {
    const message = err?.message ?? String(err);
    void logger?.error?.("Wllama headless 启动失败", { error: message, stack: err?.stack, url });
    await _closeBrowserIfAny(logger);
    return { ok: false, error: "launch_failed", message };
  }
}

export async function chat(messages, options = {}) {
  const page = _pageRef;
  if (!page) {
    throw new Error("Wllama headless 尚未启动");
  }
  if (!Array.isArray(messages)) {
    throw new Error("chat(messages) 参数必须是数组");
  }
  if (_pendingChat) {
    throw new Error("chat(messages) 正在执行中");
  }

  const timeoutMs = options.timeoutMs ?? 120000;

  return await new Promise((resolve, reject) => {
    const cleanup = () => {
      if (_pendingChat) _pendingChat = null;
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("chat(messages) 超时"));
    }, timeoutMs);

    _pendingChat = {
      resolve: (text) => {
        clearTimeout(timer);
        cleanup();
        resolve(text);
      },
      reject: (err) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    };

    page
      .evaluate(
        (msgs, errorPrefix) => {
          const fn = globalThis.llmChat;
          if (typeof fn !== "function") {
            return { ok: false, error: "llmChat_not_found" };
          }

          try {
            const ret = fn(msgs);
            if (ret && typeof ret.then === "function") {
              ret
                .then((text) => {
                  globalThis.onLLMResult(String(text ?? ""));
                })
                .catch((e) => {
                  const message = e?.message ?? String(e);
                  globalThis.onLLMResult(`${errorPrefix}${message}`);
                });
            } else {
              globalThis.onLLMResult(String(ret ?? ""));
            }
            return { ok: true };
          } catch (e) {
            const message = e?.message ?? String(e);
            return { ok: false, error: message };
          }
        },
        messages,
        _LLM_ERROR_PREFIX
      )
      .then((startResult) => {
        if (!startResult?.ok) {
          clearTimeout(timer);
          cleanup();
          reject(new Error(`llmChat 调用失败: ${startResult?.error ?? "unknown"}`));
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      });
  });
}

function _handleLLMResult(text) {
  const pending = _pendingChat;
  if (!pending) return;

  const s = typeof text === "string" ? text : String(text ?? "");
  if (s.startsWith(_LLM_ERROR_PREFIX)) {
    const message = s.slice(_LLM_ERROR_PREFIX.length);
    pending.reject(new Error(message || "llmChat 执行失败"));
    return;
  }
  pending.resolve(s);
}

function _registerShutdownHandlers(logger) {
  if (!_sigintRegistered) {
    _sigintRegistered = true;
    process.once("SIGINT", () => {
      void logger?.info?.("收到 SIGINT，关闭 Wllama headless Chrome");
      void _closeBrowserIfAny(logger);
    });
  }

  if (!_sigtermRegistered) {
    _sigtermRegistered = true;
    process.once("SIGTERM", () => {
      void logger?.info?.("收到 SIGTERM，关闭 Wllama headless Chrome");
      void _closeBrowserIfAny(logger);
    });
  }
}

async function _closeBrowserIfAny(logger) {
  const browser = _browserRef;
  _browserRef = null;
  _pageRef = null;
  _pendingChat = null;
  _onLLMResultExposed = false;
  if (!browser) return;

  try {
    await browser.close();
    void logger?.info?.("Wllama headless Chrome 已关闭");
  } catch (err) {
    const message = err?.message ?? String(err);
    void logger?.warn?.("关闭 Wllama headless Chrome 失败", { error: message });
  }
}
