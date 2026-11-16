/**
 * AIStream 影视 · 全局界面配置（UI 结构层，非影视内容数据）
 * ------------------------------------------------------------------
 * 本文件只描述「界面长什么样、有哪些导航」，不描述任何影视条目。
 * 所有影视条目的地址、字段、参数一律由 datasource.js 管理，
 * 且未提供信息保持待补充，不在本文件内编造。
 */

export const BRAND = Object.freeze({
  name: 'AIStream',
  suffix: '影视',
  role: 'ADMIN',
  title: 'AIStream 影视',
});

/**
 * 四端必须严格一致的核心功能。
 * 各端界面只允许改变「呈现方式与交互」，不得增删此清单。
 */
export const CORE_FEATURES = Object.freeze([
  { id: 'browse', label: '内容浏览' },
  { id: 'search', label: '搜索' },
  { id: 'detail', label: '详情查看' },
  { id: 'play', label: '播放入口' },
]);

/**
 * 一级导航。
 * 依据需求方对参考图的两处改造：
 *   - 「独家大瓜」→ 直接移除（不保留占位、不改名顶替）
 *   - 「游戏中心」→ 替换为「榜单」（影视内容向，而非游戏向）
 * 四端共用同一份清单，仅布局方向不同（桌面左侧竖排 / 移动底部横排 / TV 左侧大焦点竖排）。
 */
export const PRIMARY_NAV = Object.freeze([
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'filter', label: '筛选', icon: 'filter' },
  { id: 'rank', label: '榜单', icon: 'rank' }, // 原「游戏中心」替换项
  { id: 'mine', label: '我的', icon: 'mine' },
]);

export const REMOVED_NAV = Object.freeze([
  { id: 'gossip', label: '独家大瓜', action: 'removed' },
  { id: 'games', label: '游戏中心', action: 'replaced-by:rank' },
]);

/**
 * 顶部栏目 = 按「影视类型」区分，不再显示采集源栏目（栏目 1~13）。
 * ------------------------------------------------------------------
 * id / kind 全部来自需求方站点 app.js 的实测定义：
 *   KINDNAME = { movie:'电影', series:'剧集', anime:'动漫',
 *                variety:'综艺' }
 *   侧栏分类：rec / movie / series / anime / variety / vod / iptv
 *   （短剧 short / 纪录片 doc 因上游无数据已按需求去掉）
 *   直播分组：iptv / sportslive
 *   按类型取内容的真实接口：api/up/catalog?kind=<kind>&limit=&page=
 * 显示名按需求方要求（「电视剧」而非站点内部「剧集」）。
 * source 决定 datasource.js 用哪个实测接口取数据。
 */
export const CHANNELS = Object.freeze([
  { id: 'rec', label: '推荐', group: '影视', source: 'home' },
  { id: 'movie', label: '电影', group: '影视', source: 'catalog', kind: 'movie' },
  { id: 'series', label: '电视剧', group: '影视', source: 'catalog', kind: 'series' },
  { id: 'anime', label: '动漫', group: '影视', source: 'catalog', kind: 'anime' },
  { id: 'variety', label: '综艺', group: '影视', source: 'catalog', kind: 'variety' },
  { id: 'vod', label: '点播', group: '影视', source: 'official-vod' },
  { id: 'iptv', label: 'IPTV', group: '直播', source: 'iptv' },
]);

/**
 * 「我的」快捷入口：接口路径与返回结构均来自站点 app.js 实测。
 * view 决定界面渲染形态，避免把原始 JSON 键值摊开显示。
 *   items  → {items:[{id,title,poster...}]} 影视卡片
 *   points → {points,vip,checkin,invite,cfg,growth,daily} 会员信息
 *   weekly → {days:[...]} 追剧周片单
 *   iptv   → {enabled,channels:[{cid,name,group,logo}],now} 直播频道
 */
export const QUICK_ENTRIES = Object.freeze([
  { id: 'weekly', label: '我的追剧', icon: 'rank', api: 'api/weekly', view: 'weekly' },
  { id: 'points', label: '积分中心', icon: 'mine', api: 'api/points/me', view: 'points' },
  { id: 'reserve', label: '我的预约', icon: 'info', api: 'api/preview/reserved', view: 'items' },
  { id: 'history', label: '历史记录', icon: 'back', api: 'api/history', view: 'items' },
  { id: 'fav', label: '我的收藏', icon: 'play', api: 'api/fav', view: 'items' },
]);

/**
 * 「我的」页标签：账户标签只负责会员 / 积分 / 关于；
 * 影视类功能各自一个标签，主内容区不再重复渲染一份快捷入口。
 * IPTV 已在顶部影视类型导航里，故不在此重复。
 */
export const MINE_TABS = Object.freeze([
  { id: 'account', label: '账户信息', icon: 'mine' },
  { id: 'weekly', label: '我的追剧', icon: 'rank' },
  { id: 'history', label: '历史记录', icon: 'back' },
  { id: 'fav', label: '我的收藏', icon: 'play' },
  { id: 'reserve', label: '我的预约', icon: 'info' },
  { id: 'search', label: '搜索历史', icon: 'search' },
]);

/** 应用版本号（与 package.json 一致） */
export const APP_VERSION = '1.0.0';

/** 内容分区标题（UI 版式元素，同样不携带任何影视数据） */
export const SECTIONS = Object.freeze([
  { id: 'hero', label: '焦点推荐' },
  { id: 'hot', label: '热播榜单' },
  { id: 'latest', label: '最近更新' },
]);

/** 四端共享的内联图标（避免外部图标库依赖与网络请求） */
export const ICONS = Object.freeze({
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
  filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  rank: '<path d="M5 20V11"/><path d="M12 20V4"/><path d="M19 20v-6"/>',
  mine: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.6-4 3.5-6 7.5-6s6.9 2 7.5 6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.2 4.2"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  arrow: '<path d="M9 5l7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.2"/>',
});

export function icon(name, size = 24) {
  const d = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/** 各端的布局参数（差异在此声明，由各端独立布局模块消费，不是缩放系数） */
export const PLATFORM_LAYOUT = Object.freeze({
  desktop: { input: 'keyboard-mouse', navOrientation: 'vertical-left', gridMin: 168, gridMax: 232, hover: true, focusRing: false, safeArea: false },
  mobile: { input: 'touch', navOrientation: 'horizontal-bottom', gridMin: 104, gridMax: 168, hover: false, focusRing: false, safeArea: true },
  tv: { input: 'remote', navOrientation: 'vertical-left', gridMin: 220, gridMax: 300, hover: false, focusRing: true, safeArea: true },
});
