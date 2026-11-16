/**
 * TV 大屏端（遥控器）独立布局模块
 * ------------------------------------------------------------------
 * 与桌面 / 移动完全不同的设计，不是缩放或拉伸：
 *   · 10-foot UI：大字号、大间距、overscan 安全区、高对比度
 *   · 无 hover、无滚动条、无鼠标指针，全部依赖「焦点」
 *   · 自研 FocusManager：基于几何方位的空间导航（方向键找最近可焦点元素）
 *   · 横向「货架」Rows：左右键驱动整行平移，上下键跨行
 *   · 全屏沉浸详情 + 遥控器返回键
 *   · 遥控器按键映射（含 Android TV / 常见厂商 keyCode 兼容）
 */
import { BRAND, PRIMARY_NAV, CHANNELS, SECTIONS, CORE_FEATURES, icon } from '../../core/config.js';
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
import { statsBar, mineContent } from '../../components/extras.js';

const PLATFORM = 'tv';
const root = document.getElementById('app');

/* 遥控器按键映射。目标设备实际 keyCode 需实机核对，已列为「待补充项」。 */
const KEY_ACTION = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', NumpadEnter: 'ok', ' ': 'ok', Spacebar: 'ok', Select: 'ok',
  Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
  '/': 'search', F3: 'search', s: 'search', S: 'search',
  MediaPlayPause: 'play', MediaPlay: 'play',
};
const KEYCODE_ACTION = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  13: 'ok', 23: 'ok', 66: 'ok', 32: 'ok',     // OK / DPAD_CENTER / ENTER / SPACE
  4: 'back', 461: 'back', 8: 'back',          // Android TV BACK / 厂商 BACK
  82: 'search',                                // 部分厂商「搜索」键
};
function resolveKey(e) {
  return KEY_ACTION[e.key] || KEYCODE_ACTION[e.keyCode] || null;
}

