// Lunar and solar eclipses: found at each full/new moon from the Moon's distance to the
// Earth's shadow (lunar) or to the Sun (solar). Times are of greatest eclipse, good to a few minutes.
import * as A from './astro.js';

const RAD = Math.PI / 180;
const EARTH_R = 6378.14;

/** Angular sizes (degrees) at jd: Moon parallax and radius, Sun radius and parallax. */
function sizes(jd) {
  const km = A.moonDist(jd), s = A.sun(jd);
  const pm = Math.asin(EARTH_R / km) / RAD;
  return { pm, sm: 0.272481 * pm, ss: 0.266563 / s.dist, ps: 0.002443 / s.dist };
}

// angular distance between two ecliptic positions, degrees
function sep(l1, b1, l2, b2) {
  const c = Math.sin(b1 * RAD) * Math.sin(b2 * RAD) + Math.cos(b1 * RAD) * Math.cos(b2 * RAD) * Math.cos((l1 - l2) * RAD);
  return Math.acos(Math.min(1, c)) / RAD;
}

/** Distance from the Moon to the centre of the Earth's shadow (lunar) or to the Sun (solar), degrees. */
function gap(jd, lunar) {
  const s = A.sun(jd);
  return sep(A.moonLon(jd), A.moonLat(jd), s.trueLon + (lunar ? 180 : 0), 0);
}

// ternary search for the moment of closest approach near jd
function closest(jd, lunar) {
  let a = jd - 0.3, b = jd + 0.3;
  for (let i = 0; i < 40; i++) {
    const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
    if (gap(m1, lunar) < gap(m2, lunar)) b = m2; else a = m1;
  }
  return (a + b) / 2;
}

export const ECLIPSE_NAMES = {
  'lunar-total': 'จันทรุปราคาเต็มดวง', 'lunar-partial': 'จันทรุปราคาบางส่วน', 'lunar-penumbral': 'จันทรุปราคาเงามัว',
  'solar-total': 'สุริยุปราคาเต็มดวง', 'solar-annular': 'สุริยุปราคาวงแหวน', 'solar-partial': 'สุริยุปราคาบางส่วน',
};

/** Lunar eclipse at the full moon near jd, or null. */
export function lunarEclipse(fullJd) {
  const jd = closest(fullJd, true), d = gap(jd, true), z = sizes(jd);
  const umbra = 1.02 * (z.pm - z.ss + z.ps), penumbra = 1.02 * (z.pm + z.ss + z.ps);
  let type = null;
  if (d < umbra - z.sm) type = 'lunar-total';
  else if (d < umbra + z.sm) type = 'lunar-partial';
  else if (d < penumbra + z.sm) type = 'lunar-penumbral';
  if (!type) return null;
  return { jd, type, name: ECLIPSE_NAMES[type], gap: d, umbra, penumbra, moonR: z.sm, magnitude: (umbra + z.sm - d) / (2 * z.sm) };
}

/** Solar eclipse at the new moon near jd (seen from somewhere on Earth), or null. */
export function solarEclipse(newJd) {
  const jd = closest(newJd, false), d = gap(jd, false), z = sizes(jd);
  if (d > z.pm - z.ps + z.ss + z.sm) return null;
  // the Moon's shadow axis hits the Earth: total or annular somewhere, else partial only
  const central = d < z.pm - z.ps - Math.abs(z.sm - z.ss) * 0.5;
  const type = !central ? 'solar-partial' : z.sm * 1.008 > z.ss ? 'solar-total' : 'solar-annular';
  return { jd, type, name: ECLIPSE_NAMES[type], gap: d, moonR: z.sm, sunR: z.ss };
}

/** Eclipses from jd0 on, for `months` lunations. */
export function eclipsesFrom(jd0, months = 40) {
  const out = [];
  let full = A.findMoonPhase(jd0, 180), nw = A.findMoonPhase(jd0, 0);
  for (let i = 0; i < months; i++) {
    const l = lunarEclipse(full), s = solarEclipse(nw);
    if (l) out.push(l);
    if (s) out.push(s);
    full = A.findMoonPhase(full + 20, 180);
    nw = A.findMoonPhase(nw + 20, 0);
  }
  return out.sort((a, b) => a.jd - b.jd);
}

