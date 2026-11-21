/**
 * AIStream 影视 · 内容源适配层（唯一数据出入口）
 * ==================================================================
 * 本文件里的协议 / 路径 / 参数名 / 字段名 / 鉴权方式，全部来自 2026-11-15
 * 对需求方提供站点 fnos.jiulingkeji.asia:8890 的**实际探测**，不是假设或示例：
 *
 *   · GET  /                     → 登录页
 *   · GET  /api/public          → {siteName, needLogin, regEnabled, inviteRequired}
 *   · POST /api/auth/login      → {username,password} → {token}
 *   · GET  /api/config          → {views, iptv, sportsLive, officialVod} 权限与开关
 *   · 其余 /api/* 需 Authorization: Bearer <token>
 *   · gate.js / app.js / player.js / player.html 为公开静态文件
 *
 * 二次实测（2026-11-15，按影视类型区分栏目时）：
 *   · app.js: KINDNAME = {movie,series,anime,variety,short,doc}；CUR_KIND='rec'
 *   · app.js: loadKind(kind) → api/up/catalog?kind=<kind>&limit=48&page=1
 *             → {items:[{id,title|normalized_title,poster_url|carousel_url|
 *                        backdrop_url,year,area,content_kind}], pageSize}
 *   · app.js: api/home/cat?idx=&t= 是「某个首页栏目内的分类筛选」，不是全局类型分类
 *   · app.js: api/history | api/fav | api/preview/reserved → {items:[...]}
 *   · app.js: api/points/me → {points,vip,growth,checkin,invite,cfg,daily}
 *   · app.js: api/weekly → {days:[...]}；api/iptv → {enabled,denied,channels,now,error}
 *   · app.js: api/iptv/stream?ch=<cid>&token=<token>[&direct=0] → 直播流
 *   · app.js: api/official-vod → {list:[{name,poster,playUrl|url}]}
 *   · 站点自带 /vendor/hls.min.js，前端 HLS 播放为 m3u8 直连
 *
 * 严禁示例数据：本文件不包含任何片名 / 海报 / 集数 / 评分 / 播放链接等示例值。
 * ==================================================================
 */
import { CHANNELS, QUICK_ENTRIES } from './config.js';
import { getSetting } from './settings.js';
import { IOS_BUILTIN_GATEWAY, isIOSRuntime } from './ios-config.js';

/** 需求方提供、实测可达的内容源地址 */
export const PROVIDED_HOST = 'fnos.jiulingkeji.asia:8890';

/** 实测记录（可审计） */
export const SITE_PROBE = Object.freeze({
  probedAt: '2026-11-15',
  protocol: 'http',
  httpsUsable: false,              // TLS 握手失败，服务器只提供明文 HTTP
  service: 'AIStream 影视自研聚合后端',
  publicApi: 'api/public',
  loginApi: 'api/auth/login',
  authScheme: 'Authorization: Bearer <token>',
  tokenStorageKey: 'aistream_token',
  corsHeaderPresent: false,
  frontendAssets: ['gate.js', 'app.js', 'player.js', 'player.html', 'vendor/hls.min.js'],
});

/** 实测接口清单（全部来自站点前端源码） */
export const ENDPOINTS = Object.freeze({
  public: 'api/public',
  login: 'api/auth/login',
  register: 'api/auth/register',
  me: 'api/auth/me',
  logout: 'api/auth/logout',
  config: 'api/config',
  home: 'api/home',
  homeCat: 'api/home/cat',
  homeMore: 'api/home/more',
  search: 'api/search',
  upSearch: 'api/up/search',
  catalog: 'api/up/catalog',
  upDetail: 'api/up/detail',
  upWarm: 'api/up/warm',
  upResolve: 'api/up/resolve',
  upFeed: 'api/up/feed',
  play: 'api/play',
  playWarm: 'api/play/warm',
  dimg: 'api/dimg',
  history: 'api/history',
  fav: 'api/fav',
  reserved: 'api/preview/reserved',
  points: 'api/points/me',
  weekly: 'api/weekly',
  iptv: 'api/iptv',
  iptvStream: 'api/iptv/stream',
  officialVod: 'api/official-vod',
});

/** 数据源配置：全部为实测值，仍集中在此便于修改 */
export const DATA_SOURCE = {
  host: PROVIDED_HOST,
  protocol: 'http',
  apiBasePath: '',
  proxyPrefix: 'api/',
  endpoints: { ...ENDPOINTS },
  auth: {
    header: 'Authorization',
    prefix: 'Bearer ',
    tokenKey: 'aistream_token',
  },
  // 实测字段名（来自 app.js 的 homeCard / upCard / 各「我的」视图）
  fieldMap: {
    id: 'id',
    title: 'title',
    name: 'name',
    normalizedTitle: 'normalized_title',
    poster: 'poster',
    posterUrl: 'poster_url',
    carouselUrl: 'carousel_url',
    backdrop: 'backdrop',
    backdropUrl: 'backdrop_url',
    station: 'station',
    stationId: 'stationId',
    year: 'year',
    area: 'area',
    contentKind: 'content_kind',
    score: 'score',
    rating: 'rating',
    description: 'description',
    remarks: 'remarks',
    language: 'language',
  },
  // 实测响应结构
  responseMap: {
    home: 'columns',
    columnItems: 'items',
    search: 'collect',
    cat: 'items',
    more: 'items',
    catalog: 'items',
    history: 'items',
    fav: 'items',
    reserved: 'items',
    vod: 'list',
    iptv: 'channels',
    weekly: 'days',
    play: 'results',
    playSources: 'sources',
    playEpisodes: 'episodes',
    episodeUrl: 'url',
  },
  // 严禁示例数据：恒为 false，代码中不存在任何 mock 分支
  allowMockData: false,
};

