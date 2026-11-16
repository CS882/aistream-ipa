/**
 * AIStream 影视 · 零依赖本地静态服务器 + 内容源同源代理
 * ------------------------------------------------------------------
 * 1) 以 http 协议提供四端入口（ES Modules / PWA 需要 http，不能用 file://）
 * 2) 把 /api/* 反向代理到需求方内容源 http://fnos.jiulingkeji.asia:8890
 *    原因：实测该站响应头无 Access-Control-Allow-Origin，浏览器 / WebView
 *    跨域直连会被 CORS 拦截；同源代理透传 Authorization 与请求体，四端统一。
 * 运行：node server.js   （PORT=8080 HOST=0.0.0.0 node server.js）
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';

// 实测：只提供明文 HTTP，HTTPS 握手失败
const UPSTREAM_HOST = process.env.AISTREAM_HOST || 'fnos.jiulingkeji.asia:8890';
const UPSTREAM = 'http://' + UPSTREAM_HOST;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * 流中转：/api/proxy?u=<encodeURIComponent(真实地址)>
 * 第三方 m3u8 / mp4 多数不返回 CORS 头，浏览器与 WebView 直连会被拦。
 * 这里把片源拉回本地同源，并重写 m3u8 里的分片 / 密钥 URI，
 * 使 hls.js 后续请求也走代理（Range 透传，302 跟随）。
 */
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
    if (s.startsWith('#')) {
      // #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA 等带 URI="..." 的标签
      return line.replace(/URI="([^"]+)"/g, (_m, u) => 'URI="' + wrap(u) + '"');
    }
    return wrap(s);   // 分片地址（绝对或相对）
  }).join('\n');
}

function proxyStream(req, res, urlObj) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    });
    res.end();
    return;
  }
  let target;
  try { target = new URL(urlObj.searchParams.get('u') || ''); }
  catch { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"error":"缺少或非法的 u 参数"}'); return; }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"error":"仅支持 http/https"}'); return;
  }
  // 防止把本机服务当成跳板递归请求
  if (/^(localhost|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(target.hostname)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"error":"不允许代理本机地址"}'); return;
  }

  const hop = (url, depth = 0) => {
    const headers = {
      'user-agent': PROXY_UA,
      accept: '*/*',
      referer: url.origin + '/',
    };
    if (req.headers.range) headers.range = req.headers.range;
    const client = url.protocol === 'https:' ? https : http;
    const p = client.request(url, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      timeout: 20000,
    }, (pr) => {
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
          res.end(req.method === 'HEAD' ? undefined : body);
        });
        pr.on('error', () => { try { res.end(); } catch { /* ignore */ } });
        return;
      }
      const out = {
        'Content-Type': ct || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      };
      ['content-length', 'content-range', 'accept-ranges'].forEach((k) => {
        if (pr.headers[k]) out[k] = pr.headers[k];
      });
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

function proxyApi(req, res, urlObj) {
  let target;
  try { target = new URL(UPSTREAM + urlObj.pathname + urlObj.search); }
  catch { res.writeHead(400); res.end('Bad upstream URL'); return; }

  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];   // 让上游返回未压缩内容，避免透传头不一致
  delete headers['connection'];

  const p = http.request(target, { method: req.method, headers, timeout: 20000 }, (pr) => {
    const out = { ...pr.headers };
    delete out['connection'];
    delete out['transfer-encoding'];
    // 刷新 CORS 相关头：同源代理后由本服务统一放行
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

const server = http.createServer((req, res) => {
  let urlObj;
  try {
    urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch { res.writeHead(400); res.end('Bad Request'); return; }

  let pathname;
  try { pathname = decodeURIComponent(urlObj.pathname); }
  catch { res.writeHead(400); res.end('Bad Request'); return; }

  // 片源流中转（第三方 m3u8 / mp4 无 CORS 头时使用）
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

  // 内容源 API：同源代理转发（含登录 POST 与 Bearer 头）
  if (pathname.startsWith('/' + 'api/')) { proxyApi(req, res, urlObj); return; }

  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;
  console.log('');
  console.log('  AIStream 影视 · 四端已启动（零依赖）');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  启动台(自动分发)  ${base}/`);
  console.log(`  电脑桌面端        ${base}/desktop.html`);
  console.log(`  iOS / 安卓移动端  ${base}/mobile.html`);
  console.log(`  TV 大屏端         ${base}/tv.html`);
  console.log('  ─────────────────────────────────────────────');
  console.log(`  内容源同源代理    ${base}/api/*  ->  ${UPSTREAM}/api/*`);
  console.log('  实测：协议 http、需 Bearer 登录、响应无 CORS 头（已由代理解决）');
  console.log('  提示：?platform=tv 可强制切端；账号在应用内登录，不内置任何凭据');
  console.log('');
});
