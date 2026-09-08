const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { makeFixture } = require('./fixtures/contest-sessions.cjs');
const { waitUntil } = require('./qa-wait.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright', `appearance-${Date.now()}`);
const userData = path.join(output, 'user-data');
fs.mkdirSync(userData, { recursive: true });
const fixture = makeFixture();
Object.assign(fixture.study.settings, { language: 'zh-CN', themeVersion: 7, panelOpacity: 72, autoSync: false });
if (process.env.CF_COMPASS_QA_WALLPAPER) {
  const filename = `custom-wallpaper${path.extname(process.env.CF_COMPASS_QA_WALLPAPER)}`;
  fs.copyFileSync(process.env.CF_COMPASS_QA_WALLPAPER, path.join(userData, filename));
  fs.writeFileSync(path.join(userData, 'custom-wallpaper.json'), JSON.stringify({ filename, name: 'Local preview copy', mediaType: 'image' }));
  Object.assign(fixture.study.settings, { wallpaperEnabled: true, wallpaperId: 'custom', wallpaperFit: 'cover' });
}
for (const [name, value] of [['cache', fixture.cache], ['study', fixture.study]]) fs.writeFileSync(path.join(userData, `${name}.json`), JSON.stringify(value));
let app, page; const errors = [], checks = [];
async function launch() {
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: userData } });
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForSelector('.workbench-move');
  if (process.env.CF_COMPASS_QA_TRACE_SAVES) await app.evaluate(({ ipcMain }) => {
    globalThis.appearanceSaveTrace = [];
    const handler = ipcMain._invokeHandlers.get('study:set');
    ipcMain.removeHandler('study:set');
    ipcMain.handle('study:set', async (event, data) => {
      globalThis.appearanceSaveTrace.push({ phase: 'request', theme: data.settings?.accentTheme, at: Date.now() });
      const result = await handler(event, data);
      globalThis.appearanceSaveTrace.push({ phase: 'saved', theme: result.settings?.accentTheme, at: Date.now() });
      return result;
    });
  });
}
const stored = () => page.evaluate(() => window.cfBridge.getStudyData());
const open = () => page.getByRole('button', { name: '外观设置', exact: true }).click();
const number = name => page.getByRole('spinbutton', { name: `${name}数值`, exact: true });
async function alpha(selector) {
  return page.locator(selector).first().evaluate(el => {
    const color = getComputedStyle(el).backgroundColor;
    return color.startsWith('rgba') ? Number(color.match(/[\d.]+/g)[3]) : 1;
  });
}
(async () => {
  await launch(); await open();
  assert.equal(await number('面板透明度').inputValue(), '28');
  for (const value of [0, 50, 100]) {
    await number('面板透明度').fill(String(value));
    for (const selector of ['.draggable-panel', '.stats-strip', '.app-rail', '.workbench-panel-content > .problem-workspace']) {
      assert.equal(await alpha(selector), selector.includes('problem-workspace') ? 0 : (100 - value) / 100, selector);
    }
    if (value === 100) {
      assert.equal(await alpha('.draggable-panel'), 0);
      const style = await page.locator('.draggable-panel').first().evaluate(el => ({ opacity: getComputedStyle(el).opacity, blur: getComputedStyle(el).backdropFilter }));
      assert.equal(style.opacity, '1'); assert.equal(style.blur, 'blur(0px)');
    }
  }
  assert.equal((await stored()).settings.panelOpacity, 72, 'preview must not persist');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await alpha('.draggable-panel'), .72);
  checks.push('0/50/100 transparency, hover, wrapper, text opacity, cancel, no preview writes');
  await open();
  await page.getByRole('button', { name: /大厅展示/ }).click();
  assert.equal(await number('面板透明度').inputValue(), '100');
  assert.equal(await number('面板磨砂').inputValue(), '0');
  await page.getByRole('button', { name: '记住当前方案' }).click();
  await page.getByRole('button', { name: /专注刷题/ }).click();
  assert.equal(await number('面板透明度').inputValue(), '10');
  await page.getByRole('button', { name: '使用我的方案' }).click();
  assert.equal(await number('面板透明度').inputValue(), '100');
  await page.screenshot({ path: path.join(output, 'controls.png') });
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.locator('.draggable-panel').first().hover();
  assert.equal(await alpha('.draggable-panel'), 0, 'hover must not restore an opaque backing');
  await waitUntil(stored, study => study.settings.panelOpacity === 0);
  assert.equal((await stored()).settings.panelOpacity, 0);
  assert.equal((await stored()).settings.customVisibilityPreset.panelOpacity, 0);
  await page.screenshot({ path: path.join(output, 'transparent.png') });
  const surfaces = await page.locator('.app-content *').evaluateAll(els => els.filter(el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 100 && r.height > 32 && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
  }).map(el => ({ class: el.className, background: getComputedStyle(el).backgroundColor })));
  fs.writeFileSync(path.join(output, 'surfaces.json'), JSON.stringify(surfaces, null, 2));
  await app.close(); app = null; await launch();
  assert.equal((await stored()).settings.panelOpacity, 0);
  await open(); assert.equal(await number('面板透明度').inputValue(), '100');
  await page.getByRole('button', { name: /大厅平衡/ }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.appearance-drawer').count(), 0);
  assert.equal((await stored()).settings.panelOpacity, 0);
  assert.equal(await page.locator('.workbench-layer-menu, .workbench-layer-picker').count(), 0);
  checks.push('distinct presets, saved custom preset, cold-start persistence, Esc rollback, no panel menu');
  const pageSurfaces = {};
  for (const [name, selector] of [
    ['今日训练', '.today-page'], ['计划题单', '.study-plan-page'],
    ['复习库', '.review-library'], ['训练分析', '.training-analytics'],
    ['赛事复盘', '.contest-replay-page'], ['赛事中心', '.contest-center-page'],
    ['模板库', '.template-library-page'], ['数据中心', '.data-center'],
  ]) {
    const nav = page.locator('.app-rail').getByRole('button', { name, exact: true });
    assert.equal(await nav.count(), 1, `${name} navigation must be available`);
    await nav.click(); await page.waitForSelector(selector); await page.waitForTimeout(400);
    pageSurfaces[name] = await page.locator('.app-content *').evaluateAll(els => els.filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el), c = s.backgroundColor.match(/[\d.]+/g);
      return r.width > 150 && r.height > 32 && (s.backgroundImage !== 'none' || (c && (c.length === 3 || Number(c[3]) > 0)));
    }).map(el => ({ tag: el.tagName, class: el.className, background: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage })));
  }
  fs.writeFileSync(path.join(output, 'page-surfaces.json'), JSON.stringify(pageSurfaces, null, 2));
  for (const [name, surfaces] of Object.entries(pageSurfaces)) {
    assert.deepEqual(surfaces.filter(s => !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(s.tag)), [], `${name}: panels must be clear`);
  }
  await page.locator('.app-rail').getByRole('button', { name: '题库', exact: true }).click();
  for (const [name, file] of [['大厅平衡', 'balanced'], ['专注刷题', 'focus'], ['大厅展示', 'showcase']]) {
    await open(); await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, `${file}.png`) });
  }
  const ratingColors = () => page.locator('.rating').evaluateAll(els => els.map(el => getComputedStyle(el).color));
  const baselineRatingColors = await ratingColors();
  const accents = [];
  for (const [id, name] of [['sky', '天空蓝'], ['mint', '薄荷绿'], ['coral', '珊瑚粉']]) {
    await open();
    await page.getByRole('button', { name: /大厅平衡/ }).click();
    const appearanceBefore = await page.locator('.app-shell').evaluate(el => ({
      opacity: el.style.getPropertyValue('--panel-opacity'), brightness: el.style.getPropertyValue('--wallpaper-brightness'),
    }));
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
    const appearanceAfter = await page.locator('.app-shell').evaluate(el => ({
      opacity: el.style.getPropertyValue('--panel-opacity'), brightness: el.style.getPropertyValue('--wallpaper-brightness'),
    }));
    assert.deepEqual(appearanceAfter, appearanceBefore, 'theme must not change transparency or brightness');
    await page.screenshot({ path: path.join(output, `theme-${id}-picker.png`) });
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await waitUntil(stored, study => study.settings.accentTheme === id);
    assert.equal((await stored()).settings.accentTheme, id);
    assert.deepEqual(await ratingColors(), baselineRatingColors, 'CF rating colors must remain semantic');
    accents.push(await page.locator('.app-shell').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim()));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, `theme-${id}.png`) });
    await open(); await number('面板透明度').fill('100');
    assert.equal(await alpha('.draggable-panel'), 0, `${id} still supports full transparency`);
    await page.getByRole('button', { name: '取消', exact: true }).click();
  }
  assert.equal(new Set(accents).size, 3);
  checks.push('three theme palettes, selected state, persisted choice, unchanged CF rating colors, unchanged appearance controls, full transparency per theme');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ output, checks, errors }));
})().catch(async error => { console.error(error); if(app) { const trace = await app.evaluate(() => globalThis.appearanceSaveTrace); fs.writeFileSync(path.join(output, 'save-failure.json'), JSON.stringify({ error: error.message, trace }, null, 2)); console.error(JSON.stringify(trace)); } process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
