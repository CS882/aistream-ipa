/**
 * AIStream 影视 · 统一业务逻辑层
 * ------------------------------------------------------------------
 * 桌面 / iOS / 安卓 / TV 四端全部只调用这一份 store，
 * 保证「内容浏览、搜索、详情查看、播放入口」四件事的行为与状态完全一致。
 * 登录态由内容源 /api/public + /api/auth/* 驱动，四端共用同一份实现。
 */
import { bus, EVT } from './events.js';
import { PRIMARY_NAV, CHANNELS, QUICK_ENTRIES, MINE_TABS } from './config.js';
import { getSetting, pushSearchHistory, applyPreferences } from './settings.js';
import * as ds from './datasource.js';

const state = {
  platform: 'desktop',
  nav: PRIMARY_NAV[0].id,
  channel: '',                  // 当前影视类型分类 id
  channels: [],                 // CHANNELS 影视类型清单（按 api/config 权限过滤）
  keyword: '',
  items: [],
  detail: null,
  view: 'list',
  loading: false,
  loadingChannel: '',           // 正在加载的分类（用于切换时立刻给出反馈）
  loadingSince: 0,              // 开始时间，用于「站点较慢」提示
  slowHint: false,              // 超过 2.6 秒仍未返回
  loadingMore: false,
  status: 'loading',            // 'loading'|'need-login'|'ok'|'error'
  notice: '',
  page: 1,
  toast: null,
  play: null,                   // {playUrl, episodes, notice}
  user: null,                   // /api/auth/me 真实用户信息
  extra: null,                  // 当前标签的数据
  mineTab: 'account',           // 「我的」页当前标签
  filter: { country: '', year: '', sort: 'default' },  // 筛选页前端筛选/排序（country 为地区，year 为年代分组）
  auth: {
    required: true,
    loggedIn: false,
    siteName: 'AIStream 影视',
    regEnabled: true,
    inviteRequired: false,
    publicOk: false,
    publicError: '',
    error: '',
    busy: false,
  },
};

export function getState() { return { ...state }; }

/** 请求序号：快速连点分类时，丢弃过期请求的结果，避免慢请求覆盖新分类 */
let refreshSeq = 0;

function commit(patch, evt = EVT.STATE) {
  Object.assign(state, patch);
  bus.emit(evt, getState());
}

function applyResult(result, { append = false } = {}) {
  commit({
    items: append ? [...state.items, ...(result.data || [])] : (result.data || []),
    status: result.status === 'need-login' ? 'need-login' : result.status,
    notice: result.notice || '',
    loading: false,
    slowHint: false,
    loadingChannel: '',
    loadingSince: 0,
  });
  if (result.status === 'need-login') {
    commit({ auth: { ...state.auth, loggedIn: false } });
  }
}

/** 初始化：探测公开信息 → 校验已有 token → 拉取真实栏目 → 首次浏览 */
export async function init(platform) {
  applyPreferences();
  commit({ platform, status: 'loading' });
  const pub = await ds.fetchPublic();
  const auth = {
    required: pub.needLogin !== false,
    loggedIn: false,
    siteName: pub.siteName || 'AIStream 影视',
    regEnabled: pub.regEnabled !== false,
    inviteRequired: !!pub.inviteRequired,
    publicOk: !!pub.ok,
    publicError: pub.error || '',
    error: '',
    busy: false,
  };
  commit({ auth, notice: pub.ok ? '' : ('内容源探测失败：' + (pub.error || '不可达')) });

  if (ds.hasToken()) {
    const u = await ds.fetchUser();
    auth.loggedIn = !!u.ok;
    if (u.ok) commit({ user: u.data });
    else ds.clearToken();
    commit({ auth: { ...auth } });
  }
  if (!auth.loggedIn) {
    commit({ status: 'need-login', items: [], channels: [], notice: '请先登录内容源账号' });
    return;
  }
  await loadChannels();
  await refresh({ force: true });
  setTimeout(() => { ds.prefetchCategories().catch(() => {}); }, 1500);
}

async function loadChannels() {
  const r = await ds.fetchChannels();
  const channels = r.ok && r.data?.length ? r.data : [];
  commit({ channels, channel: channels.length ? channels[0].id : '' });
}