/** 仍待补充项（实测已解决协议 / 接口 / 参数 / 鉴权 / 分类枚举 / 主要字段 / 跨域） */
export const PENDING_ITEMS = Object.freeze([
  { group: '账号', key: 'account.credentials', label: '内容源账号', detail: '站点 needLogin=true；由使用者在四端登录界面自行输入', impact: '未登录时 /api/* 全部 401' },
  { group: '账号', key: 'account.tvLogin', label: 'TV 扫码 / 验证码登录', detail: '站点只提供 api/auth/login 用户名密码；无设备码 / 扫码登录接口，TV 端已改为遥控器虚拟键盘输入', impact: 'TV 登录需用遥控器逐步输入，无法一键扫码' },
  { group: '字段', key: 'field.badge', label: '清晰度角标字段', detail: '首页条目中「高清」角标对应的真实字段名未确认', impact: '卡片角标留空' },
  { group: '字段', key: 'field.subtitle', label: '更新文案字段', detail: '参考图「更 N 集」类文案对应的真实字段名未确认', impact: '卡片副文案显示年份/地区' },
  { group: '播放', key: 'play.drm', label: 'DRM / 投屏要求', detail: '已实现内置 HLS/原生播放器与跨域流中转；是否需要 DRM、投屏、倍速记忆未说明', impact: '当前只提供播放、暂停、进度、选集、线路切换' },
  { group: '播放', key: 'play.danmukuSource', label: '弹幕数据接口', detail: '站点未提供弹幕接口；当前为本地发送 + 插件扩展口，不加载虚构弹幕', impact: '无法展示其它观众弹幕' },
  { group: '播放', key: 'play.filterParams', label: '站点筛选参数', detail: '实测 api/up/catalog 只支持 kind/limit/page，无 area/year/sort 入参；筛选为本地匹配 + 多页加载', impact: '筛选覆盖已加载内容，非服务端全量' },
  { group: '发布', key: 'app.desktopAppId', label: '桌面应用标识', detail: '应用名 / 包名 / 签名信息', impact: 'Electron 打包分发所需' },
  { group: '发布', key: 'app.iosBundleId', label: 'iOS Bundle ID', detail: '未在需求中给出', impact: 'Xcode 归档与上架所需' },
  { group: '发布', key: 'app.androidPackage', label: '安卓正式包名', detail: '当前手机/TV 为构建占位 com.aistream.pending.mobile / .tv', impact: '可测试安装，无法上架' },
  { group: '发布', key: 'app.tvRemoteMap', label: 'TV 遥控器实机键值', detail: '目标设备 OK / Back / 菜单键 keyCode 需实机核对', impact: '不同厂商遥控器可能有差异' },
  { group: '发布', key: 'release.minOsVersions', label: '各端最低系统版本', detail: '桌面 / iOS / Android / Android TV 最低版本', impact: '兼容性测试范围待定' },
  { group: '发布', key: 'release.storeAssets', label: '正式图标与商店素材', detail: '各端图标、启动图、TV Banner、应用描述；当前为占位素材', impact: '无法上架' },
  { group: '发布', key: 'release.iosTeamId', label: 'Apple Developer Team ID', detail: 'Xcode 自动签名与导出 .ipa 所需', impact: '无法产出 .ipa' },
  { group: '发布', key: 'release.iosSigning', label: 'iOS 证书与描述文件', detail: '证书 / Provisioning Profile / 导出方式', impact: '.ipa 无法真机安装或上架' },
  { group: '发布', key: 'release.androidSigning', label: '安卓正式签名密钥', detail: '当前两个 APK 使用 debug.keystore', impact: '无法上架与版本升级' },
  { group: '发布', key: 'release.winSigning', label: 'Windows 代码签名证书', detail: 'EV / OV 代码签名证书', impact: '未签名 .exe 有 SmartScreen 提示' },
]);

export function pendingItems() { return PENDING_ITEMS.slice(); }

/* ---------------- 登录态 ---------------- */
function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
export function getToken() {
  try { return storage()?.getItem(DATA_SOURCE.auth.tokenKey) || ''; } catch { return ''; }
}
export function setToken(t) {
  try { storage()?.setItem(DATA_SOURCE.auth.tokenKey, String(t || '')); } catch { /* ignore */ }
}
export function clearToken() {
  try { storage()?.removeItem(DATA_SOURCE.auth.tokenKey); } catch { /* ignore */ }
}
export function hasToken() { return !!getToken(); }

let publicInfo = null;
let homeCache = null;
let siteConfig = null;
const itemCache = new Map();
const detailCache = new Map();   // id → { at, item }，避免每次打开详情都打 /api/up/detail
const DETAIL_TTL = 3 * 60 * 1000;
/** 分类/首页列表缓存：切换分类秒开，避免每次都等站点并行扫描采集站 */
const listCache = new Map();
const LIST_TTL = 5 * 60 * 1000;
function listKey({ channel = '', page = 1, keyword = '' }) { return `${channel}|${page}|${keyword}`; }
export function peekList(params) {
  const hit = listCache.get(listKey(params));
  return hit && (Date.now() - hit.at) < LIST_TTL ? hit.data : null;
}
let persistTimer = null;
const CACHE_KEY = 'aistream_list_cache_v1';
function persistCache() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const rows = [...listCache].slice(-16).map(([k, v]) => ({ k, at: v.at, data: v.data }));
      storage()?.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch { /* 容量不足时忽略 */ }
  }, 400);
}
function restoreCache() {
  try {
    const rows = JSON.parse(storage()?.getItem(CACHE_KEY) || '[]');
    rows.forEach((r) => {
      if (r && r.k && Array.isArray(r.data) && (Date.now() - r.at) < LIST_TTL) listCache.set(r.k, { at: r.at, data: r.data });
    });
  } catch { /* ignore */ }
}
function putList(params, data) { listCache.set(listKey(params), { at: Date.now(), data }); persistCache(); }
restoreCache();

