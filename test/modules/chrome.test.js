/**
 * Chrome 模块测试
 * 测试模块接口验证和基本功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import chromeModule from "../../modules/chrome/index.js";
import { BrowserManager } from "../../modules/chrome/browser_manager.js";
import { TabManager } from "../../modules/chrome/tab_manager.js";
import { PageActions } from "../../modules/chrome/page_actions.js";
import { getToolDefinitions } from "../../modules/chrome/tools.js";

// ==================== Property 1: Module Interface Validation ====================
describe("Property 1: Module Interface Validation", () => {
  it("should export required 'name' field as string", () => {
    expect(chromeModule.name).toBeDefined();
    expect(typeof chromeModule.name).toBe("string");
    expect(chromeModule.name).toBe("chrome");
  });

  it("should export required 'init' function", () => {
    expect(chromeModule.init).toBeDefined();
    expect(typeof chromeModule.init).toBe("function");
  });

  it("should export required 'shutdown' function", () => {
    expect(chromeModule.shutdown).toBeDefined();
    expect(typeof chromeModule.shutdown).toBe("function");
  });

  it("should export required 'getToolDefinitions' function", () => {
    expect(chromeModule.getToolDefinitions).toBeDefined();
    expect(typeof chromeModule.getToolDefinitions).toBe("function");
  });

  it("should export required 'executeToolCall' function", () => {
    expect(chromeModule.executeToolCall).toBeDefined();
    expect(typeof chromeModule.executeToolCall).toBe("function");
  });

  it("should export optional 'getWebComponent' function", () => {
    expect(chromeModule.getWebComponent).toBeDefined();
    expect(typeof chromeModule.getWebComponent).toBe("function");
  });

  it("should export optional 'getHttpHandler' function", () => {
    expect(chromeModule.getHttpHandler).toBeDefined();
    expect(typeof chromeModule.getHttpHandler).toBe("function");
  });
});

// ==================== Tool Definitions Tests ====================
describe("Tool Definitions", () => {
  it("should return array of tool definitions", () => {
    const tools = getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("should have all 15 Chrome tools defined", () => {
    const tools = getToolDefinitions();
    const toolNames = tools.map(t => t.function.name);
    
    const expectedTools = [
      "chrome_launch",
      "chrome_close",
      "chrome_new_tab",
      "chrome_close_tab",
      "chrome_list_tabs",
      "chrome_navigate",
      "chrome_get_url",
      "chrome_screenshot",
      "chrome_get_content",
      "chrome_get_text",
      "chrome_click",
      "chrome_type",
      "chrome_fill",
      "chrome_evaluate",
      "chrome_wait_for"
    ];

    for (const expected of expectedTools) {
      expect(toolNames).toContain(expected);
    }
  });

  it("should have valid tool definition structure", () => {
    const tools = getToolDefinitions();
    
    for (const tool of tools) {
      expect(tool.type).toBe("function");
      expect(tool.function).toBeDefined();
      expect(tool.function.name).toBeDefined();
      expect(typeof tool.function.name).toBe("string");
      expect(tool.function.description).toBeDefined();
      expect(typeof tool.function.description).toBe("string");
      expect(tool.function.parameters).toBeDefined();
      expect(tool.function.parameters.type).toBe("object");
    }
  });
});

// ==================== BrowserManager Unit Tests ====================
describe("BrowserManager", () => {
  let browserManager;
  const mockLog = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  };

  beforeEach(() => {
    browserManager = new BrowserManager({ log: mockLog });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with empty browser list", () => {
    expect(browserManager.getBrowserCount()).toBe(0);
    expect(browserManager.listBrowsers()).toEqual([]);
  });

  it("should return browser_not_found for invalid browserId", async () => {
    const result = await browserManager.close("invalid-id");
    expect(result.error).toBe("browser_not_found");
    expect(result.browserId).toBe("invalid-id");
  });

  it("should return null for getBrowser with invalid id", () => {
    const browser = browserManager.getBrowser("invalid-id");
    expect(browser).toBeNull();
  });

  it("should return null for getPuppeteerBrowser with invalid id", () => {
    const browser = browserManager.getPuppeteerBrowser("invalid-id");
    expect(browser).toBeNull();
  });
});

// ==================== TabManager Unit Tests ====================
describe("TabManager", () => {
  let tabManager;
  let mockBrowserManager;
  const mockLog = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  };

  beforeEach(() => {
    mockBrowserManager = {
      getPuppeteerBrowser: vi.fn().mockReturnValue(null),
      getBrowser: vi.fn().mockReturnValue(null)
    };
    tabManager = new TabManager({ log: mockLog, browserManager: mockBrowserManager });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with empty tab list", () => {
    expect(tabManager.getTabCount()).toBe(0);
  });

  it("should return browser_not_found when creating tab for invalid browser", async () => {
    const result = await tabManager.newTab("invalid-browser-id");
    expect(result.error).toBe("browser_not_found");
    expect(result.browserId).toBe("invalid-browser-id");
  });

  it("should set viewport to 1024x768 before navigating when creating tab", async () => {
    const callSequence = [];
    const mockPage = {
      setViewport: vi.fn(async () => {
        callSequence.push("setViewport");
      }),
      goto: vi.fn(async () => {
        callSequence.push("goto");
      }),
      url: vi.fn().mockReturnValue("about:blank"),
      on: vi.fn(),
      authenticate: vi.fn()
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage)
    };
    mockBrowserManager.getPuppeteerBrowser.mockReturnValue(mockBrowser);
    mockBrowserManager.getBrowser.mockReturnValue({ proxy: null });

    const result = await tabManager.newTab("browser-id-1", "https://example.com");

    expect(result.ok).toBe(true);
    expect(mockPage.setViewport).toHaveBeenCalledTimes(1);
    expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1024, height: 768 });
    expect(mockPage.goto).toHaveBeenCalledTimes(1);
    expect(callSequence[0]).toBe("setViewport");
    expect(callSequence[1]).toBe("goto");
  });

  it("should return tab_not_found for invalid tabId", async () => {
    const result = await tabManager.closeTab("invalid-tab-id");
    expect(result.error).toBe("tab_not_found");
    expect(result.tabId).toBe("invalid-tab-id");
  });

  it("should return browser_not_found when listing tabs for invalid browser", async () => {
    const result = await tabManager.listTabs("invalid-browser-id");
    expect(result.error).toBe("browser_not_found");
  });

  it("should return null for getTab with invalid id", () => {
    const tab = tabManager.getTab("invalid-id");
    expect(tab).toBeNull();
  });

  it("should return null for getPage with invalid id", () => {
    const page = tabManager.getPage("invalid-id");
    expect(page).toBeNull();
  });
});

// ==================== PageActions Unit Tests ====================
describe("PageActions", () => {
  let pageActions;
  let mockTabManager;
  const mockLog = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  };

  beforeEach(() => {
    mockTabManager = {
      getPage: vi.fn().mockReturnValue(null)
    };
    pageActions = new PageActions({ log: mockLog, tabManager: mockTabManager });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return tab_not_found for navigate with invalid tabId", async () => {
    const result = await pageActions.navigate("invalid-tab-id", "https://example.com");
    expect(result.error).toBe("tab_not_found");
    expect(result.tabId).toBe("invalid-tab-id");
  });

  it("should return tab_not_found for getUrl with invalid tabId", async () => {
    const result = await pageActions.getUrl("invalid-tab-id");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for screenshot with invalid tabId", async () => {
    const result = await pageActions.screenshot("invalid-tab-id");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for getContent with invalid tabId", async () => {
    const result = await pageActions.getContent("invalid-tab-id");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for getText with invalid tabId", async () => {
    const result = await pageActions.getText("invalid-tab-id");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for click with invalid tabId", async () => {
    const result = await pageActions.click("invalid-tab-id", "#button");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for type with invalid tabId", async () => {
    const result = await pageActions.type("invalid-tab-id", "#input", "text");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for fill with invalid tabId", async () => {
    const result = await pageActions.fill("invalid-tab-id", "#input", "value");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for evaluate with invalid tabId", async () => {
    const result = await pageActions.evaluate("invalid-tab-id", "return 1");
    expect(result.error).toBe("tab_not_found");
  });

  it("should return tab_not_found for waitFor with invalid tabId", async () => {
    const result = await pageActions.waitFor("invalid-tab-id", "#element");
    expect(result.error).toBe("tab_not_found");
  });
});

// ==================== Module Lifecycle Tests ====================
describe("Module Lifecycle", () => {
  const mockRuntime = {
    log: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn()
    }
  };

  afterEach(async () => {
    await chromeModule.shutdown();
    vi.clearAllMocks();
  });

  it("should initialize without errors", async () => {
    await expect(chromeModule.init(mockRuntime)).resolves.not.toThrow();
  });

  it("should return tool definitions after init", async () => {
    await chromeModule.init(mockRuntime);
    const tools = chromeModule.getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(15);
  });

  it("should return web component definition", async () => {
    await chromeModule.init(mockRuntime);
    const component = chromeModule.getWebComponent();
    expect(component).toBeDefined();
    expect(component.moduleName).toBe("chrome");
    expect(component.displayName).toBeDefined();
    expect(component.icon).toBeDefined();
  });

  it("should return http handler function", async () => {
    await chromeModule.init(mockRuntime);
    const handler = chromeModule.getHttpHandler();
    expect(typeof handler).toBe("function");
  });

  it("should shutdown without errors", async () => {
    await chromeModule.init(mockRuntime);
    await expect(chromeModule.shutdown()).resolves.not.toThrow();
  });
});

// ==================== Property 12: Error Structure Consistency ====================
describe("Property 12: Error Structure Consistency", () => {
  let pageActions;
  let mockTabManager;
  const mockLog = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };

  beforeEach(() => {
    mockTabManager = { getPage: vi.fn().mockReturnValue(null) };
    pageActions = new PageActions({ log: mockLog, tabManager: mockTabManager });
  });

  it("should return error object with 'error' field for tab_not_found", async () => {
    const result = await pageActions.navigate("invalid", "https://example.com");
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });

  it("should include relevant context in error response", async () => {
    const result = await pageActions.navigate("invalid-tab", "https://example.com");
    expect(result.error).toBe("tab_not_found");
    expect(result.tabId).toBe("invalid-tab");
  });
});

// ==================== executeToolCall Routing Tests ====================
describe("executeToolCall Routing", () => {
  const mockRuntime = {
    log: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }
  };

  beforeEach(async () => {
    await chromeModule.init(mockRuntime);
  });

  afterEach(async () => {
    await chromeModule.shutdown();
  });

  it("should return error for unknown tool", async () => {
    const result = await chromeModule.executeToolCall({}, "unknown_tool", {});
    expect(result.error).toBe("unknown_tool");
  });

  it("should route chrome_close to browserManager", async () => {
    const result = await chromeModule.executeToolCall({}, "chrome_close", { browserId: "invalid" });
    expect(result.error).toBe("browser_not_found");
  });

  it("should route chrome_new_tab to tabManager", async () => {
    const result = await chromeModule.executeToolCall({}, "chrome_new_tab", { browserId: "invalid" });
    expect(result.error).toBe("browser_not_found");
  });

  it("should route chrome_close_tab to tabManager", async () => {
    const result = await chromeModule.executeToolCall({}, "chrome_close_tab", { tabId: "invalid" });
    expect(result.error).toBe("tab_not_found");
  });

  it("should route chrome_navigate to pageActions", async () => {
    const result = await chromeModule.executeToolCall({}, "chrome_navigate", { tabId: "invalid", url: "https://example.com" });
    expect(result.error).toBe("tab_not_found");
  });

  it("should route chrome_screenshot to pageActions", async () => {
    const result = await chromeModule.executeToolCall({}, "chrome_screenshot", { tabId: "invalid" });
    expect(result.error).toBe("tab_not_found");
  });
});
