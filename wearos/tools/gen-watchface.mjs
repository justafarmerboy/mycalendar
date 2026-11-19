// Writes the Wear OS (Watch Face Format) watch face: res/raw/watchface.xml plus its images.
// Same design and images as the Amazfit face in ../watchface; the watch works out the season,
// Moon phase and Thai lunar day itself from the expressions in expr.mjs.
// Usage: node wearos/tools/gen-watchface.mjs   (after node watchface/tools/render-assets.cjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as X from './expr.mjs';
import { LAYOUT as L } from '../../watchface/shared/layout.js';
import { PHASE_NAMES } from '../../watchface/shared/sky.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RES = path.join(HERE, '../src/main/res');
const ASSETS = path.join(HERE, '../../watchface/assets/trex3/images');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad2 = (n) => String(n).padStart(2, '0');

// images: same files as the Amazfit face, renamed to Android resource names
fs.rmSync(path.join(RES, 'drawable-nodpi'), { recursive: true, force: true });
fs.mkdirSync(path.join(RES, 'drawable-nodpi'), { recursive: true });
const copy = (from, to) => fs.copyFileSync(path.join(ASSETS, from), path.join(RES, 'drawable-nodpi', to + '.png'));
copy('bg.png', 'bg');
copy('preview.png', 'preview');
for (let i = 0; i < 36; i++) copy(`earth/e${pad2(i)}.png`, `earth_${pad2(i)}`);
for (let i = 0; i < 30; i++) copy(`moon/m${pad2(i)}.png`, `moon_${pad2(i)}`);

const image = (name, x, y, w, h, extra = '') =>
  `<PartImage x="${x}" y="${y}" width="${w}" height="${h}" name="${name}">${extra}<Image resource="${name}"/></PartImage>`;

// a Condition that shows image `prefix_NN` for the angle `expr` (degrees 0..360), `count` images per turn.
// Compares are tried in order, so each only needs an upper bound: angle < step*(i + 0.5)
function frames(prefix, count, expr, x, y, size) {
  const step = 360 / count, exprs = [], compares = [];
  for (let i = 0; i < count; i++) {
    exprs.push(`<Expression name="${prefix}${i}"><![CDATA[${expr} < ${step * (i + 0.5)}]]></Expression>`);
    compares.push(`<Compare expression="${prefix}${i}">${image(`${prefix}_${pad2(i)}`, x, y, size, size)}</Compare>`);
  }
  const wrap = `<Default>${image(`${prefix}_00`, x, y, size, size)}</Default>`; // the last half step wraps to 0
  return `<Condition><Expressions>${exprs.join('')}</Expressions>${compares.join('')}${wrap}</Condition>`;
}

// The Moon on its orbit: elongation 0 (new) toward the Sun on the left, 90 (first quarter) toward the viewer
const E = `rad(${X.ELONG})`;
const moonX = `${L.cx} - ${L.orbitRx}*cos(${E}) - ${L.moonImg / 2}`;
const moonY = `${L.cy} + ${L.orbitRy}*sin(${E}) - ${L.moonImg / 2}`;
// One Moon, drawn after the Earth: hidden only while it is behind the Earth's disk
const behind = `sin(${E}) < 0 && abs(${L.orbitRx}*cos(${E})) < ${L.earthR + L.moonImg / 2}`;
const moon = () => `<Group name="moon" x="0" y="0" width="${L.moonImg}" height="${L.moonImg}">
  <Transform target="x" value="${esc(moonX)}"/><Transform target="y" value="${esc(moonY)}"/>
  <Transform target="alpha" value="${esc(`${behind} ? 0 : 255`)}"/>
  <Variant mode="AMBIENT" target="alpha" value="0"/>
  ${frames('moon', 30, X.ELONG, 0, 0, L.moonImg)}
</Group>`;

const font = (size, color, body) => `<Font family="SYNC_TO_DEVICE" size="${size}" weight="BOLD" color="${color}">${body}</Font>`;
const text = (name, y, size, color, body, ambient = false) => `<PartText name="${name}" x="40" y="${y}" width="400" height="${L.lineH + 8}">
  ${ambient ? '' : '<Variant mode="AMBIENT" target="alpha" value="0"/>'}
  <Text align="CENTER" ellipsis="TRUE">${font(size, color, body)}</Text>
</PartText>`;
const template = (format, params) => `<Template>${esc(format)}${params.map((p) => `<Parameter expression="${esc(p)}"/>`).join('')}</Template>`;

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const SEASONS = ['วสันตวิษุวัต', 'ครีษมายัน', 'ศารทวิษุวัต', 'เหมายัน'];

