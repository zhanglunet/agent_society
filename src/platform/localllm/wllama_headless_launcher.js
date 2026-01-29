import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const DEFAULT_WLLAMA_QUERY =
  "ctx=4096&predict=1024&temp=0.7&top_k=40&top_p=0.9&stream=1&model=../models/LFM2-700M-Q4_K_M.gguf&autoload=1";

let _browserRef = null;
let _sigintRegistered = false;
let _sigtermRegistered = false;

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

  const url = options.url ?? buildWllamaHeadlessUrl({ port: options.port, query: options.query });
  const chromePath = options.chromeExecutablePath ?? findChromeExecutablePath(options);

  if (!chromePath) {
    void logger?.warn?.("未找到 Chrome 可执行文件，跳过 Wllama headless 启动");
    return { ok: false, error: "chrome_not_found" };
  }

  const headless = options.headless ?? false;
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
    page.setDefaultNavigationTimeout(navigationTimeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded" });

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
  if (!browser) return;

  try {
    await browser.close();
    void logger?.info?.("Wllama headless Chrome 已关闭");
  } catch (err) {
    const message = err?.message ?? String(err);
    void logger?.warn?.("关闭 Wllama headless Chrome 失败", { error: message });
  }
}
