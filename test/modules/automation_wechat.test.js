/**
 * 微信自动化测试
 * 
 * 测试内容：
 * 1. 查找微信窗口
 * 2. 获取微信窗口的控制树
 * 3. 获取微信窗口的子控件
 * 4. 截图微信窗口
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
  workspaceManager: null
};

async function testWechatAutomation() {
  console.log("=".repeat(60));
  console.log("微信自动化测试开始");
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

    // 4. 查找微信窗口
    console.log("\n[4] 查找微信窗口...");
    const findResult = await accessibilityService.findControl({
      processName: "WeChat.exe",
      timeout: 5000
    });

    if (!findResult.ok || !findResult.found) {
      console.log("✗ 未找到微信窗口，请确保微信正在运行");
      console.log("  错误:", findResult.error || "not_found");
      return;
    }

    console.log("✓ 找到微信窗口:");
    console.log("  - 名称:", findResult.control?.name);
    console.log("  - 类型:", findResult.control?.controlType);
    console.log("  - 类名:", findResult.control?.className);
    console.log("  - 边界:", JSON.stringify(findResult.control?.bounds));

    const wechatBounds = findResult.control.bounds;

    // 5. 获取微信窗口的控制树
    console.log("\n[5] 获取微信控制树 (maxDepth=2)...");
    const treeResult = await accessibilityService.getControlTree({
      processName: "WeChat.exe",
      maxDepth: 2
    });

    if (treeResult.ok) {
      console.log("✓ 获取控制树成功");
      console.log("  - 根节点:", treeResult.tree?.controlType, "-", treeResult.tree?.name);
      console.log("  - 子节点数:", treeResult.tree?.children?.length || 0);
      
      // 显示前5个子控件
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

    // 6. 获取微信窗口的子控件 (使用 getChildren)
    console.log("\n[6] 获取微信子控件 (getChildren, maxDepth=1)...");
    const childrenResult = await accessibilityService.getChildren(
      { name: findResult.control.name },
      { maxDepth: 1 }
    );

    if (childrenResult.ok) {
      console.log("✓ 获取子控件成功");
      console.log("  - 子控件数量:", childrenResult.children?.length || 0);
      
      // 显示前5个子控件详细信息
      if (childrenResult.children?.length > 0) {
        console.log("  - 前5个子控件详情:");
        childrenResult.children.slice(0, 5).forEach((child, i) => {
          console.log(`    ${i + 1}. ${child.controlType}: ${child.name || '(无名称)'}`);
          console.log(`       className: ${child.className || '(无)'}, bounds: ${JSON.stringify(child.bounds)}`);
        });
      }
    } else {
      console.log("✗ 获取子控件失败:", childrenResult.error);
    }

    // 7. 创建测试工作区用于截图
    console.log("\n[7] 创建测试工作区...");
    const testWorkspaceId = `test-wechat-${Date.now()}`;
    const workspace = await workspaceManager.createWorkspace(testWorkspaceId, {});
    console.log("✓ 测试工作区创建完成:", testWorkspaceId);

    // 8. 截图微信窗口
    console.log("\n[8] 截图微信窗口...");
    const mockCtx = {
      agent: { id: "test-agent", workspaceId: testWorkspaceId, parentAgentId: "root" },
      currentMessage: { id: `test-msg-${Date.now()}` }
    };
    
    const screenshotResult = await inputController.screenshotRegion(
      mockCtx,
      wechatBounds.x,
      wechatBounds.y,
      wechatBounds.width,
      wechatBounds.height,
      "wechat_screenshot.jpg"
    );

    if (screenshotResult.ok) {
      console.log("✓ 截图成功");
      console.log("  - 文件路径:", screenshotResult.files?.[0]?.path);
      console.log("  - 文件大小:", screenshotResult.files?.[0]?.size, "bytes");
      console.log("  - MIME类型:", screenshotResult.files?.[0]?.mimeType);
    } else {
      console.log("✗ 截图失败:", screenshotResult.error);
    }

    // 9. 测试 setFocus 功能
    console.log("\n[9] 测试设置焦点...");
    const focusResult = await accessibilityService.setFocus({
      name: findResult.control.name
    });

    if (focusResult.ok) {
      console.log("✓ 设置焦点成功");
    } else {
      console.log("✗ 设置焦点失败:", focusResult.error);
    }

    // 10. 测试截图控件功能
    console.log("\n[10] 测试截图控件 (screenshotControl)...");
    const controlScreenshotResult = await accessibilityService.screenshotControl(
      mockCtx,
      { name: findResult.control.name },
      "wechat_control_screenshot.jpg",
      { margin: 10 }
    );

    if (controlScreenshotResult.ok) {
      console.log("✓ 控件截图成功");
      console.log("  - 文件路径:", controlScreenshotResult.files?.[0]?.path);
      console.log("  - 文件大小:", controlScreenshotResult.files?.[0]?.size, "bytes");
    } else {
      console.log("✗ 控件截图失败:", controlScreenshotResult.error);
    }

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
testWechatAutomation();
