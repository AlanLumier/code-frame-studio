# Create a codemv shortcut on the Windows desktop.
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "codemv.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $repo "run.cmd"
$shortcut.WorkingDirectory = $repo
$shortcut.IconLocation = Join-Path $repo "assets\codemv.ico"
$shortcut.Description = "codemv - AI music video studio"
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath"