/** 登录（四端共用的登录界面调用） */
export async function login(username, password) {
  commit({ auth: { ...state.auth, error: '', busy: true } });
  const r = await ds.login(username, password);
  if (r.ok) {
    commit({ auth: { ...state.auth, loggedIn: true, error: '', busy: false }, status: 'loading' });
    await loadChannels();
    await refresh({ force: true });
    setTimeout(() => { ds.prefetchCategories().catch(() => {}); }, 1500);
  } else {
    commit({ auth: { ...state.auth, error: r.error || '登录失败', busy: false } });
  }
  return r;
}

/** 注册（站点 regEnabled 为 true 时可用） */
export async function register(username, password, invite) {
  commit({ auth: { ...state.auth, error: '', busy: true } });
  const r = await ds.register(username, password, invite);
  if (r.ok) {
    commit({ auth: { ...state.auth, loggedIn: true, error: '', busy: false }, status: 'loading' });
    await loadChannels();
    await refresh({ force: true });
    setTimeout(() => { ds.prefetchCategories().catch(() => {}); }, 1500);
  } else {
    commit({ auth: { ...state.auth, error: r.error || '注册失败', busy: false } });
  }
  return r;
}

export async function logout() {
  await ds.logout();
  commit({
    auth: { ...state.auth, loggedIn: false, error: '', busy: false },
    items: [], channels: [], channel: '', detail: null, keyword: '', mineTab: 'account', extra: null,
    filter: { country: '', year: '', sort: 'default' },
    view: 'list', status: 'need-login', play: null,
  });
}

/** 浏览：切换一级导航（四端同名同意图） */
export async function setNav(navId) {
  if (!PRIMARY_NAV.some((n) => n.id === navId)) return;
  commit({ nav: navId, view: 'list', detail: null, keyword: '', page: 1 });
  if (navId === 'mine') return setMineTab(state.mineTab);   // 账户标签自动读取会员/积分
  // 首页 / 榜单 / 筛选共用当前分类的真实数据：已有内容就立即切换，不再等接口
  if (state.items.length && ds.peekList({ channel: state.channel, page: 1, keyword: '' })) return;
  await refresh();
}

/** 浏览：切换影视类型分类（立即反馈，不等站点聚合扫描） */
export async function setChannel(channelId) {
  const known = state.channels.some((c) => c.id === channelId) || CHANNELS.some((c) => c.id === channelId);
  if (!known) return;
  if (state.channel === channelId && !state.loading) return;   // 重复点当前分类不再打接口
  const cached = ds.peekList({ channel: channelId, page: 1, keyword: '' });
  // 乐观切换：有缓存直接换内容；没有就立刻清空并显示骨架 + 顶部进度条，绝不「按了没反应」
  commit({
    channel: channelId, view: 'list', detail: null, keyword: '', page: 1,
    filter: { ...state.filter, country: '', year: '' },
    items: cached || [],
    status: cached ? 'ok' : 'loading',
    loading: !cached,
    slowHint: false,
    loadingChannel: channelId,
    loadingSince: Date.now(),
    notice: '',
  });
  refresh();
}

let inflight = null;
let slowTimer = null;
function beginLoading(patch = {}) {
  clearTimeout(slowTimer);
  commit({ ...patch, slowHint: false, loadingSince: Date.now() });
  slowTimer = setTimeout(() => {
    if (state.loading) commit({ slowHint: true });
  }, 2600);
}
function endLoading() {
  clearTimeout(slowTimer);
  slowTimer = null;
}

export async function refresh({ append = false, force = false } = {}) {
  if (!ds.hasToken()) { endLoading(); commit({ status: 'need-login', items: [], loading: false, slowHint: false }); return; }
  const seq = ++refreshSeq;
  // 取消上一次仍在飞的请求：快速连点分类时不再排队等待，也不会旧结果覆盖新结果
  if (inflight) { try { inflight.abort(); } catch { /* ignore */ } }
  inflight = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = inflight ? inflight.signal : null;

  const params = { nav: state.nav, channel: state.channel, keyword: state.keyword, page: state.page, force };
  const cached = !force && !append && !state.keyword ? ds.peekList(params) : null;
  if (cached) {
    endLoading();
    commit({ items: cached, status: 'ok', loading: false, slowHint: false, loadingChannel: '' });
  } else {
    beginLoading({ loading: true, loadingChannel: state.channel });
  }
  const result = await ds.fetchList({ ...params, signal });
  if (seq !== refreshSeq) return;          // 已被更新的切换取代，丢弃
  if (result.status === 'aborted') return; // 主动取消，保持新请求的状态
  endLoading();
  applyResult(result, { append });
}

