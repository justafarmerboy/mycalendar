// Astronomy for the sky calendar: Sun, Moon, seasons and day length.
// Low-precision formulas from Jean Meeus, "Astronomical Algorithms" (2nd ed.).
// Accuracy: Sun ~0.01 deg, Moon ~0.02 deg -> event times good to a few minutes.
// Works in the browser and in Node (no DOM).

const RAD = Math.PI / 180;
const DELTA_T = 69 / 86400; // TT - UT in days (about 69 s in the 2020s)
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);
export const norm360 = (d) => ((d % 360) + 360) % 360;
const norm180 = (d) => norm360(d + 180) - 180;

/** Julian Day (UT) of a JS Date. */
export const jdOf = (date) => date.getTime() / 86400000 + 2440587.5;
/** JS Date of a Julian Day (UT). */
export const dateOf = (jd) => new Date((jd - 2440587.5) * 86400000);
const centuries = (jd) => (jd + DELTA_T - 2451545) / 36525;

/** Sun position: apparent ecliptic longitude, declination, equation of time (minutes). */
export function sun(jd) {
  const T = centuries(jd);
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M)
    + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const omega = 125.04 - 1934.136 * T;
  const trueLon = L0 + C;
  const lon = norm360(trueLon - 0.00569 - 0.00478 * sin(omega));
  const eps = 23.439291 - 0.0130042 * T + 0.00256 * cos(omega);
  const dec = Math.asin(sin(eps) * sin(lon)) / RAD;
  const ra = norm360(Math.atan2(cos(eps) * sin(lon), cos(lon)) / RAD);
  const eot = norm180(L0 - 0.0057183 - ra) * 4; // minutes; sundial minus clock
  const e = 0.016708634 - 0.000042037 * T;
  const dist = (1.000001018 * (1 - e * e)) / (1 + e * cos(M + C)); // AU
  return { lon, trueLon: norm360(trueLon), dec, ra, eps, eot, dist };
}

