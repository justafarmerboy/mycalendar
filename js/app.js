// Sky calendar UI: draws Sun (fixed, left), Earth (centre, tilted axis, north up) and Moon (right),
// and fills the season / day / moon cards for the chosen moment.
import * as A from './astro.js';
import { LAND_B64 } from './land.js';

const RAD = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const DAY = 86400000;

const PLACES = [
  { name: 'กรุงเทพฯ', lat: 13.75, lng: 100.5 },
  { name: 'เชียงใหม่', lat: 18.79, lng: 98.98 },
  { name: 'ขอนแก่น', lat: 16.43, lng: 102.83 },
  { name: 'หาดใหญ่', lat: 7.01, lng: 100.47 },
  { name: 'โตเกียว', lat: 35.68, lng: 139.69 },
  { name: 'ลอนดอน', lat: 51.51, lng: -0.13 },
  { name: 'นิวยอร์ก', lat: 40.71, lng: -74.01 },
  { name: 'ซิดนีย์', lat: -33.87, lng: 151.21 },
  { name: 'เรคยาวิก', lat: 64.15, lng: -21.94 },
];

const state = { t: Date.now(), place: PLACES[0], playing: false, speed: 86400000, holdMin: 0 };

// ---------- land mask ----------
const land = Uint8Array.from(atob(LAND_B64), (c) => c.charCodeAt(0));
function landBit(r, c) {
  const i = Math.min(179, Math.max(0, r)) * 360 + (((c % 360) + 360) % 360);
  return (land[i >> 3] >> (i & 7)) & 1;
}
// bilinear blend of the four nearest cells, so coastlines are not blocky
function isLand(lat, lng) {
  const y = 89.5 - lat, x = lng + 179.5;
  const r = Math.floor(y), c = Math.floor(x), fy = y - r, fx = x - c;
  const top = landBit(r, c) * (1 - fx) + landBit(r, c + 1) * fx;
  const bottom = landBit(r + 1, c) * (1 - fx) + landBit(r + 1, c + 1) * fx;
  return top * (1 - fy) + bottom * fy > 0.5;
}

// ---------- formatting ----------
const fmtDate = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
const when = (d) => `${fmtShort.format(d)} ${fmtTime.format(d)}`;
const hm = (hours) => `${Math.floor(hours)} ชม. ${Math.round((hours % 1) * 60)} นาที`;
const localDayNumber = (ms) => { const d = new Date(ms); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };

// ---------- scene ----------
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const globe = document.createElement('canvas');
const moonBig = document.createElement('canvas');
const mctx = moonBig.getContext('2d');
let L = {}; // layout
let stars = [];

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth;
  const H = Math.round(Math.max(W * 0.5, 280));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.height = H + 'px';
  const R = Math.min(H * 0.28, W * 0.15);
  L = {
    W, H, dpr, R,
    ex: W * 0.5, ey: H * 0.52,
    orbit: R * 1.65, orbitRy: R * 1.15, // seen from above the orbit, so the Moon passes below/above the Earth
    sunX: -H * 0.18, sunR: H * 0.42,
    moonX: W - Math.min(H * 0.17, W * 0.085) - W * 0.04, moonY: H * 0.45, moonR: Math.min(H * 0.17, W * 0.085),
  };
  globe.width = globe.height = Math.round(2 * R * dpr);
  moonBig.width = moonBig.height = Math.round(2 * L.moonR * dpr);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  stars = Array.from({ length: Math.round(W * H / 2500) }, () => [rnd() * W, rnd() * H, rnd() * 1.2 + 0.2, rnd() * 0.7 + 0.2]);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => scale(a, 1 / Math.hypot(...a));

/**
 * Earth orientation in the view frame (x right / away from the Sun, y up, z toward the viewer).
 * The Sun stays on the left, so the axis appears to swing around during the year:
 * toward the Sun at the June solstice, away at the December solstice, toward the viewer in March.
 */
function earthFrame(jd) {
  const s = A.sun(jd);
  const e = s.eps * RAD, l = s.lon * RAD;
  return frameOf(jd, s, [-Math.sin(e) * Math.sin(l), Math.cos(e), Math.sin(e) * Math.cos(l)], [-1, 0, 0]);
}

/**
 * Bird's-eye view from above the orbit (x right, y up, z toward the viewer = ecliptic north).
 * The Sun is at the centre and the Earth goes round counterclockwise. The axis never moves: it
 * always leans toward screen-up, the direction of the June-solstice Sun, and points at Polaris.
 */
function birdFrame(jd) {
  const s = A.sun(jd);
  const e = s.eps * RAD, h = (s.lon + 180) * RAD; // heliocentric longitude of the Earth
  const f = frameOf(jd, s, [0, Math.sin(e), Math.cos(e)], [-Math.cos(h), -Math.sin(h), 0]);
  f.pos = [Math.cos(h), Math.sin(h)];
  return f;
}

function frameOf(jd, s, axis, toSun) {
  const u = unit(sub(toSun, scale(axis, dot(toSun, axis)))); // equator direction under the Sun
  const w = cross(axis, u); // 90 degrees east of it
  return { axis, u, w, toSun, subLng: A.subsolarPoint(jd).lng, sun: s };
}

