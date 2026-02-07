Add-Type -AssemblyName UIAutomationClient

# Filter by process name
$targetPids = @(Get-Process | Where-Object { $_.ProcessName -eq "WeChatAppEx" } | Select-Object -ExpandProperty Id)
Write-Host "Target PIDs: $targetPids"
if ($targetPids.Count -eq 0) { 
    Write-Host "NOT_FOUND"
    exit
}

$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.Condition]::TrueCondition
$elements = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)

Write-Host "Total elements: $($elements.Count)"

$found = $null
for ($i = 0; $i -lt $elements.Count; $i++) {
    $_ = $elements[$i]
    $currentPid = $_.Current.ProcessId
    
    if (-not $currentPid -or ($targetPids -notcontains $currentPid)) { 
        continue 
    }
    
    Write-Host "Found element with matching PID: $currentPid, Name: $($_.Current.Name), Type: $($_.Current.ControlType.ProgrammaticName)"
    $found = $_
    break
}

if ($found) {
    $rect = $found.Current.BoundingRectangle
    $className = $found.Current.ClassName
    $output = "FOUND:" + $found.Current.ControlType.ProgrammaticName + ":" + $found.Current.Name + ":" + $found.Current.AutomationId + ":" + $className + ":" + [int]$rect.X + ":" + [int]$rect.Y + ":" + [int]$rect.Width + ":" + [int]$rect.Height
    Write-Host $output
} else {
    Write-Host "NOT_FOUND"
}
