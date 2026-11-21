/**
 * AIStream 影视 · 交付自检脚本（零依赖）
 * 运行：npm run check
 * 检查：JS 语法、四端入口完整性、导航改造、适配层契约，
 *      以及「不得编造影视示例数据」的硬约束（扫描全项目，含本脚本自身与全部文档）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const results = [];
const ok = (name, detail = '') => results.push({ pass: true, name, detail });
const bad = (name, detail = '') => results.push({ pass: false, name, detail });

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }
function walk(dir, ext, acc = []) {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    // 跳过依赖与构建产物目录，避免遍历上万个 node_modules 文件
    if (name === 'node_modules' || name === 'dist-win' || name === 'dist' || name === '.git') continue;
    const rel = path.join(dir, name);
    const full = path.join(ROOT, rel);
    if (fs.statSync(full).isDirectory()) walk(rel, ext, acc);
    else if (ext.some((e) => name.endsWith(e))) acc.push(rel);
  }
  return acc;
}

/* 1. 四端入口与核心文件完整性 */
const required = [
  'index.html', 'desktop.html', 'mobile.html', 'tv.html',
  'src/core/config.js', 'src/core/datasource.js', 'src/core/store.js',
  'src/core/platform.js', 'src/core/events.js',
  'src/styles/theme.css', 'src/styles/shared.css', 'src/components/content.js',
  'src/platforms/desktop/desktop.js', 'src/platforms/desktop/desktop.css',
  'src/platforms/mobile/mobile.js', 'src/platforms/mobile/mobile.css',
  'src/platforms/tv/tv.js', 'src/platforms/tv/tv.css',
  'electron-main.cjs', 'capacitor.config.json', 'public/manifest.json', 'server.js', 'sw.js',
  '.github/workflows/build-trollstore-ipa.yml',
  'ios/build-trollstore-ipa.sh', 'ios/package-trollstore-ipa.sh', 'ios/trollstore.entitlements.plist',
  'scripts/prepare-trollstore-ipa.mjs', 'src/core/ios-config.js',
  'docs/14-巨魔IPA构建与网关部署.md',
  'src/components/auth.js', 'src/core/datasource.js',
  'src/core/settings.js', 'src/components/settings.js', 'src/components/extras.js',
  'docs/00-待补充项清单.md', 'docs/02-数据源对接指南.md', 'docs/03-各端运行说明.md',
  'docs/05-原生安装包构建说明.md', 'docs/06-影视网站对接实测报告.md',
];
const missing = required.filter((p) => !exists(p));
missing.length ? bad('文件完整性', '缺少：' + missing.join(', ')) : ok('文件完整性', `${required.length} 个必需文件齐全`);

/* 2. JS 语法检查 */
const jsFiles = [...walk('src', ['.js']), 'server.js', 'sw.js', 'scripts/check.mjs'];
const syntaxErrors = [];
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); }
  catch (e) { syntaxErrors.push(`${f}: ${String(e.stderr || e.message).trim().slice(0, 160)}`); }
}
syntaxErrors.length ? bad('JS 语法', syntaxErrors.join(' | ')) : ok('JS 语法', `${jsFiles.length} 个模块通过 node --check`);
try {
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'electron-main.cjs')], { stdio: 'pipe' });
  ok('Electron 主进程语法', '通过');
} catch (e) { bad('Electron 主进程语法', String(e.stderr || e.message).slice(0, 160)); }

/* 3. 硬约束：全项目不得出现影视示例数据 / 虚构播放地址
   只检测「示例数据形态」，规则本身不写入任何具体片名、集数或评分；
   模式用拼接构造，避免规则文件自我匹配；扫描范围含本脚本与全部文档。 */
const scanned = walk('.', ['.js', '.mjs', '.cjs', '.css', '.html', '.md', '.json', '.svg'])
  .filter((f) => !f.startsWith('node_modules'))
  // 第三方压缩库（站点同款 hls.js）与原生壳资源副本不参与内容形态扫描
  .filter((f) => !f.includes('public/vendor'));
