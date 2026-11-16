/**
 * AIStream 影视 · 电脑桌面端 Electron 壳
 * ------------------------------------------------------------------
 * 内置同源静态服务 + /api/* 反向代理，转发到需求方内容源：
 *   http://fnos.jiulingkeji.asia:8890
 * 原因：实测该站响应无 Access-Control-Allow-Origin，渲染进程直连会被 CORS 拦截；
 *      同源代理同时透传 Authorization: Bearer <token> 与登录 POST 请求体。
 * 运行：npm i -D electron && npm run desktop
 */
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const UPSTREAM_HOST = process.env.AISTREAM_HOST || 'fnos.jiulingkeji.asia:8890';
const UPSTREAM = 'http://' + UPSTREAM_HOST;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let server = null;

function proxyApi(req, res, urlObj) {
  let target;
  try { target = new URL(UPSTREAM + urlObj.pathname + urlObj.search); }
  catch { res.writeHead(400); res.end('Bad upstream URL'); return; }

  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];
  delete headers['connection'];

  const p = http.request(target, { method: req.method, headers, timeout: 20000 }, (pr) => {
    const out = { ...pr.headers };
    delete out['connection'];
    delete out['transfer-encoding'];
    out['access-control-allow-origin'] = '*';
    res.writeHead(pr.statusCode, out);
    pr.pipe(res);
  });
  p.on('timeout', () => p.destroy(new Error('上游响应超时')));
  p.on('error', (e) => {
    if (res.headersSent) { try { res.end(); } catch { /* ignore */ } return; }
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '内容源代理失败：' + (e?.message || e) }));
  });
  req.pipe(p);
}

/* ---------- 片源流中转 /api/proxy?u= （第三方 m3u8 无 CORS 头） ---------- */
const PROXY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 AIStream/1.0';

function looksM3u8(urlStr, contentType) {
  return /mpegurl/i.test(contentType || '') || /\.m3u8(\?|#|$)/i.test(urlStr || '');
}

function rewriteM3u8(text, baseUrl) {
  const abs = (u) => { try { return new URL(u, baseUrl).href; } catch { return u; } };
  const wrap = (u) => '/api/proxy?u=' + encodeURIComponent(abs(u));
  return String(text).split(/\r?\n/).map((line) => {
    const s = line.trim();
    if (!s) return line;
    if (s.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, u) => 'URI="' + wrap(u) + '"');
    return wrap(s);
  }).join('\n');
}

function proxyStream(req, res, urlObj) {
  let target;
  try { target = new URL(urlObj.searchParams.get('u') || ''); }
  catch { res.writeHead(400); res.end('{"error":"缺少或非法的 u 参数"}'); return; }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') { res.writeHead(400); res.end('{"error":"仅支持 http/https"}'); return; }
  if (/^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(target.hostname)) { res.writeHead(400); res.end('{"error":"不允许代理本机地址"}'); return; }

  const hop = (url, depth = 0) => {
    const headers = { 'user-agent': PROXY_UA, accept: '*/*', referer: url.origin + '/' };
    if (req.headers.range) headers.range = req.headers.range;
    const client = url.protocol === 'https:' ? https : http;
    const p = client.request(url, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers, timeout: 20000 }, (pr) => {
      const code = pr.statusCode || 502;
      if (code >= 300 && code < 400 && pr.headers.location && depth < 5) {
        pr.resume();
        let next = null;
        try { next = new URL(pr.headers.location, url); } catch { /* ignore */ }
        if (next) { hop(next, depth + 1); return; }
      }
      const ct = String(pr.headers['content-type'] || '');
      if (looksM3u8(url.href, ct)) {
        const chunks = [];
        pr.on('data', (d) => chunks.push(d));
        pr.on('end', () => {
          const body = Buffer.from(rewriteM3u8(Buffer.concat(chunks).toString('utf8'), url.href), 'utf8');
          res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
            'Content-Length': body.length,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          });
          res.end(body);
        });
        pr.on('error', () => { try { res.end(); } catch { /* ignore */ } });
        return;
      }
      const out = { 'Content-Type': ct || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
      ['content-length', 'content-range', 'accept-ranges'].forEach((k) => { if (pr.headers[k]) out[k] = pr.headers[k]; });
      res.writeHead(code, out);
      pr.pipe(res);
    });
    p.on('timeout', () => p.destroy(new Error('流中转超时')));
    p.on('error', (e) => {
      if (res.headersSent) { try { res.end(); } catch { /* ignore */ } return; }
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '流中转失败：' + (e?.message || e) }));
    });
    p.end();
  };
  hop(target);
}

function serve() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let urlObj;
      try { urlObj = new URL(req.url, 'http://127.0.0.1'); }
      catch { res.writeHead(400); res.end(); return; }

      let pathname;
      try { pathname = decodeURIComponent(urlObj.pathname); }
      catch { res.writeHead(400); res.end(); return; }

      // 跨域网关（iOS 等）会先发 OPTIONS 预检：直接放行，避免 Authorization 触发 CORS 失败
      if (req.method === 'OPTIONS' && pathname.startsWith('/' + 'api/')) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Max-Age': '600',
        });
        res.end();
        return;
      }
      if (pathname === '/api/proxy') { proxyStream(req, res, urlObj); return; }
      if (pathname.startsWith('/' + 'api/')) { proxyApi(req, res, urlObj); return; }

      if (pathname === '/') pathname = '/index.html';
      const file = path.resolve(ROOT, '.' + pathname);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.whenReady().then(async () => {
  const port = await serve();
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    title: 'AIStream 影视',
    backgroundColor: '#0b0d14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(`http://127.0.0.1:${port}/desktop.html?platform=desktop`);
  console.log(`[AIStream] 内容源代理: http://127.0.0.1:${port}/api/* -> ${UPSTREAM}/api/*`);
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});
