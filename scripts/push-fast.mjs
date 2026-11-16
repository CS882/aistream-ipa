// 高速推送：Node 内置 fetch（直连 api.github.com），并发创建 blob，一次 tree/commit/ref
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'CS882', REPO = 'aistream-ipa', BRANCH = 'main';
const ROOT = process.cwd();

if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }

// Node fetch 在本机走系统代理？用 undici ProxyAgent 不可用时，直接 https.request 走代理 CONNECT
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const opts = {
      host: 'api.github.com', port: 443, path: urlPath, method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'aistream-push',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      },
      rejectUnauthorized: false,
    };
    const doRequest = (socket) => {
      const head = [
        `${method} ${urlPath} HTTP/1.1`,
        `Host: api.github.com`,
        ...Object.entries(opts.headers).map(([k, v]) => `${k}: ${v}`),
        `Connection: close`,
        '', '',
      ].join('\r\n');
      let data = Buffer.from(head, 'utf8');
      if (payload) data = Buffer.concat([data, payload]);
      let resp = Buffer.alloc(0);
      socket.on('data', c => { resp = Buffer.concat([resp, c]); });
      socket.on('end', () => {
        const idx = resp.indexOf('\r\n\r\n');
        const body = resp.slice(idx + 4).toString('utf8');
        try { resolve(JSON.parse(body || '{}')); } catch { resolve({ __raw: body.slice(0, 300) }); }
      });
      socket.write(data);
    };
    if (PROXY) {
      const u = new URL(PROXY);
      const c = net.connect(Number(u.port) || 80, u.hostname, () => {
        c.write(`CONNECT api.github.com:443 HTTP/1.1\r\nHost: api.github.com:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
      });
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString();
        if (buf.includes('\r\n\r\n')) {
          c.removeListener('data', onData);
          if (!/200/.test(buf.split('\r\n')[0])) { c.destroy(); return reject(new Error('代理 CONNECT 失败: ' + buf.split('\r\n')[0])); }
          const secured = tls.connect({ socket: c, servername: 'api.github.com', rejectUnauthorized: false }, () => doRequest(secured));
          secured.on('error', reject);
        }
      };
      c.on('data', onData);
      c.on('error', reject);
    } else {
      const direct = tls.connect({ host: 'api.github.com', port: 443, servername: 'api.github.com', rejectUnauthorized: false }, () => doRequest(direct));
      direct.on('error', reject);
    }
  });
}

async function main() {
  console.log('1) 获取当前 ref');
  const ref = await request('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  if (ref.message) throw new Error('ref: ' + ref.message);
  const parentSha = ref.object.sha;
  const pc = await request('GET', `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
  const baseTree = pc.tree.sha;
  console.log('   parent', parentSha.slice(0, 8));

  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
    .split('\0').filter(Boolean);
  console.log('2) 文件数', files.length);

  // 确保测试文件也在树中覆盖时会保留？我们要删除 _probe.txt：从 tree 中排除它，并用 base_tree 时设为删除
  const tracked = files.filter(f => f !== '_probe.txt');

  console.log('3) 并发上传 blob（并发 12）');
  const tree = [];
  let done = 0;
  const CONC = 12;
  for (let i = 0; i < tracked.length; i += CONC) {
    const slice = tracked.slice(i, i + CONC);
    const rs = await Promise.all(slice.map(async rel => {
      const content = fs.readFileSync(path.join(ROOT, rel)).toString('base64');
      const r = await request('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
      if (!r.sha) throw new Error('blob失败 ' + rel + ': ' + JSON.stringify(r).slice(0, 120));
      return { path: rel, mode: '100644', type: 'blob', sha: r.sha };
    }));
    tree.push(...rs);
    done += rs.length;
    if (done % 60 < CONC || done === tracked.length) console.log('   ' + done + '/' + tracked.length);
  }
  // 删除测试文件
  tree.push({ path: '_probe.txt', mode: '100644', type: 'blob', sha: null });

  console.log('4) 创建 tree');
  const nt = await request('POST', `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTree, tree });
  if (!nt.sha) throw new Error('tree失败: ' + JSON.stringify(nt).slice(0, 200));

  console.log('5) 创建 commit');
  const cm = await request('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'AIStream 四端影视App + 巨魔IPA云端构建配置', tree: nt.sha, parents: [parentSha],
  });
  if (!cm.sha) throw new Error('commit失败: ' + JSON.stringify(cm).slice(0, 200));

  console.log('6) 更新 ref');
  const up = await request('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: cm.sha, force: false });
  if (up.message && !up.object) throw new Error('ref更新失败: ' + JSON.stringify(up).slice(0, 200));

  console.log('COMMIT_SHA=' + cm.sha);
}
main().catch(e => { console.error('失败:', e.message); process.exit(1); });
