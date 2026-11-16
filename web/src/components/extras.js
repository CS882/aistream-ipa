/**
 * 影视应用常见信息组件（四端共用）
 * ------------------------------------------------------------------
 * 替换掉原先「调试向」的信息（域名标签、待补充计数、能力清单、占位文案）：
 *   · 顶部 → 真实内容统计条
 *   · 右上 → 用户区 + 设置入口
 *   · 侧栏 → 主站快捷入口
 *   · Hero → /api/home 的真实条目
 *   · 我的 → 会员卡 + 快捷入口功能视图 + 版本信息
 * 所有展示内容都来自真实接口或用户偏好，不编造影视数据。
 *
 * 2026-11-15 修复：快捷入口不再把接口原始 JSON 键值摊开显示
 * （曾出现「vip [对象] / growth [对象]」）。现在按站点 app.js 实测结构
 * 渲染成影视卡片、会员信息、追剧周片单与直播频道。
 */
import { icon, QUICK_ENTRIES, MINE_TABS, APP_VERSION } from '../core/config.js';
import { escapeHTML } from './content.js';
import { getSetting, getSearchHistory } from '../core/settings.js';

const e = escapeHTML;

/** 顶部统计条：真实分类数 / 内容数 / 同步状态 / 版本 */
export function statsBar(state, summary) {
  if (!getSetting('showStats')) return '';
  const chans = state.channels?.length || 0;
  const items = state.items?.length || 0;
  const ok = !!state.auth?.loggedIn;
  return `<div class="stats-bar">
    <span class="stats-bar__status ${ok ? 'is-ok' : ''}"><i></i>${ok ? '内容已同步' : '等待登录'}</span>
    <span>${chans} 个分类</span>
    <span>${items} 条内容</span>
    <span class="stats-bar__tip">搜索、详情与内置播放均已就绪</span>
    <span class="stats-bar__ver">v${APP_VERSION}</span>
  </div>`;
}

/** 右上角用户区（替代域名调试标签） */
export function userChip(state) {
  const u = state.user || {};
  const name = u.username || u.name || u.user || (state.auth?.loggedIn ? '我的账号' : '未登录');
  return `<div class="user-chip">
    <button class="user-chip__btn" data-focusable="1" data-zone="top" data-action="settings" title="设置">
      <span class="user-chip__avatar">${e(String(name).slice(0, 1).toUpperCase() || 'A')}</span>
      <span class="user-chip__name">${e(name)}</span>
      <span class="user-chip__gear">${icon('filter', 15)}</span>
    </button>
  </div>`;
}

/** 侧栏 / 我的页快捷入口（替代「四端一致能力」清单） */
export function quickEntries(state) {
  if (!getSetting('showQuickEntries')) return '';
  const active = state.mineTab === 'account' ? 'points' : state.mineTab;
  return `<div class="quick-entries">
    <div class="quick-entries__label">快捷入口</div>
    ${QUICK_ENTRIES.map((x) => `<button class="quick-entry ${active === x.id ? 'is-on' : ''}"
      data-focusable="1" data-zone="row" data-action="extra" data-extra="${x.id}">
      ${icon(x.icon, 16)}<span>${e(x.label)}</span></button>`).join('')}
  </div>`;
}

/** 真实 Hero：背景海报 + 片名 + 年份/栏目 + 播放/详情 */
export function heroMain(item, { tag = '焦点推荐' } = {}) {
  if (!item || !item.title) return heroPlaceholder();
  const loading = getSetting('preloadPoster') ? 'eager' : 'lazy';
  const bg = item.poster
    ? `<img class="hero-real__bg" src="${e(item.poster)}" alt="" loading="${loading}" />`
    : '';
  const meta = [item.section, item.year].filter(Boolean).map((x) => `<span>${e(x)}</span>`).join('');
  return `<div class="hero-real" data-action="detail" data-id="${e(item.id)}">
    ${bg}<div class="hero-real__shade"></div>
    <div class="hero-real__info">
      <span class="hero-real__tag">${e(tag)}</span>
      <h2 class="hero-real__title">${e(item.title)}</h2>
      ${meta ? `<div class="hero-real__meta">${meta}</div>` : ''}
      <div class="hero-real__actions">
        <button class="btn-primary" data-action="play" data-id="${e(item.id)}">${icon('play', 16)} 播放</button>
        <button class="btn-ghost" data-action="detail" data-id="${e(item.id)}">查看详情</button>
      </div>
    </div>
  </div>`;
}

/** 侧边/小焦点位 */
export function heroMini(item, index) {
  if (!item || !item.title) return `<div class="hero-mini hero-mini--empty"><span>暂无焦点内容</span></div>`;
  const bg = item.poster ? `<img src="${e(item.poster)}" alt="" loading="lazy" />` : '';
  return `<div class="hero-mini" data-action="detail" data-id="${e(item.id)}">
    ${bg}<div class="hero-mini__shade"></div>
    <div class="hero-mini__info"><b>${e(item.title)}</b><small>${e(item.section || item.year || '')}</small></div>
  </div>`;
}

