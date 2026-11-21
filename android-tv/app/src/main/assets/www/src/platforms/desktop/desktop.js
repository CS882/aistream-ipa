/**
 * 桌面端（键盘 + 鼠标）独立布局模块
 * 与移动 / TV 不是同一套 DOM 的缩放：侧边栏导航、顶栏搜索、悬浮卡片操作、
 * 右侧详情抽屉、底部状态栏、全局快捷键均为桌面专属。
 */
import { BRAND, PRIMARY_NAV, CHANNELS, SECTIONS, APP_VERSION, icon } from '../../core/config.js';
import { filterRows, applyFilter } from '../../components/filters.js';
import { bus, EVT } from '../../core/events.js';
import * as store from '../../core/store.js';
import {
  posterCard, listItems, dataSourceBar, emptyState, detailPending,
  detailContent, pendingPanel, PLACEHOLDER_COUNTS, escapeHTML,
  loadingStrip, skeletonGrid,
} from '../../components/content.js';
import { mountChrome } from '../../components/chrome.js';
import { mountAuthGate } from '../../components/auth.js';
import { mountSettings } from '../../components/settings.js';
import { statsBar, userChip, quickEntries, heroMain, heroMini, mineContent } from '../../components/extras.js';

const PLATFORM = 'desktop';
const root = document.getElementById('app');

root.innerHTML = `
<div class="desk">
  <aside class="desk__side">
    <div class="desk__brand">
      <div class="brand brand--lg"><span class="brand__name">${BRAND.name}</span><span class="brand__suffix">${BRAND.suffix}</span></div>
      <span class="brand__role">${BRAND.role}</span>
    </div>
    <div class="desk__side-label">主导航</div>
    <nav class="desk__nav" id="desk-nav">
      ${PRIMARY_NAV.map((n) => `<button class="desk__nav-item" data-nav="${n.id}">
        <span class="desk__nav-icon">${icon(n.icon, 20)}</span><span>${n.label}</span>
        <kbd>${PRIMARY_NAV.indexOf(n) + 1}</kbd></button>`).join('')}
    </nav>
    <div class="desk__side-label desk__side-label--mt">快捷入口</div>
    <div class="desk__side-quick" id="desk-quick"></div>
    <div class="desk__side-foot">
      <div class="desk__side-title">AIStream 影视 · v${APP_VERSION}</div>
      <button class="desk__side-settings" data-action="settings">设置 · 播放模式</button>
    </div>
  </aside>

  <div class="desk__main">
    <header class="desk__top">
      <div class="desk__crumb" id="desk-crumb"></div>
      <div class="desk__search-wrap">
        <label class="search-pill" id="desk-search-pill">
          <span class="search-pill__icon">${icon('search', 18)}</span>
          <input id="desk-search" type="search" autocomplete="off" placeholder="搜索影视内容" aria-label="搜索影视内容" />
          <button class="search-pill__clear" id="desk-search-clear" aria-label="清空">✕</button>
        </label>
        <span class="desk__kbd-hint"><kbd>/</kbd> 聚焦搜索</span>
      </div>
      <div class="desk__top-meta" id="desk-top-meta"></div>
    </header>

    <div class="desk__bar-wrap" id="desk-bar"></div>
    <nav class="desk__channels" id="desk-channels" aria-label="频道"></nav>
    <main class="desk__content" id="desk-content"></main>

    <footer class="desk__statusbar">
      <span><i class="desk__led"></i> AIStream 影视 / 桌面端</span>
      <span id="desk-status-text"></span>
      <span>快捷键 <kbd>1</kbd>–<kbd>4</kbd> 导航 · <kbd>←</kbd><kbd>→</kbd> 频道 · <kbd>Esc</kbd> 关闭</span>
    </footer>
  </div>

  <div class="desk__drawer-mask" id="desk-mask"></div>
  <aside class="desk__drawer" id="desk-drawer" aria-label="详情">
    <div class="desk__drawer-head">
      <span>详情查看</span>
      <button id="desk-drawer-close" aria-label="关闭">✕</button>
    </div>
    <div class="desk__drawer-body" id="desk-drawer-body"></div>
  </aside>
</div>`;

mountChrome(PLATFORM);
mountAuthGate(document.body);
mountSettings(document.body);

const el = {
  nav: document.getElementById('desk-nav'),
  crumb: document.getElementById('desk-crumb'),
  bar: document.getElementById('desk-bar'),
  channels: document.getElementById('desk-channels'),
  content: document.getElementById('desk-content'),
  status: document.getElementById('desk-status-text'),
  topMeta: document.getElementById('desk-top-meta'),
  search: document.getElementById('desk-search'),
  clear: document.getElementById('desk-search-clear'),
  quick: document.getElementById('desk-quick'),
  drawer: document.getElementById('desk-drawer'),
  drawerBody: document.getElementById('desk-drawer-body'),
  mask: document.getElementById('desk-mask'),
};

