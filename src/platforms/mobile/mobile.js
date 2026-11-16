/**
 * 移动触控端（iOS / 安卓）独立布局模块
 * 还原参考图的移动端「影视」版式：状态栏、顶部半透明搜索胶囊、横向频道栏、
 * 大幅焦点轮播、分区标题 + 箭头、三列海报网格、底部 Tab。
 * 与桌面 / TV 不共用布局 DOM：触摸手势、上滑整页详情、底部安全区均为移动端专属。
 */
import { BRAND, PRIMARY_NAV, CHANNELS, SECTIONS, CORE_FEATURES, icon } from '../../core/config.js';
import { filterRows, applyFilter } from '../../components/filters.js';
import { bus, EVT } from '../../core/events.js';
import * as store from '../../core/store.js';
import { mobileFlavor } from '../../core/platform.js';
import {
  posterCard, listItems, dataSourceBar, emptyState, detailPending,
  detailContent, pendingPanel, PLACEHOLDER_COUNTS, escapeHTML,
  loadingStrip, skeletonGrid,
} from '../../components/content.js';
import { mountChrome } from '../../components/chrome.js';
import { mountAuthGate } from '../../components/auth.js';
import { mountSettings } from '../../components/settings.js';
import { statsBar, heroMain, mineContent } from '../../components/extras.js';

const PLATFORM = 'mobile';
const flavor = mobileFlavor();
const root = document.getElementById('app');
document.documentElement.dataset.flavor = flavor;

root.innerHTML = `
<div class="mob">
  <div class="mob__statusbar">
    <span>${flavor === 'ios' ? 'iOS' : flavor === 'android' ? 'ANDROID' : 'MOBILE WEB'} · 触摸交互</span>
    <span>AIStream 影视</span>
  </div>

  <header class="mob__top">
    <div class="mob__logo" aria-label="${BRAND.title}"><span class="mob__logo-mark"></span><span class="mob__logo-text">${BRAND.name}</span></div>
    <button class="mob__settings-btn" data-action="settings" aria-label="设置">${icon('filter', 18)}</button>
    <label class="search-pill mob__search" id="mob-search-pill">
      <input id="mob-search" type="search" autocomplete="off" placeholder="搜索影视内容" aria-label="搜索影视内容" />
      <button class="search-pill__clear" id="mob-search-clear" aria-label="清空">✕</button>
      <span class="search-pill__icon" id="mob-search-go">${icon('search', 19)}</span>
    </label>
  </header>

  <div class="mob__bar-wrap" id="mob-bar"></div>
  <nav class="mob__channels" id="mob-channels" aria-label="频道"></nav>

  <main class="mob__scroll" id="mob-scroll">
    <div class="mob__hero" id="mob-hero">
      <div id="mob-hero-body"></div>
      <div class="mob__hero-dots dots" id="mob-dots"></div>
    </div>

    <div id="mob-content"></div>
  </main>

  <nav class="mob__tabbar" id="mob-tabbar">
    ${PRIMARY_NAV.map((n) => `<button class="mob__tab" data-nav="${n.id}">
      <span class="mob__tab-icon">${icon(n.icon, 22)}</span><span>${n.label}</span>
    </button>`).join('')}
  </nav>

  <section class="mob__detail" id="mob-detail" aria-label="详情">
    <div class="mob__detail-top">
      <button class="mob__detail-back" data-action="close">${icon('back', 22)}</button>
      <span>详情查看</span>
    </div>
    <div class="mob__detail-poster skeleton"><span class="pending-tag">海报待接入</span></div>
    <div class="mob__detail-body" id="mob-detail-body"></div>
  </section>
</div>`;

mountChrome(PLATFORM);
mountAuthGate(document.body);
mountSettings(document.body);

const el = {
  bar: document.getElementById('mob-bar'),
  channels: document.getElementById('mob-channels'),
  content: document.getElementById('mob-content'),
  tabbar: document.getElementById('mob-tabbar'),
  search: document.getElementById('mob-search'),
  clear: document.getElementById('mob-search-clear'),
  go: document.getElementById('mob-search-go'),
  scroll: document.getElementById('mob-scroll'),
  hero: document.getElementById('mob-hero'),
  dots: document.getElementById('mob-dots'),
  detail: document.getElementById('mob-detail'),
  detailBody: document.getElementById('mob-detail-body'),
};

