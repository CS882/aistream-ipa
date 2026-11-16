/**
 * 统一内容渲染组件（无平台样式，四端共用）
 * ------------------------------------------------------------------
 * 影视条目全部来自实测接入的内容源 /api/*；未登录或无数据时只显示状态文案，
 * 不生成任何片名 / 海报 / 集数 / 评分 / 播放链接等示例值。
 */
import { icon } from '../core/config.js';

export const PLACEHOLDER_COUNTS = Object.freeze({ desktop: 12, mobile: 6, tv: 8, hero: 3 });

export function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** 列表项：有真实条目就用真实条目，没有就返回空（由 emptyState 说明原因） */
export function listItems(items) {
  return Array.isArray(items) ? items : [];
}

/** 海报卡片 HTML（真实条目） */
export function posterCard(item, { focusable = false } = {}) {
  const attr = focusable ? ' data-focusable="1" tabindex="-1"' : '';
  if (!item || !item.title) {
    return `<div class="poster-card"${attr} data-placeholder="1">
      <div class="poster skeleton is-placeholder"><span class="pending-tag">暂无内容</span></div>
      <div class="poster-card__title poster-card__title--pending">暂无条目</div>
    </div>`;
  }
  const poster = item.poster
    ? `<img class="poster__img" src="${escapeHTML(item.poster)}" alt="${escapeHTML(item.title)}" loading="lazy" onerror="this.style.display='none'" />`
    : '';
  const badge = item.badge ? `<span class="poster__badge">${escapeHTML(item.badge)}</span>` : '';
  const foot = (item.subtitle || item.score)
    ? `<div class="poster__foot"><span>${escapeHTML(item.subtitle)}</span>${item.score ? `<span class="poster__score">${escapeHTML(item.score)}</span>` : ''}</div>`
    : '';
  const infoAttr = focusable ? ' data-focusable="1" data-zone="row"' : '';
  return `<div class="poster-card"${attr} data-id="${escapeHTML(item.id)}" role="button" aria-label="${escapeHTML(item.title)}">
      <div class="poster">${poster}${badge}${foot}
        <button class="poster-card__info"${infoAttr} data-action="detail" data-id="${escapeHTML(item.id)}" title="查看详情">i</button>
      </div>
      <div class="poster-card__title">${escapeHTML(item.title)}</div>
      <div class="poster-card__sub">${escapeHTML(item.category || '')}</div>
    </div>`;
}

/** 顶部状态条：实测已对接 + 同源代理 + 待补充项 */
export function dataSourceBar(summary) {
  return `<div class="ds-bar">
      <span class="ds-bar__dot" style="background:#5ddc9a;box-shadow:0 0 0 4px rgba(93,220,154,.14)"></span>
      <span>已对接 <strong>${escapeHTML(summary.siteName || '')}</strong>
        <code>${escapeHTML(summary.host)}</code> · 同源代理已启用 · 接口与字段均为实测值</span>
      <span class="ds-bar__count">${summary.count} 项待补充</span>
    </div>`;
}

/**
 * 分类切换 / 刷新时的即时反馈条。
 * 不再用整块遮罩把内容压暗（会让人以为「卡住」），只显示一条细进度 + 文案。
 */
export function loadingStrip(state) {
  if (!state?.loading) return '';
  const ch = (state.channels || []).find((c) => c.id === state.loadingChannel);
  const name = ch?.label || '';
  const slow = state.slowHint ? '站点聚合较慢，已并行尝试回退…' : '正在向内容源请求…';
  return `<div class="load-strip" role="status" aria-live="polite">
      <span class="load-strip__spinner"></span>
      <span class="load-strip__text">正在加载${name ? '「' + escapeHTML(name) + '」' : '内容'} · ${slow}</span>
      <span class="load-strip__bar"><i></i></span>
    </div>`;
}

/** 骨架卡片：切换分类且无缓存时立刻占位，避免下方区域空白 */
export function skeletonGrid(count = 12) {
  return Array.from({ length: count }, () => `<div class="poster-card is-skeleton" aria-hidden="true">
      <div class="poster skeleton"></div>
      <div class="poster-card__title skeleton-line"></div>
    </div>`).join('');
}

