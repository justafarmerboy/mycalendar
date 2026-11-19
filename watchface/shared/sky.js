// Everything the watch face shows, worked out from the current time. Pure functions, so the same
// code runs on the watch and in the Node tests / preview renderer.
import { sun, moonPhase, findMoonPhase, seasonsOf, jdOf, dateOf } from './astro.js';
import { LAYOUT } from './layout.js';

const DAY = 86400000;
export const EARTH_FRAMES = 36; // one image per 10 degrees of the Sun's longitude
export const MOON_FRAMES = 30; // one image per 12 degrees of elongation

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function phaseName(e) {
  if (e < 7 || e >= 353) return 'จันทร์ดับ';
  if (e < 83) return 'ข้างขึ้น เสี้ยว';
  if (e < 97) return 'ข้างขึ้น ครึ่งดวง';
  if (e < 173) return 'ข้างขึ้น ค่อนดวง';
  if (e < 187) return 'จันทร์เพ็ญ';
  if (e < 263) return 'ข้างแรม ค่อนดวง';
  if (e < 277) return 'ข้างแรม ครึ่งดวง';
  return 'ข้างแรม เสี้ยว';
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;
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
  let lunar;
  if (today === newDay) lunar = 'แรม 15 ค่ำ';
  else if (today <= fullDay) lunar = `ขึ้น ${Math.max(1, 15 - (fullDay - today))} ค่ำ`;
  else lunar = `แรม ${Math.min(today - fullDay, 15)} ค่ำ`;

  // next equinox or solstice
  const y = local.getUTCFullYear();
  const events = seasonsOf(y).concat(seasonsOf(y + 1));
  const next = events.find((e) => dayNo(dateOf(e.jd).getTime()) >= today);
  const eventDay = dayNo(dateOf(next.jd).getTime());
  let season;
  if (eventDay === today) {
    const t = new Date(dateOf(next.jd).getTime() + offset);
    season = `วันนี้${next.name} ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())} น.`;
  } else season = `อีก ${eventDay - today} วัน ถึง${next.name}`;

  return {
    earthFrame,
    moonFrame,
    moonX,
    moonY,
    moonFront,
    date: `${WEEKDAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear() + 543}`,
    moon: `${lunar} · ${phaseName(p.elong)}`,
    season,
  };
}

export function statsText(heart, steps, battery) {
  const hr = heart > 0 ? `HR ${heart}` : 'HR --';
  return `${hr}   ${thousands(steps || 0)} ก้าว   ${battery}%`;
}
