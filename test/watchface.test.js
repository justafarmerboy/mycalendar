import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { faceState, statsText } from '../watchface/shared/sky.js';
import { TEXT_W } from '../watchface/shared/text-images.js';

const BKK = 7 * 3600000;
const at = (iso) => new Date(iso).getTime();

test('watch face keeps an identical copy of js/astro.js', () => {
  const web = fs.readFileSync(new URL('../js/astro.js', import.meta.url), 'utf8');
  const watch = fs.readFileSync(new URL('../watchface/shared/astro.js', import.meta.url), 'utf8');
  assert.equal(watch.split('\n').slice(1).join('\n'), web);
});

test('face on the full moon of ออกพรรษา, 26 Oct 2026, Bangkok', () => {
  const f = faceState(at('2026-10-26T05:00Z'), BKK);
  assert.equal(f.date, 'จ. 26 ต.ค. 2569');
  assert.equal(f.moon, 'ขึ้น 15 ค่ำ · จันทร์เพ็ญ');
  assert.equal(f.moonFrame, 15); // full moon image
  assert.equal(f.season, 'อีก 57 วัน ถึงเหมายัน'); // 22 Dec in Bangkok
});

test('face on the December solstice (22 Dec, Bangkok time) shows the time of the event', () => {
  const f = faceState(at('2026-12-22T00:00Z'), BKK);
  assert.match(f.season, /^เหมายัน เวลา 03:[45]\d น\.$/);
  assert.equal(f.earthFrame, 27); // Sun at 270 degrees: north pole tilted away from the Sun
});

test('Moon sits behind the Earth around last quarter and in front around first quarter', () => {
  assert.equal(faceState(at('2026-10-19T12:00Z'), BKK).moonFront, true);
  assert.equal(faceState(at('2026-11-02T12:00Z'), BKK).moonFront, false);
});

test('stats line', () => {
  assert.equal(statsText(72, 12345, 80), 'HR 72   12,345 ก้าว   80%');
  assert.equal(statsText(0, 0, 55), 'HR --   0 ก้าว   55%');
});

// Runs the real watch face code against a small fake of the watch's hmUI/hmSensor/timer globals
test('watch face builds and fills its widgets', async () => {
  const widgets = [];
  const timers = [];
  const sensor = (fields) => ({ ...fields, addEventListener() {} });
  const now = new Date('2026-11-19T01:30:00Z'), local = new Date(now.getTime() + BKK);
  globalThis.hmUI = {
    widget: { IMG: 'IMG', IMG_TIME: 'IMG_TIME', TEXT: 'TEXT', WIDGET_DELEGATE: 'DELEGATE' },
    show_level: { ONLY_NORMAL: 1, ONAL_AOD: 2 },
    align: { LEFT: 0, CENTER_H: 1, CENTER_V: 2 },
    text_style: { ELLIPSIS: 1 },
    prop: { MORE: 'more', SRC: 'src', VISIBLE: 'visible' },
    createWidget(type, opts) {
      const w = { type, opts: { ...opts }, setProperty(k, v) { if (k === 'more') Object.assign(this.opts, v); else this.opts[k] = v; } };
      widgets.push(w);
      return w;
    },
  };
  globalThis.hmSensor = {
    id: { TIME: 'TIME', BATTERY: 'BATTERY', STEP: 'STEP', HEART: 'HEART' },
    event: { CHANGE: 'change' },
    createSensor: (id) => ({
      TIME: sensor({ utc: now.getTime(), year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes(), second: 0 }),
      BATTERY: sensor({ current: 80 }), STEP: sensor({ current: 5230 }), HEART: sensor({ last: 72 }),
    })[id],
  };
  globalThis.timer = { createTimer: (delay, repeat, cb) => timers.push({ delay, repeat, cb }), stopTimer() {} };
  let face;
  globalThis.WatchFace = (def) => { face = def; };
  await import('../watchface/watchface/index.js');
  face.build();

  const texts = widgets.filter((w) => w.type === 'TEXT').map((w) => w.opts.text);
  assert.deepEqual(texts, ['พฤ. 19 พ.ย. 2569', 'อีก 33 วัน ถึงเหมายัน', 'HR 72   5,230 ก้าว   80%']);
  // the Moon line comes from images, centred on the screen
  const [lunar, phase] = widgets.filter((w) => /\/(lunar|phase)\//.test(w.opts.src));
  assert.equal(lunar.opts.src, 'images/lunar/w10.png');
  assert.equal(phase.opts.src, 'images/phase/p3.png');
  const right = phase.opts.x + TEXT_W['phase/p3'];
  assert.ok(Math.abs(lunar.opts.x + right - 480) <= 1, `${lunar.opts.x} .. ${right}`);
  // no text the watch font cannot draw: a tone mark right after an upper vowel or sara am
  for (const t of texts) assert.doesNotMatch(t, /[\u0e31\u0e34-\u0e37][\u0e48-\u0e4b]|[\u0e48-\u0e4b]\u0e33/, t);
  const earth = widgets[2];
  assert.match(earth.opts.src, /^images\/earth\/e\d\d\.png$/);
  assert.ok(fs.existsSync(new URL(`../watchface/assets/trex3/${earth.opts.src}`, import.meta.url)));
  const moons = [widgets[1], widgets[3]].filter((w) => w.opts.visible);
  assert.equal(moons.length, 1);
  assert.ok(fs.existsSync(new URL(`../watchface/assets/trex3/${moons[0].opts.src}`, import.meta.url)));
  assert.equal(timers.at(-1).repeat, 60000);
});