/** 可选网关：iOS 壳无内嵌 Node 服务时，指向运行本项目的电脑 / NAS（设置项 gateway） */
export function gatewayBase() {
  let g = '';
  try { g = String(getSetting('gateway') || '').trim(); } catch { g = ''; }
  g = g.replace(/\/+$/, '');
  if (/^https?:\/\//i.test(g)) return g;
  // 巨魔 IPA 装上即用：iOS 原生环境且用户未手动设置网关时，回退到构建期内置网关。
  // 桌面浏览器 / 安卓壳仍走各自同源内嵌代理，行为不变。
  if (isIOSRuntime() && /^https?:\/\//i.test(IOS_BUILTIN_GATEWAY)) {
    return String(IOS_BUILTIN_GATEWAY).replace(/\/+$/, '');
  }
  return '';
}
function withGateway(path) {
  const g = gatewayBase();
  return g ? g + '/' + String(path).replace(/^\/+/, '') : path;
}

/** 统一 API 调用：同源相对路径（或网关）+ Bearer，由本地代理转发到内容源 */
async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  const t = getToken();
  if (t) headers[DATA_SOURCE.auth.header] = DATA_SOURCE.auth.prefix + t;
  let body = opts.body;
  if (body && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let res;
  let timer = null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = Number(opts.timeout) > 0 ? Number(opts.timeout) : 20000;
  if (ctrl) timer = setTimeout(() => ctrl.abort(), timeoutMs);   // 聚合分类接口可能很慢，超时后走缓存/回退
  // 外部可传 signal（切换分类时取消上一次请求，避免排队拖慢下一次）
  const onAbort = () => { try { ctrl?.abort(); } catch { /* ignore */ } };
  if (opts.signal && ctrl) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    res = await fetch(withGateway(path), { method: opts.method || 'GET', headers, body,
      signal: ctrl ? ctrl.signal : undefined, credentials: 'same-origin' });
  } catch (e) {
    if (opts.signal?.aborted) return { ok: false, status: 'aborted', error: '请求已取消', data: null };
    return { ok: false, status: 'error',
      error: e?.name === 'AbortError' ? `内容源响应超时（${Math.round(timeoutMs / 1000)} 秒）` : '内容源不可达：' + (e?.message || e), data: null };
  } finally {
    if (timer) clearTimeout(timer);
    if (opts.signal && ctrl) { try { opts.signal.removeEventListener('abort', onAbort); } catch { /* ignore */ } }
  }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status === 401) return { ok: false, status: 'need-login', error: (json && json.error) || '未登录', data: json };
  if (!res.ok) return { ok: false, status: 'error', error: (json && json.error) || ('HTTP ' + res.status), data: json };
  return { ok: true, status: 'ok', data: json };
}

/** 公开站点信息（无需登录） */
export async function fetchPublic() {
  const r = await api(ENDPOINTS.public);
  if (r.ok && r.data) {
    publicInfo = r.data;
    return { ok: true, siteName: r.data.siteName || '', regEnabled: r.data.regEnabled !== false,
      inviteRequired: !!r.data.inviteRequired, needLogin: r.data.needLogin !== false };
  }
  return { ok: false, error: r.error, siteName: '', regEnabled: true, inviteRequired: false, needLogin: true };
}

export async function login(username, password) {
  const r = await api(ENDPOINTS.login, { method: 'POST', body: { username, password } });
  if (r.ok && r.data && r.data.token) {
    setToken(r.data.token); homeCache = null; siteConfig = null;
    return { ok: true, token: r.data.token };
  }
  return { ok: false, status: r.status, error: (r.data && r.data.error) || r.error || '登录失败' };
}

export async function register(username, password, invite) {
  const body = { username, password };
  if (invite) body.invite = invite;
  const r = await api(ENDPOINTS.register, { method: 'POST', body });
  if (r.ok && r.data && r.data.token) {
    setToken(r.data.token); homeCache = null; siteConfig = null;
    return { ok: true, token: r.data.token };
  }
  return { ok: false, status: r.status, error: (r.data && r.data.error) || r.error || '注册失败' };
}

export async function authMe() {
  if (!hasToken()) return { ok: false, status: 'need-login' };
  const r = await api(ENDPOINTS.me);
  if (!r.ok) clearToken();
  return r;
}

export async function logout() {
  try { await api(ENDPOINTS.logout, { method: 'POST' }); } catch { /* ignore */ }
  clearToken(); homeCache = null; siteConfig = null; itemCache.clear(); detailCache.clear(); listCache.clear();
}

/* ---------------- 内容模型 ---------------- */
/** 实测：TMDB 图床直连，其余走本站 api/dimg?u= 代理（防防盗链） */
function proxyImage(u) {
  if (!u || typeof u !== 'string') return null;
  if (/^https?:\/\/(image\.)?tmdb\.org\//i.test(u)) return u;
  if (/^https?:\/\//i.test(u) || u.startsWith('/')) {
    return withGateway(ENDPOINTS.dimg + '?u=' + encodeURIComponent(u));
  }
  return u;
}

/** 内容源原始条目 → 四端统一内容模型（只取实测字段，不猜未确认字段） */
export function mapItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const f = DATA_SOURCE.fieldMap;
  const pick = (k) => (f[k] ? raw[f[k]] ?? null : null);
  const rawId = pick('id');
  const rawStationId = pick('stationId');
  // 同一 id（如 179）在不同站点（吉吉/西瓜/电影天堂）会重复；直接用 id 做缓存 key
  // 会互相覆盖，导致点 A 卡片播 B 内容。用 id+stationId 生成唯一 key 对外暴露。
  const id = rawId == null ? null
    : (rawStationId ? `${rawId}__s_${rawStationId}` : String(rawId));
  const title = pick('title') || pick('name') || pick('normalizedTitle') || '';
  const posterRaw = pick('poster') || pick('posterUrl') || pick('carouselUrl')
    || pick('backdrop') || pick('backdropUrl');
  const item = {
    id: id == null ? null : String(id),
    rawId: rawId == null ? null : String(rawId),   // 站点原始 id（可能跨站重复），请求 play 时用
    title: String(title),
    poster: proxyImage(posterRaw),
    badge: null,                                  // 清晰度字段未确认 → 留空
    subtitle: pick('year') ? String(pick('year')) : '',
    // 实测 app.js 的 upCard 使用 it.score 渲染评分
    score: (pick('rating') ?? pick('score')) == null ? null : String(pick('rating') ?? pick('score')),
    category: raw.__section || pick('contentKind') || '',
    description: pick('description') || '',        // 详情接口 /api/up/detail 返回的 description
    remarks: pick('remarks') || '',
    language: pick('language') || '',
    playUrl: null,
    episodes: null,
    station: pick('station'),
    stationId: pick('stationId') || null,
    year: pick('year'),
    area: pick('area'),
    section: raw.__section || '',
    // 直播 / 官源点播：站点已给出可直接播放的地址，播放入口据此直接返回
    __liveUrl: raw.__liveUrl || null,
    __directUrl: raw.__directUrl || null,
    // 搜索结果自带 sources（已是可播放直链）。实测 /api/search 的 collect 条目
    // 带 sources:[{from,episodes:[{name,url}]}]，直接转成分组线路，避免再用
    // station「名称」去请求 /api/play（名称不是 sid，会触发上游兜底返回无关内容）。
    __searchSources: Array.isArray(raw.sources) && raw.sources.length
      ? raw.sources.filter((s) => s && Array.isArray(s.episodes) && s.episodes.length)
        .map((s) => ({
          lineName: [pick('station') || '', s.from || ''].filter(Boolean).join(' · ') || '线路',
          episodes: s.episodes
            .filter((ep) => ep && (ep.url || ep.playUrl))
            .map((ep, i) => ({ name: ep.name || ep.title || ('第 ' + (i + 1) + ' 集'), url: ep.url || ep.playUrl })),
        }))
        .filter((s) => s.episodes.length)
      : null,
  };
  if (item.id) itemCache.set(item.id, item);
  return item;
}

