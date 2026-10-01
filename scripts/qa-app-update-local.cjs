const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

// Runs real unsigned NSIS updates for a disposable app, never the production app.
// All source/build/feed files live in ignored output. NSIS also creates one uniquely
// named LocalApplicationData installer cache, which is guarded and removed below.
const projectRoot = path.resolve(__dirname, "..");
const outputParent = path.join(projectRoot, "output", "app-update-local");
const args = process.argv.slice(2);
const contextArg = args.indexOf("--context");
const prepareOnly = args.includes("--prepare-only");
const reuseBuilds = args.includes("--reuse-builds");
if (process.platform !== "win32") throw Error("This QA requires Windows NSIS.");

function inside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function writeJson(filename, value) {
  const temporary = filename + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, filename);
}
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
const hash = filename => crypto.createHash("sha512").update(fs.readFileSync(filename)).digest("base64");

const driverSource = String.raw`
$ErrorActionPreference = 'Stop'
$ctx = Get-Content -LiteralPath $env:CF_UPDATE_QA_CONTEXT -Raw | ConvertFrom-Json
$root = [IO.Path]::GetFullPath($ctx.outputRoot)
function Assert-OwnedPath([string]$candidate) {
  $full = [IO.Path]::GetFullPath($candidate)
  if (-not $full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing operation outside fixture root: $full"
  }
  return $full
}
if ($ctx.runId -notmatch '^[a-f0-9]{12}$' -or
    $ctx.appId -ne ('com.cfcompass.updateqa.' + $ctx.runId) -or
    $ctx.productName -ne ('CFCompassUpdateQA-' + $ctx.runId) -or
    $ctx.packageName -ne ('cf-compass-update-qa-' + $ctx.runId)) { throw 'Invalid fixture identity.' }
$fixtureGuid = [guid]::Parse($ctx.guid).ToString()
$installRoot = Assert-OwnedPath $ctx.installRoot
$userData = Assert-OwnedPath $ctx.userData
$downloadCache = Assert-OwnedPath $ctx.downloadCache
$cacheParent = [Environment]::GetFolderPath('LocalApplicationData')
$systemCache = [IO.Path]::GetFullPath((Join-Path $cacheParent ($ctx.packageName + '-updater')))
if ([IO.Path]::GetDirectoryName($systemCache) -ne [IO.Path]::GetFullPath($cacheParent)) {
  throw 'Invalid NSIS seed-cache path.'
}
$keyPaths = @(('Software\' + $fixtureGuid),
  ('Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $fixtureGuid))
function Read-Registration {
  $entries = @()
  foreach ($hiveName in @('CurrentUser','LocalMachine')) {
    foreach ($viewName in @('Registry64','Registry32')) {
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::$hiveName, [Microsoft.Win32.RegistryView]::$viewName)
      try {
        foreach ($keyPath in $keyPaths) {
          $key = $base.OpenSubKey($keyPath, $false)
          if ($null -ne $key) {
            try {
              $entries += [pscustomobject]@{ hive=$hiveName; view=$viewName; key=$keyPath;
                installLocation=$key.GetValue('InstallLocation'); displayVersion=$key.GetValue('DisplayVersion');
                displayName=$key.GetValue('DisplayName'); uninstallString=$key.GetValue('UninstallString') }
            } finally { $key.Dispose() }
          }
        }
      } finally { $base.Dispose() }
    }
  }
  return $entries
}
function Stop-OwnedProcesses {
  foreach ($record in @(Get-CimInstance Win32_Process)) {
    if ($record.ExecutablePath) {
      $executable = [IO.Path]::GetFullPath($record.ExecutablePath)
      if ($executable.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        Stop-Process -Id $record.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  }
}
switch ($env:CF_UPDATE_QA_ACTION) {
  'preflight' {
    $registration = @(Read-Registration)
    if ($registration.Count -ne 0) { throw 'Fixture registration already exists; refusing install.' }
    if (Test-Path -LiteralPath $systemCache) { throw "Fixture seed cache already exists: $systemCache" }
    if (Test-Path -LiteralPath $installRoot) { throw 'Fixture installation already exists.' }
    [pscustomobject]@{ registryAbsent=$true; systemCacheAbsent=$true; systemCache=$systemCache;
      queriedKeys=$keyPaths; queriedViews=@('HKCU64','HKCU32','HKLM64','HKLM32') } | ConvertTo-Json
  }
  'install' {
    if (@(Read-Registration).Count -ne 0 -or (Test-Path -LiteralPath $systemCache)) {
      throw 'Fixture identity became occupied; refusing install.'
    }
    $installer = Assert-OwnedPath $ctx.initialInstaller
    $startArgs = @{ FilePath=$installer; WindowStyle='Hidden'; PassThru=$true;
      ArgumentList=@('/S', '/currentuser', "/D=$installRoot"); Wait=$true }
    $process = Start-Process @startArgs
    if ($process.ExitCode -ne 0) { throw "Initial installer exited with $($process.ExitCode)." }
    [pscustomobject]@{ installerExitCode=$process.ExitCode; registration=@(Read-Registration) } | ConvertTo-Json -Depth 5
  }
  'status' {
    [pscustomobject]@{ registration=@(Read-Registration); systemCache=$systemCache;
      systemCacheExists=(Test-Path -LiteralPath $systemCache) } | ConvertTo-Json -Depth 5
  }
  'uninstall' {
    Stop-OwnedProcesses
    $uninstaller = Assert-OwnedPath (Join-Path $installRoot ('Uninstall ' + $ctx.productName + '.exe'))
    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
      $process = Start-Process -FilePath $uninstaller -WindowStyle Hidden -ArgumentList @('/S','/currentuser') -Wait -PassThru
      if ($process.ExitCode -ne 0) { throw "Fixture uninstaller exited with $($process.ExitCode)." }
    }
    $deadline = (Get-Date).AddSeconds(45)
    do {
      $registration = @(Read-Registration)
      $executableExists = Test-Path -LiteralPath (Join-Path $installRoot ($ctx.productName + '.exe'))
      if ($registration.Count -ne 0 -or $executableExists) { Start-Sleep -Milliseconds 250 }
    } while (($registration.Count -ne 0 -or $executableExists) -and (Get-Date) -lt $deadline)
    if ($registration.Count -ne 0 -or $executableExists) { throw 'Fixture uninstall left registration or executable.' }
    [pscustomobject]@{ registryAbsent=$true; executableAbsent=$true;
      userDataPreserved=(Test-Path -LiteralPath (Join-Path $userData 'sentinel.json')) } | ConvertTo-Json
  }
  'cleanup' {
    if (@(Read-Registration).Count -ne 0) { throw 'Refusing cleanup while fixture registration remains.' }
    Stop-OwnedProcesses
    foreach ($candidate in @($installRoot, $downloadCache)) {
      $checked = Assert-OwnedPath $candidate
      if (Test-Path -LiteralPath $checked) { Remove-Item -LiteralPath $checked -Recurse -Force }
    }
    # Only the exact random package-name cache owned by this fixture is removed.
    if (Test-Path -LiteralPath $systemCache) { Remove-Item -LiteralPath $systemCache -Recurse -Force }
    [pscustomobject]@{ systemCacheRemoved=(-not (Test-Path -LiteralPath $systemCache));
      downloadCacheRemoved=(-not (Test-Path -LiteralPath $downloadCache)); registryAbsent=$true;
      syntheticUserDataRetained=(Test-Path -LiteralPath (Join-Path $userData 'sentinel.json')) } | ConvertTo-Json
  }
  default { throw 'Unknown fixture operation.' }
}
`;

