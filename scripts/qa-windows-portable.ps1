param(
  [Parameter(Mandatory = $true)]
  [string]$Executable,
  [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$resolvedExecutable = (Resolve-Path -LiteralPath $Executable).Path
$startedAt = Get-Date
$temporaryRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$userDataRoot = Join-Path $temporaryRoot "cf-compass-portable-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $userDataRoot | Out-Null

$previousUserData = $env:CF_COMPASS_USER_DATA
$env:CF_COMPASS_USER_DATA = $userDataRoot
$outerProcess = $null
$seenIds = [System.Collections.Generic.HashSet[int]]::new()
$readyProcess = $null

function Get-DescendantIds([int]$RootId) {
  $records = @(Get-CimInstance Win32_Process)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootId)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($record in $records) {
      if ($ids.Contains([int]$record.ParentProcessId) -and $ids.Add([int]$record.ProcessId)) {
        $changed = $true
      }
    }
  }
  return @($ids)
}

try {
  $outerProcess = Start-Process -FilePath $resolvedExecutable -PassThru
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    foreach ($processId in @(Get-DescendantIds -RootId $outerProcess.Id)) {
      [void]$seenIds.Add([int]$processId)
    }
    $candidates = foreach ($processId in $seenIds) {
      Get-Process -Id $processId -ErrorAction SilentlyContinue
    }
    $readyProcess = $candidates | Where-Object {
      $_.MainWindowHandle -ne 0 -and (
        $_.ProcessName -like 'CF Compass*' -or $_.MainWindowTitle -like '*CF Compass*'
      )
    } | Select-Object -First 1
    if (-not $readyProcess) { Start-Sleep -Seconds 1 }
  } while (-not $readyProcess -and (Get-Date) -lt $deadline)

  if (-not $readyProcess) {
    throw "Published portable package did not show a CF Compass window within $TimeoutSeconds seconds."
  }

  Start-Sleep -Seconds 3
  $elapsed = [math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
  [pscustomobject]@{
    executable = [System.IO.Path]::GetFileName($resolvedExecutable)
    outerPid = $outerProcess.Id
    readyPid = $readyProcess.Id
    windowTitle = $readyProcess.MainWindowTitle
    elapsedMs = $elapsed
  } | ConvertTo-Json
}
finally {
  foreach ($processId in @($seenIds | Sort-Object -Descending)) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  if ($outerProcess) {
    Stop-Process -Id $outerProcess.Id -Force -ErrorAction SilentlyContinue
  }
  $env:CF_COMPASS_USER_DATA = $previousUserData
  Remove-Item -LiteralPath $userDataRoot -Recurse -Force -ErrorAction SilentlyContinue
}