function renderGlobe(f, cv = globe) {
  const n = cv.width, c2 = cv.getContext('2d'), img = c2.createImageData(n, n), d = img.data;
  const half = n / 2, lw = 0.7 * 57.3 / half; // a grid line about one pixel wide, in degrees
  const { axis, u, w, subLng, toSun } = f;
  for (let py = 0; py < n; py++) {
    const y = 1 - (py + 0.5) / half;
    for (let px = 0; px < n; px++) {
      const x = (px + 0.5) / half - 1;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      const p = x * u[0] + y * u[1] + z * u[2];
      const q = x * w[0] + y * w[1] + z * w[2];
      const s = x * axis[0] + y * axis[1] + z * axis[2];
      const lat = Math.asin(s) / RAD;
      const lng = subLng + Math.atan2(q, p) / RAD;
      let cr, cg, cb;
      if (isLand(lat, lng)) {
        if (lat < -60 || lat > 72) [cr, cg, cb] = [235, 240, 245];
        else { // green, fading to tan across the subtropical deserts
          const dry = 0.65 * Math.exp(-(((Math.abs(lat) - 25) / 8) ** 2));
          [cr, cg, cb] = [78 + 96 * dry, 140 + 14 * dry, 70 + 30 * dry];
        }
      } else [cr, cg, cb] = [22, 74, 150];
      const al = Math.abs(lat);
      const g = (t, rr, gg, bb, k) => { if (Math.abs(al - t) < lw) { cr += (rr - cr) * k; cg += (gg - cg) * k; cb += (bb - cb) * k; } };
      g(0, 255, 230, 120, 0.85);
      g(23.44, 255, 150, 80, 0.7);
      g(66.56, 150, 210, 255, 0.7);
      const mer = ((lng % 30) + 30) % 30;
      if (mer < lw / Math.max(Math.cos(lat * RAD), 0.2) && al < 80) { cr += (255 - cr) * 0.18; cg += (255 - cg) * 0.18; cb += (255 - cb) * 0.18; }
      // smooth terminator with twilight
      const light = x * toSun[0] + y * toSun[1] + z * toSun[2];
      const day = Math.min(1, Math.max(0, (light + 0.06) / 0.14));
      const shade = 0.45 + 0.55 * Math.max(light, 0) ** 0.6;
      const k = day * shade + (1 - day) * 0.11;
      const edge = Math.min(1, (1 - Math.sqrt(r2)) * half); // antialiased rim
      const i = (py * n + px) * 4;
      d[i] = cr * k + (1 - day) * 4;
      d[i + 1] = cg * k + (1 - day) * 8;
      d[i + 2] = cb * k + (1 - day) * 22;
      d[i + 3] = 255 * edge;
    }
  }
  c2.putImageData(img, 0, 0);
}

// Maria (dark seas) of the near side, as [x, y, radius] on the unit disk, north up.
const MARIA = [[-0.32, 0.38, 0.22], [-0.05, 0.42, 0.16], [0.18, 0.32, 0.14], [0.36, 0.42, 0.12], [-0.45, -0.02, 0.24],
  [0.1, 0.05, 0.13], [0.3, 0.08, 0.13], [0.5, 0.18, 0.1], [-0.2, -0.3, 0.12], [0.2, -0.22, 0.1]];

/** Moon as seen from Earth (northern hemisphere): waxing = lit on the right. */
function renderMoon(elong) {
  const n = moonBig.width, img = mctx.createImageData(n, n), d = img.data, half = n / 2;
  const e = elong * RAD, Lx = Math.sin(e), Lz = -Math.cos(e);
  for (let py = 0; py < n; py++) {
    const y = 1 - (py + 0.5) / half;
    for (let px = 0; px < n; px++) {
      const x = (px + 0.5) / half - 1;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      let alb = 0.82;
      for (const [mx, my, mr] of MARIA) {
        const dd = ((x - mx) ** 2 + (y - my) ** 2) / (mr * mr);
        if (dd < 1) alb -= 0.2 * (1 - dd) ** 0.7;
      }
      alb += 0.015 * Math.sin(x * 37 + y * 11) * Math.sin(y * 29 - x * 7);
      const lit = Math.min(1, Math.max(0, (x * Lx + z * Lz + 0.02) / 0.06));
      const b = (lit * (0.35 + 0.65 * Math.max(0, x * Lx + z * Lz) ** 0.5) + 0.07 * (1 - lit)) * alb;
      const i = (py * n + px) * 4;
      d[i] = 250 * b; d[i + 1] = 245 * b; d[i + 2] = 232 * b;
      d[i + 3] = 255 * Math.min(1, (1 - Math.sqrt(r2)) * half);
    }
  }
  mctx.putImageData(img, 0, 0);
}

