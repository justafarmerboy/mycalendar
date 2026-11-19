// Everything the watch face shows, worked out from the current time. Pure functions, so the same
// code runs on the watch and in the Node tests / preview renderer.
import { sun, moonPhase, findMoonPhase, seasonsOf, jdOf, dateOf } from './astro.js';
import { LAYOUT } from './layout.js';

const DAY = 86400000;
const pad2 = (n) => (n < 10 ? '0' : '') + n;
export const EARTH_FRAMES = 36; // one image per 10 degrees of the Sun's longitude
export const MOON_FRAMES = 30; // one image per 12 degrees of elongation

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const PHASE_NAMES = ['จันทร์ดับ', 'ข้างขึ้น เสี้ยว', 'ข้างขึ้น ครึ่งดวง', 'ข้างขึ้น ค่อนดวง',
  'จันทร์เพ็ญ', 'ข้างแรม ค่อนดวง', 'ข้างแรม ครึ่งดวง', 'ข้างแรม เสี้ยว'];

export function phaseIndex(e) {
  if (e < 7 || e >= 353) return 0;
  if (e < 83) return 1;
  if (e < 97) return 2;
  if (e < 173) return 3;
  if (e < 187) return 4;
  if (e < 263) return 5;
  if (e < 277) return 6;
  return 7;
}
export const phaseName = (e) => PHASE_NAMES[phaseIndex(e)];

/** Text of a lunar day image: key 'w01'..'w15' is ขึ้น (waxing), 'k01'..'k15' is แรม (waning). */
export const lunarText = (key) => `${key[0] === 'w' ? 'ขึ้น' : 'แรม'} ${Number(key.slice(1))} ค่ำ`;
export const LUNAR_KEYS = [...Array(30)].map((_, i) => (i < 15 ? 'w' : 'k') + pad2((i % 15) + 1));

const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * @param utc     current time, ms since 1970 (UTC)
 * @param offset  local time minus UTC, ms (from the watch's time sensor)
 */
export function faceState(utc, offset) {
  const jd = jdOf(new Date(utc));
  const local = new Date(utc + offset); // read with getUTC* to get the watch's local date
  const dayNo = (ms) => Math.floor((ms + offset) / DAY);
  const today = dayNo(utc);

  // Earth: the axis direction follows the season
  const s = sun(jd);
  const earthFrame = Math.round(s.lon / (360 / EARTH_FRAMES)) % EARTH_FRAMES;

  // Moon: where it is on its orbit, and what we see of it
  const p = moonPhase(jd);
  const moonFrame = Math.round(p.elong / (360 / MOON_FRAMES)) % MOON_FRAMES;
  const E = (p.elong * Math.PI) / 180;
  const { cx, cy, orbitRx, orbitRy, moonImg } = LAYOUT;
  const moonX = Math.round(cx - orbitRx * Math.cos(E) - moonImg / 2);
  const moonY = Math.round(cy + orbitRy * Math.sin(E) - moonImg / 2);
  const moonFront = Math.sin(E) >= 0; // first quarter side is toward the viewer

  // Thai lunar day, anchored like the Thai calendar: the full-moon day is ขึ้น 15 ค่ำ
  const newDay = dayNo(dateOf(p.lastNew).getTime());
  const fullDay = dayNo(dateOf(findMoonPhase(p.lastNew, 180)).getTime());
  let lunarKey;
  if (today === newDay) lunarKey = 'k15';
  else if (today <= fullDay) lunarKey = 'w' + pad2(Math.max(1, 15 - (fullDay - today)));
  else lunarKey = 'k' + pad2(Math.min(today - fullDay, 15));

  // next equinox or solstice
  const y = local.getUTCFullYear();
  const events = seasonsOf(y).concat(seasonsOf(y + 1));
  const next = events.find((e) => dayNo(dateOf(e.jd).getTime()) >= today);
  const eventDay = dayNo(dateOf(next.jd).getTime());
  let season;
  if (eventDay === today) {
    const t = new Date(dateOf(next.jd).getTime() + offset);
    // no "วันนี้": the watch font drops a tone mark stacked on an upper vowel (นี้, ขึ้น, ค่ำ)
    season = `${next.name} เวลา ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())} น.`;
  } else season = `อีก ${eventDay - today} วัน ถึง${next.name}`;

  return {
    earthFrame,
    moonFrame,
    moonX,
    moonY,
    moonFront,
    date: `${WEEKDAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear() + 543}`,
    moon: `${lunarText(lunarKey)} · ${phaseName(p.elong)}`, // drawn from images, see watchface/index.js
    lunarKey,
    phaseIndex: phaseIndex(p.elong),
    season,
  };
}

export function statsText(heart, steps, battery) {
  const hr = heart > 0 ? `HR ${heart}` : 'HR --';
  return `${hr}   ${thousands(steps || 0)} ก้าว   ${battery}%`;
}