export function heroPlaceholder() {
  return `<div class="hero-real hero-real--empty">
    <div class="hero-real__info"><span class="hero-real__tag">焦点推荐</span>
      <h2 class="hero-real__title">暂无焦点内容</h2>
      <div class="hero-real__meta"><span>切换分类或稍后刷新</span></div>
    </div>
  </div>`;
}

/** 快捷入口里的影视卡片（详情 / 播放入口与四端主列表一致） */
function extraCards(items) {
  return `<div class="extra-grid">${items.map((it) => {
    const id = e(it.id || '');
    const poster = it.poster
      ? `<img src="${e(it.poster)}" alt="" loading="lazy" />`
      : `<span class="extra-card__ph">暂无封面</span>`;
    const meta = [it.category, it.subtitle, it.section].filter(Boolean).map((x) => e(String(x))).join(' · ');
    return `<div class="extra-card" data-focusable="1" data-zone="row" data-action="detail" data-id="${id}">
      <div class="extra-card__poster">${poster}</div>
      <div class="extra-card__meta"><b>${e(it.title || '未命名')}</b>${meta ? `<small>${meta}</small>` : ''}</div>
      <button class="extra-card__play" data-focusable="1" data-zone="row" data-action="play" data-id="${id}">
        ${icon('play', 14)} 播放
      </button>
    </div>`;
  }).join('')}</div>`;
}

/** 积分中心：只展示站点实测字段，不再摊开原始 JSON */
function pointsCard(d) {
  if (!d || typeof d !== 'object') return `<div class="detail__notice">暂无积分信息</div>`;
  const vip = (d.vip && typeof d.vip === 'object') ? d.vip : {};
  const ck = (d.checkin && typeof d.checkin === 'object') ? d.checkin : {};
  const inv = (d.invite && typeof d.invite === 'object') ? d.invite : {};
  const identity = vip.level > 0
    ? `${String(vip.name || '会员')}${vip.days > 0 ? ' · 剩 ' + String(vip.days) + ' 天' : ' · 永久'}`
    : '普通用户';
  const rows = [
    ['我的积分', d.points == null ? '—' : String(d.points)],
    ['当前身份', identity],
    ['积分倍率', vip.pointMul == null ? '—' : '×' + String(vip.pointMul)],
    ['今日签到', ck.today ? '已签到' : '未签到'],
  ];
  if (inv.code) rows.push(['邀请码', String(inv.code)]);
  return `<div class="points-card">
    <div class="points-card__num"><b>${e(String(d.points ?? 0))}</b><span>我的积分</span></div>
    <div class="extra-kv">${rows.map(([k, v]) => `<div><b>${e(k)}</b><span>${e(String(v))}</span></div>`).join('')}</div>
  </div>`;
}

/** 追剧周片单：宽容读取 days 结构，不假设未确认字段 */
function weeklyCard(days) {
  if (!Array.isArray(days) || !days.length) return `<div class="detail__notice">该周暂无追剧数据</div>`;
  return `<div class="weekly-grid">${days.slice(0, 14).map((d) => {
    const label = d?.date || d?.day || d?.label || d?.key || '';
    const list = Array.isArray(d?.items) ? d.items : (Array.isArray(d?.list) ? d.list : []);
    const names = list.slice(0, 4).map((x) => (x && typeof x === 'object' ? (x.title || x.name || '') : String(x))).filter(Boolean);
    return `<div class="weekly-day"><b>${e(String(label || '日期'))}</b>
      ${names.length ? names.map((n) => `<span>${e(String(n))}</span>`).join('') : `<span>${list.length} 条片单</span>`}</div>`;
  }).join('')}</div>`;
}

/** 快捷入口结果区：按真实返回结构渲染功能视图 */
export function extraResult(state) {
  const x = state.extra;
  const label = x?.label || MINE_TABS.find((t) => t.id === state.mineTab)?.label || '';
  const head = `<section class="mine-card mine-card--extra"><div class="mine-card__head">
      <h3>${e(label)}</h3>
      <button class="btn-ghost btn-mini" data-focusable="1" data-zone="row" data-action="mine-tab" data-tab="account">返回账户</button>
    </div>`;
  const end = '</section>';
  if (!x) return head + `<div class="detail__notice">点击上方标签读取内容源数据</div>` + end;
  if (x.loading) return head + `<div class="detail__notice">正在读取内容源数据…</div>` + end;
  if (x.ok === false) return head + `<div class="detail__notice">${e(x.error || '暂不可用，可能需要在主站开通')}</div>` + end;
  if (x.kind === 'points') return head + pointsCard(x.points) + end;
  if (x.kind === 'weekly') return head + weeklyCard(x.days) + end;
  if (x.kind === 'items') {
    return head + ((x.items && x.items.length)
      ? extraCards(x.items)
      : `<div class="detail__notice">${e(x.empty || '暂无内容')}</div>`) + end;
  }
  return head + `<div class="detail__notice">${e(x.empty || '暂不可用')}</div>` + end;
}