function label(text, x, y, color = '#e6ebf5', size = 14, align = 'center') {
  ctx.font = `600 ${size}px Sarabun, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 4;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function drawScene(jd, phase) {
  const { W, H, dpr, R, ex, ey } = L;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of stars) { ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, r, r); }
  ctx.globalAlpha = 1;

  // Sun, fixed on the left
  const glow = ctx.createRadialGradient(L.sunX, ey, L.sunR * 0.6, L.sunX, ey, L.sunR * 2.2);
  glow.addColorStop(0, 'rgba(255,200,80,.55)');
  glow.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const body = ctx.createRadialGradient(L.sunX + L.sunR * 0.3, ey, 0, L.sunX, ey, L.sunR);
  body.addColorStop(0, '#fffbe0');
  body.addColorStop(0.7, '#ffd34d');
  body.addColorStop(1, '#ff9a1f');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(L.sunX, ey, L.sunR, 0, Math.PI * 2); ctx.fill();
  if (W >= 600) label('ดวงอาทิตย์', Math.max(L.sunX + L.sunR * 0.55, 44), ey + 5, '#5a3300', 15);

  // sunlight
  ctx.strokeStyle = 'rgba(255,215,110,.28)';
  ctx.lineWidth = 1.5;
  for (const k of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const y = ey + k * R, x0 = L.sunX + L.sunR + 8, x1 = ex - R * Math.sqrt(1 - k * k) - 14;
    if (x1 - x0 < 30) continue;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - 7, y - 4); ctx.lineTo(x1 - 7, y + 4); ctx.closePath();
    ctx.fillStyle = 'rgba(255,215,110,.5)'; ctx.fill();
  }

  const f = earthFrame(jd);
  // Moon's orbit: elongation 0 (new) is toward the Sun, 90 (first quarter) toward the viewer
  const D = phase.elong * RAD;
  const mx = ex - L.orbit * Math.cos(D), my = ey + L.orbitRy * Math.sin(D), mr = Math.max(5, R * 0.14);
  const orbitHalf = (front) => {
    ctx.strokeStyle = 'rgba(200,210,230,.35)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(ex, ey, L.orbit, L.orbitRy, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (front) { // direction of travel: counterclockwise seen from the north, left to right in front
      const ax = ex + L.orbit * 0.25, ay = ey + L.orbitRy * Math.sqrt(1 - 0.0625);
      ctx.fillStyle = 'rgba(200,210,230,.6)';
      ctx.beginPath(); ctx.moveTo(ax + 7, ay - 0.6); ctx.lineTo(ax - 3, ay - 5); ctx.lineTo(ax - 3, ay + 4); ctx.closePath(); ctx.fill();
    }
  };
  const smallMoon = () => {
    ctx.fillStyle = '#2b2f38';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8e6dc';
    ctx.beginPath(); ctx.arc(mx, my, mr, Math.PI / 2, Math.PI * 1.5); ctx.fill(); // lit half faces the Sun
    label('ดวงจันทร์', mx, my + mr + 15, '#cfd6e4', 12);
  };
  orbitHalf(false);
  if (Math.sin(D) < 0) smallMoon();
  drawAxis(f, false);

  // Earth
  renderGlobe(f);
  ctx.drawImage(globe, ex - R, ey - R, 2 * R, 2 * R);
  const atm = ctx.createRadialGradient(ex, ey, R * 0.98, ex, ey, R * 1.08);
  atm.addColorStop(0, 'rgba(120,180,255,.45)');
  atm.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = atm;
  ctx.beginPath(); ctx.arc(ex, ey, R * 1.08, 0, Math.PI * 2); ctx.fill();
  drawPlace(f);
  drawAxis(f, true);

  orbitHalf(true);
  if (Math.sin(D) >= 0) smallMoon();

  // Moon as seen from Earth, on the right
  renderMoon(phase.elong);
  const glowM = ctx.createRadialGradient(L.moonX, L.moonY, L.moonR, L.moonX, L.moonY, L.moonR * 1.5);
  glowM.addColorStop(0, `rgba(220,225,240,${0.25 * phase.illum})`);
  glowM.addColorStop(1, 'rgba(220,225,240,0)');
  ctx.fillStyle = glowM;
  ctx.beginPath(); ctx.arc(L.moonX, L.moonY, L.moonR * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(moonBig, L.moonX - L.moonR, L.moonY - L.moonR, 2 * L.moonR, 2 * L.moonR);
  label(moonPhaseName(phase.elong).name, L.moonX, L.moonY + L.moonR + 22, '#e6ebf5', 15);
  label(`สว่าง ${Math.round(phase.illum * 100)}%`, L.moonX, L.moonY + L.moonR + 40, '#8f9bb5', 12);
  label('มองจากโลก', L.moonX, L.moonY - L.moonR - 10, '#8f9bb5', 12);
}

// Tilted axis through the poles. Drawn in two passes so the part behind the globe is hidden.
function drawAxis(f, front) {
  const { R, ex, ey } = L, a = f.axis, len = 1.32;
  const seg = (t0, t1) => {
    ctx.beginPath();
    ctx.moveTo(ex + a[0] * R * t0, ey - a[1] * R * t0);
    ctx.lineTo(ex + a[0] * R * t1, ey - a[1] * R * t1);
    ctx.stroke();
  };
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff6b6b';
  if (!front) {
    // dashed upright reference (perpendicular to the orbit) and the axis behind the globe
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ex, ey - R * 1.45); ctx.lineTo(ex, ey + R * 1.45); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  // the globe hides points with z < 0 that fall inside the disk
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const t0 = -len + (2 * len * i) / steps, t1 = t0 + (2 * len) / steps, tm = (t0 + t1) / 2;
    const proj = Math.hypot(a[0] * tm, a[1] * tm);
    if (proj > 1 || a[2] * tm > 0) seg(t0, t1);
  }
  const nx = ex + a[0] * R * (len + 0.1), ny = ey - a[1] * R * (len + 0.1);
  label('N', nx, ny + 5, '#ff8f8f', 15);
  label('S', ex - a[0] * R * (len + 0.1), ey + a[1] * R * (len + 0.1) + 5, '#ff8f8f', 13);
  label(`แกนเอียง ${f.sun.eps.toFixed(1)}°`, nx + 10, ny + 5, '#8f9bb5', 12, 'left');
}

function drawPlace(f) {
  const { R, ex, ey } = L, p = state.place;
  const dl = (p.lng - f.subLng) * RAD, ph = p.lat * RAD;
  const v = [0, 1, 2].map((k) => Math.cos(ph) * Math.cos(dl) * f.u[k] + Math.cos(ph) * Math.sin(dl) * f.w[k] + Math.sin(ph) * f.axis[k]);
  if (v[2] <= 0) return;
  const x = ex + v[0] * R, y = ey - v[1] * R;
  ctx.fillStyle = '#ff3b3b';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  label(p.name, x + 8, y - 6, '#fff', 12, 'left');
}

// ---------- bird's-eye view: Sun in the middle, Earth's orbit, fixed axis toward Polaris ----------
const bird = $('bird');
const bctx = bird.getContext('2d');
const birdGlobe = document.createElement('canvas');
let B = {};
let ghostCache = { key: '', items: [] };
let birdStars = [];

function layoutBird() {
  const dpr = L.dpr, W = bird.clientWidth;
  const H = Math.round(Math.min(Math.max(W * 0.72, 440), 760));
  bird.width = Math.round(W * dpr);
  bird.height = Math.round(H * dpr);
  bird.style.height = H + 'px';
  const ro = Math.min(W * 0.36, H * 0.33);
  B = { W, H, dpr, cx: W / 2, cy: H * 0.55, ro, rb: Math.max(24, ro * 0.2), rg: Math.max(16, ro * 0.12) };
  birdGlobe.width = birdGlobe.height = Math.round(2 * B.rb * dpr);
  ghostCache.key = '';
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  birdStars = Array.from({ length: Math.round(W * H / 2500) }, () => [rnd() * W, rnd() * H, rnd() * 1.2 + 0.2, rnd() * 0.7 + 0.2]);
}

function arrow(c, x0, y0, x1, y1, color, width = 2, dash = []) {
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width; c.setLineDash(dash);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]);
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath(); c.moveTo(x1, y1);
  c.lineTo(x1 - 9 * Math.cos(a - 0.4), y1 - 9 * Math.sin(a - 0.4));
  c.lineTo(x1 - 9 * Math.cos(a + 0.4), y1 - 9 * Math.sin(a + 0.4));
  c.closePath(); c.fill();
}

function blabel(text, x, y, color = '#e6ebf5', size = 13, align = 'center') {
  bctx.font = `600 ${size}px Sarabun, system-ui, sans-serif`;
  bctx.textAlign = align; bctx.fillStyle = color; bctx.shadowColor = '#000'; bctx.shadowBlur = 4;
  bctx.fillText(text, x, y); bctx.shadowBlur = 0;
}

// Earth with its axis arrow, at screen position (x, y) and radius r, from a pre-rendered globe canvas
function drawBirdEarth(cv, f, x, y, r, strong) {
  bctx.drawImage(cv, x - r, y - r, 2 * r, 2 * r);
  const px = x + f.axis[0] * r, py = y - f.axis[1] * r; // north pole on the disk
  const len = r * (strong ? 2.1 : 1.9);
  arrow(bctx, px, py, x, y - len, strong ? '#ff6b6b' : 'rgba(255,120,120,.75)', strong ? 2.5 : 1.5, [4, 3]);
  bctx.fillStyle = '#ff6b6b';
  bctx.beginPath(); bctx.arc(px, py, strong ? 3.5 : 2.5, 0, Math.PI * 2); bctx.fill();
  if (strong) blabel('N', px + 10, py + 4, '#ff8f8f', 13, 'left');
}

function ghosts(year) {
  const key = `${year}:${B.W}`;
  if (ghostCache.key === key) return ghostCache.items;
  ghostCache = {
    key,
    items: A.seasonsOf(year).map((e) => {
      const f = birdFrame(e.jd), cv = document.createElement('canvas');
      cv.width = cv.height = Math.round(2 * B.rg * B.dpr);
      renderGlobe(f, cv);
      return { ...e, f, cv };
    }),
  };
  return ghostCache.items;
}

function drawBird(jd, phase) {
  const { W, H, dpr, cx, cy, ro, rb, rg } = B;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bctx.fillStyle = '#02040a';
  bctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of birdStars) { bctx.globalAlpha = a; bctx.fillStyle = '#fff'; bctx.fillRect(x, y, r, r); }
  bctx.globalAlpha = 1;

  // Polaris, very far away "up there": every arrow points the same way
  const sx = cx, sy = 30;
  const g = bctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
  g.addColorStop(0, 'rgba(200,225,255,1)'); g.addColorStop(1, 'rgba(200,225,255,0)');
  bctx.fillStyle = g; bctx.beginPath(); bctx.arc(sx, sy, 16, 0, Math.PI * 2); bctx.fill();
  bctx.fillStyle = '#fff';
  bctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? 2.5 : 8; bctx.lineTo(sx + rr * Math.cos(a), sy + rr * Math.sin(a)); }
  bctx.closePath(); bctx.fill();
  blabel('ดาวเหนือ (Polaris)', sx + 16, sy + 5, '#cfe1ff', 14, 'left');
  if (W >= 560) blabel('อยู่ไกล ~430 ปีแสง แกนโลกจึงชี้มาทางนี้ตลอดปี', sx + 16, sy + 22, '#8f9bb5', 12, 'left');

  // orbit and direction of travel
  bctx.strokeStyle = 'rgba(200,210,230,.35)'; bctx.lineWidth = 1.5; bctx.setLineDash([5, 6]);
  bctx.beginPath(); bctx.arc(cx, cy, ro, 0, Math.PI * 2); bctx.stroke(); bctx.setLineDash([]);
  for (const a of [Math.PI * 0.25, Math.PI * 1.25]) {
    const x = cx + ro * Math.cos(a), y = cy - ro * Math.sin(a);
    arrow(bctx, x, y, x - 14 * Math.sin(a), y - 14 * Math.cos(a), 'rgba(200,210,230,.55)', 1.5); // counterclockwise tangent
  }

  // Sun
  const sg = bctx.createRadialGradient(cx, cy, 0, cx, cy, ro * 0.32);
  sg.addColorStop(0, 'rgba(255,210,90,.6)'); sg.addColorStop(1, 'rgba(255,170,40,0)');
  bctx.fillStyle = sg; bctx.beginPath(); bctx.arc(cx, cy, ro * 0.32, 0, Math.PI * 2); bctx.fill();
  bctx.fillStyle = '#ffd34d'; bctx.beginPath(); bctx.arc(cx, cy, ro * 0.12, 0, Math.PI * 2); bctx.fill();
  blabel('ดวงอาทิตย์', cx, cy + ro * 0.12 + 16, '#ffd98a', 12);

  // the four seasons of this year, faint; labels go round the current Earth when it is close
  const f = birdFrame(jd);
  const x = cx + ro * f.pos[0], y = cy - ro * f.pos[1];
  const seasonLabels = [];
  for (const e of ghosts(A.dateOf(jd).getFullYear())) {
    const gx = cx + ro * e.f.pos[0], gy = cy - ro * e.f.pos[1];
    if (Math.hypot(gx - x, gy - y) < rb * 2.5) { // beside the Moon's orbit
      seasonLabels.push([e, x + rb * 1.75 + 8, y - 4, 'left']);
      continue;
    }
    bctx.globalAlpha = 0.55; drawBirdEarth(e.cv, e.f, gx, gy, rg, false); bctx.globalAlpha = 1;
    seasonLabels.push([e, gx, gy + (e.f.pos[1] > 0.5 ? -(rg * 2.2 + 12) : rg + 18), 'center']);
  }

  // the Earth now, with the Moon on its small orbit
  const mo = rb * 1.75, sa = Math.atan2(f.toSun[1], f.toSun[0]), ma = sa + phase.elong * RAD;
  bctx.strokeStyle = 'rgba(200,210,230,.25)'; bctx.lineWidth = 1;
  bctx.beginPath(); bctx.arc(x, y, mo, 0, Math.PI * 2); bctx.stroke();
  const mx = x + mo * Math.cos(ma), my = y - mo * Math.sin(ma), mr = Math.max(4, rb * 0.22);
  bctx.fillStyle = '#2b2f38'; bctx.beginPath(); bctx.arc(mx, my, mr, 0, Math.PI * 2); bctx.fill();
  bctx.fillStyle = '#e8e6dc'; bctx.beginPath(); bctx.arc(mx, my, mr, -sa - Math.PI / 2, -sa + Math.PI / 2); bctx.fill();
  renderGlobe(f, birdGlobe);
  const atm = bctx.createRadialGradient(x, y, rb * 0.98, x, y, rb * 1.12);
  atm.addColorStop(0, 'rgba(120,180,255,.45)'); atm.addColorStop(1, 'rgba(120,180,255,0)');
  bctx.fillStyle = atm; bctx.beginPath(); bctx.arc(x, y, rb * 1.12, 0, Math.PI * 2); bctx.fill();
  drawBirdEarth(birdGlobe, f, x, y, rb, true);

  for (const [e, lx, ly, align] of seasonLabels) {
    const d = A.dateOf(e.jd);
    blabel(e.name, lx, ly, '#f5b942', 13, align);
    blabel(`${d.getDate()} ${MONTHS[d.getMonth()]}`, lx, ly + 15, '#8f9bb5', 12, align);
  }
  if (W >= 560) blabel('มองลงมาจากเหนือระนาบวงโคจร · โลกโคจรทวนเข็มนาฬิกา', 12, H - 12, '#8f9bb5', 12, 'left');
}

// ---------- cards ----------
function moonPhaseName(e) {
  if (e < 7 || e >= 353) return { name: 'จันทร์ดับ (เดือนมืด)', en: 'New moon' };
  if (e < 83) return { name: 'ข้างขึ้น เสี้ยว', en: 'Waxing crescent' };
  if (e < 97) return { name: 'ข้างขึ้น ครึ่งดวง', en: 'First quarter' };
  if (e < 173) return { name: 'ข้างขึ้น ค่อนดวง', en: 'Waxing gibbous' };
  if (e < 187) return { name: 'จันทร์เพ็ญ (เต็มดวง)', en: 'Full moon' };
  if (e < 263) return { name: 'ข้างแรม ค่อนดวง', en: 'Waning gibbous' };
  if (e < 277) return { name: 'ข้างแรม ครึ่งดวง', en: 'Last quarter' };
  return { name: 'ข้างแรม เสี้ยว', en: 'Waning crescent' };
}

// Thai lunar day, anchored like the Thai calendar: the full-moon day is ขึ้น 15 ค่ำ and the
// new-moon day is แรม 14/15 ค่ำ. Approximate: the official calendar is arithmetic and can differ by a day.
function thaiLunarDay(ms, lastNewJd) {
  const today = localDayNumber(ms);
  const newDay = localDayNumber(A.dateOf(lastNewJd).getTime());
  const fullDay = localDayNumber(A.dateOf(A.findMoonPhase(lastNewJd, 180)).getTime());
  if (today === newDay) return 'แรม 14–15 ค่ำ (วันจันทร์ดับ)';
  if (today <= fullDay) return `ขึ้น ${Math.max(1, 15 - (fullDay - today))} ค่ำ`;
  return `แรม ${Math.min(today - fullDay, 15)} ค่ำ`;
}

const SEASON_N = ['ฤดูใบไม้ผลิ', 'ฤดูร้อน', 'ฤดูใบไม้ร่วง', 'ฤดูหนาว'];
const SEASON_S = ['ฤดูใบไม้ร่วง', 'ฤดูหนาว', 'ฤดูใบไม้ผลิ', 'ฤดูร้อน'];
function thaiSeason(d) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  if (md >= 216 && md <= 515) return 'ฤดูร้อน';
  if (md >= 516 && md <= 1015) return 'ฤดูฝน';
  return 'ฤดูหนาว';
}

function eventsAround(jd) {
  const y = A.dateOf(jd).getUTCFullYear();
  return [...A.seasonsOf(y - 1), ...A.seasonsOf(y), ...A.seasonsOf(y + 1)];
}

// Year wheel laid out like a clock: December solstice at 12, March equinox at 3,
// June solstice at 6, September equinox at 9; the Earth moves clockwise.
function renderWheel(sunLon, events) {
  const svg = $('yearWheel'), r = 70;
  const pos = (lon, rr = r) => { const a = (lon + 90) * RAD; return [rr * Math.sin(a), -rr * Math.cos(a)]; };
  let html = `<circle r="${r}" fill="none" stroke="#c0392b" stroke-width="2"/>`
    + '<circle r="15" fill="#ffd34d"/><text y="32" text-anchor="middle">ดวงอาทิตย์</text>';
  for (const e of events) {
    const [x, y] = pos(e.lon), [x2, y2] = pos(e.lon, r + 9), [tx, ty] = pos(e.lon, r + 24);
    const d = A.dateOf(e.jd);
    html += `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#f5b942" stroke-width="3"/>`
      + `<text x="${tx}" y="${ty - 2}" text-anchor="middle" class="ev">${e.name}</text>`
      + `<text x="${tx}" y="${ty + 12}" text-anchor="middle">${d.getDate()} ${MONTHS[d.getMonth()]}</text>`;
  }
  const [ex, ey] = pos(sunLon);
  html += `<circle cx="${ex}" cy="${ey}" r="8" fill="#3b82f6" stroke="#fff" stroke-width="2"/>`;
  svg.innerHTML = html;
}

