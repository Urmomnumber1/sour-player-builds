// A stand-in for Hermes Music in the iPhone simulator check: /api/status (what the app checks before
// it moves to an address) and a web build at /app/, like the real one. Everything else answers empty.
// IMPOSTOR=1 answers every address with a plain web page instead (like an Umbrel's own dashboard).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3060);
const WEB = path.resolve(process.env.WEB || 'out/web');
const TYPES = {
    '.css': 'text/css',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    console.log(req.method, p);
    if (process.env.IMPOSTOR === '1') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('<!doctype html><title>umbrelOS</title><h1>Welcome</h1>');
    }
    res.setHeader('access-control-allow-origin', '*');
    if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST' });
        return res.end();
    }
    if (p === '/api/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ asking: 0, done: 0, failed: 0, library: { files: 3, scanning: false }, pending: 0, workers: [], working: 0 }));
    }
    if (p === '/app') {
        res.writeHead(302, { location: '/app/' });
        return res.end();
    }
    if (p.startsWith('/app/')) {
        const rel = decodeURIComponent(p.slice(5)) || 'index.html';
        if (rel === 'settings.js') {
            res.writeHead(200, { 'content-type': 'text/javascript' });
            return res.end('// set by Hermes Music\n');
        }
        let file = path.resolve(WEB, rel);
        if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            if (path.extname(rel)) {
                res.writeHead(404);
                return res.end();
            }
            file = path.join(WEB, 'index.html');
        }
        res.writeHead(200, { 'cache-control': 'no-cache', 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"error":"not found"}');
}).listen(PORT, '0.0.0.0', () => console.log(`stand-in Hermes Music on :${PORT} serving ${WEB}`));