export async function loadMore() {
  if (!ds.hasToken()) return;
  const next = state.page + 1;
  commit({ loading: true });
  const result = await ds.fetchList({ nav: state.nav, channel: state.channel, keyword: state.keyword, page: next });
  if (!result.ok) { commit({ loading: false, slowHint: false }); toast(result.notice || '加载更多失败'); return; }
  commit({ page: next });
  applyResult(result, { append: true });
}

/**
 * 筛选需要更多样本：再拉 1 页（最多 4 页）。
 * 实测站点 api/up/catalog 只支持 kind/limit/page，没有 area/year/sort 入参，
 * 因此全量筛选只能用「多页加载 + 本地匹配」逼近，并在界面标明覆盖范围。
 */
export async function expandList() {
  if (!ds.hasToken() || state.loadingMore) return;
  if (state.page >= 4) { toast('已加载 4 页；站点未提供全量筛选参数'); return; }
  commit({ loadingMore: true });
  const next = state.page + 1;
  const r = await ds.fetchList({ nav: state.nav, channel: state.channel, keyword: state.keyword, page: next });
  commit({ loadingMore: false });
  if (!r.ok) { toast(r.notice || '加载更多失败'); return; }
  const have = new Set(state.items.map((x) => x.id));
  const add = (r.data || []).filter((x) => x.id && !have.has(x.id));
  commit({ page: next, items: [...state.items, ...add] });
  if (!add.length) toast('该分类已没有更多内容');
}

/** 搜索：四端统一入口 */
export async function search(keyword) {
  const q = String(keyword ?? '').trim();
  if (q) pushSearchHistory(q);
  commit({ keyword: q, view: 'list', detail: null, page: 1 });
  if (!q) return refresh();
  if (!ds.hasToken()) { commit({ status: 'need-login', loading: false }); return; }
  commit({ loading: true });
  applyResult(await ds.search(q));
}

export function clearSearch() {
  commit({ keyword: '', view: 'list', detail: null, page: 1 });
  refresh();
}

/** 详情：站点无独立详情接口，使用列表缓存中的真实条目 */
export async function openDetail(id) {
  if (id == null) {
    commit({ view: 'detail', detail: null });
    bus.emit(EVT.DETAIL, getState());
    toast('暂无可用条目详情');
    return;
  }
  const result = await ds.fetchDetail(id);
  if (result.ok && result.data?.length) {
    commit({ detail: result.data[0], view: 'detail', play: null });
  } else {
    toast(result.notice || '详情不可用');
    commit({ view: 'detail', detail: null, play: null });
  }
  bus.emit(EVT.DETAIL, getState());
}

export function closeDetail() {
  commit({ view: 'list', detail: null, play: null });
  bus.emit(EVT.DETAIL, getState());
}

