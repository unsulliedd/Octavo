# Launch → document rendered, for the release build (Windows).
# Build first: npx tauri build --no-bundle
# "Editor" = Edit invoked through UI Automation until the formatting bar's Bold button exists, which the
# editor adds once it is loaded and has checked the document. Needs the formatting bar shown (the default)
# and a document the editor can open; otherwise the cell is empty.
# Limitation: UI Automation makes the webview build its accessibility tree, so large documents read slower
# than they feel; compare runs with each other, not with a stopwatch.
# "Rendered" = the window title changes to "<file> — Octavo", which App.tsx sets right after the
# render pipeline finishes. Mermaid diagrams render after that. Polling resolution is ~15 ms.
param(
  [string[]]$Files = @("fidelity\fixtures\extensions.md", "fidelity\fixtures\field-guide.md"),
  [int]$Runs = 5,
  [string]$Exe = "src-tauri\target\release\octavo.exe"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

function Find-Named($root, $name) {
  $by = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, $name)
  $root.FindFirst([Windows.Automation.TreeScope]::Descendants, $by)
}

# Milliseconds from pressing Edit to the editor being ready, or $null if it never is.
function Measure-Editor($process) {
  $root = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  $edit = $null
  $wait = [Diagnostics.Stopwatch]::StartNew()
  while (-not $edit -and $wait.ElapsedMilliseconds -lt 5000) { $edit = Find-Named $root "Edit" }
  if (-not $edit) { return $null }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $edit.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
  while (-not (Find-Named $root "Bold (Ctrl+B)")) {
    if ($sw.ElapsedMilliseconds -gt 20000) { return $null }
  }
  $sw.ElapsedMilliseconds
}

# A ~1 MB document from the field guide (ordinary prose, lists, tables), so the large-file number is
# reproducible. The edge-case fixtures parse 2-4x slower than real documents, so they are not used here.
$big = Join-Path $env:TEMP "octavo-1mb.md"
$chunk = [IO.File]::ReadAllText((Resolve-Path fidelity\fixtures\field-guide.md).Path)
$sb = [Text.StringBuilder]::new()
while ($sb.Length -lt 1MB) { [void]$sb.Append($chunk).Append("`n`n") }
[IO.File]::WriteAllText($big, $sb.ToString())

foreach ($file in $Files + $big) {
  $path = (Resolve-Path $file).Path
  $name = Split-Path $path -Leaf
  $windows = @()
  $editors = @()
  $times = foreach ($i in 1..$Runs) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process $Exe -ArgumentList "`"$path`"" -PassThru
    $window = $null
    while (-not $p.MainWindowTitle.StartsWith($name)) {
      if ($sw.ElapsedMilliseconds -gt 30000) { Stop-Process -Id $p.Id; throw "Timed out waiting for $name" }
      Start-Sleep -Milliseconds 5
      $p.Refresh()
      if (-not $window -and $p.MainWindowHandle -ne 0) { $window = $sw.ElapsedMilliseconds }
    }
    $windows += $window
    $sw.ElapsedMilliseconds
    $editors += Measure-Editor $p
    # Single instance: the next launch would hand its file to this window, so close it fully first.
    Stop-Process -Id $p.Id
    $p.WaitForExit()
  }
  $sorted = @($times | Sort-Object)
  [pscustomobject]@{
    File   = $name
    Window = @($windows | Sort-Object)[[int][math]::Floor(($Runs - 1) / 2)]
    KB     = [math]::Round((Get-Item $path).Length / 1KB)
    First  = $times[0]
    Median = $sorted[[int][math]::Floor(($Runs - 1) / 2)]
    Max    = $sorted[-1]
    Editor = if ($editors -contains $null) { $null } else { @($editors | Sort-Object)[[int][math]::Floor(($Runs - 1) / 2)] }
  }
}