/** Topocentric RA/Dec of the Moon for an observer (Meeus ch. 40, spherical Earth). */
function moonTopo(jd, lat, lng) {
  const s = A.sun(jd);
  const m = A.toEquatorial(A.moonLon(jd), A.moonLat(jd), s.eps);
  const pm = Math.asin(EARTH_R / A.moonDist(jd));
  const H = (A.gmst(jd) + lng - m.ra) * RAD, d = m.dec * RAD, phi = lat * RAD;
  const dRa = Math.atan2(-Math.cos(phi) * Math.sin(pm) * Math.sin(H), Math.cos(d) - Math.cos(phi) * Math.sin(pm) * Math.cos(H));
  const dec = Math.atan2((Math.sin(d) - Math.sin(phi) * Math.sin(pm)) * Math.cos(dRa), Math.cos(d) - Math.cos(phi) * Math.sin(pm) * Math.cos(H));
  return { ra: m.ra + dRa / RAD, dec: dec / RAD, H: H - dRa };
}

const alt = (dec, H, lat) => Math.asin(Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(H)) / RAD;

/**
 * What an observer at (lat, lng) sees of an eclipse.
 * lunar: whether the Moon is above the horizon at some time while it is in the shadow.
 * solar: the largest fraction of the Sun's diameter covered while the Sun is up (0 = not seen).
 */
export function localView(ec, lat, lng) {
  if (ec.type.startsWith('lunar')) {
    let best = -90;
    for (let k = -12; k <= 12; k++) { // +-2 hours
      const jd = ec.jd + k / 144, s = A.sun(jd);
      const m = A.toEquatorial(A.moonLon(jd), A.moonLat(jd), s.eps);
      best = Math.max(best, alt(m.dec, (A.gmst(jd) + lng - m.ra) * RAD, lat) - 0.95);
    }
    return { visible: best > 0, alt: best };
  }
  let best = 0, bestJd = ec.jd;
  for (let k = -36; k <= 36; k++) { // +-3 hours, every 5 minutes
    const jd = ec.jd + k / 288, s = A.sun(jd), z = sizes(jd);
    const so = A.toEquatorial(s.lon, 0, s.eps);
    if (alt(so.dec, (A.gmst(jd) + lng - so.ra) * RAD, lat) < -0.5) continue;
    const mt = moonTopo(jd, lat, lng);
    const c = Math.sin(so.dec * RAD) * Math.sin(mt.dec * RAD) + Math.cos(so.dec * RAD) * Math.cos(mt.dec * RAD) * Math.cos((so.ra - mt.ra) * RAD);
    const d = Math.acos(Math.min(1, c)) / RAD, smTopo = z.sm * 1.01;
    const mag = (z.ss + smTopo - d) / (2 * z.ss);
    if (mag > best) { best = mag; bestJd = jd; }
  }
  return { visible: best > 0, magnitude: Math.min(best, 1), jd: bestJd };
}

/** How deep the Moon is in the Earth's shadow right now: umbra and penumbra cover 0..1 of it. */
export function shadowCover(jd) {
  const d = gap(jd, true), z = sizes(jd);
  const umbra = 1.02 * (z.pm - z.ss + z.ps), penumbra = 1.02 * (z.pm + z.ss + z.ps);
  const cover = (r) => Math.min(1, Math.max(0, (r + z.sm - d) / (2 * z.sm)));
  return { umbra: cover(umbra), penumbra: cover(penumbra) };
}

/** Moon's path past the shadow (lunar) or the Sun (solar), relative to its centre, in degrees. */
export function pathAround(ec, hours = 3, step = 0.25) {
  const lunar = ec.type.startsWith('lunar'), pts = [];
  for (let h = -hours; h <= hours + 1e-9; h += step) {
    const jd = ec.jd + h / 24, s = A.sun(jd), b = A.moonLat(jd);
    const dl = ((A.moonLon(jd) - s.trueLon - (lunar ? 180 : 0) + 540) % 360) - 180;
    pts.push({ h, x: dl * Math.cos(b * RAD), y: b });
  }
  return pts;
}