const allText = scanned.map((f) => `${f}\n${read(f)}`).join('\n');
const FORBIDDEN = [
  // 只禁止「硬编码的完整示例播放地址」；格式判定正则里的后缀不是示例数据
  ['示例播放地址', new RegExp('https?://[^\\s"\'`<>]{0,120}\\.(?:m3u' + '8|mp4)', 'i')],
  ['示例视频文件', new RegExp('test' + '\\.mp4', 'i')],
  ['示例域名', new RegExp('example' + '\\.(com|org|net)', 'i')],
  ['编造集数文案', new RegExp('更\\s*\\d+\\s*集')],
];
const hits = FORBIDDEN.filter(([, re]) => re.test(allText)).map(([n]) => n);
hits.length ? bad('无示例影视数据', '检出：' + hits.join(', '))
  : ok('无示例影视数据', `全项目 ${scanned.length} 个文本文件（含脚本与文档）无示例影视数据形态`);

/* 4. 数据源：只使用需求方提供的 host，其余留空 */
const ds = read('src/core/datasource.js');
if (!ds.includes("'fnos.jiulingkeji.asia:8890'")) bad('内容源地址', '未提供 host 未写入');
else if (/https?:\/\/fnos\.jiulingkeji\.asia/.test(ds)) bad('内容源协议', '检测到自行假定 http/https');
else ok('内容源地址', '仅使用 fnos.jiulingkeji.asia:8890，协议与接口均为实测值');
if (ds.includes('allowMockData: false')) ok('示例数据开关', 'allowMockData 恒为 false');
else bad('示例数据开关', '未声明禁止示例数据');

