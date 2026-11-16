/**
 * 巨魔 IPA 构建期参数注入（零依赖，Node 18+）
 * ------------------------------------------------------------------
 * 在 macOS 编译前运行，把 Bundle ID / Team ID / 内置网关写入：
 *   - capacitor.config.json  (appId)
 *   - src/core/ios-config.js (IOS_BUNDLE_ID / IOS_TEAM_ID / IOS_BUILTIN_GATEWAY)
 *   - ios/trollstore.entitlements.plist (application-identifier / team-identifier)
 *
 * 全部可用环境变量覆盖；未设置时用 ios-config.js 中的默认约定值。
 * 用法： node scripts/prepare-trollstore-ipa.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s);

const BUNDLE = (process.env.IOS_BUNDLE_ID || 'com.aistream.player').trim();
const TEAM = (process.env.IOS_TEAM_ID || 'AAAAAAAAAA').trim();
const GATEWAY = (process.env.GATEWAY_URL || 'http://fnos.jiulingkeji.asia:8891').trim();

if (!/^[a-z0-9.]*$/i.test(BUNDLE) || !BUNDLE.includes('.')) {
  console.error('IOS_BUNDLE_ID 非法：需形如 com.example.app'); process.exit(1);
}
if (!/^[A-Z0-9]{10}$/i.test(TEAM)) {
  console.error('IOS_TEAM_ID 非法：需 10 位字母数字'); process.exit(1);
}
if (!/^https?:\/\//i.test(GATEWAY)) {
  console.error('GATEWAY_URL 非法：需 http(s):// 开头'); process.exit(1);
}

// 1) capacitor.config.json
const cap = JSON.parse(read('capacitor.config.json'));
cap.appId = BUNDLE;
write('capacitor.config.json', JSON.stringify(cap, null, 2) + '\n');

// 2) ios-config.js
let cfg = read('src/core/ios-config.js');
cfg = cfg.replace(/export const IOS_BUNDLE_ID = '[^']*';/, `export const IOS_BUNDLE_ID = '${BUNDLE}';`);
cfg = cfg.replace(/export const IOS_TEAM_ID = '[^']*';/, `export const IOS_TEAM_ID = '${TEAM}';`);
cfg = cfg.replace(/export const IOS_BUILTIN_GATEWAY = '[^']*';/, `export const IOS_BUILTIN_GATEWAY = '${GATEWAY}';`);
write('src/core/ios-config.js', cfg);

// 3) entitlements
let ent = read('ios/trollstore.entitlements.plist');
ent = ent.replace(/<string>AAAAAAAAAA\.com\.aistream\.player<\/string>/, `<string>${TEAM}.${BUNDLE}</string>`);
ent = ent.replace(/<key>com\.apple\.developer\.team-identifier<\/key>\s*<string>[^<]*<\/string>/,
  `<key>com.apple.developer.team-identifier</key>\n\t<string>${TEAM}</string>`);
write('ios/trollstore.entitlements.plist', ent);

console.log('IPA 构建参数已注入：');
console.log('  Bundle ID :', BUNDLE);
console.log('  Team ID   :', TEAM);
console.log('  内置网关  :', GATEWAY);
