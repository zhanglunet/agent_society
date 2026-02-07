/**
 * 无障碍辅助服务 (UIAutomation)
 * 
 * 职责：
 * - UI 元素查找（通过属性条件）
 * - UI 元素操作（点击、设置焦点、输入文本）
 * - UI 树获取
 * - 控件截图
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execAsync = promisify(exec);

/**
 * 无障碍服务类
 */
export class AccessibilityService {
  constructor(options) {
    this.configManager = options.configManager;
    this.runtime = options.runtime;
    this.log = options.log ?? console;
    this._platform = process.platform;
  }

  /**
   * 执行 PowerShell 脚本
   * @private
   */
  async _runPSScript(scriptContent, timeout = 30000) {
    const buffer = Buffer.from(scriptContent, 'utf16le');
    const base64Script = buffer.toString('base64');
    
    const { stdout, stderr } = await execAsync(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`,
      { timeout }
    );
    return { stdout, stderr, success: true };
  }

  /**
   * 查找控件
   */
  async findControl(criteria) {
    try {
      if (this._platform !== 'win32') {
        return { ok: false, error: 'unsupported_platform' };
      }

      const timeout = criteria.timeout || 5000;
      const conditions = [];
      
      if (criteria.controlType) {
        conditions.push(`$_.Current.ControlType.ProgrammaticName -eq "${criteria.controlType}"`);
      }
      if (criteria.name) {
        conditions.push(`$_.Current.Name -like "${criteria.name}"`);
      }
      if (criteria.automationId) {
        conditions.push(`$_.Current.AutomationId -eq "${criteria.automationId}"`);
      }
      if (criteria.className) {
        conditions.push(`$_.Current.ClassName -eq "${criteria.className}"`);
      }
      if (criteria.processName) {
        conditions.push(`$_.Current.ProcessName -eq "${criteria.processName}"`);
      }

      // 如果没有条件，默认匹配所有
      const conditionStr = conditions.length > 0 ? conditions.join(' -and ') : '$true';
      
      const script = `Add-Type -AssemblyName UIAutomationClient
$startTime = Get-Date
$found = $null

while (((Get-Date) - $startTime).TotalMilliseconds -lt ${timeout}) {
    $desktop = [System.Windows.Automation.AutomationElement]::RootElement
    $condition = [System.Windows.Automation.Condition]::TrueCondition
    $elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    
    for ($i = 0; $i -lt $elements.Count; $i++) {
        $_ = $elements[$i]
        if (${conditionStr}) {
            $found = $_
            break
        }
    }
    
    if ($found) { break }
    Start-Sleep -Milliseconds 100
}

if ($found) {
    $rect = $found.Current.BoundingRectangle
    Write-Host "FOUND:$($found.Current.ControlType):$($found.Current.Name):$($found.Current.AutomationId):$([int]$rect.X):$([int]$rect.Y):$([int]$rect.Width):$([int]$rect.Height)"
} else {
    Write-Host "NOT_FOUND"
}`;

      const { stdout } = await this._runPSScript(script, timeout + 5000);
      const output = stdout.trim();
      
      if (output.startsWith('FOUND:')) {
        const parts = output.split(':');
        return {
          ok: true,
          found: true,
          controlType: parts[1],
          name: parts[2],
          automationId: parts[3],
          bounds: {
            x: parseInt(parts[4], 10),
            y: parseInt(parts[5], 10),
            width: parseInt(parts[6], 10),
            height: parseInt(parts[7], 10)
          }
        };
      } else {
        return { ok: true, found: false };
      }
    } catch (error) {
      this.log.error?.('[Automation] 查找控件失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 获取控件树
   */
  async getControlTree(options = {}) {
    try {
      if (this._platform !== 'win32') {
        return { ok: false, error: 'unsupported_platform' };
      }

      const maxDepth = options.maxDepth || 3;
      
      // 使用纯字符串拼接生成 JSON，避免 PowerShell 内置 ConvertTo-Json 的问题
      const tempOutputPath = path.join(tmpdir(), `tree_${Date.now()}.json`);
      
      const script = `
Add-Type -AssemblyName UIAutomationClient

function Escape-JsonString {
    param($str)
    $str = [string]$str
    # 只保留可打印字符（包括中文）
    $str = $str -replace '[^\x20-\x7E\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF\s]', ''
    $str = $str.Replace('\\', '\\\\')
    $str = $str.Replace('"', '\\"')
    return $str
}

function Get-ControlTree {
    param($element, $depth, $maxDepth)
    
    if ($depth -gt $maxDepth) { return $null }
    
    $rect = $element.Current.BoundingRectangle
    $name = Escape-JsonString $element.Current.Name
    $controlType = Escape-JsonString $element.Current.ControlType.ProgrammaticName
    $automationId = Escape-JsonString $element.Current.AutomationId
    $className = Escape-JsonString $element.Current.ClassName
    $x = [int]($rect.X -as [int])
    $y = [int]($rect.Y -as [int])
    $w = [int]($rect.Width -as [int])
    $h = [int]($rect.Height -as [int])
    if ($x -eq $null -or $x -isnot [int]) { $x = 0 }
    if ($y -eq $null -or $y -isnot [int]) { $y = 0 }
    if ($w -eq $null -or $w -isnot [int]) { $w = 0 }
    if ($h -eq $null -or $h -isnot [int]) { $h = 0 }
    
    [System.Collections.ArrayList]$childJsons = @()
    if ($depth -lt $maxDepth) {
        $condition = [System.Windows.Automation.Condition]::TrueCondition
        $childElements = $element.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
        for ($i = 0; $i -lt $childElements.Count; $i++) {
            $childTree = Get-ControlTree -element $childElements[$i] -depth ($depth + 1) -maxDepth $maxDepth
            if ($childTree) {
                [void]$childJsons.Add($childTree)
            }
        }
    }
    
    $childrenJson = "[" + ($childJsons -join ",") + "]"
    
    return "{" +
           '"controlType":"' + $controlType + '",' +
           '"name":"' + $name + '",' +
           '"automationId":"' + $automationId + '",' +
           '"className":"' + $className + '",' +
           '"bounds":{"x":' + $x + ',"y":' + $y + ',"width":' + $w + ',"height":' + $h + '},' +
           '"children":' + $childrenJson +
           "}"
}

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$json = Get-ControlTree -element $desktop -depth 0 -maxDepth ${maxDepth}
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$base64 = [Convert]::ToBase64String($bytes)
$base64 | Out-File -FilePath "${tempOutputPath}" -Encoding utf8
Write-Host "SAVED"
`;

      await this._runPSScript(script, 60000);
      
      // 从文件读取 JSON (Base64 编码)
      const fs = await import('node:fs/promises');
      try {
        const base64Str = await fs.readFile(tempOutputPath, 'utf8');
        await fs.unlink(tempOutputPath).catch(() => {});
        const jsonStr = Buffer.from(base64Str.trim(), 'base64').toString('utf8');
        const tree = JSON.parse(jsonStr);
        return { ok: true, tree };
      } catch (parseError) {
        return { ok: false, error: 'parse_error', message: parseError.message };
      }
    } catch (error) {
      this.log.error?.('[Automation] 获取控件树失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 获取子控件
   */
  async getChildren(parentCriteria, options = {}) {
    try {
      if (this._platform !== 'win32') {
        return { ok: false, error: 'unsupported_platform' };
      }

      // First find the parent
      const parentResult = await this.findControl(parentCriteria);
      if (!parentResult.ok || !parentResult.found) {
        return { ok: false, error: 'parent_not_found', parentResult };
      }

      const maxDepth = options.maxDepth || 3;
      
      const script = `Add-Type -AssemblyName UIAutomationClient

function Get-Children {
    param($element, $depth, $maxDepth)
    
    if ($depth -gt $maxDepth) { return @() }
    
    $result = @()
    $condition = [System.Windows.Automation.Condition]::TrueCondition
    $children = $element.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    
    for ($i = 0; $i -lt $children.Count; $i++) {
        $child = $children[$i]
        $rect = $child.Current.BoundingRectangle
        $item = @{
            controlType = $child.Current.ControlType.ProgrammaticName
            name = $child.Current.Name
            automationId = $child.Current.AutomationId
            className = $child.Current.ClassName
            bounds = @{
                x = [int]$rect.X
                y = [int]$rect.Y
                width = [int]$rect.Width
                height = [int]$rect.Height
            }
        }
        $result += $item
        
        if ($depth -lt $maxDepth) {
            $grandChildren = Get-Children -element $child -depth ($depth + 1) -maxDepth $maxDepth
            $result += $grandChildren
        }
    }
    
    return $result
}

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

$parent = $null
for ($i = 0; $i -lt $elements.Count; $i++) {
    $_ = $elements[$i]
    if ($_.Current.AutomationId -eq "${parentCriteria.automationId}" -or $_.Current.Name -eq "${parentCriteria.name}") {
        $parent = $_
        break
    }
}

if ($parent) {
    $children = Get-Children -element $parent -depth 0 -maxDepth ${maxDepth}
    Write-Host "CHILDREN:$($children.Count)"
    foreach ($child in $children) {
        Write-Host "$($child.controlType):$($child.name):$($child.automationId)"
    }
} else {
    Write-Host "PARENT_NOT_FOUND"
}`;

      const { stdout } = await this._runPSScript(script, 30000);
      const lines = stdout.trim().split('\n');
      
      if (lines[0].startsWith('CHILDREN:')) {
        const children = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(':');
          children.push({
            controlType: parts[0],
            name: parts[1] || '',
            automationId: parts[2] || ''
          });
        }
        return { ok: true, children };
      } else {
        return { ok: false, error: 'parent_not_found' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 获取子控件失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 点击控件
   */
  async clickControl(criteria) {
    try {
      if (this._platform !== 'win32') {
        return { ok: false, error: 'unsupported_platform' };
      }

      const script = `Add-Type -AssemblyName UIAutomationClient

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

$target = $null
for ($i = 0; $i -lt $elements.Count; $i++) {
    $_ = $elements[$i]
    if ($_.Current.AutomationId -eq "${criteria.automationId}" -or $_.Current.Name -eq "${criteria.name}") {
        $target = $_
        break
    }
}

if ($target) {
    # Try Invoke pattern first
    $invokePattern = $target.GetCurrentPattern([System.Windows.Automation.PatternIdentifiers]::InvokePattern)
    if ($invokePattern) {
        $invokePattern.Invoke()
        Write-Host "CLICKED:invoke"
    } else {
        # Fall back to clicking the center point
        $rect = $target.Current.BoundingRectangle
        $x = [int]($rect.X + $rect.Width / 2)
        $y = [int]($rect.Y + $rect.Height / 2)
        
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
        
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Clicker {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
        [Clicker]::mouse_event(0x0002, 0, 0, 0, 0)
        [Clicker]::mouse_event(0x0004, 0, 0, 0, 0)
        Write-Host ('CLICKED:mouse:' + $x + ':' + $y)
    }
} else {
    Write-Host "NOT_FOUND"
}`;

      const { stdout } = await this._runPSScript(script, 30000);
      const output = stdout.trim();
      
      if (output.startsWith('CLICKED:')) {
        const parts = output.split(':');
        return {
          ok: true,
          method: parts[1],
          x: parts[2] ? parseInt(parts[2], 10) : null,
          y: parts[3] ? parseInt(parts[3], 10) : null
        };
      } else {
        return { ok: false, error: 'control_not_found' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 点击控件失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 设置焦点并激活窗口
   */
  async setFocus(criteria) {
    try {
      if (this._platform !== 'win32') {
        return { ok: false, error: 'unsupported_platform' };
      }

      const script = `Add-Type -AssemblyName UIAutomationClient

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    public const int SW_RESTORE = 9;
}
"@

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

$target = $null
for ($i = 0; $i -lt $elements.Count; $i++) {
    $_ = $elements[$i]
    if ($_.Current.AutomationId -eq "${criteria.automationId}" -or $_.Current.Name -eq "${criteria.name}") {
        $target = $_
        break
    }
}

if ($target) {
    # 获取窗口句柄并激活窗口
    $hwnd = $target.Current.NativeWindowHandle
    if ($hwnd -ne 0) {
        # 如果窗口最小化，先恢复
        if ([Win32]::IsIconic([IntPtr]$hwnd)) {
            [Win32]::ShowWindow([IntPtr]$hwnd, [Win32]::SW_RESTORE) | Out-Null
        }
        # 设置前台窗口
        [Win32]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
    }
    # 同时设置 UIAutomation 焦点
    $target.SetFocus()
    Write-Host "FOCUSED"
} else {
    Write-Host "NOT_FOUND"
}`;

      const { stdout } = await this._runPSScript(script, 30000);
      const output = stdout.trim();
      
      if (output === 'FOCUSED') {
        return { ok: true };
      } else {
        return { ok: false, error: 'control_not_found' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 设置焦点失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 向控件发送文本
   */
  async sendTextToControl(criteria, text) {
    try {
      if (this._platform !== 'win32') {
        return { ok: false, error: 'unsupported_platform' };
      }

      // First set focus
      await this.setFocus(criteria);
      await new Promise(resolve => setTimeout(resolve, 100));

      const escapedText = text.replace(/"/g, '`"');
      
      const script = `Add-Type -AssemblyName UIAutomationClient

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

$target = $null
for ($i = 0; $i -lt $elements.Count; $i++) {
    $_ = $elements[$i]
    if ($_.Current.AutomationId -eq "${criteria.automationId}" -or $_.Current.Name -eq "${criteria.name}") {
        $target = $_
        break
    }
}

if ($target) {
    # Try Value pattern first
    $valuePattern = $target.GetCurrentPattern([System.Windows.Automation.PatternIdentifiers]::ValuePattern)
    if ($valuePattern) {
        $valuePattern.SetValue("${escapedText}")
        Write-Host "SET:value"
    } else {
        # Fall back to SendKeys
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("${escapedText}")
        Write-Host "SET:sendkeys"
    }
} else {
    Write-Host "NOT_FOUND"
}`;

      const { stdout } = await this._runPSScript(script, 30000);
      const output = stdout.trim();
      
      if (output.startsWith('SET:')) {
        return { ok: true, method: output.split(':')[1] };
      } else {
        return { ok: false, error: 'control_not_found' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 发送文本失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 等待控件出现
   */
  async waitForControl(criteria, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await this.findControl({ ...criteria, timeout: 1000 });
      if (result.ok && result.found) {
        return { ok: true, found: true, control: result };
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return { ok: true, found: false };
  }

  /**
   * 找到根 agent 的工作区 ID
   * 从当前 agent 向上追溯，找到 parentAgentId 为 "root" 的 agent
   */
  _findRootWorkspaceId(agentId) {
    const runtime = this.runtime;
    let currentId = agentId;
    const visited = new Set();
    
    while (currentId && currentId !== "user" && !visited.has(currentId)) {
      visited.add(currentId);
      
      // 检查当前 agent 是否有工作区
      if (runtime.workspaceManager.checkWorkspaceExists(currentId)) {
        // 检查是否是根 agent（parentAgentId 为 "root" 或不存在）
        const meta = runtime._agentMetaById.get(currentId);
        if (!meta || !meta.parentAgentId || meta.parentAgentId === "root") {
          return currentId;
        }
      }
      
      // 向上查找父 agent
      const meta = runtime._agentMetaById.get(currentId);
      if (!meta || !meta.parentAgentId) {
        break;
      }
      currentId = meta.parentAgentId;
    }
    
    return null;
  }

  /**
   * 控件截图
   * 
   * 使用 FFmpeg 的 gdigrab 功能截图，避免 PowerShell 被杀毒软件拦截。
   * 截图后使用 workspace.writeFile 写入到正确的工作区。
   */
  async screenshotControl(ctx, criteria, destPath, options = {}) {
    if (this._platform !== 'win32') {
      return { ok: false, error: 'unsupported_platform' };
    }

    const agentId = ctx.agent?.id;
    
    if (!agentId) {
      return { ok: false, error: 'no_agent_id', message: '无法获取智能体ID' };
    }

    // 找到根 agent 的工作区（parentAgentId 为 "root" 的 agent）
    const rootWorkspaceId = this._findRootWorkspaceId(agentId);
    if (!rootWorkspaceId) {
      return { ok: false, error: 'workspace_not_assigned', message: '当前智能体未分配工作空间' };
    }

    // 首先查找控件
    const findResult = await this.findControl(criteria);
    if (!findResult.ok || !findResult.found) {
      return { ok: false, error: 'control_not_found', findResult };
    }

    const bounds = findResult.bounds;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return { ok: false, error: 'invalid_bounds', bounds };
    }

    // 应用边距
    const margin = options.margin || 0;
    const x = Math.max(0, bounds.x - margin);
    const y = Math.max(0, bounds.y - margin);
    const width = bounds.width + margin * 2;
    const height = bounds.height + margin * 2;

    const workspace = await this.runtime.workspaceManager.getWorkspace(rootWorkspaceId);

    // 创建临时文件路径
    const tempPath = path.join(tmpdir(), `screenshot_${Date.now()}.jpg`);

    // 使用 FFmpeg gdigrab 截图到临时文件
    const ffmpegCmd = `ffmpeg -f gdigrab -i desktop -vf "crop=${width}:${height}:${x}:${y}" -vframes 1 -q:v 2 -y "${tempPath}"`;
    
    await execAsync(ffmpegCmd, { timeout: 30000 });
    
    // 读取截图文件内容
    const buffer = await readFile(tempPath);
    
    // 删除临时文件
    await unlink(tempPath);
    
    // 使用 workspace.writeFile 写入到正确的工作区
    await workspace.writeFile(destPath, buffer, {
      operator: agentId,
      messageId: ctx.currentMessage?.id,
      mimeType: 'image/jpeg'
    });
    
    return {
      ok: true,
      bounds: bounds,
      files: [{
        path: destPath,
        mimeType: 'image/jpeg',
        size: buffer.length
      }]
    };
  }
}

export default AccessibilityService;