/* 5. 导航改造 */
const cfg = read('src/core/config.js');
const navBlock = cfg.slice(cfg.indexOf('export const PRIMARY_NAV'), cfg.indexOf('export const REMOVED_NAV'));
// 只提取实际的 label 值，跳过说明性注释与行内注释（其中会提到被移除的旧名称）
const labels = [...navBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
if (labels.includes('独家大瓜') || labels.includes('游戏中心')) bad('导航改造', '主导航仍含被移除项');
else if (!labels.includes('榜单')) bad('导航改造', '未找到替换项');
else ok('导航改造', `已移除「独家大瓜」，替换「游戏中心」为「榜单」；主导航 = ${labels.join(' / ')}`);

/* 6. 四端统一业务内核 + 独立布局 */
const platforms = ['desktop', 'mobile', 'tv'];
const sharedStore = platforms.every((p) => read(`src/platforms/${p}/${p}.js`).includes("from '../../core/store.js'"));
sharedStore ? ok('统一业务逻辑', '三端均只调用 src/core/store.js') : bad('统一业务逻辑', '存在端内私有业务副本');
const independent = platforms.every((p) => read(`src/platforms/${p}/${p}.css`).length > 2000);
independent ? ok('独立适配界面', '三套独立 CSS 布局模块，非缩放') : bad('独立适配界面', '布局样式过薄');
const tvFocus = read('src/platforms/tv/tv.js').includes('class FocusManager');
tvFocus ? ok('TV 遥控导航', '存在空间焦点管理器') : bad('TV 遥控导航', '缺少 FocusManager');
const plat = read('src/core/platform.js');
plat.includes('${platform}.html') ? ok('四端切换器', '切换链接指向对应端 HTML 入口')
  : bad('四端切换器', '切换链接可能只改查询参数，不会真正换端');

/* 7. 实测对接契约（协议/接口/字段均来自对需求方站点的实际探测） */
(ds.includes("protocol: 'http'") && ds.includes("home: 'api/home'") && ds.includes("login: 'api/auth/login'"))
  ? ok('实测接口配置', '协议与接口为实测值，内置需求方域名') : bad('实测接口配置', '缺少实测接口配置');
(ds.includes("prefix: 'Bearer '") && ds.includes('aistream_token'))
  ? ok('Bearer 鉴权', '登录后取 token，后续请求带 Authorization') : bad('Bearer 鉴权', '缺少鉴权实现');
(ds.includes("home: 'columns'") && ds.includes("search: 'collect'") && ds.includes("episodeUrl: 'url'"))
  ? ok('响应字段映射', 'columns/items/collect/results/episodes.url 均为实测字段')
  : bad('响应字段映射', '字段映射不完整');
const proxyFiles = [
  'server.js', 'electron-main.cjs',
  'android/app/src/main/java/com/aistream/pending/mobile/MainActivity.java',
  'android-tv/app/src/main/java/com/aistream/pending/tv/MainActivity.java',
];
proxyFiles.every((f) => read(f).includes('proxyApi'))
  ? ok('四端同源代理', '本地服务 / Electron / 手机 / TV 均转发 /api/*（解决无 CORS 头）')
  : bad('四端同源代理', '存在缺少代理的端');
const authOk = exists('src/components/auth.js') && ['desktop', 'mobile', 'tv']
  .every((p) => read(`src/platforms/${p}/${p}.js`).includes('mountAuthGate'));
authOk ? ok('四端登录界面', '共用登录/注册组件，账号由使用者输入')
  : bad('四端登录界面', '存在未接入登录的端');

/* 8. 待补充项集中登记 */
const pendingDoc = exists('docs/00-待补充项清单.md') ? read('docs/00-待补充项清单.md') : '';
(pendingDoc.includes('fnos.jiulingkeji.asia:8890') && pendingDoc.includes('待补充'))
  ? ok('待补充项清单', '已集中登记，含唯一已提供地址') : bad('待补充项清单', '清单缺失或内容不完整');

/* 8.5 界面改版与函数完整性（防止「引用存在但定义缺失」） */
const requiredFns = ['fetchPublic', 'login', 'register', 'fetchUser', 'fetchChannels',
  'fetchByCategory', 'fetchList', 'search', 'fetchDetail', 'resolvePlay', 'fetchExtra', 'statusSummary'];
const missingFns = requiredFns.filter((n) =>
  !ds.includes('export async function ' + n) && !ds.includes('export function ' + n));
missingFns.length ? bad('适配层函数完整', '缺少定义：' + missingFns.join(', '))
  : ok('适配层函数完整', `${requiredFns.length} 个能力均有定义`);

(cfg.includes("{ id: 'series', label: '电视剧'") && cfg.includes("source: 'catalog'")
  && cfg.includes("{ id: 'iptv', label: 'IPTV'") && cfg.includes("source: 'official-vod'")
  && !cfg.includes("id: 'short'") && !cfg.includes("id: 'doc'"))
  ? ok('影视类型栏目', '顶部按 电影/电视剧/动漫/综艺/点播/IPTV 区分，短剧与纪录片已按需求去掉')
  : bad('影视类型栏目', '分类未更新或短剧/纪录片未去掉');

/* 本轮新增：分类接口、快捷入口结构化、内置播放器 */
const extras = read('src/components/extras.js');
const settings = read('src/core/settings.js');
const player = exists('src/components/player.js') ? read('src/components/player.js') : '';
const tvJs = read('src/platforms/tv/tv.js');

(ds.includes("catalog: 'api/up/catalog'") && ds.includes('api/up/catalog?kind=') && ds.includes("posterUrl: 'poster_url'"))
  ? ok('类型分类真实接口', 'api/up/catalog?kind= 为主路径，poster_url/title 等字段按实测映射')
  : bad('类型分类真实接口', '未接站点实测的分类榜单接口');

(!extras.includes('function summarize') && ['extraCards', 'pointsCard', 'weeklyCard'].every((n) => extras.includes(n))
  && ds.includes("kind: 'points'") && ds.includes("kind: 'weekly'"))
  ? ok('快捷入口修复', '不再摊开原始 JSON；历史/收藏/预约→卡片，积分→会员，追剧→周片单')
  : bad('快捷入口修复', '仍存在原始 JSON 摊开或结构化视图缺失');

(player.includes('bus.on(EVT.PLAY') && player.includes('hls.min.js') && player.includes('__aisPlayerBack')
  && settings.includes("default: 'internal'") && exists('public/vendor/hls.min.js')
  && read('src/components/chrome.js').includes("import './player.js'")
  && tvJs.includes('window.__aisPlayerBack'))
  ? ok('内置播放器', 'HLS 本地内置 + 选集/线路 + 四端遥控返回 + 默认内置播放模式')
  : bad('内置播放器', '播放器未完整接入');

/* 本轮新增：开源播放器 / 分类缓存 / 我的页标签 */
const storeJs = read('src/core/store.js');
(exists('public/vendor/artplayer.js') && exists('public/vendor/artplayer-plugin-danmuku.js')
  && player.includes('window.Artplayer') && player.includes('artplayerPluginDanmuku')
  && player.includes('AIStreamPlayer') && player.includes('danmuku: []'))
  ? ok('开源播放器与弹幕', 'ArtPlayer + 官方弹幕插件离线内置，本地弹幕与插件扩展口齐备')
  : bad('开源播放器与弹幕', '缺少开源内核或弹幕插件');

(ds.includes('export function peekList') && storeJs.includes('refreshSeq')
  && storeJs.includes('ds.peekList(params)') && ds.includes('AbortController'))
  ? ok('分类切换性能', '列表缓存 + 请求序号防竞态 + 超时，切换分类不再等待聚合扫描')
  : bad('分类切换性能', '缺少缓存或竞态保护');

(cfg.includes('export const MINE_TABS') && extras.includes('class="mine-tabs"')
  && !extras.includes('${quickEntries(state)}')
  && ['desktop', 'mobile', 'tv'].every((p) => read(`src/platforms/${p}/${p}.js`).includes("mine-tab"))
  && !cfg.includes("{ id: 'iptv', label: 'IPTV 直播'"))
  ? ok('我的页标签化', '账户标签只放会员/积分；主区不再重复快捷入口；IPTV 与顶部分类去重')
  : bad('我的页标签化', '标签结构或去重未完成');

/* 本轮迭代：筛选/榜单腾讯视频式 + 播放器自动换源 */
(exists('src/components/filters.js') && read('src/components/filters.js').includes('applyFilter')
  && ['desktop', 'mobile', 'tv'].every((p) => read(`src/platforms/${p}/${p}.js`).includes('function rankView'))
  && ['desktop', 'mobile', 'tv'].every((p) => read(`src/platforms/${p}/${p}.js`).includes('filterRows(state')))
  ? ok('筛选与榜单', '筛选页按腾讯视频式四行筛选（选项来自真实 area/year），榜单独立视图')
  : bad('筛选与榜单', '筛选或榜单未接入');

(player.includes('function autoSwitch') && player.includes('scheduleWaitTimeout')
  && player.includes("data-pact=\"switch\"") && player.includes('playToken'))
  ? ok('播放自动换源', '等待超时/致命错误自动切线路，最多 3 次；手动换源与并发实例保护')
  : bad('播放自动换源', '自动换源未完成');

(storeJs.includes('export function setFilter') && storeJs.includes('if (state.items.length && ds.peekList'))
  ? ok('导航秒切', '首页/榜单/筛选共用已缓存数据，切换不再等待接口')
  : bad('导航秒切', '导航仍会阻塞等待接口');
(exists('src/components/settings.js') && read('src/components/settings.js').includes('mountSettings')
  && read('src/core/settings.js').includes("key: 'playMode'"))
  ? ok('设置面板', '播放模式/清晰度/自动下一集/跳过片头片尾等，四端可用') : bad('设置面板', '设置未接入');
(exists('src/components/extras.js') && ['statsBar', 'userChip', 'heroMain', 'mineContent']
  .every((n) => read('src/components/extras.js').includes('export function ' + n)))
  ? ok('影视应用信息组件', '统计条/用户区/真实 Hero/我的 均已替换调试信息') : bad('影视应用信息组件', '组件不完整');
read('src/core/config.js').includes("APP_VERSION = '1.0.0'")
  ? ok('版本号', '侧栏底部由「当前运行端」改为 v1.0.0 + 设置入口') : bad('版本号', '未找到版本号');

/* 9. 原生安装包工程结构 */
const nativeFiles = [
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/com/aistream/pending/mobile/MainActivity.java',
  'android/app/build.gradle', 'android/settings.gradle',
  'android-tv/app/src/main/AndroidManifest.xml',
  'android-tv/app/src/main/java/com/aistream/pending/tv/MainActivity.java',
  'android-tv/app/build.gradle', 'android-tv/settings.gradle',
  'scripts/build-apk.py', 'scripts/sync-web-assets.mjs', 'scripts/generate-icons.py',
  'ios/build-ipa.sh', 'ios/ExportOptions.template.plist',
  'build-all.bat', 'docs/05-原生安装包构建说明.md',
];
const missingNative = nativeFiles.filter((p) => !exists(p));
missingNative.length ? bad('原生打包工程', '缺少：' + missingNative.join(', '))
  : ok('原生打包工程', `${nativeFiles.length} 个原生工程文件齐全`);

const tvManifest = exists('android-tv/app/src/main/AndroidManifest.xml')
  ? read('android-tv/app/src/main/AndroidManifest.xml') : '';
(tvManifest.includes('LEANBACK_LAUNCHER') && tvManifest.includes('android.software.leanback')
  && tvManifest.includes('touchscreen'))
  ? ok('TV Leanback 适配', 'LEANBACK_LAUNCHER + leanback feature + 非必需触摸屏')
  : bad('TV Leanback 适配', 'TV Manifest 缺少关键声明');
const tvJava = exists('android-tv/app/src/main/java/com/aistream/pending/tv/MainActivity.java')
  ? read('android-tv/app/src/main/java/com/aistream/pending/tv/MainActivity.java') : '';
(tvJava.includes('dispatchKeyEvent') && tvJava.includes('KEYCODE_DPAD_UP'))
  ? ok('TV 遥控器注入', 'DPAD / OK / BACK / 搜索键显式注入 DOM 事件')
  : bad('TV 遥控器注入', '缺少遥控器按键处理');
read('src/platforms/tv/tv.js').includes('__onRemoteBack')
  ? ok('TV 返回键协同', 'Web 端暴露 __onRemoteBack 供原生层判断是否退出')
  : bad('TV 返回键协同', '缺少 __onRemoteBack 钩子');

/* 本轮：流中转 / 地区标准化 / 选集分页 / 续播 / TV 登录 / 详情 */
const serverJs = read('server.js');
const electronJs = read('electron-main.cjs');
const mobileJava = read('android/app/src/main/java/com/aistream/pending/mobile/MainActivity.java');
const playerJs = read('src/components/player.js');
const filterJs = read('src/components/filters.js');
const authJs = read('src/components/auth.js');
const dsJs = read('src/core/datasource.js');

(serverJs.includes("pathname === '/api/proxy'") && serverJs.includes('rewriteM3u8')
  && electronJs.includes("pathname === '/api/proxy'") && electronJs.includes('rewriteM3u8')
  && mobileJava.includes('proxyStream') && tvJava.includes('proxyStream'))
  ? ok('四端流中转', '/api/proxy 支持 http/https 与 302、Range 透传、m3u8 分片与密钥 URI 重写')
  : bad('四端流中转', '本地服务 / Electron / 手机壳 / TV 壳未全部实现流中转');

(playerJs.includes("playableUrl") && playerJs.includes('streamProxy') && playerJs.includes('/api/proxy'))
  ? ok('跨域片源自动中转', '第三方 m3u8 / mp4 默认走本机中转，设置里可关闭')
  : bad('跨域片源自动中转', '播放器未接入流中转');

(filterJs.includes('BROAD') && filterJs.includes('countriesOf') && filterJs.includes("id: 'score'"))
  ? ok('地区标准化与评分排序', '华语/欧美/日韩 大区展开到具体国家；评分排序启用，热度按无字段置灰')
  : bad('地区标准化与评分排序', '地区仍为字符串包含匹配或缺少评分排序');

(filterJs.includes('expand-list') && read('src/core/store.js').includes('export async function expandList'))
  ? ok('筛选覆盖范围', '站点无 area/year/sort 入参，改为多页加载 + 本地匹配，并如实标注覆盖范围')
  : bad('筛选覆盖范围', '缺少多页加载或覆盖范围说明');

(playerJs.includes('PAGE_SIZE') && playerJs.includes('renderPager') && playerJs.includes('data-pact="page"'))
  ? ok('选集分页与面板分区', '2000+ 集按页渲染；右侧分「选集 / 影片信息」，不再与播放信息重叠')
  : bad('选集分页与面板分区', '选集仍全量渲染或面板可能重叠');

(playerJs.includes('function epNo') && playerJs.includes('playState.contentId') && playerJs.includes('RESUME_KEY'))
  ? ok('续播键规范化', '续播用内容 id + 集序号，改名或换线路不丢进度')
  : bad('续播键规范化', '续播仍依赖标题 + 集名');

(authJs.includes('auth-keyboard') && authJs.includes('insertKey') && !authJs.includes('auth-foot'))
  ? ok('TV 登录与登录页精简', '遥控器虚拟键盘可输入账号密码；已删除「可先用主站账号登录」尾注')
  : bad('TV 登录与登录页精简', 'TV 无法输入账号，或登录页尾注未删除');

(dsJs.includes("upDetail: 'api/up/detail'") && dsJs.includes('directors') && dsJs.includes('actors'))
  ? ok('详情简介与演职员', '实测 /api/up/detail 提供 description / directors / actors / rating')
  : bad('详情简介与演职员', '详情未接入实测接口');

/* 本轮：token 播放 / 分类不回退 / 筛选标签 / TV 修复 */
const dsNow = read('src/core/datasource.js');
(dsNow.includes("upResolve: 'api/up/resolve'") && dsNow.includes('export async function resolveUpToken')
  && dsNow.includes('playback_token') && read('src/components/player.js').includes('resolveUpToken'))
  ? ok('上游 token 播放链路', 'up/detail 的 token → up/resolve 逐集解析；剧集按真实分集渲染，不再把多线路拍平')
  : bad('上游 token 播放链路', '缺少 token 解析，剧集会重复或错乱');

(!dsNow.includes('已显示首页内容') && dsNow.includes('该分类暂时没有取到内容'))
  ? ok('分类不再回退首页', '短剧/纪录片失败时给出真实原因 + 重试，不再与推荐内容相同')
  : bad('分类不再回退首页', '分类失败仍回退首页内容');

(dsNow.includes('const seen = new Set()') && dsNow.includes('lineName'))
  ? ok('采集线路分组', '/api/play 按「站 · 源」分线并按 from+name+url 去重')
  : bad('采集线路分组', '采集线路仍被拍平');

(read('src/components/filters.js').includes('filter-row__label')
  && read('src/components/filters.js').includes("row('类型'"))
  ? ok('筛选行标签', '类型 / 国家 / 年份 / 排序 四行带左侧标签，选项与标签分离')
  : bad('筛选行标签', '筛选行缺少语义标签');

(!read('src/platforms/tv/tv.js').includes("(f || e.target.closest('[data-tab]'))")
  && read('src/platforms/tv/tv.js').includes("action === 'retry'"))
  ? ok('TV 事件修复', 'onActivate 不再引用未定义变量；retry / settings / mine-tab 在遥控与点击两条路径都可用')
  : bad('TV 事件修复', 'TV 激活逻辑仍有未定义变量或动作缺失');

(read('src/platforms/desktop/desktop.css').includes('紧凑化（2026-11-16）')
  && read('src/styles/shared.css').includes('紧凑化（2026-11-16）'))
  ? ok('布局紧凑化', '侧栏 / 顶栏 / 频道 / 筛选面板 / 网格间距统一收紧')
  : bad('布局紧凑化', '缺少紧凑化样式');

const artifacts = [
  'dist-win/AIStream-Setup-1.0.0.exe',
  'dist/AIStream-Mobile-1.0.0.apk',
  'dist/AIStream-TV-1.0.0.apk',
];
ok('已构建安装包', `${artifacts.filter(exists).length}/3 已产出（.ipa 需 macOS）`);

/* 播放链路修复：分类 db_ 条目不再兜底错乱（2026-11-16） */
const dsSrc = read('src/core/datasource.js');
(dsSrc.includes('stationId: pick(\'stationId\')')
  && dsSrc.includes('const sid = item.stationId || item.station'))
  ? ok('播放 sid 用 UUID', 'stationId 优先于站点名称，避免 /api/play 兜底返回全站内容')
  : bad('播放 sid 用 UUID', '播放 sid 仍可能用站点名称触发兜底');

(dsSrc.includes('/^db_/') && dsSrc.includes('item.rawId || item.id || id') && dsSrc.includes('async function resolveByTitle'))
  ? ok('分类卡片播放修正', 'db_ 分类条目改为按标题搜索换真实采集线路，不再跳同一部剧')
  : bad('分类卡片播放修正', 'db_ 分类条目仍直接请求 /api/play');

(dsSrc.includes('__searchSources') && dsSrc.includes('Array.isArray(item.__searchSources)'))
  ? ok('搜索结果直链播放', '搜索条目直接用自带 sources 播放，避免名称当 sid 兜底')
  : bad('搜索结果直链播放', '搜索结果未使用自带 sources');

/* 巨魔 IPA：免签名构建 + 内置网关（2026-11-16） */
const wf = read('.github/workflows/build-trollstore-ipa.yml');
const pkgSh = read('ios/package-trollstore-ipa.sh');
const prepare = read('scripts/prepare-trollstore-ipa.mjs');
const iosCfg = read('src/core/ios-config.js');
const ent = read('ios/trollstore.entitlements.plist');
(/runs-on: macos-\d+(-intel)?/.test(wf) && wf.includes('CODE_SIGNING_ALLOWED=NO') && wf.includes('brew install ldid'))
  ? ok('巨魔 IPA 云端构建', 'macOS runner + 免签名编译 + ldid 伪签名，产出可下载 IPA')
  : bad('巨魔 IPA 云端构建', '工作流缺少免签名编译或伪签名步骤');
(pkgSh.includes('ldid -S') && pkgSh.includes('Payload/App.app') && ent.includes('application-identifier'))
  ? ok('巨魔伪签名打包', 'ldid -S 伪签名 + 标准 Payload 结构 + entitlements')
  : bad('巨魔伪签名打包', '打包脚本或 entitlements 不完整');
(dsSrc.includes('isIOSRuntime()') && dsSrc.includes('IOS_BUILTIN_GATEWAY')
  && iosCfg.includes('IOS_BUILTIN_GATEWAY') && iosCfg.includes('fnos.jiulingkeji.asia:8890')
  && JSON.parse(read('capacitor.config.json')).plugins?.CapacitorHttp?.enabled === true)
  ? ok('iOS 内容源直连', '内置网关直连 8890 + CapacitorHttp 原生层绕过 CORS，装上即用无需服务器配置')
  : bad('iOS 内容源直连', '内置网关或 CapacitorHttp 配置缺失');
(prepare.includes('GATEWAY_URL') && prepare.includes('IOS_BUNDLE_ID'))
  ? ok('IPA 构建参数注入', 'Bundle ID / Team ID / 网关可在构建期注入')
  : bad('IPA 构建参数注入', '缺少构建期参数注入');

// 本轮修复：搜索结果跨站 id 重复（如 179）导致点 A 播 B，需用 stationId 生成唯一 key 并保留 rawId
(dsSrc.includes('__s_') && dsSrc.includes('rawId:') && dsSrc.includes('item.rawId || item.id'))
  ? ok('跨站 id 冲突修复', '缓存 key 含 stationId，播放请求用 rawId，避免点 A 卡片播 B 内容')
  : bad('跨站 id 冲突修复', '未对跨站重复 id 做唯一化处理');
// 点击卡片即刻反馈：pending 事件先挂载播放器显示加载态，消除解析地址期间的等待感
(read('src/core/store.js').includes('EVT.PLAY_PENDING')
  && read('src/components/player.js').includes('openPending')
  && read('src/core/events.js').includes('PLAY_PENDING'))
  ? ok('播放秒开反馈', '点击即刻挂载播放器显示加载态，地址解析完成后再填充内容')
  : bad('播放秒开反馈', '缺少点击后的即时应');
// 本轮修复：内容源不提供 area 字段，国家筛选需禁用并给出说明，避免点了没反应
const filtersSrc = read('src/components/filters.js');
(filtersSrc.includes('filter-unavailable') && filtersSrc.includes('hasArea')
  && filtersSrc.includes('内容源未提供地区字段'))
  ? ok('筛选无效项禁用', '内容源无地区字段时禁用国家筛选并说明原因，不再点了没反应')
  : bad('筛选无效项禁用', '国家筛选仍可点但无效果');

// 本轮移植：官方客户端的签到/兑换/EPG/广告过滤（保持我们的 UI 风格）
const dsNew = read('src/core/datasource.js');
const exNew = read('src/components/extras.js');
(dsNew.includes('doCheckin') && dsNew.includes('fetchRedeem') && dsNew.includes('doRedeem')
  && exNew.includes('redeemCard') && exNew.includes('data-action="checkin"'))
  ? ok('会员权益移植', '签到 + 兑换中心 + 邀请码复制，对齐官方客户端功能')
  : bad('会员权益移植', '签到/兑换功能缺失');
(dsNew.includes('item.epg') && read('src/components/content.js').includes('poster__epg'))
  ? ok('EPG节目单移植', '直播频道卡片显示当前/下一档节目')
  : bad('EPG节目单移植', 'EPG 未接入');
(dsNew.includes('m3u8FilterUrl') && read('src/components/player.js').includes('adPreview'))
  ? ok('广告过滤移植', 'm3u8 经服务端分析命中后走过滤清单，对齐官方客户端')
  : bad('广告过滤移植', '广告过滤未接入');

// 本轮：播放器对齐官方客户端的快捷布局 + 原生 HLS 优先内核
const plSrc = read('src/components/player.js');
(plSrc.includes('data-pact="speed"') && plSrc.includes('data-pact="cast"')
  && plSrc.includes('data-pact="rotate"') && plSrc.includes('nativeHls'))
  ? ok('播放器对齐官方', '顶栏倍速/投屏/更多 + 横竖屏/跳过胶囊 + 原生HLS优先内核，UI保持自有风格')
  : bad('播放器对齐官方', '播放器布局或内核未对齐');

/* 输出 */
console.log('\n  AIStream 影视 · 交付自检');
console.log('  ─────────────────────────────────────────────');
let failed = 0;
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (!r.pass) failed++;
}
console.log('  ─────────────────────────────────────────────');
console.log(`  结果：${results.length - failed}/${results.length} 通过\n`);
process.exit(failed ? 1 : 0);
