const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { makeFixture } = require('./fixtures/contest-sessions.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright', `titlebar-${Date.now()}`);
const profile = path.join(output, 'user-data');
fs.mkdirSync(profile, { recursive: true });
const fixture = makeFixture();
Object.assign(fixture.study.settings, { language: 'zh-CN', themeVersion: 7, autoSync: false });
if (process.env.CF_COMPASS_QA_WALLPAPER) {
  const filename = `custom-wallpaper${path.extname(process.env.CF_COMPASS_QA_WALLPAPER)}`;
  fs.copyFileSync(process.env.CF_COMPASS_QA_WALLPAPER, path.join(profile, filename));
  fs.writeFileSync(path.join(profile, 'custom-wallpaper.json'), JSON.stringify({ filename, name: 'Local test copy', mediaType: 'image' }));
  Object.assign(fixture.study.settings, { wallpaperEnabled: true, wallpaperId: 'custom', wallpaperFit: 'cover' });
}
for (const name of ['cache', 'study']) fs.writeFileSync(path.join(profile, `${name}.json`), JSON.stringify(fixture[name]));
let app;
(async () => {
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: profile } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.titlebar');
  if (process.env.CF_COMPASS_QA_WALLPAPER) {
    await page.waitForFunction(() => [...document.querySelectorAll('img.app-wallpaper--image')].some(el => el.complete && el.naturalWidth > 0));
    const geometry = await page.locator('.app-wallpaper--image').first().evaluate(el => {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { top: rect.top, bottom: rect.bottom, inset: style.top, height: style.height, viewport: innerHeight };
    });
    assert.equal(geometry.inset, '0px');
    assert.equal(Number.parseFloat(geometry.height), geometry.viewport);
    assert.ok(geometry.top <= 0 && geometry.bottom >= geometry.viewport, 'wallpaper must cover the titlebar, not begin below it');
  }
  const results = [];
  for (const theme of ['sky', 'mint', 'coral']) {
    for (const opacity of [0, .5, 1]) {
      // Exercise the shared CSS tokens without writing the real user profile.
      await page.locator('.app-shell').evaluate((el, { theme, opacity }) => {
        el.classList.remove('accent-sky', 'accent-mint', 'accent-coral');
        el.classList.add(`accent-${theme}`);
        el.style.setProperty('--panel-opacity', opacity);
      }, { theme, opacity });
      const styles = await page.locator('.titlebar').evaluate(el => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, shadow: s.boxShadow, blur: s.backdropFilter,
          decoration: getComputedStyle(el, '::after').content,
          drag: getComputedStyle(el.querySelector('.titlebar__drag')).getPropertyValue('-webkit-app-region') };
      });
      results.push({ theme, opacity, ...styles });
    }
  }
  fs.writeFileSync(path.join(output, 'styles.json'), JSON.stringify(results, null, 2));
  for (const result of results) {
    const colors = { sky: '8, 23, 39', mint: '10, 27, 28', coral: '28, 19, 32' };
    assert.equal(result.background, `rgba(${colors[result.theme]}, 0.86)`);
    assert.equal(result.shadow, 'none');
    assert.equal(result.blur, 'none');
    assert.equal(result.decoration, 'none');
    assert.equal(result.drag, 'drag');
  }
  const maximize = page.getByRole('button', { name: '最大化', exact: true });
  await maximize.focus();
  assert.equal(await maximize.evaluate(el => getComputedStyle(el).outlineOffset), '-3px');
  await maximize.click();
  await page.waitForTimeout(300);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()), true);
  await maximize.click();
  await page.waitForTimeout(300);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()), false);
  for (const width of [1500, 1040]) {
    await page.setViewportSize({ width, height: 900 });
    const enterButton = page.getByRole('button', { name: '沉浸大厅', exact: true });
    assert.equal(await enterButton.count(), 1);
    assert.equal(await enterButton.locator('span').evaluate(el => getComputedStyle(el).display === 'none'), width <= 1420);
    for (const exit of ['keyboard', 'button']) {
    await page.getByRole('button', { name: '沉浸大厅', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.titlebar')).visibility === 'hidden');
    const hidden = await page.locator('.titlebar').evaluate(el => ({ opacity: getComputedStyle(el).opacity,
      pointer: getComputedStyle(el).pointerEvents, inert: el.inert,
      drag: getComputedStyle(el.querySelector('.titlebar__drag')).getPropertyValue('-webkit-app-region') }));
    assert.deepEqual(hidden, { opacity: '0', pointer: 'none', inert: true, drag: 'no-drag' });
    assert.equal(await page.locator('.app-rail').evaluate(el => getComputedStyle(el).opacity), '0');
    const exitButton = page.getByRole('button', { name: '退出沉浸模式', exact: true });
    await exitButton.waitFor();
    if (exit === 'keyboard') await page.keyboard.press('Escape');
    else await exitButton.click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.titlebar')).opacity === '1');
    assert.equal(await page.locator('.titlebar').evaluate(el => el.inert), false);
    assert.equal(await maximize.isVisible(), true);
    assert.equal(await enterButton.isVisible(), true);
    }
  }
  const screenshot = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(path.join(output, 'titlebar.png'), Buffer.from(screenshot, 'base64'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, output, states: results.length, errors }));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
