param(
  [Parameter(Mandatory = $true)][string]$PreviousInstaller,
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviousVersion,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$ReportPath = '.qa-output/windows-upgrade/report.json'
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:RUNNER_TEMP) {
  throw 'Official upgrade QA is restricted to disposable GitHub-hosted Windows runners. Never run production-identity installers locally.'
}
if ($ExpectedPreviousVersion -notmatch '^\d+\.\d+\.\d+$' -or $ExpectedVersion -notmatch '^\d+\.\d+\.\d+$' -or
    ([version]$ExpectedVersion) -le ([version]$ExpectedPreviousVersion)) { throw 'Expected versions must be increasing stable versions.' }
$previous = (Resolve-Path -LiteralPath $PreviousInstaller).Path
$candidate = (Resolve-Path -LiteralPath $Installer).Path
if ([IO.Path]::GetFileName($previous) -ne "CF-Compass-$ExpectedPreviousVersion-Windows-x64-Setup.exe" -or
    [IO.Path]::GetFileName($candidate) -ne "CF-Compass-$ExpectedVersion-Windows-x64-Setup.exe") { throw 'Unexpected official installer asset name.' }

$temporaryRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
$runId = [guid]::NewGuid().ToString('N')
$ownedRoot = Join-Path $temporaryRoot "cf-compass-upgrade-$runId"
$installRoot = Join-Path $ownedRoot 'install'
$userData = Join-Path $ownedRoot 'user-data'
$contextPath = Join-Path $ownedRoot 'upgrade-context.json'
$report = [ordered]@{ previousVersion=$ExpectedPreviousVersion; version=$ExpectedVersion;
  environment='github-hosted Windows'; verification='official installer overwrite; not an in-app public-channel update'; steps=@(); passed=$false }
$installationStarted = $false
$failure = $null

function Assert-OwnedPath([string]$candidatePath) {
  $full = [IO.Path]::GetFullPath($candidatePath)
  if (-not $full.StartsWith($ownedRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing an operation outside the owned upgrade directory: $full"
  }
  return $full
}
function Read-Registration {
  # electron-builder v26 UUID.v5(com.cfcompass.desktop, 50e065bc-3134-11e6-9bab-38c9862bdaf3).
  $installerGuid = '4b46b436-ddfb-5421-9660-ac16137e8106'
  $entries = @()
  foreach ($hive in @('CurrentUser','LocalMachine')) {
    foreach ($view in @('Registry64','Registry32')) {
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hive, [Microsoft.Win32.RegistryView]::$view)
      try {
        foreach ($keyPath in @("Software\$installerGuid", "Software\Microsoft\Windows\CurrentVersion\Uninstall\$installerGuid")) {
          $key = $base.OpenSubKey($keyPath, $false)
          if ($null -ne $key) {
            try { $entries += [pscustomobject]@{ hive=$hive; view=$view; key=$keyPath;
              location=$key.GetValue('InstallLocation'); version=$key.GetValue('DisplayVersion') } }
            finally { $key.Dispose() }
          }
        }
      } finally { $base.Dispose() }
    }
  }
  return $entries
}
function Assert-OwnedRegistration {
  $entries = @(Read-Registration)
  if ($entries.Count -eq 0) { throw 'Installed application registration was not created.' }
  foreach ($entry in $entries) {
    if (-not $entry.location -or [IO.Path]::GetFullPath($entry.location).TrimEnd('\') -ne $installRoot.TrimEnd('\')) {
      throw 'An application registration points outside the owned installation.'
    }
  }
}
function Stop-OwnedProcesses {
  foreach ($record in @(Get-CimInstance Win32_Process)) {
    if ($record.ExecutablePath -and [IO.Path]::GetFullPath($record.ExecutablePath).StartsWith(
      $ownedRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $record.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}
function Run-Installer([string]$file, [string[]]$arguments) {
  $process = Start-Process -FilePath $file -WindowStyle Hidden -ArgumentList $arguments -PassThru
  if (-not $process.WaitForExit(180000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw 'Installer exceeded the three-minute upgrade QA timeout.'
  }
  if ($process.ExitCode -ne 0) { throw "Installer exited with $($process.ExitCode)." }
}
function Cold-Launch([string]$phase) {
  & node (Join-Path $PSScriptRoot 'qa-windows-upgrade.cjs') --context $contextPath --phase $phase
  if ($LASTEXITCODE -ne 0) { throw "Real installed Electron $phase verification failed." }
  $report.steps += (Get-Content -LiteralPath (Join-Path $ownedRoot "$phase-report.json") -Raw | ConvertFrom-Json)
  Stop-OwnedProcesses
}

try {
  if (@(Read-Registration).Count -ne 0) { throw 'Existing CF Compass registration found; refusing official-identity install.' }
  if (@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'CF Compass.exe' }).Count -ne 0) {
    throw 'Existing CF Compass process found; refusing official-identity install.'
  }
  New-Item -ItemType Directory -Path $ownedRoot, $userData | Out-Null
  @{ runId=$runId; root=$ownedRoot; installRoot=$installRoot; userData=$userData;
    previousVersion=$ExpectedPreviousVersion; version=$ExpectedVersion } | ConvertTo-Json | Set-Content -LiteralPath $contextPath -Encoding utf8
  $installationStarted = $true
  Run-Installer $previous @('/S', '/currentuser', "/D=$installRoot")
  Assert-OwnedRegistration
  if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'CF Compass.exe') -PathType Leaf)) { throw 'Previous installed executable is missing.' }
  Cold-Launch 'initial'
  Run-Installer $candidate @('/S', '/currentuser', "/D=$installRoot")
  Assert-OwnedRegistration
  Cold-Launch 'upgraded'
  $report.passed = $true
} catch {
  $failure = $_
  $report.error = $_.Exception.Message
} finally {
  Stop-OwnedProcesses
  try {
    if ($installationStarted -and (Test-Path -LiteralPath $installRoot)) {
      $uninstaller = Assert-OwnedPath (Join-Path $installRoot 'Uninstall CF Compass.exe')
      if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        Assert-OwnedRegistration
        Run-Installer $uninstaller @('/S', '/currentuser')
        $deadline = (Get-Date).AddSeconds(30)
        $installedExecutable = Join-Path $installRoot 'CF Compass.exe'
        while ((@(Read-Registration).Count -ne 0 -or (Test-Path -LiteralPath $installedExecutable)) -and
            (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
        if (@(Read-Registration).Count -ne 0) { throw 'Owned uninstall left application registration.' }
        if (Test-Path -LiteralPath (Join-Path $installRoot 'CF Compass.exe')) { throw 'Owned uninstall left the application executable.' }
        if (-not (Test-Path -LiteralPath (Join-Path $userData 'upgrade-sentinel.json'))) { throw 'Uninstall removed synthetic user data.' }
        $report.uninstallVerified = $true
      } elseif (@(Read-Registration).Count -ne 0 -or (Test-Path -LiteralPath (Join-Path $installRoot 'CF Compass.exe'))) {
        throw 'Installation remains but has no owned uninstaller.'
      }
    }
  } catch {
    $report.passed = $false
    $report.cleanupError = $_.Exception.Message
    if (-not $failure) { $failure = $_ }
  }
  $resolvedReport = [IO.Path]::GetFullPath($ReportPath)
  New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($resolvedReport)) | Out-Null
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedReport -Encoding utf8
  $report | ConvertTo-Json -Depth 6
  # The complete synthetic profile stays only in RUNNER_TEMP until teardown.
  # It is never attached to a Release or uploaded as verification evidence.
}
if ($failure) { throw $failure }