/** SVG path of the lit part of the Moon (as seen from Earth) for a given elongation. */
function litPath(e, r) {
  const rx = Math.abs(Math.cos(e * RAD)) * r;
  const waxing = e < 180, crescent = e < 90 || e > 270;
  const rim = `M0,${-r}A${r},${r} 0 0 ${waxing ? 1 : 0} 0,${r}`;
  return `${rim}A${rx},${r} 0 0 ${waxing === crescent ? 0 : 1} 0,${-r}Z`;
}

// Ring of the eight phases around the Earth, Sun below (new moon between them), as in the sketch.
function renderPhaseRing(elong) {
  const r = 78, mr = 13;
  const at = (e, rr = r) => [rr * Math.sin(e * RAD), rr * Math.cos(e * RAD)];
  const names = ['จันทร์ดับ', 'ขึ้น เสี้ยว', 'ขึ้น ครึ่งดวง', 'ขึ้น ค่อนดวง', 'จันทร์เพ็ญ', 'แรม ค่อนดวง', 'แรม ครึ่งดวง', 'แรม เสี้ยว'];
  let html = `<circle r="${r}" fill="none" stroke="#c0392b" stroke-width="2"/>`
    + '<circle r="22" fill="#1d4f91" stroke="#6fa8ff"/><text y="4" text-anchor="middle">โลก</text>'
    + `<circle cy="${r + 44}" r="10" fill="#ffd34d"/><text y="${r + 62}" text-anchor="middle">ดวงอาทิตย์ (แสงมาจากด้านล่าง)</text>`;
  const cur = Math.round(norm(elong) / 45) % 8;
  names.forEach((n, i) => {
    const e = i * 45, [x, y] = at(e), [tx, ty] = at(e, r + 26 + 12 * Math.abs(Math.sin(e * RAD)));
    html += `<g transform="translate(${x},${y})"><circle r="${mr + 4}" fill="none" stroke="${i === cur ? '#f5b942' : 'none'}" stroke-width="2"/>`
      + `<circle r="${mr}" fill="#1b2235" stroke="#3a4766"/><path d="${litPath(e === 0 ? 0.01 : e, mr)}" fill="#e8e6dc"/></g>`
      + `<text x="${tx}" y="${ty + 4}" text-anchor="middle">${n}</text>`;
  });
  const [cx, cy] = at(elong);
  html += `<circle cx="${cx}" cy="${cy}" r="4" fill="#f5b942"/>`;
  $('phaseRing').innerHTML = html;
}
const norm = (d) => ((d % 360) + 360) % 360;
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function eventItem(name, jd, now) {
  const li = document.createElement('li');
  if (jd < now) li.className = 'past';
  li.innerHTML = `<span>${name}</span><span class="when">${when(A.dateOf(jd))}</span>`;
  li.addEventListener('click', () => setTime(A.dateOf(jd).getTime()));
  return li;
}