const summary = store.dataSourceStatus();
el.bar.innerHTML = '';

let lastContentKey = '';
/** 登录后使用按 api/config 权限过滤的影视类型分类；未登录时回退完整分类清单 */
function chans(state) { return state.channels && state.channels.length ? state.channels : CHANNELS; }

let heroIndex = 0;

function mobSection(title, state, count) {
  return `<section class="mob__section">
    <div class="section-head">
      <div class="section-head__title">${title}</div>
      <span class="section-head__more">更多 ${icon('arrow', 15)}</span>
    </div>
    <div class="mob__grid">${listItems(state.items, count).map((it) => posterCard(it)).join('')}</div>
    ${state.status !== 'ok' ? `<div class="mob__hint">${emptyState(state).replace('class="empty-state"', 'class="empty-state empty-state--compact"')}</div>` : ''}
  </section>`;
}

function filterView(state) {
  const list = applyFilter(state.items, state.filter);
  return `<div class="filter-page">
    <section class="mob__section">
      <div class="section-head"><div class="section-head__title">筛选</div>
        <span class="section-head__more">${list.length} 部</span></div>
      <div class="filter-panel filter-panel--tx">${filterRows(state, 'mobile')}</div>
    </section>
    <section class="mob__section">
      <div class="section-head"><div class="section-head__title">筛选结果</div></div>
      <div class="mob__grid">${list.map((it) => posterCard(it)).join('')}</div>
      ${list.length ? '' : (state.status === 'error' ? emptyState(state)
        : '<div class="mob__hint">没有符合筛选条件的内容，试试重置筛选</div>')}
    </section>
  </div>`;
}

function rankView(state) {
  const list = applyFilter(state.items, state.filter).slice(0, 30);
  return `<section class="mob__section">
    <div class="section-head"><div class="section-head__title">榜单</div>
      <span class="section-head__more">内容源顺序 · ${list.length} 部</span></div>
    <div class="rank-list">${list.map((it, i) => `<div class="rank-item" data-action="detail" data-id="${escapeHTML(it.id || '')}">
      <span class="rank-no ${i < 3 ? 'is-top' : ''}">${i + 1}</span>
      <div class="rank-poster">${it.poster ? `<img src="${escapeHTML(it.poster)}" alt="" loading="lazy" />` : ''}</div>
      <div class="rank-meta"><b>${escapeHTML(it.title || '未命名')}</b>
        <small>${escapeHTML([it.category, it.year, it.area].filter(Boolean).join(' · '))}</small></div>
      <button class="btn-ghost btn-mini" data-action="play" data-id="${escapeHTML(it.id || '')}">播放</button>
    </div>`).join('')}</div>
    ${list.length ? '' : '<div class="mob__hint">当前分类暂无榜单内容</div>'}
  </section>`;
}

function mineView(state) {
  return `<section class="mob__section">
    <div class="section-head"><div class="section-head__title">我的</div></div>
    ${mineContent(state, store.dataSourceStatus())}
  </section>`;
}

function renderContent(state) {
  const key = [state.nav, state.channel, state.keyword, state.items.length, state.status, state.auth.loggedIn, state.channels.length,
    state.extra?.id, state.extra?.loading, state.extra?.ok, state.mineTab,
    state.filter?.country, state.filter?.year, state.filter?.sort,
    state.loading, state.slowHint].join('|');
  if (key === lastContentKey) return;
  lastContentKey = key;

  const strip = loadingStrip(state);
  if (state.nav === 'mine') { el.content.innerHTML = mineView(state); return; }
  if (state.keyword) {
    el.content.innerHTML = `<section class="mob__section">
      ${strip}
      <div class="section-head"><div class="section-head__title">“${escapeHTML(state.keyword)}” 的搜索结果</div></div>
      <div class="mob__grid">${listItems(state.items, PLACEHOLDER_COUNTS.mobile).map((it) => posterCard(it)).join('')}</div>
      ${state.status !== 'ok' ? emptyState(state) : ''}
    </section>`;
    return;
  }
  if (state.nav === 'filter') { el.content.innerHTML = filterView(state); return; }
  if (state.nav === 'rank') { el.content.innerHTML = rankView(state); return; }
  if (!state.loading && state.status === 'error' && !state.items.length) {
    el.content.innerHTML = strip + `<section class="mob__section">${emptyState(state)}</section>`;
    return;
  }
  if (state.loading && !state.items.length) {
    const label = chans(state).find((c) => c.id === state.channel)?.label || '内容';
    el.content.innerHTML = strip + `<section class="mob__section">
      <div class="section-head"><div class="section-head__title">${escapeHTML(label)}</div></div>
      <div class="mob__grid">${skeletonGrid(PLACEHOLDER_COUNTS.mobile)}</div>
    </section>`;
    return;
  }
  el.content.innerHTML = strip + mobSection(SECTIONS[1].label, state, PLACEHOLDER_COUNTS.mobile)
    + mobSection(SECTIONS[2].label, state, 3);
}

