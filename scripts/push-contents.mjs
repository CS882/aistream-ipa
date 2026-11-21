// 用 Contents API 串行推送（兼容细粒度令牌；避免并发 commit sha 竞争）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'CS882', REPO = 'aistream-ipa', BRANCH = 'main';
const ROOT = process.cwd();
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'aistream-push',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
    };
    const head = [
      `${method} ${urlPath} HTTP/1.1`, `Host: api.github.com`,
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      'Connection: close', '', '',
    ].join('\r\n');
    const send = (socket) => {
      let data = Buffer.from(head, 'utf8');
      if (payload) data = Buffer.concat([data, payload]);
      let resp = Buffer.alloc(0);
      socket.on('data', c => { resp = Buffer.concat([resp, c]); });
      socket.on('end', () => {
        const idx = resp.indexOf('\r\n\r\n');
        if (idx < 0) return reject(new Error('无HTTP响应头'));
        const statusLine = resp.slice(0, idx).toString().split('\r\n')[0];
        const body = resp.slice(idx + 4).toString('utf8');
        let json; try { json = JSON.parse(body || '{}'); } catch { json = { __raw: body.slice(0, 200) }; }
        json.__status = parseInt((statusLine.match(/\d{3}/) || [0])[0], 10);
        resolve(json);
      });
      socket.on('error', reject);
      socket.write(data);
    };
    if (PROXY) {
      const u = new URL(PROXY);
      const c = net.connect(Number(u.port) || 80, u.hostname, () => {
        c.write(`CONNECT api.github.com:443 HTTP/1.1\r\nHost: api.github.com:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
      });
      let buf = '';
      const onData = chunk => {
        buf += chunk.toString();
        if (buf.includes('\r\n\r\n')) {
          c.removeListener('data', onData);
          if (!/200/.test(buf.split('\r\n')[0])) { c.destroy(); return reject(new Error('代理失败: ' + buf.split('\r\n')[0])); }
          const s = tls.connect({ socket: c, servername: 'api.github.com', rejectUnauthorized: false }, () => send(s));
          s.on('error', reject);
        }
      };
      c.on('data', onData); c.on('error', reject);
    } else {
      const s = tls.connect({ host: 'api.github.com', port: 443, servername: 'api.github.com', rejectUnauthorized: false }, () => send(s));
      s.on('error', reject);
    }
  });
}

async function main() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    .split('\0').filter(Boolean).filter(f => f !== '_probe.txt');
  console.log('本地文件数', files.length);

  // 获取远端已有树的 path->sha（含测试文件），PUT 时带上 sha 即更新
  const tree = await request('GET', `/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  const shaMap = {};
  let probeSha = null;
  if (tree.tree && Array.isArray(tree.tree)) {
    for (const it of tree.tree) {
      if (it.type === 'blob') shaMap[it.path] = it.sha;
    }
    probeSha = shaMap['_probe.txt'] || null;
  }
  console.log('远端已有 blob', Object.keys(shaMap).length, '测试文件sha', probeSha ? '有' : '无');

  // 删除测试文件（Contents API）
  if (probeSha) {
    await request('DELETE', `/repos/${OWNER}/${REPO}/contents/_probe.txt`, {
      message: 'chore: remove probe', sha: probeSha, branch: BRANCH,
    });
    console.log('已删除测试文件');
  }

  let ok = 0, fail = 0;
  for (let i = 0; i < files.length; i++) {
    const rel = files[i];
    const content = fs.readFileSync(path.join(ROOT, rel)).toString('base64');
    const body = { message: 'add ' + rel, content, branch: BRANCH };
    if (shaMap[rel]) body.sha = shaMap[rel]; // 已存在则更新
    const r = await request('PUT', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel)}`, body);
    if (r.__status === 201 || r.__status === 200 || r.content) { ok++; }
    else { fail++; console.log('  失败', rel, (r.message || JSON.stringify(r)).slice(0, 90)); }
    if ((i + 1) % 25 === 0 || i + 1 === files.length) console.log(`  ${i + 1}/${files.length} (成功${ok} 失败${fail})`);
  }
  console.log(`完成: 成功 ${ok}, 失败 ${fail}`);
  if (fail) process.exit(2);
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