/** 确保拿到首页栏目（实测 /api/home → {columns:[{title,items:[]}]}） */
async function ensureHome() {
  if (homeCache) return { ok: true, columns: homeCache };
  if (!hasToken()) return { ok: false, status: 'need-login', error: '请先登录内容源账号', columns: [] };
  const r = await api(ENDPOINTS.home, { timeout: 10000 });
  if (!r.ok) return { ok: false, status: r.status, error: r.error, columns: [] };
  const cols = (r.data && Array.isArray(r.data.columns)) ? r.data.columns : [];
  homeCache = cols;
  return { ok: true, columns: cols };
}

function needLoginResult() {
  return { ok: false, status: 'need-login', data: [], notice: '请先登录内容源账号' };
}

/** 站点权限与开关：实测 api/config → {views, iptv, sportsLive, officialVod} */
export async function fetchSiteConfig() {
  if (siteConfig) return { ok: true, data: siteConfig };
  if (!hasToken()) return { ok: false, status: 'need-login', data: null };
  const r = await api(ENDPOINTS.config);
  if (!r.ok) return { ok: false, status: r.status, data: null, error: r.error };
  siteConfig = r.data || {};
  return { ok: true, data: siteConfig };
}

/**
 * 顶部栏目：固定按「影视类型」区分（不再使用 /api/home 的采集源栏目）。
 * 登录后按站点 /api/config 的真实权限隐藏未开放项；config 不可用时保留全部分类，
 * 避免误杀导致空白。分类本身是界面结构，不是影视内容数据。
 */
export async function fetchChannels() {
  const cfg = (await fetchSiteConfig()).data || {};
  const views = cfg.views || null;
  const list = CHANNELS.filter((c) => {
    if (views && views[c.id] === false) return false;
    if (c.source === 'iptv') return cfg.iptv?.enabled !== false;
    if (c.source === 'official-vod') return cfg.officialVod?.enabled !== false;
    return true;
  });
  return { ok: true, status: 'ok', data: list.map((c) => ({ ...c })) };
}

/** 按影视类型取内容：实测 api/up/catalog?kind=<kind>&limit=&page= → {items,pageSize} */
export async function fetchByCategory(kind, page = 1, { signal = null } = {}) {
  if (!hasToken()) return needLoginResult();
  const k = encodeURIComponent(kind);
  const limit = kind === 'short' ? 12 : 48;   // 站点 loadKind 的实测页大小
  // 二次实测：api/home/cat 是「首页栏目内筛选」，不是全局影视类型分类，
  // 因此不拿它冒充分类结果；只按真实分类榜单接口取，失败则回退首页真实内容。
  const candidates = [
    ENDPOINTS.catalog + '?kind=' + k + '&limit=' + limit + '&page=' + page,
  ];
  const fast = kind === 'short' || kind === 'doc';   // 这两类上游扫描更慢，超时缩短，避免长时间转圈
  let lastNotice = '';
  for (const u of candidates) {
    const r = await api(u, { timeout: fast ? 15000 : 18000, signal });
    if (r.status === 'aborted') return { ok: false, status: 'aborted', data: [], notice: '' };
    if (r.ok && r.data && Array.isArray(r.data.items) && r.data.items.length) {
      return { ok: true, status: 'ok', data: r.data.items.map(mapItem).filter(Boolean) };
    }
    if (!r.ok) lastNotice = r.error || '';
  }
  // 不再用首页内容冒充分类：否则「短剧/纪录片」会和「推荐」长得一模一样。
  // 该分类拉不到就如实告知（可重试），由使用者决定是否回推荐页。
  const reason = lastNotice ? `（${lastNotice}）` : '';
  return {
    ok: false,
    status: 'error',
    data: [],
    notice: `该分类暂时没有取到内容${reason}。站点聚合较慢时可稍后重试，或切回「推荐」。`,
  };
}

/** 后台预取：登录后空闲时依次拉取各类型首屏，点短剧/纪录片不再等接口 */
let prefetching = false;
export async function prefetchCategories() {
  if (prefetching || !hasToken()) return;
  prefetching = true;
  try {
    const cats = CHANNELS.filter((c) => c.source === 'catalog');
    for (const c of cats) {
      if (peekList({ channel: c.id, page: 1, keyword: '' })) continue;
      try { await fetchByCategory(c.kind, 1); } catch { /* 单个分类失败不影响其它 */ }
      await new Promise((r) => setTimeout(r, 500));   // 间隔，避免把站点聚合打满
    }
  } finally {
    prefetching = false;
  }
}