function renderCards(jd, phase) {
  const date = new Date(state.t);
  const s = A.sun(jd);
  const evs = eventsAround(jd);
  const next = evs.find((e) => e.jd > jd);
  const quarter = Math.floor(s.lon / 90);
  const north = state.place.lat >= 0;

  // seasons
  renderWheel(s.lon, A.seasonsOf(date.getFullYear()));
  $('seasonName').textContent = `${(north ? SEASON_N : SEASON_S)[quarter]}ทางดาราศาสตร์`;
  $('thaiSeason').textContent = `ฤดูของไทย: ${thaiSeason(date)} · ซีกโลก${north ? 'เหนือ' : 'ใต้'}`;
  const days = next.jd - jd;
  $('countdown').innerHTML = `อีก <b>${days < 1 ? hm(days * 24) : Math.ceil(days) + ' วัน'}</b> ถึง${next.name}`;
  const list = $('seasonList');
  list.replaceChildren(...evs.filter((e) => e.jd > jd - 200 && e.jd < jd + 200).slice(0, 4)
    .map((e) => eventItem(`${e.name} <small class="muted">${e.en}</small>`, e.jd, jd)));
  const today = evs.find((e) => localDayNumber(A.dateOf(e.jd).getTime()) === localDayNumber(state.t));
  $('stageEvent').hidden = !today;
  if (today) $('stageEvent').textContent = `วันนี้คือ${today.name} (${today.en}) ${fmtTime.format(A.dateOf(today.jd))} น.`;

  // day cycle at the chosen place
  const p = state.place, st = A.sunTimes(jd, p.lat, p.lng);
  $('placeName').textContent = `${p.name} (${p.lat.toFixed(2)}°, ${p.lng.toFixed(2)}°)`;
  const minOf = (j) => { const d = A.dateOf(j); return d.getHours() * 60 + d.getMinutes(); };
  const dayPart = $('dayPart');
  if (st.polar) {
    dayPart.style.left = '0'; dayPart.style.width = st.polar === 'day' ? '100%' : '0';
  } else {
    const a = minOf(st.rise), b = minOf(st.set);
    dayPart.style.left = (a / 14.4) + '%';
    dayPart.style.width = (((b - a + 1440) % 1440) / 14.4) + '%';
  }
  $('nowMark').style.left = ((date.getHours() * 60 + date.getMinutes()) / 14.4) + '%';
  const rows = st.polar
    ? [['สถานะ', st.polar === 'day' ? 'ดวงอาทิตย์ไม่ตก (กลางวันตลอดวัน)' : 'ดวงอาทิตย์ไม่ขึ้น (กลางคืนตลอดวัน)']]
    : [['ดวงอาทิตย์ขึ้น', fmtTime.format(A.dateOf(st.rise)) + ' น.'], ['เที่ยงสุริยะ', fmtTime.format(A.dateOf(st.noon)) + ' น.'],
      ['ดวงอาทิตย์ตก', fmtTime.format(A.dateOf(st.set)) + ' น.'], ['กลางวันยาว', hm(st.dayLength)], ['กลางคืนยาว', hm(24 - st.dayLength)]];
  rows.push(['ดวงอาทิตย์ตั้งฉากที่ละติจูด', `${Math.abs(s.dec).toFixed(2)}° ${s.dec >= 0 ? 'เหนือ' : 'ใต้'}`]);
  $('dayInfo').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // moon
  renderPhaseRing(phase.elong);
  const mp = moonPhaseName(phase.elong);
  $('moonName').textContent = mp.name;
  $('moonThai').textContent = `${thaiLunarDay(state.t, phase.lastNew)} (โดยประมาณ)`;
  $('moonInfo').innerHTML = [
    ['ส่วนที่สว่าง', `${(phase.illum * 100).toFixed(1)}%`],
    ['อายุดวงจันทร์', `${phase.age.toFixed(1)} วัน`],
    ['มุมห่างดวงอาทิตย์', `${phase.elong.toFixed(1)}°`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const names = [[0, 'จันทร์ดับ'], [90, 'ข้างขึ้น ครึ่งดวง'], [180, 'จันทร์เพ็ญ'], [270, 'ข้างแรม ครึ่งดวง']];
  const upcoming = names.map(([t, n]) => ({ n, jd: A.findMoonPhase(jd, t) })).sort((a, b) => a.jd - b.jd);
  $('moonList').replaceChildren(...upcoming.map((e) => eventItem(e.n, e.jd, jd)));
}

// ---------- state ----------
let raf = 0;
function render() {
  raf = 0;
  const d = new Date(state.t);
  // fast-forwarding: hold the time of day, otherwise the spinning globe just flickers
  if (state.playing && state.speed > DAY) d.setHours(0, state.holdMin, 0, 0);
  const jd = A.jdOf(d);
  const phase = A.moonPhase(jd);
  $('stageDate').textContent = `${fmtDate.format(d)} · ${fmtTime.format(d)} น.`;
  $('dateInput').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  $('timeInput').value = d.getHours() * 60 + d.getMinutes();
  $('timeOut').textContent = fmtTime.format(d);
  drawScene(jd, phase);
  drawBird(jd, phase);
  renderCards(jd, phase);
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
function setTime(ms) { state.t = ms; schedule(); }

function step(code) {
  const d = new Date(state.t);
  const n = parseInt(code, 10);
  if (code.endsWith('M')) d.setMonth(d.getMonth() + n);
  else d.setDate(d.getDate() + n);
  setTime(d.getTime());
}

let last = 0;
function tick(now) {
  if (!state.playing) return;
  if (last) setTime(state.t + ((now - last) / 1000) * state.speed);
  last = now;
  requestAnimationFrame(tick);
}

function setup() {
  const sel = $('placeSel');
  sel.innerHTML = PLACES.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')
    + ('geolocation' in navigator ? '<option value="me">ตำแหน่งของฉัน</option>' : '');
  sel.addEventListener('change', () => {
    if (sel.value !== 'me') { state.place = PLACES[sel.value]; schedule(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { state.place = { name: 'ตำแหน่งของฉัน', lat: pos.coords.latitude, lng: pos.coords.longitude }; schedule(); },
      () => { sel.value = '0'; state.place = PLACES[0]; schedule(); alert('ไม่สามารถอ่านตำแหน่งได้'); },
    );
  });
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => step(b.dataset.step)));
  $('nowBtn').addEventListener('click', () => setTime(Date.now()));
  $('dateInput').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const [y, m, dd] = e.target.value.split('-').map(Number);
    const d = new Date(state.t);
    d.setFullYear(y, m - 1, dd);
    setTime(d.getTime());
  });
  $('timeInput').addEventListener('input', (e) => {
    const d = new Date(state.t);
    d.setHours(0, Number(e.target.value), 0, 0);
    setTime(d.getTime());
  });
  $('speedSel').addEventListener('change', (e) => { state.speed = Number(e.target.value); });
  const play = (on) => {
    if (on && !state.playing) { const d = new Date(state.t); state.holdMin = d.getHours() * 60 + d.getMinutes(); }
    state.playing = on;
    $('playBtn').textContent = on ? '❚❚ หยุด' : '▶ เล่น';
    document.querySelectorAll('.year-btn').forEach((b) => { b.textContent = on ? '❚❚ หยุด' : '▶ ดูโลกโคจรครบ 1 ปี'; });
    last = 0;
    if (on) requestAnimationFrame(tick); else schedule();
  };
  $('playBtn').addEventListener('click', () => play(!state.playing));
  document.querySelectorAll('.year-btn').forEach((b) => b.addEventListener('click', () => {
    if (!state.playing) { state.speed = 2592000000; $('speedSel').value = String(state.speed); }
    play(!state.playing);
  }));
  $('nextEventBtn').addEventListener('click', () => {
    const jd = A.jdOf(new Date(state.t));
    const next = eventsAround(jd).find((e) => e.jd > jd + 1 / 1440);
    setTime(A.dateOf(next.jd).getTime());
  });
  window.addEventListener('resize', () => { layout(); layoutBird(); schedule(); });
  layout();
  layoutBird();
  render();
  document.fonts?.ready.then(schedule);
}

setup();