const dateLine = template('%s %d %s %d', [
  X.pick(WEEKDAYS, '([DAY_OF_WEEK] - 1)'), '[DAY]', X.pick(MONTHS, '([MONTH] - 1)'), '[YEAR] + 543',
]);
// Conditions instead of picking words out of a list inside one expression: the long astronomy
// expressions then appear once per case instead of being copied into every branch
let condId = 0;
function cond(cases, fallback) {
  const id = condId++;
  const names = cases.map((_, i) => `c${id}_${i}`);
  return `<Condition><Expressions>${cases.map(([expr], i) => `<Expression name="${names[i]}"><![CDATA[${expr}]]></Expression>`).join('')}</Expressions>`
    + cases.map(([, child], i) => `<Compare expression="${names[i]}">${child}</Compare>`).join('')
    + (fallback ? `<Default>${fallback}</Default>` : '') + '</Condition>';
}
const PHASE_LIMITS = [7, 83, 97, 173, 187, 263, 277, 353];
// two halves meeting at the centre, so the lunar-day expressions are not repeated for each phase name
const half = (name, left, body) => `<PartText name="${name}" x="${left ? 40 : 246}" y="${L.lineY[0]}" width="194" height="${L.lineH + 8}">
  <Variant mode="AMBIENT" target="alpha" value="0"/>
  <Text align="${left ? 'END' : 'START'}" ellipsis="TRUE">${font(26, '#FFE6EBF5', body)}</Text>
</PartText>`;
const lunarText = (format, params) => half('lunar', true, template(format, params));
const moonLine = cond([
  [X.LUNAR_NEW, lunarText('แรม 15 ค่ำ ·', [])],
  [X.LUNAR_WAXING, lunarText('ขึ้น %d ค่ำ ·', [X.WAX_DAY])],
], lunarText('แรม %d ค่ำ ·', [X.WANE_DAY]))
  + cond(PHASE_LIMITS.map((lim, i) => [`${X.ELONG} < ${lim}`, half('phase', false, esc(PHASE_NAMES[i]))]), half('phase', false, esc(PHASE_NAMES[0])));

const bySeason = (child) => cond(SEASONS.slice(0, 3).map((name, i) => [`${X.SEASON_EVENT} == ${i}`, child(name)]), child(SEASONS[3]));
const seasonText = (format, params) => bySeason((name) => text('season', L.lineY[1], 26, '#FFF5B942', template(format.replace('$S', name), params)));
const seasonLine = cond([[`${X.SEASON_DAYS} == 0`, seasonText('วันนี้$S', [])]], seasonText('อีก %d วัน ถึง$S', [X.SEASON_DAYS]));
const statsLine = template('HR %d   %s ก้าว   %d%%', ['round([HEART_RATE])', 'numberFormat("#,##0", [STEP_COUNT])', '[BATTERY_PERCENT]']);

const timeW = 4 * L.digitW + L.colonW;
const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by wearos/tools/gen-watchface.mjs: edit that file, not this one. -->
<WatchFace width="480" height="480" clipShape="CIRCLE">
  <Metadata key="CLOCK_TYPE" value="DIGITAL"/>
  <Metadata key="PREVIEW_TIME" value="10:08:32"/>
  <Scene backgroundColor="#FF02040A">
    <Group name="scene" x="0" y="0" width="480" height="480">
      <Variant mode="AMBIENT" target="alpha" value="0"/>
      ${image('bg', 0, 0, 480, 480)}
    </Group>
    <Group name="earth" x="${L.cx - L.earthImg / 2}" y="${L.cy - L.earthImg / 2}" width="${L.earthImg}" height="${L.earthImg}">
      <Variant mode="AMBIENT" target="alpha" value="0"/>
      ${frames('earth', 36, X.LON, 0, 0, L.earthImg)}
    </Group>
    ${moon()}
    <DigitalClock x="${L.cx - timeW / 2 - 20}" y="${L.timeY}" width="${timeW + 40}" height="${L.digitH}">
      <TimeText x="0" y="0" width="${timeW + 40}" height="${L.digitH}" format="hh:mm" hourFormat="24" align="CENTER">
        <Font family="SYNC_TO_DEVICE" size="${L.digitSize - 6}" weight="BOLD" color="#FFE6EBF5"/>
      </TimeText>
    </DigitalClock>
    ${text('date', L.dateY, 28, '#FFCFD6E4', dateLine, true)}
    ${moonLine}
    ${seasonLine}
    ${text('stats', L.lineY[2], 24, '#FF8F9BB5', statsLine)}
  </Scene>
</WatchFace>
`;
fs.mkdirSync(path.join(RES, 'raw'), { recursive: true });
fs.writeFileSync(path.join(RES, 'raw/watchface.xml'), xml);
console.log(`watchface.xml: ${(xml.length / 1024).toFixed(0)} KB`);
