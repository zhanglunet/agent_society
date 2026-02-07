/**
 * 输入控制器
 * 
 * 职责：
 * - 鼠标控制：移动、点击、拖拽、滚轮
 * - 键盘控制：按键、组合键、输入文本
 * - 屏幕操作：获取尺寸、截图
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execAsync = promisify(exec);

/**
 * 按键映射表（VK Code）
 */
const KEY_CODES = {
  'backspace': 0x08, 'tab': 0x09, 'enter': 0x0D, 'shift': 0x10, 'ctrl': 0x11,
  'alt': 0x12, 'pause': 0x13, 'capslock': 0x14, 'esc': 0x1B, 'space': 0x20,
  'pageup': 0x21, 'pagedown': 0x22, 'end': 0x23, 'home': 0x24,
  'left': 0x25, 'up': 0x26, 'right': 0x27, 'down': 0x28,
  'printscreen': 0x2C, 'insert': 0x2D, 'delete': 0x2E,
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
  'a': 0x41, 'b': 0x42, 'c': 0x43, 'd': 0x44, 'e': 0x45,
  'f': 0x46, 'g': 0x47, 'h': 0x48, 'i': 0x49, 'j': 0x4A,
  'k': 0x4B, 'l': 0x4C, 'm': 0x4D, 'n': 0x4E, 'o': 0x4F,
  'p': 0x50, 'q': 0x51, 'r': 0x52, 's': 0x53, 't': 0x54,
  'u': 0x55, 'v': 0x56, 'w': 0x57, 'x': 0x58, 'y': 0x59, 'z': 0x5A,
  'lwin': 0x5B, 'rwin': 0x5C, 'numpad0': 0x60, 'numpad1': 0x61,
  'numpad2': 0x62, 'numpad3': 0x63, 'numpad4': 0x64, 'numpad5': 0x65,
  'numpad6': 0x66, 'numpad7': 0x67, 'numpad8': 0x68, 'numpad9': 0x69,
  'f1': 0x70, 'f2': 0x71, 'f3': 0x72, 'f4': 0x73, 'f5': 0x74,
  'f6': 0x75, 'f7': 0x76, 'f8': 0x77, 'f9': 0x78, 'f10': 0x79,
  'f11': 0x7A, 'f12': 0x7B, 'numlock': 0x90, 'scrolllock': 0x91,
  'lshift': 0xA0, 'rshift': 0xA1, 'lctrl': 0xA2, 'rctrl': 0xA3,
  'lalt': 0xA4, 'ralt': 0xA5
};

/**
 * 输入控制器类
 */
export class InputController {
  constructor(options) {
    this.configManager = options.configManager;
    this.runtime = options.runtime;
    this.log = options.log ?? console;
    this._platform = process.platform;
  }

  /**
   * 执行 PowerShell 命令
   * @private
   * 
   * 使用 -Command 参数直接执行命令，避免写入脚本文件被杀毒软件拦截
   */
  async _runPSScript(scriptContent, timeout = 30000) {
    const buffer = Buffer.from(scriptContent, 'utf16le');
    const base64Script = buffer.toString('base64');
    
    // 使用 PowerShell 的绝对路径，避免被 conda 等工具拦截
    const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    
    const { stdout, stderr } = await execAsync(
      `"${psPath}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`,
      { timeout }
    );
    return { stdout, stderr, success: true };
  }