/** 当前用户信息：实测 /api/auth/me */
export async function fetchUser() {
  if (!hasToken()) return { ok: false };
  const r = await api(ENDPOINTS.me);
  return r.ok ? { ok: true, data: r.data || {} } : { ok: false, error: r.error };
}

/** IPTV 直播频道：实测 api/iptv → {enabled,denied,channels:[{cid,name,group,logo,ts}],now} */
export function mapIptvChannel(ch) {
  if (!ch || !ch.cid) return null;
  const stream = ENDPOINTS.iptvStream + '?ch=' + encodeURIComponent(ch.cid)
    + '&token=' + encodeURIComponent(getToken()) + (ch.ts ? '&direct=0' : '');
  const item = mapItem({
    id: 'iptv:' + ch.cid,
    name: ch.name || ch.title || ch.cid,
    poster: ch.logo || '',
    __section: ch.group || 'IPTV',
    __liveUrl: stream,
  });
  if (item) {
    item.category = '直播';
    item.subtitle = ch.group || '';
    itemCache.set(item.id, item);
  }
  return item;
}

export async function fetchIptvChannels() {
  if (!hasToken()) return needLoginResult();
  const r = await api(ENDPOINTS.iptv);
  if (!r.ok) return { ok: false, status: r.status, data: [], notice: r.error };
  const d = r.data || {};
  if (d.enabled === false) return { ok: true, status: 'ok', data: [], notice: 'IPTV 未开启（站点后台开关）' };
  if (d.denied) return { ok: true, status: 'ok', data: [], notice: '管理员未对该账号开放 IPTV' };
  const list = Array.isArray(d.channels) ? d.channels : [];
  const items = list.map(mapIptvChannel).filter(Boolean);
  return { ok: true, status: 'ok', data: items,
    notice: items.length ? '' : (d.error || '频道清单为空') };
}

/** 官源点播：实测 api/official-vod → {list:[{name,poster,playUrl|url}]} */
export async function fetchOfficialVod() {
  if (!hasToken()) return needLoginResult();
  const r = await api(ENDPOINTS.officialVod);
  if (!r.ok) return { ok: false, status: r.status, data: [], notice: r.error };
  const list = Array.isArray(r.data?.list) ? r.data.list : [];
  const items = list.map((v) => mapItem({
    id: 'vod:' + (v.id || v.name || list.indexOf(v)),
    name: v.name || '',
    poster: v.poster || '',
    __section: '官方点播',
    __directUrl: v.playUrl || v.url || null,
  })).filter(Boolean);
  return { ok: true, status: 'ok', data: items,
    notice: items.length ? '' : '暂无点播内容（需在站点后台配置官源地址）' };
}

/**
 * 快捷入口：按站点实测返回结构做结构化解析，供界面渲染真实内容，
 * 不再把原始 JSON 键值摊开显示。
 */
export async function fetchExtra(id) {
  const entry = QUICK_ENTRIES.find((x) => x.id === id);
  if (!entry) return { ok: false, status: 'error', error: '未知入口' };
  if (!hasToken()) return { ok: false, status: 'need-login', error: '请先登录' };
  const r = await api(entry.api);
  if (!r.ok) return { ok: false, status: r.status, error: r.error, label: entry.label, kind: entry.view };
  const d = r.data || {};

  if (entry.view === 'items') {
    const rows = Array.isArray(d.items) ? d.items : [];
    return { ok: true, label: entry.label, kind: 'items', items: rows.map(mapItem).filter(Boolean),
      empty: rows.length ? '' : '暂无内容' };
  }
  if (entry.view === 'iptv') {
    const live = await fetchIptvChannels();
    return { ok: live.ok, label: entry.label, kind: 'items', items: live.data || [], empty: live.notice || '' };
  }
  if (entry.view === 'points') {
    return { ok: true, label: entry.label, kind: 'points', points: d, empty: '' };
  }
  if (entry.view === 'weekly') {
    return { ok: true, label: entry.label, kind: 'weekly', days: Array.isArray(d.days) ? d.days : [],
      empty: (Array.isArray(d.days) && d.days.length) ? '' : '该周暂无追剧数据' };
  }
  return { ok: true, label: entry.label, kind: 'text', text: '', empty: '暂不可用' };
}

/** 浏览：按顶部影视类型频道分派到对应实测接口 */
export async function fetchList({ channel = '', page = 1, keyword = '', force = false, signal = null } = {}) {
  if (!hasToken()) return needLoginResult();
  // 命中缓存直接返回：切换分类不再等待站点聚合扫描（缓存 5 分钟）
  if (!force && !keyword) {
    const cached = peekList({ channel, page, keyword });
    if (cached) return { ok: true, status: 'ok', data: cached, notice: '' };
  }
  if (keyword) return search(keyword);
  const ch = CHANNELS.find((c) => c.id === channel);
  const save = (r) => { if (r.ok && !keyword) putList({ channel, page, keyword }, r.data || []); return r; };
  if (ch?.source === 'catalog') return save(await fetchByCategory(ch.kind, page, { signal }));
  if (ch?.source === 'iptv') return save(await fetchIptvChannels());
  if (ch?.source === 'official-vod') return save(await fetchOfficialVod());

  // 推荐 / 首页：/api/home 的真实栏目条目（保留站点已有海报）
  const h = await ensureHome();
  if (!h.ok) return { ok: false, status: h.status, data: [], notice: h.error };
  const rows = [];
  h.columns.forEach((c) => {
    (Array.isArray(c.items) ? c.items : []).forEach((it) => rows.push({ ...it, __section: c.title || '' }));
  });
  if (page > 1) {
    const r = await api(ENDPOINTS.homeMore + '?page=' + page);
    if (r.ok && r.data && Array.isArray(r.data.items)) {
      return save({ ok: true, status: 'ok', data: r.data.items.map(mapItem).filter(Boolean) });
    }
  }
  return save({ ok: true, status: 'ok', data: rows.map(mapItem).filter(Boolean) });
}

