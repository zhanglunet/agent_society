import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PS_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

async function test() {
  const script = `
Add-Type -AssemblyName UIAutomationClient

# Get target process PIDs
$targetPids = @(Get-Process | Where-Object { $_.ProcessName -eq "WeChatAppEx" } | Select-Object -ExpandProperty Id)
Write-Host "Target PIDs count: $($targetPids.Count)"
Write-Host "Target PIDs: $($targetPids -join ', ')"

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

Write-Host "Total elements: $($elements.Count)"

$found = $null
$checked = 0
for ($i = 0; $i -lt $elements.Count; $i++) {
    $_ = $elements[$i]
    $currentPid = $_.Current.ProcessId
    
    if (-not $currentPid) { continue }
    $checked++
    
    if ($targetPids -contains $currentPid) {
        Write-Host "Found match at index $i : PID=$currentPid, Name='$($_.Current.Name)', Type='$($_.Current.ControlType.ProgrammaticName)'"
        $found = $_
        break
    }
}

Write-Host "Checked elements with PID: $checked"

if ($found) {
    Write-Host "FOUND:$($found.Current.ControlType.ProgrammaticName):$($found.Current.Name)"
} else {
    Write-Host "NOT_FOUND"
}
`;

  try {
    const buffer = Buffer.from(script, 'utf16le');
    const base64Script = buffer.toString('base64');
    
    const { stdout } = await execAsync(
      `"${PS_PATH}" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`,
      { timeout: 60000 }
    );
    
    console.log('Output:');
    console.log(stdout);
  } catch (error) {
    console.log('ERROR:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.log('STDERR:', error.stderr);
  }
}

test();