/** 会员与积分大卡：腾讯视频会员中心式（大数字 + 身份 + 权益信息） */
function memberBody(d) {
  if (!d || typeof d !== 'object') return `<div class="detail__notice">正在读取积分信息…</div>`;
  const vip = (d.vip && typeof d.vip === 'object') ? d.vip : {};
  const ck = (d.checkin && typeof d.checkin === 'object') ? d.checkin : {};
  const inv = (d.invite && typeof d.invite === 'object') ? d.invite : {};
  const identity = vip.level > 0
    ? `${String(vip.name || '会员')}${vip.days > 0 ? ' · 剩 ' + String(vip.days) + ' 天' : ' · 永久'}`
    : '普通用户';
  return `<div class="member-hero">
      <div class="member-num"><b>${e(String(d.points ?? 0))}</b><span>我的积分</span></div>
      <div class="member-side"><b>当前身份</b><span>${e(identity)}</span></div>
    </div>
    <div class="member-grid">
      <div><b>积分倍率</b><span>${vip.pointMul == null ? '—' : '×' + e(String(vip.pointMul))}</span></div>
      <div><b>今日签到</b><span>${ck.today ? '已签到' : '未签到'}</span></div>
      <div><b>邀请码</b><span>${inv.code ? e(String(inv.code)) : '—'}</span></div>
    </div>`;
}

/** 账户信息标签：上排「我的账号 + 关于」，下方整行会员积分大卡（参考腾讯视频） */
function accountPanel(state, summary) {
  const u = state.user || {};
  const name = u.username || u.name || u.user || (state.auth?.loggedIn ? '我的账号' : '未登录');
  const points = state.extra?.kind === 'points' ? state.extra.points : null;
  const pending = state.extra?.loading && state.extra?.id === 'points';
  const failed = state.extra && state.extra.ok === false;
  const vipName = points?.vip?.level > 0 ? String(points.vip.name || '会员') : '普通用户';
  return `<div class="mine-account">
    <div class="mine-account__top">
      <section class="mine-card mine-card--user">
        <div class="mine-card__avatar">${e(String(name).slice(0, 1).toUpperCase() || 'A')}</div>
        <div class="mine-card__who"><b>${e(name)}</b><span>${state.auth?.loggedIn ? '已登录内容源' : '未登录，请先登录'}</span></div>
        <button class="btn-ghost" data-focusable="1" data-zone="row" data-action="settings">${icon('filter', 15)} 设置</button>
      </section>
      <section class="mine-card mine-card--about">
        <div class="mine-about__head"><span>关于</span><b>AIStream 影视</b></div>
        <div class="mine-about__meta">
          <span>版本 v${APP_VERSION}</span>
          <span>内容源已连接</span>
          <span>内置播放器 · 选集 / 线路 / 弹幕</span>
        </div>
      </section>
    </div>
    <section class="mine-card mine-card--member">
      <div class="member-head">
        <div class="member-title">会员与积分</div>
        <span class="member-badge">${e(vipName)}</span>
      </div>
      ${pending ? `<div class="detail__notice">正在读取积分信息…</div>`
        : failed ? `<div class="detail__notice">${e(state.extra.error || '积分信息暂不可用')}</div>`
        : memberBody(points)}
    </section>
  </div>`;
}

/** 搜索历史标签：仅本地记录 */
function searchPanel() {
  const hist = getSearchHistory();
  return `<section class="mine-card"><h3>最近搜索</h3>
    <div class="stg-history">${hist.length ? hist.map((h) => `<span>${e(h)}</span>`).join('') : '<span>暂无搜索记录</span>'}</div>
  </section>`;
}

/** 「我的」页：标签导航 + 单一内容区（主区不再重复渲染快捷入口清单） */
export function mineContent(state, summary) {
  const tab = state.mineTab || 'account';
  return `<div class="mine-page">
    <nav class="mine-tabs" role="tablist" aria-label="我的">
      ${MINE_TABS.map((t) => `<button class="mine-tab ${t.id === tab ? 'is-on' : ''}"
        role="tab" aria-selected="${t.id === tab}" data-focusable="1" data-zone="row"
        data-action="mine-tab" data-tab="${t.id}">${icon(t.icon, 15)}<span>${e(t.label)}</span></button>`).join('')}
    </nav>
    <div class="mine-panels">
      ${tab === 'account' ? accountPanel(state, summary)
        : tab === 'search' ? searchPanel() : extraResult(state)}
    </div>
  </div>`;
}
