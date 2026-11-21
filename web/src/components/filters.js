/**
 * 筛选 / 排序（四端共用）· 腾讯视频式
 * ------------------------------------------------------------------
 * 四行：类型 / 国家（地区）/ 年份 / 排序，每行首项为「全部 / 默认」。
 * · 类型：站点实测 kind（电影/电视剧/动漫/综艺；短剧/纪录片已按需求去掉）
 * · 国家：腾讯视频式固定列表；对内容源返回的 area 做**标准化解析**，
 *         兼容「华语 / 欧美 / 日韩 / 港台」这类笼统值（不再只做字符串包含）
 * · 年份：年代分组（2026 / 2025 / 2020年代 / 2010年代 / 2000年代 / 90年代 / 更早）
 * · 排序：默认 / 时间 / 名称 / 评分；热度站点未提供字段 → 置灰
 * 覆盖范围：实测 api/up/catalog 只支持 kind/limit/page，没有 area/year/sort 入参，
 *           因此筛选是对「已加载内容」做本地匹配，界面如实标明并提供「加载更多」。
 */
import { CHANNELS } from '../core/config.js';
import { escapeHTML } from './content.js';

const e = escapeHTML;

export const COUNTRIES = Object.freeze([
  '中国大陆', '美国', '中国香港', '中国台湾', '中国澳门', '日本', '韩国',
  '英国', '法国', '德国', '意大利', '西班牙', '印度', '泰国', '俄罗斯',
  '加拿大', '澳大利亚', '爱尔兰', '瑞典', '巴西', '丹麦',
]);

/** 笼统大区 → 具体国家（内容源常用「欧美」「华语」「日韩」） */
const BROAD = {
  华语: ['中国大陆', '中国香港', '中国台湾', '中国澳门'],
  欧美: ['美国', '英国', '法国', '德国', '意大利', '西班牙', '加拿大', '澳大利亚', '爱尔兰', '瑞典', '丹麦', '巴西'],
  日韩: ['日本', '韩国'],
  港台: ['中国香港', '中国台湾'],
  英美: ['英国', '美国'],
  亚洲: ['中国大陆', '中国香港', '中国台湾', '中国澳门', '日本', '韩国', '泰国', '印度'],
};

/** 单项别名（只做明确、无歧义的映射） */
const ALIAS = {
  中国大陆: ['中国', '大陆', '内地', '国语'],
  中国香港: ['香港', '港剧', '港片', 'TVB'],
  中国台湾: ['台湾', '台剧', '台片'],
  中国澳门: ['澳门'],
  美国: ['美剧', '美片', '好莱坞'],
  日本: ['日剧', '日漫', '日影'],
  韩国: ['韩剧', '韩影', '韩综'],
  英国: ['英剧', '英影'],
  法国: ['法剧', '法影'],
  德国: ['德剧', '德影'],
  泰国: ['泰剧'],
  印度: ['印度剧', '宝莱坞'],
};

export const YEAR_GROUPS = Object.freeze([
  { id: '2026', label: '2026', test: (y) => y >= 2026 },
  { id: '2025', label: '2025', test: (y) => y === 2025 },
  { id: '2020s', label: '2020年代', test: (y) => y >= 2020 && y <= 2024 },
  { id: '2010s', label: '2010年代', test: (y) => y >= 2010 && y <= 2019 },
  { id: '2000s', label: '2000年代', test: (y) => y >= 2000 && y <= 2009 },
  { id: '1990s', label: '90年代', test: (y) => y >= 1990 && y <= 1999 },
  { id: 'older', label: '更早', test: (y) => y > 0 && y < 1990 },
]);

export const SORTS = Object.freeze([
  { id: 'default', label: '默认' },
  { id: 'year-desc', label: '时间' },
  { id: 'title', label: '名称' },
  { id: 'score', label: '评分' },
  { id: 'hot', label: '热度', disabled: true, hint: '内容源未提供热度字段' },
]);

/** 把内容源的 area 拆成规范化国家集合（含大区展开） */
export function countriesOf(area) {
  const s = String(area || '');
  const out = new Set();
  if (!s) return out;
  Object.entries(BROAD).forEach(([broad, members]) => {
    if (s.includes(broad)) members.forEach((m) => out.add(m));
  });
  Object.entries(ALIAS).forEach(([country, keys]) => {
    if (keys.some((k) => s.includes(k))) out.add(country);
  });
  // 兜底：area 直接等于某个国家名
  COUNTRIES.forEach((c) => { if (s === c) out.add(c); });
  return out;
}

export function matchesCountry(area, country) {
  if (!country) return true;
  return countriesOf(area).has(country);
}

/** 前端筛选 + 排序（不改动 state.items 原数组） */
export function applyFilter(items, filter = {}) {
  let list = Array.isArray(items) ? items.slice() : [];
  // 内容源不提供 area 时忽略国家条件，避免把全部内容误筛成 0 条
  if (filter.country && hasArea(list)) list = list.filter((x) => matchesCountry(x?.area, filter.country));
  // 片源/站点筛选（从当前内容里提取的真实 station）
  if (filter.station) list = list.filter((x) => (x?.station || '') === filter.station);
  if (filter.year) {
    const g = YEAR_GROUPS.find((x) => x.id === filter.year);
    if (g) list = list.filter((x) => g.test(Number(x?.year) || 0));
  }
  const sort = filter.sort || 'default';
  if (sort === 'year-desc') list.sort((a, b) => (Number(b?.year) || 0) - (Number(a?.year) || 0));
  else if (sort === 'title') list.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'zh'));
  else if (sort === 'score') {
    const num = (x) => { const v = parseFloat(x?.score); return Number.isFinite(v) ? v : -1; };
    list.sort((a, b) => num(b) - num(a));
  }
  return list;
}

