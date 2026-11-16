/**
 * 把 Web 统一内核同步到各原生壳的静态资源目录。
 * 浏览器开发时直接访问项目根；打包时所有原生壳只加载这份副本，保持四端界面一致。
 * 运行：npm run sync:assets
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = ['index.html', 'desktop.html', 'mobile.html', 'tv.html', 'sw.js'];
const DIRS = ['src', 'public'];

const TARGETS = [
  ['web', 'Electron / Capacitor 静态资源根'],
  ['android/app/src/main/assets/www', '安卓手机 APK assets'],
  ['android-tv/app/src/main/assets/www', '安卓 TV APK assets'],
];

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) copyFile(s, d);
  }
}

let total = 0;
for (const [target, label] of TARGETS) {
  const out = path.join(ROOT, target);
  fs.mkdirSync(out, { recursive: true });
  for (const f of FILES) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) throw new Error(`缺少源文件: ${f}`);
    copyFile(src, path.join(out, f));
    total++;
  }
  for (const d of DIRS) {
    const src = path.join(ROOT, d);
    if (!fs.existsSync(src)) throw new Error(`缺少源目录: ${d}`);
    copyDir(src, path.join(out, d));
    const count = fs.readdirSync(src, { recursive: true }).filter((x) => fs.statSync(path.join(src, x)).isFile()).length;
    total += count;
  }
  console.log(`  OK  ${target}  (${label})`);
}
console.log(`\n  已同步 ${total} 个静态资源副本（不含 docs / scripts / node_modules / 原生工程）。`);
