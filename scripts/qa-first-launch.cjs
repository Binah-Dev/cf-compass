// Exercise the real first-run workbench without preloading account/cache fixtures.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
if (process.platform === 'linux') {
  // Preserve the browser's native stderr even if it exits before launch resolves.
  process.env.DEBUG = [process.env.DEBUG, 'pw:browser'].filter(Boolean).join(',');
}
const { _electron: electron } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.CF_COMPASS_QA_OUTPUT || path.join(root, '.qa-output', 'first-launch'));
const language = process.env.CF_COMPASS_QA_LANGUAGE || 'en-US';
const savedLanguage = process.env.CF_COMPASS_QA_SAVED_LANGUAGE;
const expectedLanguage = savedLanguage || language;
const launchMode = process.env.CF_COMPASS_QA_LAUNCH_MODE || 'native';
const networkIsolated = process.env.CF_COMPASS_QA_NETWORK_ISOLATED === '1';
const executable = process.env.CF_COMPASS_QA_EXECUTABLE;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-compass-first-launch-'));
const errors = [];
const report = { language, expectedLanguage, launchMode, networkIsolated, passed: false, phase: 'initializing', checks: [], errors };
let app;
let page;
let proxy;

function persistReport() {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}

// Playwright may reject its browser-endpoint promise before electron.launch's
// outer promise settles. Preserve that failure and let the bounded launch/catch
// finish cleanup; the errors array still prevents this run from passing.
process.on('unhandledRejection', error => {
  const message = error?.stack || String(error);
  errors.push(message);
  report.failure = message;
  report.passed = false;
  process.exitCode = 1;
  console.error(message);
  persistReport();
});

const requireCheck = (name, condition, message) => {
  assert.ok(condition, message || name);
  report.checks.push(name);
  persistReport();
};

async function inspectViewport(name) {
  const view = await page.evaluate(() => {
    const selectors = ['.topbar', '.handle-form', '.topbar .primary-button', '.stats-strip', '.workbench-canvas', '#problem-search'];
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      regions: selectors.map(selector => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return { selector, ...(rect ? { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : {}) };
      }),
    };
  });
  requireCheck(`${name}: primary regions fit`, view.regions.every(r => r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.right <= view.width + 1 && r.bottom <= view.height + 1));
  requireCheck(`${name}: no document overflow`, view.scrollWidth <= view.width + 1 && view.scrollHeight <= view.height + 1);
  requireCheck(`${name}: demo label remains visible`, await page.locator('.sync-state.is-demo').isVisible() || await page.locator('.page-heading__demo').isVisible());
  report[name] = view;
  await page.screenshot({ path: path.join(output, `${name}.png`), scale: 'css' });
}

