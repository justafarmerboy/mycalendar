import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as X from '../wearos/tools/expr.mjs';
import { faceState, LUNAR_KEYS } from '../watchface/shared/sky.js';

// Evaluates a Watch Face Format expression the way the watch would, with the watch's data sources
const FN = {
  round: Math.round, floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, abs: Math.abs,
  rad: (d) => (d * Math.PI) / 180, clamp: (v, a, b) => Math.min(Math.max(v, a), b), subText: (s, a, b) => s.substring(a, b),
};
function wff(expr, utc, offsetSec) {
  const js = expr.replace(/\[([A-Z0-9_]+)\]/g, 'S.$1');
  const secs = Math.floor(utc / 1000);
  const local = new Date((secs + offsetSec) * 1000);
  const S = {
    UTC_TIMESTAMP: utc, SECONDS_SINCE_EPOCH: secs,
    SECONDS_IN_DAY: local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds(),
    DAY_OF_WEEK: local.getUTCDay() + 1, DAY: local.getUTCDate(), MONTH: local.getUTCMonth() + 1, YEAR: local.getUTCFullYear(),
  };
  return new Function('S', ...Object.keys(FN), `return (${js});`)(S, ...Object.values(FN));
}

const BKK = 7 * 3600;
const circ = (a, b, n) => Math.min(((a - b) % n + n) % n, ((b - a) % n + n) % n);

test('watch expressions agree with the web astronomy over two years (Bangkok)', () => {
  let n = 0, lunarOk = 0, seasonOk = 0;
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 13 * 3600000 + 17 * 60000) {
    const f = faceState(t, BKK * 1000);
    n++;
    assert.ok(circ(wff(X.EARTH_FRAME, t, BKK), f.earthFrame, 36) <= 1, `earth ${new Date(t).toISOString()}`);
    assert.ok(circ(wff(X.MOON_FRAME, t, BKK), f.moonFrame, 30) <= 1, `moon ${new Date(t).toISOString()}`);
    const key = wff(X.LUNAR_NEW, t, BKK) ? 'k15'
      : wff(X.LUNAR_WAXING, t, BKK) ? 'w' + String(wff(X.WAX_DAY, t, BKK)).padStart(2, '0') : 'k' + String(wff(X.WANE_DAY, t, BKK)).padStart(2, '0');
    assert.ok(LUNAR_KEYS.includes(key));
    if (key === f.lunarKey) lunarOk++;
    const days = wff(X.SEASON_DAYS, t, BKK);
    const expect = f.season.startsWith('อีก') ? Number(f.season.split(' ')[1]) : 0;
    if (days === expect) seasonOk++;
    assert.ok(Math.abs(days - expect) <= 1, `season days ${days} vs ${f.season} at ${new Date(t).toISOString()}`);
  }
  // the shortened formulas may land on the neighbouring day near midnight, rarely
  assert.ok(lunarOk / n > 0.97, `lunar day matches ${lunarOk}/${n}`);
  assert.ok(seasonOk / n > 0.98, `season countdown matches ${seasonOk}/${n}`);
});

test('watch text: date, Moon line and season line for 26 Oct 2026 (ออกพรรษา)', () => {
  const t = Date.UTC(2026, 9, 26, 5, 0);
  const pick = (list, i) => wff(X.pick(list, i), t, BKK);
  assert.equal(pick(['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'], '([DAY_OF_WEEK] - 1)'), 'จ.');
  assert.equal(wff(X.LUNAR_NEW, t, BKK), false);
  assert.equal(wff(X.LUNAR_WAXING, t, BKK), true);
  assert.equal(wff(X.WAX_DAY, t, BKK), 15);
  assert.equal(wff(X.PHASE, t, BKK), 4); // จันทร์เพ็ญ
  assert.equal(wff(X.SEASON_EVENT, t, BKK), 3); // เหมายัน
  assert.equal(wff(X.SEASON_DAYS, t, BKK), 57);
});

test('watch face XML is well formed and every image it uses exists', () => {
  const xml = fs.readFileSync(new URL('../wearos/src/main/res/raw/watchface.xml', import.meta.url), 'utf8');
  assert.match(xml, /^<\?xml/);
  const used = new Set([...xml.matchAll(/resource="([a-z0-9_]+)"/g)].map((m) => m[1]));
  assert.ok(used.size > 60);
  for (const name of used) {
    assert.ok(fs.existsSync(new URL(`../wearos/src/main/res/drawable-nodpi/${name}.png`, import.meta.url)), name);
  }
});