/** 搜索：实测 /api/search?q= → {collect:[]} */
export async function search(q) {
  if (!hasToken()) return needLoginResult();
  const r = await api(ENDPOINTS.search + '?q=' + encodeURIComponent(q));
  if (!r.ok) return { ok: false, status: r.status, data: [], notice: r.error };
  const rows = (r.data && Array.isArray(r.data.collect)) ? r.data.collect : [];
  return { ok: true, status: 'ok', data: rows.map(mapItem).filter(Boolean) };
}

/**
 * 上游详情（实测 /api/up/detail?id=av_xxx&phase=1）：
 * → {detail:{title,normalized_title,poster_url,carousel_url,backdrop_url,year,area,language,
 *            rating|score,genres[],directors[],actors[],description,remarks,episode_count},
 *    episodes:{episodes|items|list:[{name,url}]}}
 * phase=1 为快速模式（首屏分集秒回），fill=1 为全量。
 */
export async function fetchUpDetail(id, { phase = 1, signal = null } = {}) {
  const uid = String(id || '');
  if (!/^av_/.test(uid)) return { ok: false, status: 'unsupported', data: null, episodes: [] };
  const q = '?id=' + encodeURIComponent(uid) + (phase === 1 ? '&phase=1' : '&fill=1');
  const r = await api(ENDPOINTS.upDetail + q, { timeout: phase === 1 ? 15000 : 30000, signal });
  if (!r.ok) return { ok: false, status: r.status, error: r.error, data: null, episodes: [] };
  const j = r.data || {};
  const d = (j.detail && typeof j.detail === 'object') ? j.detail : {};
  const ej = (j.episodes && typeof j.episodes === 'object' && !Array.isArray(j.episodes)) ? j.episodes : {};
  const pool = Array.isArray(j.episodes) ? j.episodes : (ej.episodes || ej.items || ej.list || []);
  // 实测 player.js：episodes 里的每一项用 token（ep.token || ep.playback_token），
  // 真正播放地址要再请求 /api/up/resolve?token=...；部分采集线也会直接带 url。
  const episodes = (Array.isArray(pool) ? pool : [])
    .map((x, i) => {
      if (!x || typeof x !== 'object') return null;
      const token = x.token || x.playback_token || '';
      const url = x.url || x.playUrl || '';
      if (!token && !url) return null;
      return {
        name: x.title || x.name || x.episode_title || ('第 ' + (i + 1) + ' 集'),
        token, url, from: '官方线路', station: '',
      };
    })
    .filter(Boolean);
  const more = !!(j.pagination && j.pagination.has_more);
  return { ok: true, status: 'ok', data: d, episodes, hasMore: more };
}

/**
 * 上游 token → 真实播放地址（实测 /api/up/resolve?token=&skip=&keep=）
 * → { label, url, official, manifest }
 * skip=N 表示换到第 N 条备用线路；keep=<线路名> 表示沿用当前线路（起播更快）。
 */
export async function resolveUpToken(token, { skip = 0, keep = '' } = {}) {
  const t = String(token || '');
  if (!t) return { ok: false, status: 'error', url: '', notice: '缺少播放令牌' };
  let url = ENDPOINTS.upResolve + '?token=' + encodeURIComponent(t);
  if (skip > 0) url += '&skip=' + skip;
  if (keep && skip === 0) url += '&keep=' + encodeURIComponent(keep);
  const r = await api(url, { timeout: 22000 });
  if (!r.ok) return { ok: false, status: r.status, url: '', notice: r.error };
  const d = r.data || {};
  if (!d.url) return { ok: false, status: 'error', url: '', label: d.label || '', notice: '该线路暂不可用' };
  return { ok: true, status: 'ok', url: d.url, label: d.label || '', official: d.official !== false, manifest: d.manifest || null };
}

/** 点击即预热（实测站点 /api/up/warm，服务端后台拉齐详情进缓存） */
export function warmUp(id) {
  try {
    if (/^av_/.test(String(id || ''))) {
      api(ENDPOINTS.upWarm + '?id=' + encodeURIComponent(id), { timeout: 6000 }).catch(() => {});
    }
  } catch { /* ignore */ }
}

/** 详情：优先用实测上游详情接口补齐简介 / 演职员 / 评分；失败回退列表条目 */
export async function fetchDetail(id) {
  const key = String(id);
  const hit = detailCache.get(key);
  if (hit && Date.now() - hit.at < DETAIL_TTL) return { ok: true, status: 'ok', data: [hit.item] };
  // 详情可独立打开（例如从播放页返回）：av_ 条目即使不在列表缓存里也能拉
  const base = itemCache.get(key) || (/^av_/.test(key) ? { id: key, title: '', poster: null } : null);
  if (!base) return { ok: false, status: 'error', data: [], notice: '该条目详情不在当前列表缓存中' };
  if (!/^av_/.test(key)) {
    detailCache.set(key, { at: Date.now(), item: base });
    return { ok: true, status: 'ok', data: [base] };
  }
  const d = await fetchUpDetail(key, { phase: 1 });
  if (!d.ok || !d.data) return { ok: true, status: 'ok', data: [base], notice: d.error || '' };
  const x = d.data;
  const score = (x.rating ?? x.score);
  const item = {
    ...base,
    title: x.title || x.normalized_title || base.title,
    poster: proxyImage(x.poster_url || x.carousel_url || x.backdrop_url) || base.poster,
    score: score == null ? base.score : String(score),
    description: x.description || base.description || '',
    remarks: x.remarks || base.remarks || '',
    year: x.year || base.year,
    area: x.area || base.area,
    language: x.language || base.language || '',
    genres: Array.isArray(x.genres) ? x.genres : [],
    directors: Array.isArray(x.directors) ? x.directors : [],
    actors: Array.isArray(x.actors) ? x.actors : [],
    episodeCount: x.episode_count || null,
    seasonCount: x.season_count || null,
    __episodes: d.episodes,
  };
  itemCache.set(key, item);
  detailCache.set(key, { at: Date.now(), item });
  return { ok: true, status: 'ok', data: [item] };
}