/** Geocentric ecliptic longitude of the Moon (main periodic terms of Meeus ch. 47). */
export function moonLon(jd) {
  const T = centuries(jd);
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T;
  const terms = [
    [6.288774, 0, 0, 1, 0], [1.274027, 2, 0, -1, 0], [0.658314, 2, 0, 0, 0], [0.213618, 0, 0, 2, 0],
    [-0.185116, 0, 1, 0, 0], [-0.114332, 0, 0, 0, 2], [0.058793, 2, 0, -2, 0], [0.057066, 2, -1, -1, 0],
    [0.053322, 2, 0, 1, 0], [0.045758, 2, -1, 0, 0], [-0.040923, 0, 1, -1, 0], [-0.03472, 1, 0, 0, 0],
    [-0.030383, 0, 1, 1, 0], [0.015327, 2, 0, 0, -2], [-0.012528, 0, 0, 1, 2], [0.01098, 0, 0, 1, -2],
    [0.010675, 4, 0, -1, 0], [0.010034, 0, 0, 3, 0], [0.008548, 4, 0, -2, 0], [-0.007888, 2, 1, -1, 0],
    [-0.006766, 2, 1, 0, 0], [-0.005163, 1, 0, -1, 0], [0.004987, 1, 1, 0, 0], [0.004036, 2, -1, 1, 0],
    [0.003994, 2, 0, 2, 0], [0.003861, 4, 0, 0, 0], [0.003665, 2, 0, -3, 0], [-0.002689, 0, 1, -2, 0],
    [-0.002602, 2, 0, -1, 2], [0.00239, 2, -1, -2, 0], [-0.002348, 1, 0, 1, 0], [0.002236, 2, -2, 0, 0],
    [-0.00212, 0, 1, 2, 0], [-0.002069, 0, 2, 0, 0], [0.002048, 2, -2, -1, 0], [-0.001773, 2, 0, 1, -2],
    [-0.001595, 2, 0, 0, 2], [0.001215, 4, -1, -1, 0], [-0.00111, 0, 0, 2, 2],
  ];
  let sum = 0;
  for (const [c, d, m, mp, f] of terms) {
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sum += c * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  // Venus, Jupiter and flattening terms
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T;
  sum += 0.003958 * sin(A1) + 0.001962 * sin(Lp - F) + 0.000318 * sin(A2);
  return norm360(Lp + sum);
}

/** Moon phase: elongation from the Sun (0 new, 90 first quarter, 180 full), illuminated fraction, age in days. */
export function moonPhase(jd) {
  const elong = norm360(moonLon(jd) - sun(jd).trueLon);
  // the real new moon is within a day of the mean-motion estimate, so start 1.5 days earlier
  const lastNew = findMoonPhase(jd - elong / 12.19 - 1.5, 0);
  return { elong, illum: (1 - cos(elong)) / 2, age: jd - lastNew, lastNew, waxing: elong < 180 };
}

const SYNODIC = 29.530588853;

// Newton iteration on an angle that grows roughly linearly with time.
function solve(f, jd, rate, target) {
  for (let i = 0; i < 20; i++) {
    const step = norm180(target - f(jd)) / rate;
    jd += step;
    if (Math.abs(step) < 1e-6) break;
  }
  return jd;
}

/** First moment at or after jd0 when the elongation equals `target` degrees. */
export function findMoonPhase(jd0, target) {
  const now = norm360(moonLon(jd0) - sun(jd0).trueLon);
  const guess = jd0 + norm360(target - now) / 12.19;
  let jd = solve((j) => moonLon(j) - sun(j).trueLon, guess, 12.19, target);
  if (jd < jd0 - 1e-6) jd = solve((j) => moonLon(j) - sun(j).trueLon, jd + SYNODIC, 12.19, target);
  return jd;
}

export const SEASON_EVENTS = [
  { lon: 0, key: 'march', name: 'วสันตวิษุวัต', en: 'March equinox', note: 'กลางวันเท่ากับกลางคืน ดวงอาทิตย์ตรงเส้นศูนย์สูตร' },
  { lon: 90, key: 'june', name: 'ครีษมายัน', en: 'June solstice', note: 'ขั้วโลกเหนือเอียงเข้าหาดวงอาทิตย์ซีกโลกเหนือกลางวันยาวที่สุด' },
  { lon: 180, key: 'september', name: 'ศารทวิษุวัต', en: 'September equinox', note: 'กลางวันเท่ากับกลางคืน ดวงอาทิตย์ตรงเส้นศูนย์สูตร' },
  { lon: 270, key: 'december', name: 'เหมายัน', en: 'December solstice', note: 'ขั้วโลกเหนือเอียงหนีดวงอาทิตย์ซีกโลกเหนือกลางคืนยาวที่สุด' },
];

/** Julian Day of an equinox/solstice in a given year (lon = 0, 90, 180, 270). */
export function seasonEvent(year, lon) {
  const guess = jdOf(new Date(Date.UTC(year, 2, 20))) + lon / 0.9856;
  return solve((j) => sun(j).lon, guess, 0.9856, lon);
}

/** The four events of a year, in order. */
export const seasonsOf = (year) => SEASON_EVENTS.map((e) => ({ ...e, jd: seasonEvent(year, e.lon) }));

/** Sunrise/sunset (UT Julian Days) for a place, using the standard -0.833 deg horizon. */
export function sunTimes(jd, lat, lng) {
  // local solar noon of the civil day (at that longitude) containing jd
  let noon = Math.floor(jd + 0.5 + lng / 360) - lng / 360; // local mean noon, in UT
  const s = sun(noon);
  noon -= s.eot / 1440;
  const cosH = (sin(-0.833) - sin(lat) * sin(s.dec)) / (cos(lat) * cos(s.dec));
  if (cosH > 1) return { noon, rise: null, set: null, dayLength: 0, polar: 'night' };
  if (cosH < -1) return { noon, rise: null, set: null, dayLength: 24, polar: 'day' };
  const H = Math.acos(cosH) / RAD;
  return { noon, rise: noon - H / 360, set: noon + H / 360, dayLength: (2 * H) / 15, polar: null };
}

/** Longitude/latitude on Earth where the Sun is overhead. */
export function subsolarPoint(jd) {
  const s = sun(jd);
  const utHours = (((jd + 0.5) % 1) + 1) % 1 * 24;
  return { lat: s.dec, lng: norm180(-15 * (utHours - 12 + s.eot / 60)) };
}

/** Distance Earth-Moon in km (main terms of Meeus table 47.A). */
export function moonDist(jd) {
  const T = centuries(jd);
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const terms = [
    [-20905355, 0, 0, 1, 0], [-3699111, 2, 0, -1, 0], [-2955968, 2, 0, 0, 0], [-569925, 0, 0, 2, 0],
    [48888, 0, 1, 0, 0], [-3149, 0, 0, 0, 2], [246158, 2, 0, -2, 0], [-152138, 2, -1, -1, 0],
    [-170733, 2, 0, 1, 0], [-204586, 2, -1, 0, 0], [-129620, 0, 1, -1, 0], [108743, 1, 0, 0, 0],
    [104755, 0, 1, 1, 0], [10321, 2, 0, 0, -2], [79661, 0, 0, 1, -2], [-34782, 4, 0, -1, 0],
    [-23210, 0, 0, 3, 0], [-21636, 4, 0, -2, 0], [24208, 2, 1, -1, 0], [30824, 2, 1, 0, 0],
    [-8379, 1, 0, -1, 0], [-16675, 1, 1, 0, 0], [-12831, 2, -1, 1, 0], [-10445, 2, 0, 2, 0],
    [-11650, 4, 0, 0, 0], [14403, 2, 0, -3, 0], [-7003, 0, 1, -2, 0], [10056, 2, -1, -2, 0],
    [6322, 1, 0, 1, 0], [-9884, 2, -2, 0, 0], [5751, 0, 1, 2, 0], [-4950, 2, -2, -1, 0],
  ];
  let sum = 0;
  for (const [c, d, m, mp, f] of terms) sum += c * cos(d * D + m * M + mp * Mp + f * F);
  return 385000.56 + sum / 1000;
}

/** Geocentric ecliptic latitude of the Moon (main terms of Meeus table 47.B), degrees. */
export function moonLat(jd) {
  const T = centuries(jd);
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T;
  return 5.128122 * sin(F) + 0.280602 * sin(Mp + F) + 0.277693 * sin(Mp - F) + 0.173237 * sin(2 * D - F)
    + 0.055413 * sin(2 * D - Mp + F) + 0.046271 * sin(2 * D - Mp - F) + 0.032573 * sin(2 * D + F)
    + 0.017198 * sin(2 * Mp + F) + 0.009266 * sin(2 * D + Mp - F) + 0.008822 * sin(2 * Mp - F)
    + 0.008216 * E * sin(2 * D - M - F) + 0.004324 * sin(2 * D - 2 * Mp - F) + 0.0042 * sin(2 * D + Mp + F);
}

// ecliptic -> equatorial (right ascension, declination), degrees
export function toEquatorial(lon, lat, eps) {
  const ra = norm360(Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * RAD) * sin(eps), cos(lon)) / RAD);
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) / RAD;
  return { ra, dec };
}

