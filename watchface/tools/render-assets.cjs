// Renders the watch face images (Earth, Moon, background, digits, preview) with headless Chromium.
// Usage: node watchface/tools/render-assets.cjs
// Output: watchface/assets/trex3/images/ and watchface/shared/text-images.js (widths of the text images)
// Font: Sarabun Bold (SIL Open Font License, tools/fonts/OFL.txt)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/trex3/images');
const FONTS = path.join(__dirname, 'fonts');

const save = (rel, dataUrl) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
};
const pad2 = (n) => String(n).padStart(2, '0');

(async () => {
  const { LAYOUT } = await import(path.join(ROOT, 'shared/layout.js'));
  const sky = await import(path.join(ROOT, 'shared/sky.js'));
  const land = fs.readFileSync(path.join(ROOT, '../js/land.js'), 'utf8').replace('export const LAND_B64', 'window.LAND_B64');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  // the full font (not a web subset), which keeps the rules that place Thai tone marks
  const fontCss = `@font-face { font-family: Sarabun; font-weight: 700;
    src: url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, 'Sarabun_700Bold.ttf')).toString('base64')}); }`;
  await page.setContent(`<style>${fontCss} body { font-family: Sarabun; }</style><p style="font-weight:700">ปฏิทินฟ้า 0123456789</p>`);
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: `window.LAYOUT = ${JSON.stringify(LAYOUT)};\n${land}` });
  await page.addScriptTag({ path: path.join(__dirname, 'draw.js') });

  save('bg.png', await page.evaluate(() => renderBg()));
  for (let i = 0; i < sky.EARTH_FRAMES; i++) {
    save(`earth/e${pad2(i)}.png`, await page.evaluate((lon) => renderEarth(lon), (i * 360) / sky.EARTH_FRAMES));
  }
  for (let i = 0; i < sky.MOON_FRAMES; i++) {
    save(`moon/m${pad2(i)}.png`, await page.evaluate(([e, s]) => renderMoon(e, s), [(i * 360) / sky.MOON_FRAMES, LAYOUT.moonImg]));
  }
  for (let d = 0; d <= 9; d++) {
    save(`digits/${d}.png`, await page.evaluate(([ch, l]) => renderGlyph(ch, l.digitW, l.digitH, l.digitSize, '#e6ebf5'), [String(d), LAYOUT]));
  }
  // the Moon line (lunar day + phase name) as images, with their widths for centring on the watch
  const widths = {};
  // drawn as HTML and captured: Chromium's canvas text loses Thai tone marks stacked on upper vowels
  const H = LAYOUT.textImgH;
  const tp = await browser.newPage();
  await tp.setContent(`<style>${fontCss} body { margin: 0; background: transparent; }
    span { display: inline-block; font: 700 26px Sarabun; color: #e6ebf5; line-height: ${H}px; height: ${H}px; padding: 0 2px; white-space: nowrap; }</style><span id="t"></span>`);
  await tp.evaluate(() => document.fonts.ready);
  const text = async (rel, s) => {
    await tp.evaluate((s) => { document.getElementById('t').textContent = s; }, s);
    const el = await tp.$('#t');
    const file = path.join(OUT, rel + '.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await el.screenshot({ path: file, omitBackground: true });
    widths[rel] = Math.round((await el.boundingBox()).width);
  };
  for (const key of sky.LUNAR_KEYS) await text(`lunar/${key}`, sky.lunarText(key));
  for (const [i, name] of sky.PHASE_NAMES.entries()) await text(`phase/p${i}`, '· ' + name);
  fs.writeFileSync(path.join(ROOT, 'shared/text-images.js'),
    '// Widths in px of the text images in assets/trex3/images, written by tools/render-assets.cjs\n'
    + `export const TEXT_W = ${JSON.stringify(widths, null, 2)};\n`);
  save('digits/colon.png', await page.evaluate((l) => renderGlyph(':', l.colonW, l.digitH, l.digitSize, '#f5b942'), LAYOUT));

  // Preview: the face as it looks now in Bangkok, composed from the images above
  const now = Date.now(), f = sky.faceState(now, 7 * 3600000);
  const t = new Date(now + 7 * 3600000);
  const time = pad2(t.getUTCHours()) + pad2(t.getUTCMinutes());
  const preview = await page.evaluate(async ({ f, time, l, stats, out }) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const c = document.createElement('canvas'); c.width = c.height = 480;
    const ctx = c.getContext('2d');
    ctx.beginPath(); ctx.arc(240, 240, 240, 0, Math.PI * 2); ctx.clip();
    const get = (rel) => load('data:image/png;base64,' + out[rel]);
    ctx.drawImage(await get('bg.png'), 0, 0);
    const moon = await get(`moon/m${String(f.moonFrame).padStart(2, '0')}.png`);
    if (!f.moonFront) ctx.drawImage(moon, f.moonX, f.moonY);
    ctx.drawImage(await get(`earth/e${String(f.earthFrame).padStart(2, '0')}.png`), l.cx - l.earthImg / 2, l.cy - l.earthImg / 2);
    if (f.moonFront) ctx.drawImage(moon, f.moonX, f.moonY);
    let x = l.cx - (4 * l.digitW + l.colonW) / 2;
    for (const [i, ch] of [...time].entries()) {
      ctx.drawImage(await get(`digits/${ch}.png`), x, l.timeY); x += l.digitW;
      if (i === 1) { ctx.drawImage(await get('digits/colon.png'), x, l.timeY); x += l.colonW; }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const line = (s, y, size, color) => { ctx.font = `700 ${size}px Sarabun, sans-serif`; ctx.fillStyle = color; ctx.fillText(s, 240, y + (l.lineH + 4) / 2); };
    line(f.date, l.dateY, 28, '#cfd6e4');
    const lunar = await get(`lunar/${f.lunarKey}.png`), phase = await get(`phase/p${f.phaseIndex}.png`);
    const lx = 240 - (lunar.width + 6 + phase.width) / 2;
    ctx.drawImage(lunar, lx, l.textImgY); ctx.drawImage(phase, lx + lunar.width + 6, l.textImgY);
    line(f.season, l.lineY[1], 26, '#f5b942');
    line(stats, l.lineY[2], 24, '#8f9bb5');
    return c.toDataURL('image/png');
  }, { f, time, l: LAYOUT, stats: sky.statsText(72, 5230, 80), out: readAll() });
  save('preview.png', preview);
  console.log('preview state', f);
  await browser.close();
})();

function readAll() {
  const out = {};
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.png') && name !== 'preview.png') out[path.relative(OUT, p)] = fs.readFileSync(p).toString('base64');
    }
  };
  walk(OUT);
  return out;
}
