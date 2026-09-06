param(
  [Parameter(Mandatory = $true)]
  [string]$Installer,
  [int]$TimeoutSeconds = 60,
  [int]$MaxLaunchSeconds = 30
)

$ErrorActionPreference = 'Stop'
$resolvedInstaller = (Resolve-Path -LiteralPath $Installer).Path
$temporaryRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$testId = [guid]::NewGuid().ToString('N')
$installRoot = Join-Path $temporaryRoot "cf-compass-install-$testId"
$userDataRoot = Join-Path $temporaryRoot "cf-compass-installer-data-$testId"
New-Item -ItemType Directory -Path $userDataRoot | Out-Null

$previousUserData = $env:CF_COMPASS_USER_DATA
$env:CF_COMPASS_USER_DATA = $userDataRoot
$startedIds = [System.Collections.Generic.HashSet[int]]::new()

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

function Stop-TestProcesses {
  foreach ($processId in @($startedIds | Sort-Object -Descending)) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  $startedIds.Clear()
}

function Test-InstalledLaunch([string]$Executable, [int]$Attempt) {
  $startedAt = Get-Date
  $rootProcess = Start-Process -FilePath $Executable -PassThru
  [void]$startedIds.Add($rootProcess.Id)
  $readyProcess = $null
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  do {
    foreach ($processId in @(Get-DescendantIds -RootId $rootProcess.Id)) {
      [void]$startedIds.Add([int]$processId)
    }
    $candidates = foreach ($processId in $startedIds) {
      Get-Process -Id $processId -ErrorAction SilentlyContinue
    }
    $readyProcess = $candidates | Where-Object {
      $_.MainWindowHandle -ne 0 -and (
        $_.ProcessName -like 'CF Compass*' -or $_.MainWindowTitle -like '*CF Compass*'
      )
    } | Select-Object -First 1
    if (-not $readyProcess) { Start-Sleep -Milliseconds 500 }
  } while (-not $readyProcess -and (Get-Date) -lt $deadline)

  if (-not $readyProcess) {
    throw "Installed CF Compass did not show a window within $TimeoutSeconds seconds on launch $Attempt."
  }

  $elapsed = [math]::Round(((Get-Date) - $startedAt).TotalMilliseconds)
  if ($elapsed -gt ($MaxLaunchSeconds * 1000)) {
    throw "Installed CF Compass launch $Attempt took ${elapsed}ms, exceeding the ${MaxLaunchSeconds}s release gate."
  }

  $result = [pscustomobject]@{
    attempt = $Attempt
    readyPid = $readyProcess.Id
    windowTitle = $readyProcess.MainWindowTitle
    elapsedMs = $elapsed
  }
  Stop-TestProcesses
  Start-Sleep -Seconds 1
  return $result
}

try {
  $installProcess = Start-Process -FilePath $resolvedInstaller -ArgumentList @('/S', "/D=$installRoot") -Wait -PassThru
  if ($installProcess.ExitCode -ne 0) {
    throw "Windows installer exited with code $($installProcess.ExitCode)."
  }

  $installedExecutable = Join-Path $installRoot 'CF Compass.exe'
  if (-not (Test-Path -LiteralPath $installedExecutable -PathType Leaf)) {
    throw "Installed executable was not found at $installedExecutable."
  }

  $launches = @(
    Test-InstalledLaunch -Executable $installedExecutable -Attempt 1
    Test-InstalledLaunch -Executable $installedExecutable -Attempt 2
  )
  $userDataEntries = @(Get-ChildItem -LiteralPath $userDataRoot -Force -ErrorAction Stop).Count
  if ($userDataEntries -eq 0) {
    throw 'Installed CF Compass did not create data in the isolated user-data directory.'
  }

  $uninstaller = Get-ChildItem -LiteralPath $installRoot -File -Filter 'Uninstall*.exe' | Select-Object -First 1
  if (-not $uninstaller) {
    throw 'The Windows uninstaller was not created.'
  }
  $uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  if ($uninstallProcess.ExitCode -ne 0) {
    throw "Windows uninstaller exited with code $($uninstallProcess.ExitCode)."
  }
  $uninstallDeadline = (Get-Date).AddSeconds(30)
  while ((Test-Path -LiteralPath $installedExecutable) -and (Get-Date) -lt $uninstallDeadline) {
    Start-Sleep -Milliseconds 500
  }
  if (Test-Path -LiteralPath $installedExecutable) {
    throw 'The installed executable still exists after silent uninstall.'
  }
  if (-not (Test-Path -LiteralPath $userDataRoot -PathType Container)) {
    throw 'Uninstall unexpectedly removed the isolated user-data directory.'
  }

  [pscustomobject]@{
    installer = [System.IO.Path]::GetFileName($resolvedInstaller)
    installRoot = $installRoot
    launches = $launches
    userDataEntries = $userDataEntries
    userDataPreservedByDefault = $true
    uninstallVerified = $true
  } | ConvertTo-Json -Depth 4
}
finally {
  Stop-TestProcesses
  $env:CF_COMPASS_USER_DATA = $previousUserData
  Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $userDataRoot -Recurse -Force -ErrorAction SilentlyContinue
}
