/**
 * 自动化模块诊断测试
 * 
 * 诊断内容：
 * 1. 获取桌面所有顶级窗口
 * 2. 列出可用进程
 * 3. 测试基本UIAutomation功能
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// PowerShell 绝对路径
const PS_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

async function diagnose() {
  console.log("=".repeat(60));
  console.log("自动化模块诊断测试");
  console.log("=".repeat(60));

  // 1. 检查 PowerShell 可用性
  console.log("\n[1] 检查 PowerShell...");
  try {
    const { stdout } = await execAsync(`"${PS_PATH}" -Command "$PSVersionTable.PSVersion"`, { timeout: 10000 });
    console.log("✓ PowerShell 可用:");
    console.log("  ", stdout.trim());
  } catch (error) {
    console.log("✗ PowerShell 检查失败:", error.message);
  }

  // 2. 检查 UIAutomation 程序集
  console.log("\n[2] 检查 UIAutomation 程序集...");
  const psScript = `
Add-Type -AssemblyName UIAutomationClient
$assembly = [System.Reflection.Assembly]::GetAssembly([System.Windows.Automation.AutomationElement])
Write-Host "UIAutomation 程序集已加载"
Write-Host "位置: $($assembly.Location)"
Write-Host "版本: $($assembly.GetName().Version)"

# 获取桌面元素
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
Write-Host "桌面元素名称: $($desktop.Current.Name)"
Write-Host "桌面元素类型: $($desktop.Current.ControlType.ProgrammaticName)"

# 获取所有顶级窗口
$condition = [System.Windows.Automation.Condition]::TrueCondition
$windows = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
Write-Host "顶级窗口数量: $($windows.Count)"

# 列出前10个窗口
Write-Host "前10个窗口:"
for ($i = 0; $i -lt [Math]::Min(10, $windows.Count); $i++) {
    $win = $windows[$i]
    $name = $win.Current.Name
    $className = $win.Current.ClassName
    $processId = $win.Current.ProcessId
    Write-Host "  [$i] Name='$name' Class='$className' PID=$processId"
}
`;

  try {
    // 使用 Base64 编码避免特殊字符问题
    const buffer = Buffer.from(psScript, 'utf16le');
    const base64Script = buffer.toString('base64');
    
    const { stdout, stderr } = await execAsync(
      `"${PS_PATH}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`,
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    
    if (stderr) {
      console.log("警告:", stderr);
    }
    
    console.log("✓ UIAutomation 测试成功:");
    console.log(stdout);
  } catch (error) {
    console.log("✗ UIAutomation 测试失败:");
    console.log("  ", error.message);
    if (error.stderr) {
      console.log("  stderr:", error.stderr);
    }
  }

  // 3. 检查 FFmpeg 可用性
  console.log("\n[3] 检查 FFmpeg...");
  try {
    const { stdout } = await execAsync("ffmpeg -version", { timeout: 10000 });
    const firstLine = stdout.split('\n')[0];
    console.log("✓ FFmpeg 可用:");
    console.log("  ", firstLine);
  } catch (error) {
    console.log("✗ FFmpeg 检查失败:", error.message);
  }

  console.log("\n" + "=".repeat(60));
  console.log("诊断完成");
  console.log("=".repeat(60));
}

diagnose();