/**
 * 播放入口：实测 /api/play?sid=&vid= →
 * {results:[{name,sources:[{from,episodes:[{name,url}]}]}]}
 * 直播 / 官源点播条目已自带站点给出的真实播放地址，直接返回，不再走 /api/play。
 */
/** 线路去重集合（按 线路名|集名|地址 去重，避免多源拍平重复） */
function emptyLineSet() {
  return { episodes: [], seen: new Set() };
}

/**
 * 标题 → 真实采集条目 → 播放地址。
 * 分类页 db_ 条目没有 station，且 /api/play?vid=db_xxx 会被上游兜底成无关内容。
 * 实测 /api/search?q=<标题> 的 collect[] 带 sources（可播放直链）+ stationId/id，
 * 优先直接用 sources；否则用 stationId+id 再请求一次 /api/play。
 */
async function resolveByTitle(title, year, preferStationId) {
  let rows = [];
  try {
    const r = await api(ENDPOINTS.search + '?q=' + encodeURIComponent(title), { timeout: 15000 });
    if (r.ok && r.data && Array.isArray(r.data.collect)) rows = r.data.collect;
  } catch { /* 搜索失败交由上层给出提示 */ }
  if (!rows.length) return { ok: false, episodes: [], notice: '按标题未找到可播放的采集资源' };

  const normalize = (s) => String(s || '').replace(/[\s\u3000]/g, '').toLowerCase();
  const want = normalize(title);
  // 精确同名优先，其次去掉「第X季/国语/粤语」等后缀仍包含目标标题的
  const exact = rows.filter((c) => normalize(c.name) === want);
  const pool = exact.length ? exact : rows.filter((c) => normalize(c.name).includes(want) || want.includes(normalize(c.name)));
  const candidates = (pool.length ? pool : rows).slice().sort((a, b) => {
    // 有直链 source 的优先；年份接近的优先；指定 stationId 命中优先
    const sa = Array.isArray(a.sources) && a.sources.length ? 1 : 0;
    const sb = Array.isArray(b.sources) && b.sources.length ? 1 : 0;
    if (sa !== sb) return sb - sa;
    if (preferStationId) {
      const ma = a.stationId === preferStationId ? 1 : 0;
      const mb = b.stationId === preferStationId ? 1 : 0;
      if (ma !== mb) return mb - ma;
    }
    const ya = parseInt(a.year, 10), yb = parseInt(b.year, 10), y = parseInt(year, 10);
    if (y) {
      const da = isNaN(ya) ? 9999 : Math.abs(ya - y);
      const db = isNaN(yb) ? 9999 : Math.abs(yb - y);
      if (da !== db) return da - db;
    }
    return 0;
  });

  for (const c of candidates) {
    // 路径 1：搜索结果自带可播放直链
    if (Array.isArray(c.sources) && c.sources.length) {
      const { episodes, seen } = emptyLineSet();
      c.sources.forEach((s) => {
        if (!s || !Array.isArray(s.episodes)) return;
        const lineName = [c.station, s.from].filter(Boolean).join(' · ') || '线路';
        s.episodes.forEach((ep, i) => {
          const u = ep && (ep.url || ep.playUrl);
          if (!u) return;
          const name = ep.name || ep.title || ('第 ' + (i + 1) + ' 集');
          const key = lineName + '|' + name + '|' + u;
          if (seen.has(key)) return;
          seen.add(key);
          episodes.push({ name, url: u, from: lineName, station: c.station || '' });
        });
      });
      if (episodes.length) {
        return { ok: true, status: 'ok', data: [], playUrl: episodes[0].url, episodes,
          detail: { title: c.name || title, year: c.year, station: c.station, stationId: c.stationId },
          notice: '' };
      }
    }
    // 路径 2：用 stationId + id 再取 /api/play
    if (c.stationId && c.id != null) {
      const pq = new URLSearchParams({ sid: String(c.stationId), vid: String(c.id) });
      try {
        const pr = await api(ENDPOINTS.play + '?' + pq.toString(), { timeout: 15000 });
        if (pr.ok && pr.data && Array.isArray(pr.data.results)) {
          const { episodes, seen } = emptyLineSet();
          pr.data.results.forEach((st) => {
            (Array.isArray(st.sources) ? st.sources : []).forEach((src) => {
              const lineName = [st.name, src.from].filter(Boolean).join(' · ') || '线路';
              (Array.isArray(src.episodes) ? src.episodes : []).forEach((ep) => {
                const u = ep && ep.url;
                if (!u) return;
                const name = ep.name || ep.title || '';
                const key = lineName + '|' + name + '|' + u;
                if (seen.has(key)) return;
                seen.add(key);
                episodes.push({ name, url: u, from: lineName, station: st.name || '' });
              });
            });
          });
          if (episodes.length) {
            return { ok: true, status: 'ok', data: [], playUrl: episodes[0].url, episodes,
              detail: { title: c.name || title, year: c.year, station: c.station, stationId: c.stationId },
              notice: '' };
          }
        }
      } catch { /* 换下一个候选 */ }
    }
  }
  return { ok: false, episodes: [], notice: '找到结果但均无可用播放线路' };
}