const summary = store.dataSourceStatus();
el.bar.innerHTML = '';
el.topMeta.innerHTML = '';

let lastContentKey = '';
/** 登录后使用按 api/config 权限过滤的影视类型分类；未登录时回退完整分类清单 */
function chans(state) { return state.channels && state.channels.length ? state.channels : CHANNELS; }


function deskHero(items) {
  const list = items || [];
  const dots = Math.max(1, Math.min(3, list.length || 1));
  return `<div class="desk__hero">
      <div class="desk__hero-main">${heroMain(list[0])}</div>
      <div class="desk__hero-side">${heroMini(list[1], 1)}${heroMini(list[2], 2)}</div>
    </div>
    <div class="desk__hero-dots dots">${Array.from({ length: dots }, (_, i) => `<i class="${i === 0 ? 'is-on' : ''}"></i>`).join('')}</div>`;
}

function deskCard(item) {
  return `<div class="desk__card" data-placeholder="${item.__placeholder ? 1 : 0}" data-id="${item.id ?? ''}">
    ${posterCard(item)}
    <div class="desk__card-actions">
      <button data-action="detail">${icon('info', 15)} 详情</button>
      <button data-action="play">${icon('play', 15)} 播放</button>
    </div>
  </div>`;
}

function gridSection(title, state, count) {
  return `<section class="desk__section">
    <div class="section-head"><div class="section-head__title">${title}</div>
      <span class="section-head__more">查看全部 ${icon('arrow', 14)}</span></div>
    <div class="desk__grid">${listItems(state.items, count).map(deskCard).join('')}</div>
    ${state.status !== 'ok' ? emptyState(state) : ''}
  </section>`;
}

function filterView(state) {
  const list = applyFilter(state.items, state.filter);
  return `<div class="filter-page">
    <section class="filter-panel filter-panel--tx">
      <div class="filter-panel__head"><b>筛选</b><span>共 ${list.length} 部</span></div>
      ${filterRows(state, 'desktop')}
    </section>
    <section class="desk__section">
      <div class="section-head"><div class="section-head__title">筛选结果</div>
        <span class="section-head__more">${list.length} 部</span></div>
      <div class="desk__grid">${list.map(deskCard).join('')}</div>
      ${list.length ? '' : (state.status === 'error' ? emptyState(state)
        : '<div class="empty-state">没有符合筛选条件的内容，试试重置筛选</div>')}
    </section>
  </div>`;
}

function rankView(state) {
  const list = applyFilter(state.items, state.filter).slice(0, 30);
  return `<section class="desk__section">
    <div class="section-head"><div class="section-head__title">榜单</div>
      <span class="section-head__more">内容源顺序 · ${list.length} 部</span></div>
    <div class="rank-list">${list.map((it, i) => `<div class="rank-item" data-action="detail" data-id="${escapeHTML(it.id || '')}">
      <span class="rank-no ${i < 3 ? 'is-top' : ''}">${i + 1}</span>
      <div class="rank-poster">${it.poster ? `<img src="${escapeHTML(it.poster)}" alt="" loading="lazy" />` : '<span>暂无封面</span>'}</div>
      <div class="rank-meta"><b>${escapeHTML(it.title || '未命名')}</b>
        <small>${escapeHTML([it.category, it.year, it.area].filter(Boolean).join(' · '))}</small></div>
      <button class="btn-ghost btn-mini" data-action="play" data-id="${escapeHTML(it.id || '')}">播放</button>
    </div>`).join('')}</div>
    ${list.length ? '' : '<div class="empty-state">当前分类暂无榜单内容</div>'}
  </section>`;
}

