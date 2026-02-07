/**
 * PowerShell 执行测试
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PS_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

async function test() {
  const script = `
Add-Type -AssemblyName UIAutomationClient
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
Write-Host "WINDOWS:$($elements.Count)"
for ($i = 0; $i -lt [Math]::Min(5, $elements.Count); $i++) {
    $win = $elements[$i]
    $procId = $win.Current.ProcessId
    $procName = "unknown"
    if ($procId) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) { $procName = $proc.ProcessName }
        } catch {}
    }
    Write-Host "$($win.Current.Name)|$($win.Current.ClassName)|$procName"
}
`;

  try {
    const buffer = Buffer.from(script, 'utf16le');
    const base64Script = buffer.toString('base64');
    
    const { stdout } = await execAsync(
      `"${PS_PATH}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`,
      { timeout: 30000 }
    );
    
    console.log('SUCCESS:');
    console.log(stdout);
  } catch (error) {
    console.log('ERROR:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.log('STDERR:', error.stderr);
  }
}

test();