/** 空 / 错误 / 未登录状态 */export function emptyState(state) {
  if (state.status === 'need-login') {
    return `<div class="empty-state">
      <div class="empty-state__icon">${icon('info', 22)}</div>
      <div class="empty-state__title">请先登录内容源</div>
      <div>在登录界面输入你的账号后，即可浏览真实影视内容</div>
    </div>`;
  }
  if (state.status === 'error') {
    return `<div class="empty-state">
      <div class="empty-state__icon">${icon('info', 22)}</div>
      <div class="empty-state__title">内容源请求未完成</div>
      <div>${escapeHTML(state.notice || '')}</div>
      <button class="btn-ghost btn-mini" data-action="retry" data-focusable="1">重新加载</button>
    </div>`;
  }
  if (state.loading) {
    return `<div class="empty-state"><div class="empty-state__title">正在加载内容…</div></div>`;
  }
  return `<div class="empty-state">
      <div class="empty-state__icon">${icon('info', 22)}</div>
      <div class="empty-state__title">该栏目暂无内容</div>
      <div>切换栏目或搜索其它关键词</div>
    </div>`;
}

/** 播放结果：真实地址 / 剧集列表（不生成任何示例链接） */
export function playResultHTML(play) {
  if (!play) return '';
  if (!play.episodes?.length) {
    return play.notice ? `<div class="detail__notice">${escapeHTML(play.notice)}</div>` : '';
  }
  return `<div class="play-result">
    <div class="play-result__title">播放入口 · ${play.episodes.length} 个剧集</div>
    <div class="play-result__list">
      ${play.episodes.slice(0, 40).map((ep) => `<a href="${escapeHTML(ep.url)}" target="_blank" rel="noopener">
        ${icon('play', 13)} <span>${escapeHTML(ep.name || ep.from || ep.station || '播放')}</span></a>`).join('')}
    </div>
  </div>`;
}

/** 详情内容（真实条目，简介 / 演职员来自实测 /api/up/detail） */
export function detailContent(item, play) {
  const chips = [
    item.category,
    item.year ? item.year + ' 年' : (item.subtitle ? item.subtitle + ' 年' : ''),
    item.area,
    item.language,
    item.score ? '评分 ' + item.score : '',
    item.episodeCount ? '共 ' + item.episodeCount + ' 集' : '',
    item.remarks && item.remarks !== item.description ? item.remarks : '',
  ].filter(Boolean).map((t) => `<span class="detail__chip">${escapeHTML(String(t))}</span>`).join('');
  const cast = (label, arr) => (Array.isArray(arr) && arr.length
    ? `<div class="detail__cast"><b>${label}</b>${arr.slice(0, 12).map((x) => `<span>${escapeHTML(String(x))}</span>`).join('')}</div>`
    : '');
  return `<div class="detail">
      <div class="detail__eyebrow">内容详情</div>
      <div class="detail__title">${escapeHTML(item.title || '')}</div>
      <div class="detail__meta">${chips}</div>
      ${cast('类型', item.genres)}
      ${cast('导演', item.directors)}
      ${cast('主演', item.actors)}
      <div class="detail__desc">${escapeHTML(item.description || '内容源未提供简介')}</div>
      <div class="detail__actions">
        <button class="btn-primary" data-action="play">${icon('play', 18)} 立即播放</button>
        <button class="btn-ghost" data-action="close">返回</button>
        <button class="btn-ghost" data-action="logout">退出登录</button>
      </div>
      ${playResultHTML(play)}
    </div>`;
}

/** 详情占位（未登录 / 无条目） */
export function detailPending(state) {
  const needLogin = state?.status === 'need-login' || !state?.auth?.loggedIn;
  return `<div class="detail">
      <div class="detail__eyebrow">详情查看</div>
      <div class="detail__title">${needLogin ? '请先登录内容源' : '暂无条目详情'}</div>
      <div class="detail__notice">
        ${needLogin
          ? '内容源需要 Bearer Token 才能读取 /api/*，请先在登录界面输入你的账号。项目不内置任何凭据。'
          : '站点未提供独立详情接口（实测），详情使用列表中的真实条目；切换栏目或搜索后可查看详情。'}
      </div>
      <div class="detail__actions">
        <button class="btn-ghost" data-action="close">返回</button>
        <button class="btn-ghost" data-action="logout">退出登录</button>
      </div>
    </div>`;
}

/** 待补充项面板 */
export function pendingPanel(summary) {
  if (!summary.pending?.length) return '<div class="empty-state"><div class="empty-state__title">全部信息已补充</div></div>';
  const groups = [...new Set(summary.pending.map((p) => p.group))];
  return `<div class="pending-panel">
    ${groups.map((g) => `<section>
        <h3>${escapeHTML(g)}</h3>
        <ul>${summary.pending.filter((p) => p.group === g).map((p) => `
          <li><b>${escapeHTML(p.label)}</b><span>${escapeHTML(p.detail)}</span></li>`).join('')}
        </ul>
      </section>`).join('')}
    <p class="pending-panel__hint">实测记录见 docs/06-影视网站对接实测报告.md；完整待补充项见 docs/00-待补充项清单.md</p>
  </div>`;
}