function mineView(state) {
  return `<section class="desk__section">
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

  let html = '';
  const strip = loadingStrip(state);
  if (state.nav === 'mine') html = mineView(state);
  else if (state.keyword) {
    html = `<section class="desk__section">
      ${strip}
      <div class="section-head"><div class="section-head__title">“${escapeHTML(state.keyword)}” 的搜索结果</div>
        <span class="section-head__more">共 ${state.items.length} 条</span></div>
      <div class="desk__grid">${listItems(state.items, PLACEHOLDER_COUNTS.desktop).map(deskCard).join('')}</div>
      ${state.status !== 'ok' ? emptyState(state) : ''}
    </section>`;
  } else if (state.nav === 'filter') {
    html = filterView(state);
  } else if (state.nav === 'rank') {
    html = rankView(state);
  } else if (!state.loading && state.status === 'error' && !state.items.length) {
    html = strip + `<section class="desk__section">${emptyState(state)}</section>`;
  } else if (state.loading && !state.items.length) {
    // 没有缓存时立刻给骨架，避免下方区域看起来「卡住」
    const label = chans(state).find((c) => c.id === state.channel)?.label || '内容';
    html = strip + `<section class="desk__section">
      <div class="section-head"><div class="section-head__title">${escapeHTML(label)}</div></div>
      <div class="desk__grid">${skeletonGrid(PLACEHOLDER_COUNTS.desktop)}</div>
    </section>`;
  } else {
    html = strip + deskHero(listItems(state.items, 3))
      + gridSection(SECTIONS[1].label, state, PLACEHOLDER_COUNTS.desktop)
      + gridSection(SECTIONS[2].label, state, 6);
  }
  el.content.innerHTML = html;
}

function render(state) {
  const summary = store.dataSourceStatus();
  el.bar.innerHTML = statsBar(state, summary);
  el.topMeta.innerHTML = userChip(state);
  if (el.quick) el.quick.innerHTML = quickEntries(state);
  el.nav.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('is-on', b.dataset.nav === state.nav));
  el.channels.innerHTML = chans(state).map((c) => `<button class="channel-chip ${c.id === state.channel ? 'is-active' : ''} ${c.group === '直播' ? 'is-live' : ''}" data-channel="${c.id}">${c.label}</button>`).join('');
  const navLabel = PRIMARY_NAV.find((n) => n.id === state.nav)?.label || '首页';
  const chLabel = chans(state).find((c) => c.id === state.channel)?.label || '';
  el.crumb.innerHTML = `<b>${navLabel}</b><span>/</span><span>${chLabel}</span>`;
  el.status.textContent = `条目 ${state.items.length} · 数据源 ${state.status === 'ok' ? '已对接' : '待补充 ' + store.dataSourceStatus().count + ' 项'}`;
  el.clear.classList.toggle('is-on', !!state.keyword);
  renderContent(state);

  const open = state.view === 'detail';
  el.drawer.classList.toggle('is-open', open);
  el.mask.classList.toggle('is-open', open);
  if (open) el.drawerBody.innerHTML = state.detail ? detailContent(state.detail, state.play) : detailPending(state);
}

/* ---------------- 事件：键鼠专属 ---------------- */
root.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) return store.setNav(navBtn.dataset.nav);

  const channelBtn = e.target.closest('[data-channel]');
  if (channelBtn) return store.setChannel(channelBtn.dataset.channel);

  const filterBtn = e.target.closest('[data-filter]');
  if (filterBtn) return store.setFilter({ [filterBtn.dataset.filter]: filterBtn.dataset.value || '' });
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) return store.setFilter({ sort: sortBtn.dataset.sort });

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    const a = actionBtn.dataset.action;
    const card = actionBtn.closest('.desk__card');
    const id = actionBtn.dataset.id || card?.dataset.id || null;
    if (a === 'close') return store.closeDetail();
    if (a === 'logout') return store.logout();
    if (a === 'settings') return;
    if (a === 'extra') return store.openExtra(actionBtn.dataset.extra);
    if (a === 'clear-extra') return store.clearExtra();
    if (a === 'mine-tab') return store.setMineTab(actionBtn.dataset.tab);
    if (a === 'reset-filter') return store.clearFilter();
    if (a === 'expand-list') return store.expandList();
    if (a === 'retry') return store.refresh({ force: true });
    if (a === 'checkin') return store.checkin();
    if (a === 'open-redeem') return store.openExtra('redeem');
    if (a === 'redeem') return store.redeem(actionBtn.dataset.id);
    if (a === 'copy-invite') { try { navigator.clipboard?.writeText(actionBtn.dataset.code || ''); store.toast('邀请码已复制'); } catch {} return; }
    if (a === 'play') return store.requestPlay(id || null);
    return store.openDetail(id || null);
  }

  const hero = e.target.closest('.desk__hero [data-placeholder]');
  if (hero) return store.openDetail(null);

  const card = e.target.closest('.desk__card');
  if (card) return store.requestPlay(card.dataset.id || null);   // 点封面直接播放
});

document.getElementById('desk-drawer-close').addEventListener('click', () => store.closeDetail());
el.mask.addEventListener('click', () => store.closeDetail());

let searchTimer = null;
el.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.search(el.search.value), 320);
});
el.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); store.search(el.search.value); }
});
el.clear.addEventListener('click', () => { el.search.value = ''; store.clearSearch(); el.search.focus(); });

document.addEventListener('keydown', (e) => {
  const typing = /input|textarea/i.test(document.activeElement?.tagName || '');
  if (e.key === '/' && !typing) { e.preventDefault(); el.search.focus(); return; }
  if (e.key === 'Escape') {
    if (store.getState().view === 'detail') return store.closeDetail();
    if (el.search.value) { el.search.value = ''; store.clearSearch(); }
    el.search.blur();
    return;
  }
  if (typing) return;
  if (/^[1-4]$/.test(e.key)) return store.setNav(PRIMARY_NAV[Number(e.key) - 1].id);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const list = chans(store.getState());
    const i = list.findIndex((c) => c.id === store.getState().channel);
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
    store.setChannel(list[next].id);
  }
});

bus.on(EVT.STATE, render);
bus.on(EVT.DETAIL, render);
store.init(PLATFORM).then(() => render(store.getState()));
