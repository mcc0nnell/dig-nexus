import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const allowed = new Set(['index.html', 'app.mjs', 'themes.mjs', 'layout.css', 'generated/themes.css', 'generated/semantic.css', 'upstream/SOURCE.md', 'upstream/LICENSE']);
const types = {'.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.md': 'text/plain'};
export const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) { res.writeHead(403).end(); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const raw = decodeURIComponent(req.url.split('?')[0]);
    const file = raw === '/' ? 'index.html' : raw.slice(1);
    if (!raw.startsWith('/') || !allowed.has(file)) { res.writeHead(404).end(); return; }
    const target = await fs.realpath(path.join(root, file));
    if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
    const content = await fs.readFile(target);
    res.setHeader('Content-Type', `${types[path.extname(file)] || 'text/plain'}; charset=utf-8`);
    res.writeHead(200).end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(400).end(); }
});
server.listen(Number(process.env.PORT || 4178), '127.0.0.1', () => console.log(`Theme lab: http://127.0.0.1:${server.address().port}`));