function render(state) {
  el.bar.innerHTML = statsBar(state, store.dataSourceStatus());
  const heroBody = document.getElementById('mob-hero-body');
  if (heroBody) heroBody.innerHTML = heroMain(state.items?.[0]);
  const n = Math.max(1, Math.min(3, state.items?.length || 1));
  el.dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === 0 ? 'is-on' : ''}"></i>`).join('');
  el.tabbar.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('is-on', b.dataset.nav === state.nav));
  el.channels.innerHTML = chans(state).map((c) => `<button class="channel-chip ${c.id === state.channel ? 'is-active' : ''} ${c.group === '直播' ? 'is-live' : ''}" data-channel="${c.id}">${c.label}</button>`).join('');
  el.clear.classList.toggle('is-on', !!state.keyword);
  el.hero.style.display = (state.keyword || state.nav === 'mine' || state.nav === 'filter') ? 'none' : '';
  renderContent(state);

  const open = state.view === 'detail';
  el.detail.classList.toggle('is-open', open);
  if (open) el.detailBody.innerHTML = state.detail ? detailContent(state.detail, state.play) : detailPending(state);
}

/* ---------------- 事件：触摸专属 ---------------- */
root.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) { store.setNav(navBtn.dataset.nav); el.scroll.scrollTo({ top: 0, behavior: 'smooth' }); return; }

  const channelBtn = e.target.closest('[data-channel]');
  if (channelBtn) { store.setChannel(channelBtn.dataset.channel); return; }

  const filterBtn = e.target.closest('[data-filter]');
  if (filterBtn) { store.setFilter({ [filterBtn.dataset.filter]: filterBtn.dataset.value || '' }); return; }
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) { store.setFilter({ sort: sortBtn.dataset.sort }); return; }

  const action = e.target.closest('[data-action]');
  if (action) {
    const a = action.dataset.action;
    if (a === 'settings') return;
    if (a === 'close') return store.closeDetail();
    if (a === 'logout') return store.logout();
    if (a === 'extra') return store.openExtra(action.dataset.extra);
    if (a === 'clear-extra') return store.clearExtra();
    if (a === 'mine-tab') return store.setMineTab(action.dataset.tab);
    if (a === 'reset-filter') return store.clearFilter();
    if (a === 'expand-list') return store.expandList();
    if (a === 'retry') return store.refresh({ force: true });
    if (a === 'play') return store.requestPlay(action.dataset.id || null);
    if (a === 'detail') return store.openDetail(action.dataset.id || null);
    return store.openDetail(null);
  }

  const card = e.target.closest('.poster-card');
  if (card) return store.requestPlay(card.dataset.id || null);   // 点封面直接播放

  if (e.target.closest('.mob__hero')) return store.openDetail(null);
});

let searchTimer = null;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.search(el.search.value), 360);
});
el.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Search') { e.preventDefault(); clearTimeout(searchTimer); store.search(el.search.value); el.search.blur(); }
});
el.go.addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(searchTimer); store.search(el.search.value); el.search.blur(); });
el.clear.addEventListener('click', (e) => { e.stopPropagation(); el.search.value = ''; store.clearSearch(); });

/* 焦点轮播：横向 swipe 手势（仅切换版式指示位，不产生任何内容） */
let touchX = null;
el.hero.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
el.hero.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 42) {
    heroIndex = (heroIndex + (dx < 0 ? 1 : 2)) % 3;
    el.dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i === heroIndex));
  }
  touchX = null;
}, { passive: true });

/* 安卓物理返回键 / 浏览器返回：优先关闭详情 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && store.getState().view === 'detail') { e.preventDefault(); store.closeDetail(); }
});

bus.on(EVT.STATE, render);
bus.on(EVT.DETAIL, render);
store.init(PLATFORM).then(() => render(store.getState()));
