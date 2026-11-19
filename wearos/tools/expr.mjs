// Watch Face Format expressions for the sky calendar. The watch evaluates these itself every frame,
// so the astronomy is a shortened version of js/astro.js (good to about half a degree):
// enough to pick the right Earth / Moon image and the Thai lunar day.
// Each export is an expression string; test/wearos.test.js evaluates them against js/astro.js.

const mod = (x, n) => `((${x}) - ${n}*floor((${x})/${n}))`;
// a + b*(days since 2000-01-01 12:00 UTC), written directly in milliseconds to keep expressions short
const linear = (a, b) => {
  const c = a - b * 10957.5; // value at 1970-01-01
  return `(${(c - 360 * Math.floor(c / 360)).toFixed(6)} + ${(b / 86400000).toExponential(12)}*[UTC_TIMESTAMP])`;
};
const M = linear(357.52911, 0.98560028); // Sun's mean anomaly
const D = linear(297.8501921, 12.19074912); // Moon's mean elongation
const MP = linear(134.9633964, 13.06499295); // Moon's mean anomaly
const L0 = linear(280.46646, 0.98564736); // Sun's mean longitude

/** Sun's ecliptic longitude, degrees 0..360 (0 = March equinox). */
export const LON = mod(`${L0} + 1.9146*sin(rad(${M})) + 0.02*sin(rad(2*${M}))`, 360);

/** Moon's elongation from the Sun, degrees 0..360 (0 new, 180 full). */
export const ELONG = mod(`${D} + 6.289*sin(rad(${MP})) + 1.274*sin(rad(2*${D} - ${MP})) + 0.658*sin(rad(2*${D}))`
  + ` + 0.214*sin(rad(2*${MP})) - 2.101*sin(rad(${M}))`, 360);

/** Index of the Earth image (36 per year) and Moon image (30 per lunation). */
export const EARTH_FRAME = mod(`round(${LON}/10)`, 36);
export const MOON_FRAME = mod(`round(${ELONG}/12)`, 30);

// local time: the watch gives local seconds-in-day; the difference to UTC is the time zone offset
const RAW_OFF = `([SECONDS_IN_DAY] - ${mod('[SECONDS_SINCE_EPOCH]', 86400)})`;
const OFF = `(${RAW_OFF} > 50400 ? ${RAW_OFF} - 86400 : (${RAW_OFF} < -43200 ? ${RAW_OFF} + 86400 : ${RAW_OFF}))`;
const NOWL = `(([SECONDS_SINCE_EPOCH] + ${OFF})/86400)`; // local days since 1970
const TODAY = `floor(${NOWL})`;

// Thai lunar day, anchored like the Thai calendar: the full-moon day is ขึ้น 15 ค่ำ
// Time until the elongation reaches `target` (negative: since it did). The Moon's speed against the
// Sun varies by about 12% over its orbit, so the main periodic terms are solved for by fixed-point
// iteration: dt = (target - E(now) + P(now) - P(now + dt)) / 12.19, starting from the mean speed.
const P = (dt) => `(6.289*sin(rad(${MP} + 13.065*(${dt}))) + 1.274*sin(rad(2*${D} - ${MP} + 11.316*(${dt})))`
  + ` + 0.658*sin(rad(2*${D} + 24.381*(${dt}))) - 2.101*sin(rad(${M} + 0.9856*(${dt}))))`;
// first guess: divide by the speed at the midpoint (derivative of P); then one fixed-point step
const rate = (dt) => `(12.190749 + 1.434*cos(rad(${MP} + 13.065*(${dt}))) + 0.252*cos(rad(2*${D} - ${MP} + 11.316*(${dt})))`
  + ` + 0.28*cos(rad(2*${D} + 24.381*(${dt}))))`;
function timeTo(target) {
  const gap = `(${target} - ${ELONG})`;
  const dt0 = `(${gap}/${rate(`${gap}/24.38`)})`;
  return `((${gap} + ${P(0)} - ${P(dt0)})/12.190749)`;
}
const TO_NEW = `(-${timeTo(0)})`; // days since the last new moon
const TO_FULL = timeTo(180); // days to this lunation's full moon (negative once past)
const NEWDAY = `floor(${NOWL} - ${TO_NEW})`;
const FULLDAY = `floor(${NOWL} + ${TO_FULL})`;
/** True on the new-moon day (shown as แรม 15 ค่ำ). */
export const LUNAR_NEW = `(${TODAY} == ${NEWDAY})`;
/** True from the day after new moon up to the full-moon day (ขึ้น); otherwise แรม. */
export const LUNAR_WAXING = `(${TODAY} <= ${FULLDAY})`;
/** Number of ค่ำ while waxing / waning. */
export const WAX_DAY = `clamp(15 - (${FULLDAY} - ${TODAY}), 1, 15)`;
export const WANE_DAY = `clamp(${TODAY} - ${FULLDAY}, 1, 15)`;

/** 0..7: จันทร์ดับ, ข้างขึ้น เสี้ยว/ครึ่งดวง/ค่อนดวง, จันทร์เพ็ญ, ข้างแรม ค่อนดวง/ครึ่งดวง/เสี้ยว. */
export const PHASE = `(${ELONG} < 7 ? 0 : (${ELONG} < 83 ? 1 : (${ELONG} < 97 ? 2 : (${ELONG} < 173 ? 3`
  + ` : (${ELONG} < 187 ? 4 : (${ELONG} < 263 ? 5 : (${ELONG} < 277 ? 6 : (${ELONG} < 353 ? 7 : 0))))))))`;

// next equinox/solstice: days from the Sun's motion, which is faster in January than in July
const NEXT = `(90*(floor(${LON}/90) + 1))`;
const PREV = `(${NEXT} - 90)`;
const TO_NEXT = `((${NEXT} - ${LON})/(0.9856 + 0.033*cos(rad(${M} + 0.49*(${NEXT} - ${LON})))))`;
const SINCE_PREV = `((${LON} - ${PREV})/(0.9856 + 0.033*cos(rad(${M} - 0.49*(${LON} - ${PREV})))))`;
const PASSED_TODAY = `(floor(${NOWL} - ${SINCE_PREV}) == ${TODAY})`;
/** Days until the next equinox/solstice (0 = today). */
export const SEASON_DAYS = `(${PASSED_TODAY} ? 0 : floor(${NOWL} + ${TO_NEXT}) - ${TODAY})`;
/** Which one: 0 March equinox, 1 June solstice, 2 September equinox, 3 December solstice. */
export const SEASON_EVENT = `(${PASSED_TODAY} ? ${mod(`floor(${LON}/90)`, 4)} : ${mod(`floor(${LON}/90) + 1`, 4)})`;

/** Picks item `index` (an expression) out of a list of strings, as a WFF string expression. */
export function pick(list, index) {
  const joined = list.join('');
  let start = 0;
  const starts = list.map((s) => { const a = start; start += s.length; return a; });
  const ends = list.map((s, i) => starts[i] + s.length);
  const chain = (values) => values.slice(0, -1).reduceRight((acc, v, i) => `(${index} == ${i} ? ${v} : ${acc})`, String(values.at(-1)));
  return `subText("${joined}", ${chain(starts)}, ${chain(ends)})`;
}