  /**
   * 移动鼠标
   */
  async mouseMove(x, y, options = {}) {
    try {
      if (this._platform === 'win32') {
        const script = `Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
        
        await this._runPSScript(script, 10000);
        return { ok: true, x, y };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 鼠标移动失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 点击鼠标
   */
  async mouseClick(options = {}) {
    try {
      const button = options.button || 'left';
      
      if (options.x !== undefined && options.y !== undefined) {
        await this.mouseMove(options.x, options.y);
        await this._sleep(50);
      }
      
      if (this._platform === 'win32') {
        const mouseEvent = button === 'left' ? '0x0002, 0x0004' : 
                           button === 'right' ? '0x0008, 0x0010' : '0x0020, 0x0040';
        
        const script = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseClicker {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
[MouseClicker]::mouse_event(${mouseEvent.split(',')[0].trim()}, 0, 0, 0, 0)
[MouseClicker]::mouse_event(${mouseEvent.split(',')[1].trim()}, 0, 0, 0, 0)`;
        
        await this._runPSScript(script, 10000);
        return { ok: true, button };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 鼠标点击失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 双击鼠标
   */
  async mouseDoubleClick(options = {}) {
    try {
      if (options.x !== undefined && options.y !== undefined) {
        await this.mouseMove(options.x, options.y);
        await this._sleep(50);
      }
      
      await this.mouseClick({ button: 'left' });
      await this._sleep(50);
      await this.mouseClick({ button: 'left' });
      
      return { ok: true };
    } catch (error) {
      this.log.error?.('[Automation] 鼠标双击失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 拖拽鼠标
   */
  async mouseDrag(fromX, fromY, toX, toY) {
    try {
      await this.mouseMove(fromX, fromY);
      await this._sleep(50);
      
      if (this._platform === 'win32') {
        // Mouse down
        const downScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseDrag {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
[MouseDrag]::mouse_event(0x0002, 0, 0, 0, 0)`;
        await this._runPSScript(downScript, 10000);
        await this._sleep(100);
        
        // Move to target
        await this.mouseMove(toX, toY);
        await this._sleep(100);
        
        // Mouse up
        const upScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseDrag {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
[MouseDrag]::mouse_event(0x0004, 0, 0, 0, 0)`;
        await this._runPSScript(upScript, 10000);
        
        return { ok: true };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 鼠标拖拽失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 滚轮滚动
   */
  async mouseScroll(delta) {
    try {
      if (this._platform === 'win32') {
        const script = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseScroll {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
[MouseScroll]::mouse_event(0x0800, 0, 0, ${delta * 120}, 0)`;
        
        await this._runPSScript(script, 10000);
        return { ok: true, delta };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 滚轮滚动失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 获取鼠标位置
   */
  async getMousePosition() {
    try {
      if (this._platform === 'win32') {
        const script = `Add-Type -AssemblyName System.Windows.Forms
$pos = [System.Windows.Forms.Cursor]::Position
Write-Host "$($pos.X),$($pos.Y)"`;
        
        const { stdout } = await this._runPSScript(script, 10000);
        const cleanOutput = stdout.trim().replace(/^["']|["']$/g, '');
        const [x, y] = cleanOutput.split(',').map(v => parseInt(v.trim(), 10));
        
        if (isNaN(x) || isNaN(y)) {
          return { ok: false, error: 'parse_error', raw: stdout };
        }
        
        return { ok: true, x, y };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 获取鼠标位置失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 按下按键
   */
  async keyPress(key) {
    try {
      const vkCode = KEY_CODES[key.toLowerCase()];
      if (!vkCode) {
        return { ok: false, error: 'unknown_key', key };
      }
      
      if (this._platform === 'win32') {
        const script = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyPress {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@
[KeyPress]::keybd_event(${vkCode}, 0, 0, 0)
[KeyPress]::keybd_event(${vkCode}, 0, 0x0002, 0)`;
        
        await this._runPSScript(script, 10000);
        return { ok: true, key };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 按键失败', { error: error.message, key });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 组合键
   */
  async keyCombination(keys) {
    try {
      if (!Array.isArray(keys) || keys.length === 0) {
        return { ok: false, error: 'invalid_keys' };
      }
      
      const vkCodes = keys.map(k => KEY_CODES[k.toLowerCase()]);
      if (vkCodes.some(code => !code)) {
        return { ok: false, error: 'unknown_key', keys };
      }
      
      if (this._platform === 'win32') {
        // Press all keys
        for (const vk of vkCodes) {
          const downScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyCombo {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@
[KeyCombo]::keybd_event(${vk}, 0, 0, 0)`;
          await this._runPSScript(downScript, 10000);
          await this._sleep(50);
        }
        
        // Release in reverse order
        for (const vk of [...vkCodes].reverse()) {
          const upScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyCombo {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@
[KeyCombo]::keybd_event(${vk}, 0, 0x0002, 0)`;
          await this._runPSScript(upScript, 10000);
          await this._sleep(50);
        }
        
        return { ok: true, keys };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 组合键失败', { error: error.message, keys });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 输入文本
   */
  async typeText(text) {
    try {
      if (this._platform === 'win32') {
        const escapedText = text.replace(/[{}+^%~()]/g, '{$&}').replace(/"/g, '`"');
        const script = `Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${escapedText}")`;
        
        await this._runPSScript(script, 10000);
        return { ok: true, length: text.length };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 输入文本失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 获取屏幕尺寸
   */
  async getScreenSize() {
    try {
      if (this._platform === 'win32') {
        const script = `Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host "$($bounds.Width),$($bounds.Height)"`;
        
        const { stdout } = await this._runPSScript(script, 10000);
        const cleanOutput = stdout.trim().replace(/^["']|["']$/g, '');
        const [width, height] = cleanOutput.split(',').map(v => parseInt(v.trim(), 10));
        
        if (isNaN(width) || isNaN(height)) {
          return { ok: false, error: 'parse_error', raw: stdout };
        }
        
        return { ok: true, width, height };
      } else {
        return { ok: false, error: 'unsupported_platform' };
      }
    } catch (error) {
      this.log.error?.('[Automation] 获取屏幕尺寸失败', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  /**
   * 休眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 找到根 agent 的工作区 ID
   * 从当前 agent 向上追溯，找到 parentAgentId 为 "root" 的 agent，返回其 workspaceId
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
   * 截取屏幕区域并保存到工作区
   * 
   * 使用 FFmpeg 的 gdigrab 功能截图，避免 PowerShell 被杀毒软件拦截。
   * 截图后使用 workspace.writeFile 写入到正确的工作区。
   */
  async screenshotRegion(ctx, x, y, width, height, destPath) {
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
      debug: { agentId, workspaceId: rootWorkspaceId },
      files: [{
        path: destPath,
        mimeType: 'image/jpeg',
        size: buffer.length
      }]
    };
  }
}

export default InputController;