const fixtureMain = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'run-config.json'), 'utf8'));
fs.mkdirSync(config.userData, { recursive: true });
fs.mkdirSync(config.downloadCache, { recursive: true });
process.env.LOCALAPPDATA = config.downloadCache;
app.setPath('userData', config.userData);
app.setPath('sessionData', config.userData);
let updater;
let busy = false;
let lastCommand = '';
function event(name, details = {}) {
  fs.appendFileSync(config.eventsPath, JSON.stringify({ name, version: app.getVersion(), pid: process.pid,
    at: new Date().toISOString(), ...details }) + '\n', 'utf8');
}
function fail(error) { event('fatal', { message: error.stack || error.message }); app.exit(2); }
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
app.whenReady().then(() => {
  const marker = fs.readFileSync(path.join(path.dirname(process.execPath), 'cf-compass-nsis-install'), 'utf8');
  assert.equal(marker, config.appId);
  assert.equal(path.resolve(path.dirname(process.execPath)).toLowerCase(), config.installRoot.toLowerCase());
  assert.equal(JSON.parse(fs.readFileSync(path.join(config.userData, 'sentinel.json'), 'utf8')).token, config.sentinelToken);
  new BrowserWindow({ show: false, width: 400, height: 240 });
  const { NsisUpdater } = require('electron-updater');
  updater = new NsisUpdater({ provider: 'generic', url: config.feedUrl + 'good/' });
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.disableDifferentialDownload = true;
  updater.logger = { info: message => event('log', { message }), warn: message => event('warning', { message }),
    error: message => event('updater-error-log', { message }), debug: message => event('debug', { message }) };
  for (const name of ['checking-for-update','update-available','update-not-available','update-downloaded']) {
    updater.on(name, info => event(name, { info }));
  }
  updater.on('error', error => event('updater-error', { code: error.code, message: error.message }));
  event('ready', { execPath: process.execPath, argv: process.argv, userData: app.getPath('userData'), marker,
    signaturePolicy: 'Unsigned fixture; publisherName omitted; SHA-512 integrity is checked.' });
  if (app.getVersion() === '0.0.2') event('relaunch-verified', { marker, sentinelToken: config.sentinelToken });
  setInterval(async () => {
    if (busy || !fs.existsSync(config.commandPath)) return;
    let command;
    try { command = JSON.parse(fs.readFileSync(config.commandPath, 'utf8')); } catch { return; }
    if (command.id === lastCommand) return;
    lastCommand = command.id;
    busy = true;
    try {
      if (command.action === 'bad-download') {
        updater.setFeedURL({ provider: 'generic', url: config.feedUrl + 'bad/' });
        const result = await updater.checkForUpdates();
        assert.equal(result.isUpdateAvailable, true);
        try { await updater.downloadUpdate(); throw Error('Incorrect SHA-512 was accepted.'); }
        catch (error) {
          assert.match(error.message, /sha512 checksum mismatch/i);
          event('bad-sha512-rejected', { code: error.code, message: error.message });
        }
      } else if (command.action === 'good-download') {
        updater.setFeedURL({ provider: 'generic', url: config.feedUrl + 'good/' });
        const result = await updater.checkForUpdates();
        assert.equal(result.isUpdateAvailable, true);
        assert.equal(result.updateInfo.version, '0.0.2');
        const files = await updater.downloadUpdate();
        event('correct-download-verified', { files, sha512: crypto.createHash('sha512').update(fs.readFileSync(files[0])).digest('base64') });
      } else if (command.action === 'install') {
        assert.equal(app.getVersion(), '0.0.1');
        event('explicit-install-requested');
        updater.quitAndInstall(true, true);
      } else if (command.action === 'quit') { event('explicit-quit'); app.quit(); }
      else throw Error('Unknown fixture command.');
    } catch (error) { fail(error); }
    finally { busy = false; }
  }, 100);
}).catch(fail);
`;

function createContext() {
  const runId = crypto.randomBytes(6).toString("hex");
  const outputRoot = path.join(outputParent, `${Date.now()}-${runId}`);
  fs.mkdirSync(outputRoot, { recursive: true });
  const context = {
    schemaVersion: 1, runId, outputRoot,
    appId: `com.cfcompass.updateqa.${runId}`,
    packageName: `cf-compass-update-qa-${runId}`,
    productName: `CFCompassUpdateQA-${runId}`,
    guid: crypto.randomUUID(),
    projectDir: path.join(outputRoot, "fixture-project"),
    installRoot: path.join(outputRoot, "install"),
    userData: path.join(outputRoot, "user-data"),
    downloadCache: path.join(outputRoot, "download-cache"),
    eventsPath: path.join(outputRoot, "events.jsonl"),
    commandPath: path.join(outputRoot, "command.json"),
    sentinelToken: crypto.randomBytes(16).toString("hex")
  };
  const filename = path.join(outputRoot, "context.json");
  writeJson(filename, context);
  return { context, filename };
}
let prepared;
if (contextArg >= 0) {
  assert.ok(args[contextArg + 1], "--context requires the prepared context.json path.");
  const filename = path.resolve(args[contextArg + 1]);
  assert.ok(inside(filename, outputParent), "Prepared context must be inside this project's ignored output.");
  prepared = { context: JSON.parse(fs.readFileSync(filename, "utf8")), filename };
} else prepared = createContext();
const { context, filename: contextPath } = prepared;
assert.match(context.runId, /^[a-f0-9]{12}$/);
assert.equal(context.appId, `com.cfcompass.updateqa.${context.runId}`);
assert.equal(context.packageName, `cf-compass-update-qa-${context.runId}`);
assert.equal(context.productName, `CFCompassUpdateQA-${context.runId}`);
assert.ok(inside(context.outputRoot, outputParent));
for (const field of ["projectDir", "installRoot", "userData", "downloadCache", "eventsPath", "commandPath"]) {
  assert.ok(inside(context[field], context.outputRoot), `Unsafe ${field}.`);
}
if (prepareOnly) {
  console.log(JSON.stringify({ prepared: true, contextPath, ...context }, null, 2));
  process.exit(0);
}

const reportPath = path.join(context.outputRoot, "report.json");
if (fs.existsSync(reportPath)) fs.copyFileSync(reportPath, path.join(context.outputRoot, `previous-report-${Date.now()}.json`));
const runLog = path.join(context.outputRoot, "run.log");
for (const stream of [process.stdout, process.stderr]) {
  const originalWrite = stream.write.bind(stream);
  stream.write = (chunk, ...parameters) => {
    fs.appendFileSync(runLog, chunk);
    return originalWrite(chunk, ...parameters);
  };
}
const report = { fixture: context, versions: ["0.0.1", "0.0.2"], steps: [], errors: [], requests: [] };
let server;
let installStarted = false;
let ownershipAcquired = false;
let appProcess;
let latestYaml;
const assetMap = new Map();
function step(name, details = {}) {
  report.steps.push({ name, at: new Date().toISOString(), ...details });
  writeJson(reportPath, report);
  console.log(name);
}
async function commandProcess(executable, processArgs, label, options = {}) {
  const logfile = fs.createWriteStream(path.join(context.outputRoot, label + ".log"), { flags: "a" });
  const child = spawn(executable, processArgs, { cwd: context.projectDir, windowsHide: true,
    env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(logfile, { end: false });
  child.stderr.pipe(logfile, { end: false });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", data => { stdout += data; });
  child.stderr.on("data", data => { stderr += data; });
  try {
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    if (code !== 0) throw Error(`${label} exited ${code}: ${stderr || stdout}`);
    return stdout;
  } finally { logfile.end(); }
}
async function powershell(action) {
  const encoded = Buffer.from(driverSource, "utf16le").toString("base64");
  const output = await commandProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    "powershell-" + action, { env: { CF_UPDATE_QA_CONTEXT: contextPath, CF_UPDATE_QA_ACTION: action } });
  return JSON.parse(output.trim());
}
function events() {
  if (!fs.existsSync(context.eventsPath)) return [];
  return fs.readFileSync(context.eventsPath, "utf8").split(/\r?\n/).filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}
async function waitEvent(name, version, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const records = events();
    const fatal = records.find(record => record.name === "fatal");
    if (fatal) throw Error(fatal.message);
    const match = records.find(record => record.name === name && (!version || record.version === version));
    if (match) return match;
    await delay(150);
  }
  throw Error(`Timed out waiting for ${name} ${version || ""}; inspect events.jsonl.`);
}
function send(action) { writeJson(context.commandPath, { id: crypto.randomUUID(), action }); }

async function main() {
  fs.mkdirSync(context.projectDir, { recursive: true });
  const preflight = await powershell("preflight");
  ownershipAcquired = true;
  step("identity-and-registry-preflight", preflight);
  fs.mkdirSync(context.userData, { recursive: true });
  writeJson(path.join(context.userData, "sentinel.json"), { token: context.sentinelToken, synthetic: true });
  fs.writeFileSync(path.join(context.projectDir, "main.cjs"), fixtureMain, "utf8");
  fs.writeFileSync(path.join(context.projectDir, "pnpm-workspace.yaml"),
    "packages:\n  - '.'\noverrides:\n  'js-yaml@>=4.0.0 <4.3.2': 4.3.2\n", "utf8");
  const packageInfo = { name: context.packageName, version: "0.0.1", private: true,
    description: "Disposable isolated NSIS update QA fixture", author: "CF Compass QA", license: "MIT",
    main: "main.cjs", packageManager: "pnpm@11.19.0", dependencies: { "electron-updater": "6.8.9" } };
  writeJson(path.join(context.projectDir, "package.json"), packageInfo);
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  assert.ok(fs.existsSync(npxCli), "npx-cli.js was not found beside the current Node runtime.");
  await commandProcess(process.execPath, [npxCli, "--yes", "pnpm@11.19.0", "install", "--prod", "--ignore-scripts",
    "--store-dir", path.join(context.outputRoot, "pnpm-store")], "fixture-dependencies",
    { env: { npm_config_cache: path.join(context.outputRoot, "npx-cache") } });
  // Builder invokes pnpm list itself, outside the npx process. Put only this
  // fixture's npx-installed pnpm shim on this process's PATH before loading it.
  const npxPackages = path.join(context.outputRoot, "npx-cache", "_npx");
  const pnpmBin = fs.readdirSync(npxPackages).map(entry => path.join(npxPackages, entry, "node_modules", ".bin"))
    .find(directory => fs.existsSync(path.join(directory, "pnpm.cmd")));
  assert.ok(pnpmBin, "The fixture pnpm executable was not found in its isolated npx cache.");
  process.env.PATH = pnpmBin + path.delimiter + process.env.PATH;
  const { createRequire } = require("node:module");
  const fixtureRequire = createRequire(path.join(context.projectDir, "package.json"));
  const yaml = fixtureRequire(require.resolve("js-yaml", { paths: [fixtureRequire.resolve("electron-updater")] }));
  assert.equal(fixtureRequire(require.resolve("js-yaml/package.json", { paths: [fixtureRequire.resolve("electron-updater")] })).version, "4.3.2");
  step("fixture-dependencies-installed", { electronUpdater: "6.8.9", jsYaml: "4.3.2" });

  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    report.requests.push({ pathname, at: new Date().toISOString() });
    if (pathname === "/good/latest.yml" || pathname === "/bad/latest.yml") {
      const metadata = yaml.load(latestYaml);
      if (pathname.startsWith("/bad/")) {
        const badHash = Buffer.alloc(64, 0).toString("base64");
        metadata.sha512 = badHash;
        metadata.files = metadata.files.map(file => ({ ...file, sha512: badHash }));
      }
      response.writeHead(200, { "Content-Type": "application/yaml", "Cache-Control": "no-store" });
      response.end(yaml.dump(metadata));
      return;
    }
    const asset = assetMap.get(pathname.replace(/^\/(good|bad)\//, ""));
    if (!asset) { response.writeHead(404); response.end("Unknown QA asset"); return; }
    response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": fs.statSync(asset).size });
    fs.createReadStream(asset).pipe(response);
  });
  const previousFeed = reuseBuilds ? new URL(context.feedUrl) : null;
  if (previousFeed) {
    assert.equal(previousFeed.protocol, "http:");
    assert.equal(previousFeed.hostname, "127.0.0.1");
    assert.equal(previousFeed.pathname, "/");
  }
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(previousFeed ? Number(previousFeed.port) : 0, "127.0.0.1", resolve);
  });
  context.feedUrl = `http://127.0.0.1:${server.address().port}/`;
  writeJson(contextPath, context);
  writeJson(path.join(context.projectDir, "run-config.json"), context);
  fs.writeFileSync(path.join(context.projectDir, "marker.nsh"),
    fs.readFileSync(path.join(projectRoot, "build", "nsis-update.nsh"), "utf8"), "utf8");
  const { build, Platform, Arch } = require("electron-builder");
  const electronDist = path.join(path.dirname(require.resolve("electron/package.json")), "dist");
  assert.ok(fs.existsSync(path.join(electronDist, "electron.exe")), "Existing Electron distribution missing.");
  for (const version of report.versions) {
    packageInfo.version = version;
    writeJson(path.join(context.projectDir, "package.json"), packageInfo);
    const versionOutput = path.join(context.outputRoot, "build-" + version);
    if (!reuseBuilds) await build({ projectDir: context.projectDir, targets: Platform.WINDOWS.createTarget("nsis", Arch.x64), publish: "never",
      config: { extends: null, appId: context.appId, productName: context.productName, electronVersion: "43.4.1",
        electronDist, asar: true, npmRebuild: false,
        directories: { output: versionOutput }, files: ["main.cjs", "run-config.json", "package.json"],
        win: { signExecutable: false, publish: { provider: "generic", url: context.feedUrl + "good/" } },
        nsis: { guid: context.guid, artifactName: `${context.productName}-${version}-Windows-x64-Setup.exe`,
          oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true,
          createDesktopShortcut: false, createStartMenuShortcut: false, runAfterFinish: true,
          deleteAppDataOnUninstall: false, include: path.join(context.projectDir, "marker.nsh") } } });
    const installer = path.join(versionOutput, `${context.productName}-${version}-Windows-x64-Setup.exe`);
    assert.ok(fs.existsSync(installer));
    if (reuseBuilds) {
      const asar = require(require.resolve("@electron/asar", { paths: [path.dirname(require.resolve("electron-builder"))] }));
      const archive = path.join(versionOutput, "win-unpacked", "resources", "app.asar");
      const builtConfig = JSON.parse(asar.extractFile(archive, "run-config.json").toString());
      const builtPackage = JSON.parse(asar.extractFile(archive, "package.json").toString());
      assert.equal(builtPackage.version, version);
      assert.equal(builtPackage.name, context.packageName);
      for (const field of ["appId", "guid", "feedUrl", "installRoot", "userData", "sentinelToken"]) assert.equal(builtConfig[field], context[field]);
      assert.equal(asar.extractFile(archive, "main.cjs").toString(), fixtureMain, "Reused fixture code must match the tested entry");
    }
    assetMap.set(path.basename(installer), installer);
    assetMap.set(path.basename(installer) + ".blockmap", installer + ".blockmap");
    if (version === "0.0.1") context.initialInstaller = installer;
    else {
      context.updateInstaller = installer;
      context.updateSha512 = hash(installer);
      const metadataPath = path.join(versionOutput, "latest.yml");
      if (reuseBuilds && !fs.existsSync(metadataPath)) {
        // An interrupted fixture build can have a complete installer but no
        // final sidecar. Reconstruct this loopback-only fixture metadata from
        // the verified installer; production release metadata is never changed.
        fs.writeFileSync(metadataPath, yaml.dump({ version, files: [{ url: path.basename(installer),
          sha512: context.updateSha512, size: fs.statSync(installer).size }],
          path: path.basename(installer), sha512: context.updateSha512, releaseDate: new Date().toISOString() }));
        step("restored-loopback-fixture-metadata", { metadataPath });
      }
      latestYaml = fs.readFileSync(metadataPath, "utf8");
      const metadata = yaml.load(latestYaml);
      assert.equal(metadata.version, version);
      assert.equal(metadata.files.length, 1);
      assert.equal(metadata.files[0].sha512, context.updateSha512);
      assert.equal(metadata.files[0].url, path.basename(installer));
    }
    step((reuseBuilds ? "reused-build-" : "built-") + version, { installer, size: fs.statSync(installer).size });
  }
  writeJson(contextPath, context);
  installStarted = true;
  const installation = await powershell("install");
  assert.ok(installation.registration.some(item => item.hive === "CurrentUser" && item.displayVersion === "0.0.1"));
  assert.ok(installation.registration.every(item => item.hive !== "LocalMachine"));
  step("initial-installation", installation);
  const executable = path.join(context.installRoot, context.productName + ".exe");
  const appLog = fs.createWriteStream(path.join(context.outputRoot, "fixture-app.log"));
  appProcess = spawn(executable, [], { cwd: context.installRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  appProcess.stdout.pipe(appLog, { end: false });
  appProcess.stderr.pipe(appLog, { end: false });
  appProcess.once("exit", () => appLog.end());
  step("old-version-launched", await waitEvent("ready", "0.0.1"));
  send("bad-download");
  step("wrong-sha512-rejected", await waitEvent("bad-sha512-rejected", "0.0.1", 120000));
  assert.equal(events().filter(item => item.name === "update-downloaded").length, 0);
  send("good-download");
  const downloaded = await waitEvent("correct-download-verified", "0.0.1", 120000);
  assert.equal(downloaded.sha512, context.updateSha512);
  assert.ok(inside(downloaded.files[0], context.downloadCache));
  step("correct-download-verified", downloaded);
  send("install");
  step("explicit-quit-and-install", await waitEvent("explicit-install-requested", "0.0.1"));
  const relaunched = await waitEvent("ready", "0.0.2", 150000);
  assert.ok(relaunched.argv.includes("--updated"));
  assert.equal(path.resolve(relaunched.execPath).toLowerCase(), executable.toLowerCase());
  await waitEvent("relaunch-verified", "0.0.2");
  const registration = await powershell("status");
  assert.ok(registration.registration.some(item => item.hive === "CurrentUser" && item.displayVersion === "0.0.2"));
  assert.ok(registration.registration.every(item => item.hive !== "LocalMachine"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(context.userData, "sentinel.json"))).token, context.sentinelToken);
  step("new-version-relaunched-and-data-preserved", { ...relaunched, registration });
}

(async () => {
  try { await main(); }
  catch (error) { report.errors.push({ stage: "run", message: error.stack || error.message }); console.error(error.message); }
  finally {
    if (ownershipAcquired) {
      try {
        if (installStarted) {
          const uninstalled = await powershell("uninstall");
          assert.equal(uninstalled.userDataPreserved, true);
          step("uninstall-preserved-synthetic-user-data", uninstalled);
        }
        step("exact-fixture-cache-cleanup", await powershell("cleanup"));
      } catch (error) { report.errors.push({ stage: "cleanup", message: error.stack || error.message }); }
    }
    if (server) await new Promise(resolve => server.close(resolve));
    report.passed = report.errors.length === 0;
    report.finishedAt = new Date().toISOString();
    writeJson(reportPath, report);
    console.log(JSON.stringify({ passed: report.passed, reportPath, fixture: context, errors: report.errors }, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  }
})();