/** Greenwich mean sidereal time, degrees. */
export function gmst(jd) {
  const t = jd - 2451545, T = t / 36525;
  return norm360(280.46061837 + 360.98564736629 * t + 0.000387933 * T * T);
}

/**
 * The Moon as an observer at (lat, lng) sees it.
 * limb: direction of the bright limb, degrees counterclockwise from straight up (the zenith),
 *       as the Moon appears in the sky; 0 = lit on top, 90 = lit on the left, 180 = lit underneath.
 * north: direction of celestial north on the disk, same convention (the Moon's face turns with it).
 * alt: altitude above the horizon (topocentric, approximate), phaseAngle: Sun-Moon-Earth angle.
 */
export function moonSky(jd, lat, lng) {
  const s = sun(jd);
  const m = toEquatorial(moonLon(jd), moonLat(jd), s.eps);
  // the Sun's RA/Dec from its apparent longitude (latitude ~0)
  const so = toEquatorial(s.lon, 0, s.eps);
  const dRa = so.ra - m.ra;
  const chi = Math.atan2(cos(so.dec) * sin(dRa), sin(so.dec) * cos(m.dec) - cos(so.dec) * sin(m.dec) * cos(dRa)) / RAD;
  const H = gmst(jd) + lng - m.ra; // hour angle
  const q = Math.atan2(sin(H), Math.tan(lat * RAD) * cos(m.dec) - sin(m.dec) * cos(H)) / RAD; // parallactic angle
  const geoAlt = Math.asin(sin(lat) * sin(m.dec) + cos(lat) * cos(m.dec) * cos(H)) / RAD;
  const elong = Math.acos(sin(so.dec) * sin(m.dec) + cos(so.dec) * cos(m.dec) * cos(dRa)) / RAD;
  return {
    limb: norm360(chi - q),
    north: norm360(-q),
    alt: geoAlt - 0.95 * cos(geoAlt), // horizontal parallax of the Moon is about 0.95 deg
    elong,
    illum: (1 - cos(elong)) / 2,
  };
}