export async function resolvePlay(id) {
  if (!hasToken()) return { ok: false, status: 'need-login', playUrl: null, episodes: [], notice: '请先登录' };
  const item = itemCache.get(String(id)) || {};
  const contentId = item.id || String(id || '');
  const direct = item.__liveUrl || item.__directUrl;
  if (direct) {
    const ep = { name: item.title || '播放', url: direct, from: item.category || '线路', station: item.category || '' };
    return { ok: true, status: 'ok', data: [], contentId, detail: item,
      title: item.title || '', playUrl: direct, episodes: [ep], notice: '' };
  }

  // 搜索结果：站点已在 collect 条目里给出可播放直链（sources），直接用，
  // 避免拿 station「名称」当 sid 请求 /api/play（名称非 sid，会兜底返回全站无关内容）。
  if (Array.isArray(item.__searchSources) && item.__searchSources.length) {
    const { episodes, seen } = emptyLineSet();
    item.__searchSources.forEach((g) => {
      g.episodes.forEach((ep) => {
        const key = g.lineName + '|' + ep.name + '|' + ep.url;
        if (seen.has(key)) return;
        seen.add(key);
        episodes.push({ name: ep.name, url: ep.url, from: g.lineName, station: item.station || '' });
      });
    });
    if (episodes.length) {
      return { ok: true, status: 'ok', data: [], contentId, detail: item,
        title: item.title || '', playUrl: episodes[0].url, episodes, notice: '' };
    }
  }

  // 分类页条目（id 为 db_ 豆瓣 id，无 station）：站点 /api/play?vid=db_xxx 会兜底
  // 返回无关内容。实测正确做法：先用标题 /api/search 换成真实采集条目（id+stationId），
  // 再用其 sources 或 sid+vid 取播放地址。
  if (/^db_/.test(String(item.rawId || item.id || id)) && item.title) {
    const converted = await resolveByTitle(item.title, item.year, item.stationId);
    if (converted.ok) {
      return { ...converted, contentId, detail: { ...item, ...(converted.detail || {}) },
        title: item.title };
    }
    return { ok: false, status: 'error', playUrl: null, episodes: [],
      contentId, detail: item, notice: converted.notice || '未找到可播放的匹配线路' };
  }

  // 上游条目（id 为 av_ token）：实测 /api/up/detail 一次返回真实分集（token）+ 简介/演职员/评分
  const upId = item.rawId || item.id;
  if (/^av_/.test(String(upId || id))) {
    warmUp(upId);
    const d = await fetchUpDetail(upId, { phase: 1 });
    if (d.ok && d.episodes.length) {
      const hasToken = d.episodes.some((x) => x.token);
      return {
        ok: true, status: 'ok', data: [], contentId,
        title: item.title || d.data.title || '',
        playUrl: d.episodes[0].url || null,
        episodes: d.episodes,
        mode: hasToken ? 'up' : 'url',
        hasMore: !!d.hasMore,
        detail: { ...item, ...d.data, description: d.data.description || item.description || '' },
        notice: '',
      };
    }
  }

  const q = new URLSearchParams();
  // 播放接口的 sid 必须是站点 UUID（stationId）；站点「名称」不是合法 sid，
  // 传名称会触发上游兜底返回全站内容。优先 UUID，仅无 UUID 时回退名称。
  const sid = item.stationId || item.station;
  if (sid) q.set('sid', String(sid));
  // vid 必须用站点原始 id，而不是加了 __s_ 后缀的唯一缓存 key（否则上游不认）。
  const playVid = item.rawId || item.id;
  if (playVid) q.set('vid', String(playVid));
  if (!q.has('vid') && item.title) q.set('name', item.title);
  if (item.year) q.set('year', String(item.year));
  if (!q.toString()) return { ok: false, status: 'error', playUrl: null, episodes: [], notice: '缺少可用的条目标识' };

  const r = await api(ENDPOINTS.play + '?' + q.toString());
  if (!r.ok) return { ok: false, status: r.status, playUrl: null, episodes: [], notice: r.error };
  const m = DATA_SOURCE.responseMap;
  const results = (r.data && Array.isArray(r.data[m.play])) ? r.data[m.play] : [];
  // 实测：/api/play 返回多个站（results[]）× 多个源（sources[]），
  // 旧实现把所有源的集数拍平到一条线 → 同名集重复（出现「2249 集」）。
  // 现在按「站 · 源」分组为线路，并按 from+name+url 去重。
  const episodes = [];
  const seen = new Set();
  results.forEach((st) => {
    (Array.isArray(st[m.playSources]) ? st[m.playSources] : []).forEach((src) => {
      const lineName = [st.name, src.from].filter(Boolean).join(' · ') || '线路';
      (Array.isArray(src[m.playEpisodes]) ? src[m.playEpisodes] : []).forEach((ep) => {
        const u = ep && ep[m.episodeUrl];
        if (!u) return;
        const name = ep.name || ep.title || '';
        const key = lineName + '|' + name + '|' + u;
        if (seen.has(key)) return;
        seen.add(key);
        episodes.push({ name, url: u, from: lineName, station: st.name || '' });
      });
    });
  });
  return {
    ok: episodes.length > 0,
    status: episodes.length ? 'ok' : 'error',
    data: [],
    contentId,
    detail: item,
    title: item.title || '',
    playUrl: episodes.length ? episodes[0].url : null,
    episodes,
    notice: episodes.length ? '' : '该条目暂无线路',
  };
}

/** 供界面读取的对接状态摘要 */
/** 轻量读取缓存标题：点击卡片时即刻显示加载态用，不触发任何网络请求 */
export function peekItemTitle(id) {
  const it = itemCache.get(String(id || ''));
  return it?.title || '';
}

export function statusSummary() {
  return {
    configured: true,                       // 协议/接口/字段均已实测确认
    host: DATA_SOURCE.host,
    protocol: DATA_SOURCE.protocol,
    baseURL: DATA_SOURCE.protocol + '://' + DATA_SOURCE.host,
    proxyPrefix: DATA_SOURCE.proxyPrefix,
    needLogin: !hasToken(),
    loggedIn: hasToken(),
    siteName: (publicInfo && publicInfo.siteName) || 'AIStream 影视',
    regEnabled: publicInfo ? publicInfo.regEnabled !== false : true,
    inviteRequired: publicInfo ? !!publicInfo.inviteRequired : false,
    pending: pendingItems(),
    count: PENDING_ITEMS.length,
  };
}

/** 兼容：运行时覆盖配置（保留扩展口） */
export function set(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, k) => (acc[k] = acc[k] || {}), DATA_SOURCE);
  target[last] = value;
  return value;
}
export function get(path) {
  return path.split('.').reduce((a, k) => (a == null ? a : a[k]), DATA_SOURCE);
}