export function hasFilter(filter = {}) {
  return !!(filter.country || filter.station || filter.year || (filter.sort && filter.sort !== 'default'));
}

/** 当前数据里出现的片源/站点（去重、按数量降序），供“片源筛选”行使用 */
export function stationOptions(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((x) => {
    const s = x?.station || x?.category || '';
    if (s) map.set(s, (map.get(s) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** 当前数据是否含可用的地区字段（内容源实测不提供，据此禁用国家筛选） */
export function hasArea(items) {
  return (Array.isArray(items) ? items : []).some((x) => !!(x && x.area && String(x.area).trim()));
}

/** 当前数据里真实出现的地区 / 年份（保留给外部调用） */
export function filterOptions(items) {
  const list = Array.isArray(items) ? items : [];
  const areas = [...new Set(list.map((x) => (x && x.area ? String(x.area) : '')).filter(Boolean))].slice(0, 10);
  const years = [...new Set(list.map((x) => (x && x.year ? String(x.year) : '')).filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a)).slice(0, 8);
  return { areas, years };
}

/** 筛选面板 HTML（platform: desktop / mobile / tv） */
export function filterRows(state, platform = 'desktop') {
  const f = state.filter || {};
  const focus = platform === 'tv' ? ' data-focusable="1" data-zone="row"' : '';
  const chip = (active, attrs, text, opts = {}) => `<button class="filter-opt ${active ? 'is-on' : ''} ${opts.disabled ? 'is-disabled' : ''}"${focus} ${attrs}${opts.disabled ? ' disabled' : ''}${opts.hint ? ` title="${e(opts.hint)}"` : ''}>${e(String(text))}</button>`;
  // 左侧加一行小标签（类型/国家/年份/排序），用户一眼知道这一行在筛什么
  const row = (label, chips) => `<div class="filter-row">
      <span class="filter-row__label">${e(label)}</span>
      <div class="filter-row__chips">${chips}</div>
    </div>`;

  const typeItems = CHANNELS.filter((c) => c.source === 'catalog' || c.source === 'home');
  const typeRow = row('类型',
    chip(state.channel === 'rec', 'data-channel="rec"', '全部')
    + typeItems.filter((c) => c.id !== 'rec').map((c) => chip(c.id === state.channel, `data-channel="${c.id}"`, c.label)).join('')
  );
  // 实测内容源（catalog / home / search / official-vod）均不返回 area 字段，
  // 按国家筛选必然 0 条。置灰并说明原因，避免用户点了没反应误以为 BUG。
  const countryUnavailable = hasArea(state.items);
  const countryRow = row('国家',
    chip(!f.country, 'data-filter="country" data-value=""', '全部',
      { disabled: !countryUnavailable, hint: !countryUnavailable ? '内容源未提供地区字段' : '' })
    + (countryUnavailable
        ? COUNTRIES.map((c) => chip(f.country === c, `data-filter="country" data-value="${e(c)}"`, c)).join('')
        : '<span class="filter-unavailable">内容源未提供地区字段，暂不可按国家筛选</span>')
  );
  const yearRow = row('年份',
    chip(!f.year, 'data-filter="year" data-value=""', '全部')
    + YEAR_GROUPS.map((g) => chip(f.year === g.id, `data-filter="year" data-value="${g.id}"`, g.label)).join('')
  );
  // 片源/站点筛选：从当前内容里提取真实站点，按数量降序（原版详情页按站点分组线路的同款体验）
  const stations = stationOptions(state.items);
  const stationRow = row('片源',
    chip(!f.station, 'data-filter="station" data-value=""', '全部')
    + stations.slice(0, 16).map((s) => chip(f.station === s,
        `data-filter="station" data-value="${e(s)}"`, s)).join('')
  );
  const sortRow = row('排序',
    SORTS.map((s) => chip((f.sort || 'default') === s.id, `data-sort="${s.id}"`, s.label,
      { disabled: !!s.disabled, hint: s.hint || '' })).join('')
  );
  const total = Array.isArray(state.items) ? state.items.length : 0;
  return typeRow + countryRow + yearRow + stationRow + sortRow
    + `<div class="filter-actions">
        ${hasFilter(f) ? '<button class="btn-ghost btn-mini" data-action="reset-filter">重置筛选</button>' : ''}
        ${state.page < 4 ? `<button class="btn-ghost btn-mini" data-action="expand-list" ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? '加载中…' : '加载更多（扩大筛选范围）'}</button>` : ''}
        <span class="filter-note">已加载 ${total} 条 · 类型/年份/片源/排序可用；国家与热度因内容源未提供对应字段暂不可用</span>
      </div>`;
}