/** 播放入口：取真实地址 / 剧集列表，不实现播放器、不生成示例地址 */
export async function requestPlay(id) {
  const targetId = id ?? state.detail?.id ?? null;
  if (targetId == null) {
    toast('请先选择条目');
    bus.emit(EVT.PLAY, { ok: false, status: 'error' });
    return { ok: false, status: 'error' };
  }
  // 点击即刻反馈：先让播放器挂载并显示加载态，避免解析地址期间的空白等待
  bus.emit(EVT.PLAY_PENDING, { title: ds.peekItemTitle(targetId) || state.detail?.title || '' });
  const result = await ds.resolvePlay(targetId);
  let resolvedUrl = result.playUrl || null;
  // 上游 token 模式：外部播放 / 复制链接需要真实地址，先解析第一条线路
  if (!resolvedUrl && result.episodes?.[0]?.token && getSetting('playMode') !== 'internal') {
    const r = await ds.resolveUpToken(result.episodes[0].token);
    if (r.ok) resolvedUrl = r.url;
  }
  commit({ play: {
    playUrl: resolvedUrl,
    episodes: result.episodes || [],
    notice: result.notice || '',
    contentId: result.contentId || '',
    detail: result.detail || null,
  } });
  if (!result.ok) {
    toast(result.notice || (result.status === 'need-login' ? '请先登录' : '播放地址获取失败'));
  } else {
    const mode = getSetting('playMode');
    const url = resolvedUrl;
    if (mode === 'external' && url) {
      try { window.open(url, '_blank', 'noopener'); toast('已用外部播放器打开'); }
      catch { toast('打开外部播放器失败，请在剧集列表中点击'); }
    } else if (mode === 'copy' && url) {
      try { await navigator.clipboard.writeText(url); toast('播放地址已复制'); }
      catch { toast('复制失败，请在剧集列表中点开链接'); }
    } else if (mode === 'internal') {
      toast('已在内置播放器打开');   // player.js 监听 EVT.PLAY 后真正挂载播放器
    } else {
      toast('已获取播放地址（' + (result.episodes?.length || 0) + ' 个剧集）');
    }
  }
  bus.emit(EVT.PLAY, result);
  return result;
}

/** 快捷入口：按站点实测结构返回可渲染的功能视图（不再打印原始 JSON） */
export async function openExtra(id, { keepTab = false } = {}) {
  const entry = QUICK_ENTRIES.find((x) => x.id === id);
  if (!entry) return;
  const tab = keepTab ? state.mineTab : (id === 'points' ? 'account' : id);
  commit({ nav: 'mine', mineTab: tab, view: 'list', detail: null, keyword: '',
    extra: { id, label: entry.label, kind: entry.view, loading: true } });
  const r = await ds.fetchExtra(id);
  if (state.mineTab !== tab) return;   // 用户已切到别的标签，丢弃旧结果
  commit({ extra: r.ok
    ? { ...r, id, loading: false }
    : { id, label: entry.label, kind: entry.view, ok: false, error: r.error || '暂不可用', loading: false } });
}

/** 「我的」页标签切换：账户=会员/积分，搜索历史=本地记录，其余=内容源真实数据 */
export async function setMineTab(tabId) {
  if (!MINE_TABS.some((t) => t.id === tabId)) return;
  commit({ nav: 'mine', mineTab: tabId, view: 'list', detail: null, keyword: '' });
  if (tabId === 'account') return openExtra('points', { keepTab: true });
  if (tabId === 'search') { commit({ extra: null }); return; }
  return openExtra(tabId, { keepTab: true });
}

/** 收起快捷入口结果 */
export function clearExtra() { commit({ extra: null }); }

/** 每日签到：成功后刷新积分卡 */
export async function checkin() {
  const r = await ds.doCheckin();
  if (!r.ok) { toast(r.error || '签到失败'); return r; }
  const gained = Number(r.gained) || 0;
  toast(r.msg || (gained > 0 ? `签到成功 +${gained}` : '签到成功'));
  // 刷新积分数据，使「今日签到」变为已签到
  try {
    const p = await ds.fetchExtra('points');
    if (p?.ok) commit({ extra: { ...p, id: 'points', label: '积分中心', loading: false } });
  } catch { /* ignore */ }
  return r;
}

/** 兑换：成功后刷新兑换中心 */
export async function redeem(id) {
  const r = await ds.doRedeem(id);
  if (!r.ok) { toast(r.error || '兑换失败'); return r; }
  toast('兑换成功');
  try {
    const d = await ds.fetchRedeem();
    if (d?.ok) commit({ extra: { ...d, loading: false } });
  } catch { /* ignore */ }
  return r;
}

/** 筛选页：前端筛选/排序，立即重绘，不请求接口 */
export function setFilter(patch = {}) {
  commit({ filter: { ...state.filter, ...patch } });
}
export function clearFilter() {
  commit({ filter: { country: '', year: '', sort: 'default' } });
}

export function toast(message) {
  commit({ toast: { message, at: Date.now() } }, EVT.TOAST);
}

export function dataSourceStatus() { return ds.statusSummary(); }

// 偏好变化时通知四端重绘
bus.on('settings', () => bus.emit(EVT.STATE, getState()));