/* ---------------- 空间焦点管理器 ---------------- */
class FocusManager {
  constructor(scope, { onActivate, onBack, onSearch, onPlay }) {
    this.scope = scope;
    this.nodes = [];
    this.current = null;
    this.onActivate = onActivate;
    this.onBack = onBack;
    this.onSearch = onSearch;
    this.onPlay = onPlay;
  }
  setScope(scope) { this.scope = scope; this.current = null; }
  visible(n) {
    const r = n.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  refresh() {
    this.nodes = [...this.scope.querySelectorAll('[data-focusable="1"]')].filter((n) => this.visible(n));
  }
  center(n) {
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  focus(node) {
    if (!node) return;
    this.current?.classList.remove('is-focused');
    this.current = node;
    node.classList.add('is-focused');
    node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  initial() { this.refresh(); this.focus(this.nodes[0]); }
  ensure() {
    this.refresh();
    if (!this.current || !this.nodes.includes(this.current)) this.focus(this.nodes[0]);
  }
  /** 视图重绘后按 data-key 恢复焦点，避免遥控器手感中断 */
  restore() {
    const key = this.current?.dataset.key;
    this.refresh();
    this.focus((key && this.nodes.find((n) => n.dataset.key === key)) || this.nodes[0]);
  }
  /** 按方向寻找空间上最近的焦点：主方向距离 + 垂直偏离惩罚 */
  move(dir) {
    this.ensure();
    if (!this.current) return;
    const c = this.center(this.current);
    const zone = this.current.dataset.zone || '';
    const best = this.nodes
      .filter((n) => n !== this.current)
      .map((n) => {
        const p = this.center(n);
        const dx = p.x - c.x, dy = p.y - c.y;
        let primary = 0, secondary = 0;
        if (dir === 'right') { primary = dx; secondary = Math.abs(dy); }
        else if (dir === 'left') { primary = -dx; secondary = Math.abs(dy); }
        else if (dir === 'down') { primary = dy; secondary = Math.abs(dx); }
        else { primary = -dy; secondary = Math.abs(dx); }
        if (primary <= 4) return null;
        let score = primary + secondary * 2.4;
        const nz = n.dataset.zone || '';
        if (nz === zone) score *= 0.82;                       // 同区域优先
        // 横向货架内，左右移动优先锁定同一行，避免跨行跳焦或反复横跳
        if (zone === 'row' && nz === 'row' && (dir === 'left' || dir === 'right')
            && n.dataset.row === this.current.dataset.row) score *= 0.5;
        if (zone === 'nav' && dir === 'right') score *= (nz === 'row' ? 0.7 : 0.9); // 从主导航跳入内容
        if (nz === 'nav' && zone === 'row' && dir === 'left') score *= 0.8;         // 内容返回主导航
        return { n, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)[0];
    if (best) this.focus(best.n);
  }
  activate() { this.ensure(); this.onActivate?.(this.current); }
  back() { this.onBack?.(); }
  search() { this.onSearch?.(); }
  play() { this.onPlay?.(); }
}

/* ---------------- 页面骨架 ---------------- */
root.innerHTML = `
<div class="tv">
  <div class="tv__stage" id="tv-stage">
    <header class="tv__top">
      <div class="brand brand--lg"><span class="brand__name">${BRAND.name}</span><span class="brand__suffix">${BRAND.suffix}</span></div>
      <span class="brand__role tv__role">${BRAND.role} · TV</span>
      <button class="tv__search-entry" data-focusable="1" data-zone="top" data-action="open-search">
        ${icon('search', 26)} <span>搜索</span> <kbd>搜索键</kbd>
      </button>
      <button class="tv__settings-entry" data-focusable="1" data-zone="top" data-action="settings">
        ${icon('filter', 26)} <span>设置</span>
      </button>
    </header>

    <div class="tv__bar" id="tv-bar"></div>

    <nav class="tv__channels" id="tv-channels" aria-label="频道"></nav>

    <div class="tv__body">
      <nav class="tv__nav" id="tv-nav" aria-label="主导航"></nav>
      <main class="tv__rows" id="tv-rows"></main>
    </div>

    <footer class="tv__hint">
      <span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> 移动焦点</span>
      <span><kbd>OK</kbd> 确认</span>
      <span><kbd>BACK</kbd> 返回</span>
      <span><kbd>搜索键</kbd> 搜索</span>
      <span class="tv__hint-right" id="tv-hint-state"></span>
    </footer>
  </div>

  <section class="tv__detail" id="tv-detail" aria-label="详情"></section>

  <section class="tv__search-panel" id="tv-search-panel" aria-label="搜索">
    <div class="tv__search-box">
      <div class="detail__eyebrow">搜索影视内容</div>
      <h2>输入关键词</h2>
      <input id="tv-search-input" type="search" data-focusable="1" data-zone="search"
             placeholder="可用物理键盘 / 遥控器输入法 / 配对设备输入" autocomplete="off" />
      <div class="tv__search-actions">
        <button class="btn-primary" data-focusable="1" data-zone="search" data-action="search-submit">${icon('search', 22)} 搜索</button>
        <button class="btn-ghost" data-focusable="1" data-zone="search" data-action="search-close">返回</button>
      </div>
      <p>提交后由统一搜索逻辑调用内容源搜索接口；接口与参数待补充时返回空状态，不填充示例结果。</p>
    </div>
  </section>
</div>`;

mountChrome(PLATFORM);
const authGate = mountAuthGate(document.body);
const settingsGate = mountSettings(document.body);

const el = {
  stage: document.getElementById('tv-stage'),
  bar: document.getElementById('tv-bar'),
  channels: document.getElementById('tv-channels'),
  nav: document.getElementById('tv-nav'),
  rows: document.getElementById('tv-rows'),
  hint: document.getElementById('tv-hint-state'),
  detail: document.getElementById('tv-detail'),
  searchPanel: document.getElementById('tv-search-panel'),
  searchInput: document.getElementById('tv-search-input'),
};

const summary = store.dataSourceStatus();
el.bar.innerHTML = '';

let lastContentKey = '';
/** 登录后使用按 api/config 权限过滤的影视类型分类；未登录时回退完整分类清单 */
function chans(state) { return state.channels && state.channels.length ? state.channels : CHANNELS; }

let view = 'stage'; // 'stage' | 'detail' | 'search'
let lastNavFocus = null;

/* ---------------- 渲染 ---------------- */
function tvHeroCard(item, i) {
  const bg = item && item.poster
    ? `<img class="tv__hero-art-img" src="${escapeHTML(item.poster)}" alt="" loading="lazy" />` : '';
  const label = item && item.title ? escapeHTML(item.title) : '暂无内容';
  return `<div class="tv__hero-card" data-focusable="1" data-zone="row" data-key="hero-${i}" data-row="0" data-col="${i}"
      data-id="${item?.id ?? ''}">
      <div class="tv__hero-art">${bg}</div>
      <div class="tv__hero-label">${label}</div>
    </div>`;
}

function tvRow(title, rowIndex, state, count, hero = false) {
  const items = listItems(state.items, count);
  return `<section class="tv__row">
    <h2 class="tv__row-title">${title}</h2>
    <div class="tv__track">
      ${!items.length ? '<div class="tv__empty">暂无内容</div>' : (hero ? items.map(tvHeroCard).join('') : items.map((it, i) => {
        const html = posterCard(it, { focusable: true });
        return html.replace('data-focusable="1"', `data-focusable="1" data-zone="row" data-key="row-${rowIndex}-${i}" data-row="${rowIndex}" data-col="${i}"`);
      }).join(''))}
    </div>
  </section>`;
}

function filterView(state) {
  const list = applyFilter(state.items, state.filter).slice(0, 30);
  return `<section class="tv__row tv__row--filter">
      <h2 class="tv__row-title">筛选 · ${list.length} 部</h2>
      <div class="tv__filter-rows">${filterRows(state, 'tv')}</div>
    </section>
    ${tvRow('筛选结果', 0, { ...state, items: list }, PLACEHOLDER_COUNTS.tv)}`;
}

function rankView(state) {
  const list = applyFilter(state.items, state.filter).slice(0, 30);
  return tvRow('榜单 · 内容源顺序', 0, { ...state, items: list }, PLACEHOLDER_COUNTS.tv)
    + `<div class="tv__row-note">榜单顺序来自内容源返回顺序，共 ${list.length} 部</div>`;
}

function mineView(state) {
  return `<div class="tv__mine">${mineContent(state, store.dataSourceStatus())}</div>`;
}

function renderRows(state) {
  const key = [state.nav, state.channel, state.keyword, state.items.length, state.status, state.auth.loggedIn, state.channels.length,
    state.extra?.id, state.extra?.loading, state.extra?.ok, state.mineTab,
    state.filter?.country, state.filter?.year, state.filter?.sort,
    state.loading, state.slowHint].join('|');
  if (key === lastContentKey) return;
  lastContentKey = key;

  const strip = loadingStrip(state);
  if (state.nav === 'mine') { el.rows.innerHTML = mineView(state); return; }
  if (state.keyword) {
    el.rows.innerHTML = strip + tvRow(`“${escapeHTML(state.keyword)}” 的搜索结果`, 0, state, PLACEHOLDER_COUNTS.tv)
      + (state.status !== 'ok' ? `<div class="tv__row-note">${emptyState(state).replace('class="empty-state"', 'class="empty-state empty-state--tv"')}</div>` : '');
    return;
  }
  if (state.nav === 'filter') { el.rows.innerHTML = filterView(state); return; }
  if (state.nav === 'rank') { el.rows.innerHTML = rankView(state); return; }
  if (!state.loading && state.status === 'error' && !state.items.length) {
    el.rows.innerHTML = strip + `<div class="tv__row-note">${emptyState(state)}</div>`;
    return;
  }
  if (state.loading && !state.items.length) {
    el.rows.innerHTML = strip + `<div class="tv__row-note">正在加载该分类，请稍候…</div>`;
    return;
  }
  el.rows.innerHTML = strip + tvRow('焦点推荐', 0, state, PLACEHOLDER_COUNTS.hero, true)
    + tvRow(SECTIONS[1].label, 1, state, PLACEHOLDER_COUNTS.tv)
    + tvRow(SECTIONS[2].label, 2, state, 6);
}

function render(state) {
  el.bar.innerHTML = statsBar(state, store.dataSourceStatus());
  const chromeKey = `${state.nav}|${state.channel}|${state.channels.length}|${state.auth.loggedIn}`;
  if (render._chromeKey !== chromeKey) {
    el.nav.innerHTML = PRIMARY_NAV.map((n) => `<button class="tv__nav-item ${n.id === state.nav ? 'is-on' : ''}"
        data-focusable="1" data-zone="nav" data-key="nav-${n.id}" data-nav="${n.id}">
        <span class="tv__nav-icon">${icon(n.icon, 30)}</span><span>${n.label}</span>
      </button>`).join('');
    el.channels.innerHTML = chans(state).map((c) => `<button class="tv__channel ${c.id === state.channel ? 'is-on' : ''} ${c.group === '直播' ? 'is-live' : ''}"
        data-focusable="1" data-zone="channels" data-key="ch-${c.id}" data-channel="${c.id}">${c.label}</button>`).join('');
    render._chromeKey = chromeKey;
  }

  el.hint.textContent = `${state.items.length} 条目 · 数据源${state.status === 'ok' ? '已对接' : '待补充'}`;
  renderRows(state);

  const detailOpen = state.view === 'detail';
  el.detail.classList.toggle('is-open', detailOpen);
  if (detailOpen) {
    el.detail.innerHTML = `
      <div class="tv__detail-bg skeleton"></div>
      <div class="tv__detail-content">
        <div class="detail__eyebrow">详情查看</div>
        <div class="tv__detail-poster skeleton"><span class="pending-tag">海报待接入</span></div>
        <div class="tv__detail-info">${(state.detail ? detailContent(state.detail, state.play) : detailPending(state))
          .replace(/data-action="(play|close|logout)"/g, 'data-action="$1" data-focusable="1" data-zone="detail"')}</div>
      </div>
      <div class="tv__detail-back">按 <kbd>BACK</kbd> 返回</div>`;
  }
  // 未登录时把遥控器焦点切到登录遮罩；登录后回到主舞台
  const needLogin = state.auth.required && !state.auth.loggedIn && state.status !== 'loading';
  if (needLogin) {
    if (view !== 'auth') { view = 'auth'; fm.setScope(authGate); }
    fm.ensure();
  } else if (view === 'auth') {
    view = 'stage'; fm.setScope(el.stage); fm.initial();
  } else if (detailOpen && view !== 'detail') { view = 'detail'; fm.setScope(el.detail); fm.initial(); }
  else if (!detailOpen && view === 'detail') { view = 'stage'; fm.setScope(el.stage); fm.initial(); }
  else fm.restore();
}

/* ---------------- 交互 ---------------- */
const fm = new FocusManager(el.stage, {
  onActivate: (node) => {
    if (!node) return;
    const { nav, channel, action, id, placeholder } = node.dataset;
    if (nav) return store.setNav(nav);
    if (channel) return store.setChannel(channel);
    if (node.dataset.filter) return store.setFilter({ [node.dataset.filter]: node.dataset.value || '' });
    if (node.dataset.sort) return store.setFilter({ sort: node.dataset.sort });
    if (action === 'open-search') return openSearch();
    if (action === 'search-submit') return submitSearch();
    if (action === 'search-close') return closeSearch();
    if (action === 'close') return store.closeDetail();
    if (action === 'logout') return store.logout();
    if (action === 'settings') return settingsGate.open();
    if (action === 'extra') return store.openExtra(node.dataset.extra);
    if (action === 'clear-extra') return store.clearExtra();
    if (action === 'mine-tab') return store.setMineTab(node.dataset.tab);
    if (action === 'reset-filter') return store.clearFilter();
    if (action === 'expand-list') return store.expandList();
    if (action === 'retry') return store.refresh({ force: true });
    if (action === 'detail') return store.openDetail(id || null);
    if (action === 'play') return store.requestPlay(id || null);
    if (node.dataset.auth) { node.click(); return; }
    if (node.tagName === 'INPUT') { node.focus(); return; }
    if (node.dataset.zone === 'row' || node.dataset.zone === 'top') {
      lastNavFocus = nav || null;
      return store.requestPlay(id || null);   // 点封面直接播放
    }
  },
  onBack: () => {
    if (window.__aisPlayerBack && window.__aisPlayerBack()) return;
    if (view === 'search') return closeSearch();
    if (view === 'detail') return store.closeDetail();
    if (store.getState().keyword) return store.clearSearch();
  },
  onSearch: () => (view === 'search' ? closeSearch() : openSearch()),
  onPlay: () => store.requestPlay(store.getState().detail?.id || null),
});

function openSearch() {
  view = 'search';
  el.searchPanel.classList.add('is-open');
  fm.setScope(el.searchPanel);
  fm.initial();
  el.searchInput.focus();
}
function closeSearch() {
  el.searchPanel.classList.remove('is-open');
  el.searchInput.blur();
  view = 'stage';
  fm.setScope(el.stage);
  fm.initial();
}
function submitSearch() {
  store.search(el.searchInput.value);
  closeSearch();
}

/**
 * 供 Android TV 原生壳调用（MainActivity.dispatchKeyEvent 的 BACK 键）：
 * 返回 true 表示 Web 端已消费返回（关闭搜索 / 详情 / 清空关键词），
 * 返回 false 表示没有可返回的内容，原生层可 finish() 退出 App。
 * 浏览器端不调用此函数，行为不受影响。
 */
window.__onRemoteBack = function () {
  if (window.__aisPlayerBack && window.__aisPlayerBack()) return true;
  if (view === 'search') { closeSearch(); return true; }
  if (view === 'detail') { store.closeDetail(); return true; }
  if (store.getState().keyword) { store.clearSearch(); return true; }
  return false;
};

root.addEventListener('click', (e) => {
  // 遥控器/鼠标点击时，先把视觉焦点移到被点元素，再走统一激活逻辑
  const f = e.target.closest('[data-focusable="1"]');
  if (f) fm.focus(f);
  const node = f || e.target.closest('[data-action]') || e.target.closest('[data-filter]') || e.target.closest('[data-sort]');
  if (!node) return;
  const { nav, channel, action, id } = node.dataset;
  if (nav) return store.setNav(nav);
  if (channel) return store.setChannel(channel);
  if (node.dataset.filter) return store.setFilter({ [node.dataset.filter]: node.dataset.value || '' });
  if (node.dataset.sort) return store.setFilter({ sort: node.dataset.sort });
  if (action === 'open-search') return openSearch();
  if (action === 'search-submit') return submitSearch();
  if (action === 'search-close') return closeSearch();
  if (action === 'close') return store.closeDetail();
  if (action === 'logout') return store.logout();
  if (action === 'settings') return settingsGate.open();
  if (action === 'extra') return store.openExtra(node.dataset.extra);
  if (action === 'clear-extra') return store.clearExtra();
  if (action === 'mine-tab') return store.setMineTab(node.dataset.tab);
  if (action === 'reset-filter') return store.clearFilter();
  if (action === 'expand-list') return store.expandList();
  if (action === 'retry') return store.refresh({ force: true });
  if (action === 'detail') return store.openDetail(id || null);
  if (action === 'play') return store.requestPlay(id || null);
});

document.addEventListener('keydown', (e) => {
  const inInput = document.activeElement === el.searchInput && view === 'search';
  if (inInput) {
    // 搜索输入框内：普通字符（含空格、斜杠、字母 s）一律放行，交给输入法；
    // 只保留提交、返回，以及方向键把焦点移向「搜索 / 返回」按钮。
    if (e.key === 'Enter') { e.preventDefault(); return submitSearch(); }
    if (e.key === 'Escape' || e.keyCode === 4 || e.keyCode === 461) return closeSearch();
    if (e.key.length === 1) return;
  }
  const a = resolveKey(e);
  if (!a) return;
  if (a !== 'back') e.preventDefault();
  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') return fm.move(a);
  if (a === 'ok') {
    if (inInput && view === 'search') return submitSearch();
    return fm.activate();
  }
  if (a === 'back') return fm.back();
  if (a === 'search') return fm.search();
  if (a === 'play') return fm.play();
});

window.addEventListener('aistream:settings-open', (ev) => {
  view = 'settings'; fm.setScope(ev.detail); fm.ensure();
});
window.addEventListener('aistream:settings-close', () => {
  view = 'stage'; fm.setScope(el.stage); fm.initial();
});
bus.on(EVT.STATE, render);
bus.on(EVT.DETAIL, render);
store.init(PLATFORM).then(() => { render(store.getState()); fm.initial(); });
