/**
 * 自动化模块测试
 * 
 * 测试内容：
 * 1. 查找可用窗口（尝试多个常用程序）
 * 2. 获取窗口控制树
 * 3. 获取窗口子控件
 * 4. 截图窗口
 */

import { AccessibilityService } from "../../modules/automation/accessibility.js";
import { InputController } from "../../modules/automation/input_controller.js";
import { WorkspaceManager } from "../../src/platform/services/workspace/workspace_manager.js";
import path from "node:path";

// 模拟日志对象
const mockLog = {
  info: (...args) => console.log("[INFO]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
  debug: () => {}
};

// 模拟运行时
const mockRuntime = {
  log: mockLog,
  workspaceManager: null,
  _agentMetaById: new Map()
};

// 尝试查找的进程列表
const PROCESS_LIST = [
  { name: "WeChat.exe", display: "微信" },
  { name: "chrome.exe", display: "Chrome浏览器" },
  { name: "msedge.exe", display: "Edge浏览器" },
  { name: "notepad.exe", display: "记事本" },
  { name: "explorer.exe", display: "资源管理器" },
  { name: "Code.exe", display: "VS Code" },
  { name: "powershell.exe", display: "PowerShell" },
  { name: "cmd.exe", display: "命令提示符" }
];

async function testAutomation() {
  console.log("=".repeat(60));
  console.log("自动化模块测试开始");
  console.log("=".repeat(60));

  try {
    // 1. 初始化工作区管理器
    console.log("\n[1] 初始化工作区管理器...");
    const workspaceManager = new WorkspaceManager({
      workspacesDir: path.join(process.cwd(), "agent-society-data-3001", "workspaces"),
      logger: mockLog
    });
    mockRuntime.workspaceManager = workspaceManager;
    console.log("✓ 工作区管理器初始化完成");

    // 2. 初始化无障碍服务
    console.log("\n[2] 初始化无障碍服务...");
    const accessibilityService = new AccessibilityService({
      runtime: mockRuntime,
      log: mockLog
    });
    console.log("✓ 无障碍服务初始化完成");

    // 3. 初始化输入控制器
    console.log("\n[3] 初始化输入控制器...");
    const inputController = new InputController({
      runtime: mockRuntime,
      log: mockLog
    });
    console.log("✓ 输入控制器初始化完成");

    // 4. 查找可用窗口
    console.log("\n[4] 查找可用窗口...");
    let targetWindow = null;
    let targetProcess = null;

    // 先用 name 查找微信（processName 方式较慢且有兼容性问题）
    const NAME_LIST = [
      { name: "微信", display: "微信" },
      { name: "Google Chrome", display: "Chrome浏览器" },
      { name: "Microsoft Edge", display: "Edge浏览器" },
      { name: "记事本", display: "记事本" },
      { name: "文件资源管理器", display: "资源管理器" },
      { name: "Visual Studio Code", display: "VS Code" }
    ];

    for (const item of NAME_LIST) {
      console.log(`  尝试查找 ${item.display} (name: ${item.name})...`);
      const result = await accessibilityService.findControl({
        name: item.name,
        timeout: 3000
      });
      
      if (result.ok && result.found) {
        console.log(`  ✓ 找到 ${item.display}!`);
        targetWindow = result.control;
        targetProcess = item;
        break;
      }
    }

    if (!targetWindow) {
      console.log("✗ 未找到任何可用窗口，请至少打开一个应用程序");
      return;
    }

    console.log("\n✓ 目标窗口信息:");
    console.log("  - 应用程序:", targetProcess.display);
    console.log("  - 进程名:", targetProcess.name);
    console.log("  - 窗口名称:", targetWindow.name);
    console.log("  - 控件类型:", targetWindow.controlType);
    console.log("  - 类名:", targetWindow.className);
    console.log("  - 边界:", JSON.stringify(targetWindow.bounds));

    const bounds = targetWindow.bounds;

    // 5. 获取控制树
    console.log("\n[5] 获取控制树 (maxDepth=2)...");
    const treeResult = await accessibilityService.getControlTree({
      processName: targetProcess.name,
      maxDepth: 2
    });

    if (treeResult.ok) {
      console.log("✓ 获取控制树成功");
      console.log("  - 根节点:", treeResult.tree?.controlType, "-", treeResult.tree?.name);
      console.log("  - 子节点数:", treeResult.tree?.children?.length || 0);
      
      if (treeResult.tree?.children?.length > 0) {
        console.log("  - 前5个子控件:");
        treeResult.tree.children.slice(0, 5).forEach((child, i) => {
          console.log(`    ${i + 1}. ${child.controlType}: ${child.name || '(无名称)'}`);
          console.log(`       className: ${child.className || '(无)'}, bounds: ${JSON.stringify(child.bounds)}`);
        });
      }
    } else {
      console.log("✗ 获取控制树失败:", treeResult.error);
    }

    // 6. 获取子控件
    console.log("\n[6] 获取子控件 (getChildren, maxDepth=1)...");
    const childrenResult = await accessibilityService.getChildren(
      { name: targetWindow.name },
      { maxDepth: 1 }
    );

    if (childrenResult.ok) {
      console.log("✓ 获取子控件成功");
      console.log("  - 子控件数量:", childrenResult.children?.length || 0);
      
      if (childrenResult.children?.length > 0) {
        console.log("  - 前5个子控件详情:");
        childrenResult.children.slice(0, 5).forEach((child, i) => {
          console.log(`    ${i + 1}. ${child.controlType}: ${child.name || '(无名称)'}`);
          console.log(`       className: ${child.className || '(无)'}`);
          console.log(`       bounds: x=${child.bounds.x}, y=${child.bounds.y}, w=${child.bounds.width}, h=${child.bounds.height}`);
        });
      }
    } else {
      console.log("✗ 获取子控件失败:", childrenResult.error);
    }

    // 7. 创建测试工作区
    console.log("\n[7] 创建测试工作区...");
    const testWorkspaceId = `test-auto-${Date.now()}`;
    const workspace = await workspaceManager.createWorkspace(testWorkspaceId, {});
    console.log("✓ 测试工作区创建完成:", testWorkspaceId);

    // 添加 agent 信息到 runtime
    mockRuntime._agentMetaById.set("test-agent", {
      id: "test-agent",
      workspaceId: testWorkspaceId,
      parentAgentId: "root"
    });

    // 8. 截图窗口
    console.log("\n[8] 截图窗口...");
    const mockCtx = {
      agent: { id: "test-agent", workspaceId: testWorkspaceId, parentAgentId: "root" },
      currentMessage: { id: `test-msg-${Date.now()}` }
    };
    
    // 限制截图大小，避免太大
    const captureWidth = Math.min(bounds.width, 1920);
    const captureHeight = Math.min(bounds.height, 1080);
    
    const screenshotResult = await inputController.screenshotRegion(
      mockCtx,
      bounds.x,
      bounds.y,
      captureWidth,
      captureHeight,
      "window_screenshot.jpg"
    );

    if (screenshotResult.ok) {
      console.log("✓ 截图成功");
      console.log("  - 文件路径:", screenshotResult.files?.[0]?.path);
      console.log("  - 文件大小:", screenshotResult.files?.[0]?.size, "bytes");
      console.log("  - MIME类型:", screenshotResult.files?.[0]?.mimeType);
    } else {
      console.log("✗ 截图失败:", screenshotResult.error);
    }

    // 9. 测试设置焦点
    console.log("\n[9] 测试设置焦点...");
    const focusResult = await accessibilityService.setFocus({
      name: targetWindow.name
    });

    if (focusResult.ok) {
      console.log("✓ 设置焦点成功");
    } else {
      console.log("✗ 设置焦点失败:", focusResult.error);
    }

    // 10. 测试控件截图
    console.log("\n[10] 测试截图控件 (screenshotControl)...");
    const controlScreenshotResult = await accessibilityService.screenshotControl(
      mockCtx,
      { name: targetWindow.name },
      "control_screenshot.jpg",
      { margin: 10 }
    );

    if (controlScreenshotResult.ok) {
      console.log("✓ 控件截图成功");
      console.log("  - 文件路径:", controlScreenshotResult.files?.[0]?.path);
      console.log("  - 文件大小:", controlScreenshotResult.files?.[0]?.size, "bytes");
    } else {
      console.log("✗ 控件截图失败:", controlScreenshotResult.error);
    }

    // 11. 测试鼠标移动（移动到窗口中心）
    console.log("\n[11] 测试鼠标移动...");
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    // 这里我们只是打印信息，不实际移动鼠标
    console.log(`  将鼠标移动到窗口中心: (${Math.round(centerX)}, ${Math.round(centerY)})`);
    console.log("  (跳过实际移动，避免干扰用户)");

    console.log("\n" + "=".repeat(60));
    console.log("测试完成");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\n✗ 测试过程发生错误:");
    console.error("  ", error.message);
    console.error("  ", error.stack);
  }
}

// 运行测试
testAutomation();