async function main() {
  assert.ok(executable && fs.existsSync(executable), 'Set CF_COMPASS_QA_EXECUTABLE to the desktop executable or final AppImage.');
  fs.mkdirSync(output, { recursive: true });
  if (process.platform === 'linux') {
    // Diagnostic only: a per-application AppArmor profile can allow Electron
    // even when the generic unshare probe is denied. Never weaken host policy.
    const probe = spawnSync('unshare', ['-Ur', 'true'], { encoding: 'utf8', timeout: 5000 });
    const sysctls = {};
    for (const setting of ['kernel/unprivileged_userns_clone', 'kernel/apparmor_restrict_unprivileged_userns', 'user/max_user_namespaces']) {
      try { sysctls[setting] = fs.readFileSync(`/proc/sys/${setting}`, 'utf8').trim(); }
      catch { sysctls[setting] = 'unavailable'; }
    }
    report.linuxHost = { kernel: os.release(), sysctls, userNamespaceProbe: { status: probe.status, error: probe.error?.message, stderr: (probe.stderr || '').slice(-2000) } };
  }
  persistReport();
  if (networkIsolated) {
    const external = Object.values(os.networkInterfaces()).flat().filter(address => address && !address.internal);
    requireCheck('network namespace has no external interfaces', external.length === 0);
  }
  if (savedLanguage) {
    // Only a language preference is staged; no account, cache, or problem data.
    fs.writeFileSync(path.join(userData, 'study.json'), JSON.stringify({ version: 1, settings: { language: savedLanguage } }));
  }
  proxy = http.createServer((request, response) => {
    response.writeHead(503);
    response.end('Offline acceptance test');
  });
  proxy.on('connect', (request, socket) => socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'));
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  const env = { ...process.env, CF_COMPASS_USER_DATA: userData, HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl, NO_PROXY: '127.0.0.1,localhost', NODE_USE_ENV_PROXY: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  if (launchMode === 'fuse') delete env.APPIMAGE_EXTRACT_AND_RUN;
  if (launchMode === 'extract') env.APPIMAGE_EXTRACT_AND_RUN = '1';
  const args = [`--lang=${language}`, `--proxy-server=${proxyUrl}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'];
  if (process.env.CF_COMPASS_QA_SOURCE === '1') args.push(root);
  report.phase = 'launching';
  persistReport();
  const startedAt = Date.now();
  app = await electron.launch({ executablePath: executable, args, cwd: root, env, chromiumSandbox: true, timeout: 30000 });
  report.launchArguments = app.process().spawnargs;
  requireCheck('launch preserves Chromium sandbox', !report.launchArguments.some(argument => /^--(?:no-sandbox|disable-setuid-sandbox)(?:=|$)/.test(argument)));
  app.process().stderr?.on('data', chunk => {
    report.stderrTail = `${report.stderrTail || ''}${chunk}`.slice(-16000);
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.context().setOffline(true);
  await page.waitForSelector('.problem-row', { timeout: Math.max(1, 30000 - (Date.now() - startedAt)) });
  await page.waitForFunction(expected => document.documentElement.lang === expected, expectedLanguage, { timeout: Math.max(1, 30000 - (Date.now() - startedAt)) });
  report.readyMs = Date.now() - startedAt;
  const native = await app.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed());
    return { visible: window?.isVisible(), contentSize: window?.getContentSize(), appPath: app.getAppPath(), appDir: process.env.APPDIR || '', version: app.getVersion(), arguments: process.argv, sandboxDisabled: app.commandLine.hasSwitch('no-sandbox') || app.commandLine.hasSwitch('disable-setuid-sandbox') };
  });
  report.native = native;
  report.phase = 'exercising-workbench';
  requireCheck('application does not disable Chromium sandbox', !native.sandboxDisabled);
  requireCheck('visible main window within 30 seconds', native.visible && report.readyMs < 30000);
  if (launchMode === 'fuse') requireCheck('normal AppImage mount used', /\/\.mount_[^/]+\//.test(`${native.appPath}/`));
  if (launchMode === 'extract') requireCheck('AppImage extraction used', Boolean(native.appDir) && !/\/\.mount_/.test(native.appDir));
  requireCheck('workbench is first page', await page.locator('.problem-workspace').isVisible());
  requireCheck('demo mode is explicit', await page.locator('.sync-state.is-demo').isVisible());
  requireCheck('built-in demo identity only', await page.getByRole('textbox', { name: 'Codeforces Handle', exact: true }).inputValue() === 'compass_demo');
  const sourceNote = await page.locator('.stats-strip__note').innerText();
  requireCheck('demo statistics have an accurate source label', sourceNote.includes(expectedLanguage === 'en-US' ? 'Built-in demo data' : '内置演示数据'));
  requireCheck('sync control is available', await page.locator('.topbar .primary-button').isEnabled());
  requireCheck('no blocking dialog', await page.locator('[role="dialog"]:visible').count() === 0);
  await inspectViewport('first-launch');

  const search = page.locator('#problem-search');
  await search.fill('Watermelon');
  await page.waitForFunction(() => document.querySelectorAll('.problem-row').length === 1 && document.querySelector('.problem-name')?.textContent.includes('Watermelon'));
  const favorite = page.locator('.problem-row .favorite-button');
  await favorite.click();
  await page.waitForFunction(() => document.querySelector('.favorite-button')?.classList.contains('is-active'));
  await favorite.click();
  await page.waitForFunction(() => !document.querySelector('.favorite-button')?.classList.contains('is-active'));
  report.checks.push('offline search and favorite round trip');
  await search.fill('no-matching-problem-for-first-launch-qa');
  await page.locator('.problem-table .empty-state').waitFor();
  await search.fill('');
  await page.locator('.problem-row').first().waitFor();
  report.checks.push('empty search result recovers after clearing');

  const centerLabel = expectedLanguage === 'en-US' ? 'Data Center' : '数据中心';
  const libraryLabel = expectedLanguage === 'en-US' ? 'Problemset' : '题库';
  await page.getByRole('button', { name: centerLabel, exact: true }).click();
  await page.locator('.data-center').waitFor();
  await page.getByRole('button', { name: libraryLabel, exact: true }).click();
  await page.locator('.problem-row').first().waitFor();
  report.checks.push('navigation returns to the workbench offline');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 700));
  await page.waitForFunction(() => innerWidth === 1040 && innerHeight === 700);
  // The frame layout is debounced after resize.
  await page.waitForTimeout(350);
  await inspectViewport('minimum-window');
  requireCheck('no renderer exceptions', errors.length === 0, errors.join('\n'));
  report.passed = true;
  report.phase = 'complete';
}

main().catch(async error => {
  report.passed = false;
  report.phase = 'failed';
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, 'failure.png'), scale: 'css' }).catch(() => {});
}).finally(async () => {
  await app?.close().catch(() => {});
  await new Promise(resolve => proxy ? proxy.close(resolve) : resolve());
  persistReport();
  console.log(JSON.stringify(report, null, 2));
});
