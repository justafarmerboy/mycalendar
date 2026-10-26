// Minimal static file server: `npm start` then open http://localhost:3000
// (ES modules do not load from file://, so the page needs to be served over http).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(ROOT + path.sep) || /[\\/](\.git|node_modules|test)[\\/]/.test(file)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`ปฏิทินฟ้า: http://localhost:${PORT}`));
