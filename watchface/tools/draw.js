// Drawing code for the watch face images, run inside a browser page by render-assets.cjs.
// The globe and Moon shading are the same as the web app (js/app.js), drawn at watch size.
/* global LAND_B64, LAYOUT */
(() => {
  const RAD = Math.PI / 180;
  const L = LAYOUT;
  const land = Uint8Array.from(atob(LAND_B64), (c) => c.charCodeAt(0));
  const landBit = (r, c) => {
    const i = Math.min(179, Math.max(0, r)) * 360 + (((c % 360) + 360) % 360);
    return (land[i >> 3] >> (i & 7)) & 1;
  };
  function isLand(lat, lng) {
    const y = 89.5 - lat, x = lng + 179.5;
    const r = Math.floor(y), c = Math.floor(x), fy = y - r, fx = x - c;
    const top = landBit(r, c) * (1 - fx) + landBit(r, c + 1) * fx;
    const bottom = landBit(r + 1, c) * (1 - fx) + landBit(r + 1, c + 1) * fx;
    return top * (1 - fy) + bottom * fy > 0.5;
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => scale(a, 1 / Math.hypot(...a));
  const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // Earth seen from the side with the Sun on the left, for solar longitude `lon` (degrees).
  // The continents are fixed with Thailand facing the viewer (local evening side of the day/night line).
  function earthFrame(lon) {
    const e = 23.44 * RAD, l = lon * RAD;
    const axis = [-Math.sin(e) * Math.sin(l), Math.cos(e), Math.sin(e) * Math.cos(l)];
    const toSun = [-1, 0, 0];
    const u = unit(sub(toSun, scale(axis, dot(toSun, axis))));
    return { axis, u, w: cross(axis, u), toSun, subLng: 100.5 - 90 };
  }

  function globe(f, n) {
    const cv = canvas(n), c2 = cv.getContext('2d'), img = c2.createImageData(n, n), d = img.data;
    const half = n / 2, lw = 0.9 * 57.3 / half;
    const { axis, u, w, subLng, toSun } = f;
    for (let py = 0; py < n; py++) {
      const y = 1 - (py + 0.5) / half;
      for (let px = 0; px < n; px++) {
        const x = (px + 0.5) / half - 1, r2 = x * x + y * y;
        if (r2 > 1) continue;
        const z = Math.sqrt(1 - r2);
        const lat = Math.asin(x * axis[0] + y * axis[1] + z * axis[2]) / RAD;
        const lng = subLng + Math.atan2(x * w[0] + y * w[1] + z * w[2], x * u[0] + y * u[1] + z * u[2]) / RAD;
        let cr, cg, cb;
        if (isLand(lat, lng)) {
          if (lat < -60 || lat > 72) [cr, cg, cb] = [235, 240, 245];
          else {
            const dry = 0.65 * Math.exp(-(((Math.abs(lat) - 25) / 8) ** 2));
            [cr, cg, cb] = [78 + 96 * dry, 140 + 14 * dry, 70 + 30 * dry];
          }
        } else [cr, cg, cb] = [22, 74, 150];
        const al = Math.abs(lat);
        const g = (t, rr, gg, bb, k) => { if (Math.abs(al - t) < lw) { cr += (rr - cr) * k; cg += (gg - cg) * k; cb += (bb - cb) * k; } };
        g(0, 255, 230, 120, 0.85);
        g(23.44, 255, 150, 80, 0.7);
        g(66.56, 150, 210, 255, 0.7);
        const light = x * toSun[0] + y * toSun[1] + z * toSun[2];
        const day = Math.min(1, Math.max(0, (light + 0.06) / 0.14));
        const k = day * (0.45 + 0.55 * Math.max(light, 0) ** 0.6) + (1 - day) * 0.13;
        const i = (py * n + px) * 4;
        d[i] = cr * k + (1 - day) * 4; d[i + 1] = cg * k + (1 - day) * 8; d[i + 2] = cb * k + (1 - day) * 22;
        d[i + 3] = 255 * Math.min(1, (1 - Math.sqrt(r2)) * half);
      }
    }
    c2.putImageData(img, 0, 0);
    return cv;
  }

  window.renderEarth = (lon) => {
    const S = L.earthImg, R = L.earthR, c = canvas(S), ctx = c.getContext('2d'), m = S / 2;
    const f = earthFrame(lon), a = f.axis, len = 1.35;
    const atm = ctx.createRadialGradient(m, m, R * 0.97, m, m, R * 1.12);
    atm.addColorStop(0, 'rgba(120,180,255,.55)'); atm.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(m, m, R * 1.12, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(globe(f, 2 * R), m - R, m - R);
    // tilted axis: hidden where it is behind the globe
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    const steps = 80;
    for (let i = 0; i < steps; i++) {
      const t0 = -len + (2 * len * i) / steps, t1 = t0 + (2 * len) / steps, tm = (t0 + t1) / 2;
      if (Math.hypot(a[0] * tm, a[1] * tm) > 1 || a[2] * tm > 0) {
        ctx.beginPath(); ctx.moveTo(m + a[0] * R * t0, m - a[1] * R * t0); ctx.lineTo(m + a[0] * R * t1, m - a[1] * R * t1); ctx.stroke();
      }
    }
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath(); ctx.arc(m + a[0] * R * len, m - a[1] * R * len, 4, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  };

  // Moon as the Earth sees it at elongation `e` (waxing lit on the right), with its maria
  const MARIA = [[-0.3, 0.45, 0.22, 0.2], [0.18, 0.42, 0.14, 0.2], [0.05, 0.24, 0.07, 0.15], [0.3, 0.15, 0.17, 0.2],
    [0.64, 0.3, 0.1, 0.22], [0.55, -0.08, 0.12, 0.18], [0.36, -0.27, 0.08, 0.16], [-0.58, 0.1, 0.28, 0.17],
    [-0.25, -0.17, 0.11, 0.12], [-0.14, -0.36, 0.14, 0.16], [-0.43, -0.38, 0.08, 0.18], [-0.12, -0.72, 0.04, -0.25]];
  window.renderMoon = (elong, size) => {
    const n = size, c = canvas(n), ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data, half = n / 2;
    const e = elong * RAD, limb = elong < 180 ? 270 * RAD : 90 * RAD;
    const Lx = -Math.sin(limb) * Math.sin(e), Lz = -Math.cos(e);
    for (let py = 0; py < n; py++) {
      const y = 1 - (py + 0.5) / half;
      for (let px = 0; px < n; px++) {
        const x = (px + 0.5) / half - 1, r2 = x * x + y * y;
        if (r2 > 1) continue;
        const z = Math.sqrt(1 - r2);
        let alb = 0.85;
        for (const [mx, my, mr, k] of MARIA) {
          const dd = ((x - mx) ** 2 + (y - my) ** 2) / (mr * mr);
          if (dd < 1) alb -= k * (1 - dd) ** 0.7;
        }
        const cosI = x * Lx + z * Lz;
        const lit = Math.min(1, Math.max(0, (cosI + 0.03) / 0.08));
        const b = (lit * (0.4 + 0.6 * Math.max(0, cosI) ** 0.5) + 0.16 * (1 - lit)) * alb; // earthshine keeps the dark side visible
        const i = (py * n + px) * 4;
        d[i] = 250 * b + (1 - lit) * 8; d[i + 1] = 245 * b + (1 - lit) * 12; d[i + 2] = 232 * b + (1 - lit) * 24;
        d[i + 3] = 255 * Math.min(1, (1 - Math.sqrt(r2)) * half);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };

  // Static background: stars, the Sun on the left, sunlight and the Moon's orbit
  window.renderBg = () => {
    const W = 480, c = canvas(W), ctx = c.getContext('2d');
    ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, W, W);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 110; i++) { ctx.globalAlpha = rnd() * 0.6 + 0.2; ctx.fillStyle = '#fff'; const s = rnd() * 1.6 + 0.6; ctx.fillRect(rnd() * W, rnd() * W, s, s); }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(L.sunX, L.cy, L.sunR * 0.6, L.sunX, L.cy, L.sunR * 2.1);
    glow.addColorStop(0, 'rgba(255,200,80,.5)'); glow.addColorStop(1, 'rgba(255,160,40,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, W);
    const body = ctx.createRadialGradient(L.sunX + L.sunR * 0.3, L.cy, 0, L.sunX, L.cy, L.sunR);
    body.addColorStop(0, '#fffbe0'); body.addColorStop(0.7, '#ffd34d'); body.addColorStop(1, '#ff9a1f');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(L.sunX, L.cy, L.sunR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,110,.35)'; ctx.fillStyle = 'rgba(255,215,110,.55)'; ctx.lineWidth = 2;
    for (const k of [-0.7, 0, 0.7]) {
      const y = L.cy + k * L.earthR, x0 = L.sunX + L.sunR + 10, x1 = L.cx - L.earthR * Math.sqrt(1 - k * k) - 18;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1 + 2, y); ctx.lineTo(x1 - 8, y - 5); ctx.lineTo(x1 - 8, y + 5); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(200,210,230,.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.ellipse(L.cx, L.cy, L.orbitRx, L.orbitRy, 0, 0, Math.PI * 2); ctx.stroke();
    return c.toDataURL('image/png');
  };

  // A line of Thai text as an image: the watch's own font drops tone marks stacked on upper vowels
  window.renderText = (text, size, h, color) => {
    const probe = canvas(1).getContext('2d');
    probe.font = `700 ${size}px Sarabun, sans-serif`;
    const w = Math.ceil(probe.measureText(text).width) + 4;
    const c = canvas(w, h), ctx = c.getContext('2d');
    ctx.font = probe.font; ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.fillText(text, 2, h / 2 + 1);
    return { url: c.toDataURL('image/png'), w };
  };

  // Digits for the time, drawn in the page's display font
  window.renderGlyph = (ch, w, h, size, color) => {
    const c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = color; ctx.font = `700 ${size}px Sarabun, DejaVu Sans, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, w / 2, h * 0.86);
    return c.toDataURL('image/png');
  };
})();
