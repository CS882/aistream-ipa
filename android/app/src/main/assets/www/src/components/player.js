/**
 * AIStream 影视 · 四端共用内置播放器
 * ==================================================================
 * 内核：ArtPlayer 5.2.3（MIT）+ artplayer-plugin-danmuku 5.3.0（MIT）
 *       + 站点同款 hls.js（均离线内置在 public/vendor/，无 CDN 依赖）
 * UI：参考腾讯视频
 *   · 顶部渐变标题栏（返回 / 片名 / 关闭）
 *   · 底部悬浮功能条（弹幕开关 + 发送 + 换源 + 上/下一集 + 外链）
 *   · 右侧面板分「选集 / 影片信息」两个标签，线路为标签按钮，
 *     剧集按页渲染（2000+ 集不卡、不重叠），面板底部固定分页条
 * 数据：store.requestPlay() → EVT.PLAY → 真实地址 / 剧集 / 线路 / 详情
 * 跨域：第三方 m3u8 / mp4 无 CORS 头时，经本机 /api/proxy?u= 中转，
 *       m3u8 内的分片与密钥 URI 由中转端重写，四端同一套
 * 输入：桌面键鼠 / 移动触控 / TV 遥控器（几何焦点导航 + BACK 优先关闭）
 * ==================================================================
 */
import { bus, EVT } from '../core/events.js';
import { getSetting } from '../core/settings.js';
import { getToken, gatewayBase, resolveUpToken, fetchUpDetail, adPreview, m3u8FilterUrl } from '../core/datasource.js';
import { escapeHTML } from './content.js';

const e = escapeHTML;
const BASE = new URL('.', document.baseURI);
const VENDOR = Object.freeze({
  art: new URL('public/vendor/artplayer.js', BASE).href,
  danmuku: new URL('public/vendor/artplayer-plugin-danmuku.js', BASE).href,
  hls: new URL('public/vendor/hls.min.js', BASE).href,
});
const LOCAL_PROXY = new URL('api/proxy', BASE).href;
function proxyEndpoint() { const g = gatewayBase(); return g ? g + '/api/proxy' : LOCAL_PROXY; }

const PAGE_SIZE = { desktop: 60, mobile: 24, tv: 40 };

let host = null;
let artEl = null;
let art = null;
let hls = null;
let titleEl = null;
let epsEl = null;
let linesEl = null;
let pagerEl = null;
let countEl = null;
let metaEl = null;
let loadingEl = null;
let errorEl = null;
let dmInput = null;
let dmToggle = null;

const extraPlugins = [];          // 外部通过 window.AIStreamPlayer.use() 注册
const playState = {
  open: false, title: '', contentId: '', detail: null,
  episodes: [], lines: [], line: '', index: 0, page: 0,
  introSkipped: false, outroTriggered: false, danmukuOn: true,
  failed: new Set(),        // 已判定不可用的线路
  switchCount: 0,           // 自动换源次数上限，防止死循环
  playToken: 0,             // 快速切集/换源时作废旧实例
  waitTimer: null,          // 线路等待超时计时器
  tab: 'eps',
  lastIndex: -1,          // 仅在换集/换线路时把分页对齐到当前集，手动翻页不被打回
  proxied: false,           // 当前这一集是否走了本地中转
  upMode: false,            // 上游 token 模式（地址需逐集解析）
  skip: 0,                  // 当前集已换过的备用线路数
  keepLabel: '',            // 沿用线路名（/api/up/resolve 的 keep）
};

function platform() {
  return document.documentElement.dataset.platform
    || (/tv\.html/i.test(location.pathname) ? 'tv'
      : /mobile\.html/i.test(location.pathname) ? 'mobile'
        : /desktop\.html/i.test(location.pathname) ? 'desktop' : 'desktop');
}
function isM3u8(url) { return /\.m3u8(\?|#|$)/i.test(url || ''); }
function currentEp() { return playState.episodes[playState.index] || null; }
function currentUrl() { return currentEp()?.url || ''; }
function lineOf(ep) { return ep?.from || ep?.station || '默认线路'; }
function pageSize() { return PAGE_SIZE[platform()] || 60; }

/* ---------------- 跨域流中转 ---------------- */
function isCrossOrigin(u) {
  try { return new URL(u, location.href).origin !== location.origin; } catch { return false; }
}
/** 第三方片源走本机 /api/proxy；站点自身接口（api/iptv/stream 等）保持直连 */
function playableUrl(raw) {
  if (!raw) return raw;
  if (getSetting('streamProxy') === false) return raw;
  if (!isCrossOrigin(raw)) return raw;
  return proxyEndpoint() + '?u=' + encodeURIComponent(raw);
}

/* ---------------- 开源库按需加载 ---------------- */
const scriptPromises = new Map();
function loadScript(url) {
  if (!scriptPromises.has(url)) {
    scriptPromises.set(url, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromises.delete(url); reject(new Error('组件加载失败：' + url.split('/').pop())); };
      document.head.appendChild(s);
    }));
  }
  return scriptPromises.get(url);
}
async function ensureVendor(url) {
  await loadScript(VENDOR.art);
  if (getSetting('danmukuEnabled') !== false) {
    try { await loadScript(VENDOR.danmuku); } catch { /* 弹幕插件可选 */ }
  }
  if (isM3u8(url)) {
    await loadScript(VENDOR.hls);
    if (!window.Hls) throw new Error('HLS 组件未就绪');
  }
  if (!window.Artplayer) throw new Error('ArtPlayer 未就绪');
}

/* ---------------- DOM（腾讯视频式布局） ---------------- */
function build() {
  host = document.createElement('div');
  host.className = 'ais-player';
  host.dataset.platform = platform();
  host.hidden = true;
  host.innerHTML = `
    <div class="ais-player__stage">
      <div class="ais-player__art"></div>
      <div class="ais-player__top">
        <div class="ais-player__back" data-pfocus="1" data-pact="close" title="返回">‹</div>
        <div class="ais-player__title"></div>
        <button class="ais-player__icon" data-pfocus="1" data-pact="close">✕ 关闭</button>
      </div>
      <div class="ais-player__loading">正在加载播放地址…</div>
      <div class="ais-player__error" hidden></div>
      <div class="ais-player__tbar">
        <button class="ais-player__dm-toggle is-on" data-pfocus="1" data-pact="danmuku-toggle" title="弹幕开关">弹</button>
        <input class="ais-player__dm-input" type="text" maxlength="60" placeholder="发个弹幕见证当下" aria-label="发送弹幕" />
        <button class="ais-player__icon" data-pfocus="1" data-pact="danmuku-send">发送</button>
        <span class="ais-player__tbar-sep"></span>
        <button class="ais-player__icon" data-pfocus="1" data-pact="switch">换源</button>
        <button class="ais-player__icon" data-pfocus="1" data-pact="prev">上一集</button>
        <button class="ais-player__icon" data-pfocus="1" data-pact="next">下一集</button>
        <button class="ais-player__icon" data-pfocus="1" data-pact="external">外部打开</button>
        <button class="ais-player__icon" data-pfocus="1" data-pact="copy">复制链接</button>
      </div>
    </div>
    <aside class="ais-player__side">
      <div class="ais-player__tabs" role="tablist">
        <button class="ais-player__tab is-on" role="tab" data-pfocus="1" data-pact="tab" data-tab="eps">
          选集 <small class="ais-player__count" id="ais-ep-count"></small>
        </button>
        <button class="ais-player__tab" role="tab" data-pfocus="1" data-pact="tab" data-tab="info">影片信息</button>
      </div>
      <div class="ais-player__pane" data-pane="eps">
        <div class="ais-player__linebar">
          <span class="ais-player__linelabel">线路</span>
          <div class="ais-player__lines" id="ais-lines"></div>
        </div>
        <div class="ais-player__epwrap"><div class="ais-player__eps"></div></div>
        <div class="ais-player__pager" id="ais-pager"></div>
      </div>
      <div class="ais-player__pane" data-pane="info" hidden>
        <div class="ais-player__meta"></div>
      </div>
    </aside>`;
  document.body.appendChild(host);
  artEl = host.querySelector('.ais-player__art');
  titleEl = host.querySelector('.ais-player__title');
  epsEl = host.querySelector('.ais-player__eps');
  linesEl = host.querySelector('#ais-lines');
  pagerEl = host.querySelector('#ais-pager');
  countEl = host.querySelector('#ais-ep-count');
  metaEl = host.querySelector('.ais-player__meta');
  loadingEl = host.querySelector('.ais-player__loading');
  errorEl = host.querySelector('.ais-player__error');
  dmInput = host.querySelector('.ais-player__dm-input');
  dmToggle = host.querySelector('.ais-player__dm-toggle');

  host.addEventListener('click', onClick);
  dmInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); sendDanmuku(dmInput.value); }
  });
}

/* ---------------- ArtPlayer 实例 ---------------- */
function destroyArt() {
  if (art) {
    try { art.destroy(); } catch { /* ignore */ }
    art = null;
  }
  if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
}

function danmukuPlugin() { return art?.plugins?.artplayerPluginDanmuku || null; }

async function createArt(rawUrl) {
  destroyArt();
  const url = playableUrl(rawUrl);
  playState.proxied = url !== rawUrl;
  const plugins = [];
  if (window.artplayerPluginDanmuku) {
    try {
      plugins.push(window.artplayerPluginDanmuku({
        danmuku: [],                 // 站点未提供弹幕接口 → 不编造内容
        speed: 7, opacity: 0.9, fontSize: 24, color: '#FFFFFF',
        mode: 0, margin: [12, '20%'], antiOverlap: true,
        synchronousPlayback: false, theme: 'dark',
      }));
    } catch { /* 插件异常不影响播放 */ }
  }
  extraPlugins.forEach((p) => { try { plugins.push(p); } catch { /* ignore */ } });

  const customType = {};
  if (isM3u8(rawUrl) && window.Hls) {
    customType.m3u8 = (video, src) => {
      hls = new window.Hls({
        enableWorker: true,
        xhrSetup: (xhr, u) => {
          try {
            const s = String(u);
            // 只给内容源 API 加 Bearer；中转地址不加，避免把 token 带到第三方
            if (s.startsWith(location.origin) && !s.includes('/api/proxy') && getToken()) {
              xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
            }
          } catch { /* ignore */ }
        },
      });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (loadingEl) loadingEl.hidden = true;
      });
      hls.on(window.Hls.Events.ERROR, (_evt, data) => {
        if (!data?.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) autoSwitch('片源网络错误');
        else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); } catch { autoSwitch('片源解码错误'); }
        } else autoSwitch('片源加载失败');
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    };
  }

  const artOptions = {
    container: artEl,
    url,
    customType,
    theme: '#ff6a00',              // 腾讯视频式橙色进度条
    volume: 0.8,
    autoplay: true,
    muted: false,
    pip: true, setting: true, playbackRate: true, aspectRatio: true,
    fullscreen: true, fullscreenWeb: true, miniProgressBar: true,
    hotkey: true, mutex: true, airplay: true,
    plugins,
    moreVideoAttr: { playsInline: true, 'webkit-playsinline': true },
    // 上/下一集统一放在自己的功能条（TV 遥控可聚焦），避免与原生控制条重复
  };
  // ArtPlayer 会校验 option.type 必须为字符串，未指定时不能传 undefined
  if (isM3u8(rawUrl) && window.Hls) artOptions.type = 'm3u8';
  art = new window.Artplayer(artOptions);

  art.on('destroy', () => { if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; } });
  art.on('ready', () => { if (loadingEl) loadingEl.hidden = true; });
  art.on('video:playing', () => {
    clearTimeout(playState.waitTimer);
    playState.waitTimer = null;
    playState.switchCount = 0;
    if (loadingEl) loadingEl.hidden = true;
  });
  art.on('video:waiting', () => {
    if (!playState.waitTimer) scheduleWaitTimeout();
  });
  art.on('video:pause', () => {
    saveResume();
    try { hls?.startLoad?.(); } catch { /* 暂停时继续缓冲，便于稍后秒播 */ }
  });
  art.on('video:ended', onEnded);
  art.on('video:timeupdate', onTimeUpdate);
  art.on('video:loadedmetadata', onLoadedMetadata);
  art.on('error', () => autoSwitch('片源加载失败'));
  if (!playState.danmukuOn) { try { danmukuPlugin()?.hide?.(); } catch { /* ignore */ } }
}

/* ---------------- 播放控制 ---------------- */
function showError(msg) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.innerHTML = `<b>${e(msg)}</b><span>可切换线路 / 剧集，或用「外部打开」「复制链接」</span>`;
  if (loadingEl) loadingEl.hidden = true;
}
function clearError() {
  if (errorEl) { errorEl.hidden = true; errorEl.innerHTML = ''; }
  if (loadingEl) { loadingEl.hidden = false; loadingEl.textContent = '正在加载播放地址…'; }
}

function renderLines() {
  if (!linesEl) return;
  host?.classList.toggle('is-up', playState.upMode);
  if (playState.upMode) {
    const label = playState.keepLabel || '官方线路';
    linesEl.innerHTML = `<span class="ais-player__line-chip is-on">${e(label)}</span>`
      + '<span class="ais-player__empty">可用「换源」切换备用线路</span>';
    return;
  }
  linesEl.innerHTML = playState.lines.map((x) => `<button class="ais-player__line-chip ${x === playState.line ? 'is-on' : ''}"
      data-pfocus="1" data-pact="line" data-line="${e(x)}" title="${e(x)}">${e(x)}</button>`).join('')
    || '<span class="ais-player__empty">默认线路</span>';
}

function epsOfLine() {
  if (playState.upMode) return playState.episodes;          // token 模式只有一条官方线路
  return playState.episodes.filter((x) => !playState.line || lineOf(x) === playState.line);
}

/** 剧集按页渲染：2000+ 集也只渲染当前页，UI 不卡、不再与“播放信息”重叠 */
function renderEpisodes() {
  if (!epsEl) return;
  const all = playState.episodes;
  const list = epsOfLine();
  const per = pageSize();
  const totalPages = Math.max(1, Math.ceil(list.length / per));
  const curInList = list.findIndex((x) => all.indexOf(x) === playState.index);
  if (playState.index !== playState.lastIndex) {
    playState.lastIndex = playState.index;
    if (curInList >= 0) playState.page = Math.floor(curInList / per);
  }
  playState.page = Math.max(0, Math.min(totalPages - 1, playState.page));
  const start = playState.page * per;
  const slice = list.slice(start, start + per);
  epsEl.innerHTML = slice.map((ep) => {
    const idx = all.indexOf(ep);
    return `<button class="ais-player__ep ${idx === playState.index ? 'is-on' : ''}"
      data-pfocus="1" data-pact="ep" data-index="${idx}" title="${e(ep.name || '')}">${e(ep.name || ('第 ' + (idx + 1) + ' 集'))}</button>`;
  }).join('') || '<div class="ais-player__empty">该线路暂无剧集</div>';
  if (countEl) countEl.textContent = list.length ? `共 ${list.length} 集` : '';
  renderPager(totalPages, list.length);
  if (linesEl) {
    linesEl.querySelectorAll('[data-line]').forEach((b) => b.classList.toggle('is-on', b.dataset.line === playState.line));
  }
}

function renderPager(totalPages, totalEps) {
  if (!pagerEl) return;
  if (totalPages <= 1) {
    pagerEl.innerHTML = `<span class="ais-player__pager-info">${totalEps ? '本线路 ' + totalEps + ' 集' : ''}</span>`;
    return;
  }
  const cur = playState.page;
  const picks = new Set([0, totalPages - 1, cur, cur - 1, cur + 1]);
  const nums = [...picks].filter((i) => i >= 0 && i < totalPages).sort((a, b) => a - b);
  let html = `<button class="ais-player__pg" data-pfocus="1" data-pact="page" data-page="${Math.max(0, cur - 1)}" ${cur === 0 ? 'disabled' : ''}>‹</button>`;
  let last = -1;
  nums.forEach((n) => {
    if (last >= 0 && n - last > 1) html += '<span class="ais-player__pg-gap">…</span>';
    html += `<button class="ais-player__pg ${n === cur ? 'is-on' : ''}" data-pfocus="1" data-pact="page" data-page="${n}">${n + 1}</button>`;
    last = n;
  });
  html += `<button class="ais-player__pg" data-pfocus="1" data-pact="page" data-page="${Math.min(totalPages - 1, cur + 1)}" ${cur === totalPages - 1 ? 'disabled' : ''}>›</button>`;
  pagerEl.innerHTML = html;
}

/* ---------------- 续播（内容 id + 集序号） ---------------- */
const RESUME_KEY = 'aistream_resume_v2';
function epNo(ep, idx) {
  const m = String(ep?.name || '').match(/(\d{1,4})/);
  return m ? String(Number(m[1])) : String(idx + 1);
}
/** 用「内容 id + 集序号」做 key：改名、换线路都不会丢进度 */
function resumeKey() {
  const id = playState.contentId || playState.title || '';
  return id + '#' + epNo(playState.episodes[playState.index], playState.index);
}
function readResume() {
  try {
    const all = JSON.parse(localStorage.getItem(RESUME_KEY) || '{}') || {};
    return Number(all[resumeKey()]?.t) || 0;
  } catch { return 0; }
}
function saveResume() {
  const v = art?.video;
  if (!v || !playState.open) return;
  const t = Number(v.currentTime) || 0;
  if (t < 3) return;
  try {
    const all = JSON.parse(localStorage.getItem(RESUME_KEY) || '{}') || {};
    all[resumeKey()] = { t, at: Date.now(), title: playState.title, ep: epNo(playState.episodes[playState.index], playState.index) };
    const keys = Object.keys(all);
    if (keys.length > 60) delete all[keys[0]];
    localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
function fmt(sec) {
  const m = Math.floor((Number(sec) || 0) / 60);
  const s = Math.floor((Number(sec) || 0) % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

let tipEl = null;
let tipTimer = null;
function showTip(msg) {
  if (!host) return;
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ais-player__tip'; host.appendChild(tipEl); }
  tipEl.textContent = msg;
  tipEl.classList.add('is-on');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => tipEl.classList.remove('is-on'), 2600);
}

/** 自动/手动换源：按线路优先级切换，最多 3 次，失败线路不重复尝试 */
function autoSwitch(reason = '') {
  if (!playState.open) return false;

  // 上游 token 模式：同一集换备用线路（skip=1,2,3），不是切到别的集
  if (playState.upMode) {
    if (playState.skip >= 3) {
      showError(`已尝试 ${playState.skip + 1} 条线路仍无法播放${reason ? '（' + reason + '）' : ''}`);
      return false;
    }
    playState.skip++;
    const ep = currentEp();
    if (ep) ep.url = '';
    showTip(`${reason ? reason + '，' : ''}正在切换备用线路 ${playState.skip}/3`);
    playIndex(playState.index, { auto: true });
    return true;
  }

  const cur = playState.line;
  if (cur) playState.failed.add(cur);
  if (playState.switchCount >= 3) {
    showError(`已尝试多条线路仍无法播放${reason ? '（' + reason + '）' : ''}`);
    return false;
  }
  const candidates = playState.lines.filter((l) => !playState.failed.has(l));
  if (!candidates.length) {
    showError(`全部线路暂不可用${reason ? '（' + reason + '）' : ''}`);
    return false;
  }
  const epName = playState.episodes[playState.index]?.name || '';
  const next = candidates[0];
  playState.switchCount++;
  playState.line = next;
  playState.page = 0;
  renderEpisodes();
  let target = playState.episodes.findIndex((x) => lineOf(x) === next && x.name === epName);
  if (target < 0) target = playState.episodes.findIndex((x) => lineOf(x) === next);
  if (target < 0) { showError('该线路暂无可用剧集'); return false; }
  showTip(`${reason ? reason + '，' : ''}已自动切换到「${next}」`);
  playIndex(target, { auto: true });
  return true;
}

/** 等待超时：12 秒仍未起播 → 自动切下一条线路 */
function scheduleWaitTimeout() {
  clearTimeout(playState.waitTimer);
  playState.waitTimer = setTimeout(() => {
    playState.waitTimer = null;
    if (!playState.open) return;
    const v = art?.video;
    const playing = v && (v.currentTime > 0.5 || (!v.paused && v.readyState >= 2));
    if (!playing) autoSwitch('线路等待超时');
  }, 12000);
}

async function playIndex(i, { auto = false } = {}) {
  const list = playState.episodes;
  if (!list.length || !playState.open) return;
  const token = ++playState.playToken;
  clearTimeout(playState.waitTimer);
  playState.waitTimer = null;
  const changed = playState.index !== Math.max(0, Math.min(list.length - 1, i));
  playState.index = Math.max(0, Math.min(list.length - 1, i));
  playState.introSkipped = false;
  playState.outroTriggered = false;
  if (changed) playState.skip = 0;             // 换集重新从主线路开始
  let url = currentUrl();

  // 上游 token 模式：这一集还没有地址 → 调 /api/up/resolve 解析
  if (!url && playState.upMode) {
    const ep = currentEp();
    if (!ep?.token) { autoSwitch('该集没有播放地址'); return; }
    try {
      if (loadingEl) { loadingEl.hidden = false; loadingEl.textContent = '正在解析播放线路…'; }
      const r = await resolveUpToken(ep.token, { skip: playState.skip, keep: playState.keepLabel });
      if (!playState.open || token !== playState.playToken) return;
      if (!r.ok) { if (auto) autoSwitch(r.notice || '线路解析失败'); else showError(r.notice || '线路解析失败'); return; }
      ep.url = r.url;
      if (r.label) { playState.keepLabel = r.label; playState.line = r.label; renderLines(); }
      url = r.url;
    } catch (err) {
      if (auto) autoSwitch('线路解析异常'); else showError(err?.message || '线路解析异常');
      return;
    }
  }
  if (!url) { autoSwitch('该集没有播放地址'); return; }
  // 广告过滤（官方客户端同款）：采集站 m3u8 先让服务端按后台规则分析，
  // 命中插播广告则改用服务端改写后的清单（切片仍为源站直链，不占上行）。
  let playUrl = url;
  if (isM3u8(url) && getSetting('adFilter') !== false) {
    try {
      const ap = await adPreview(url);
      if (ap.ok && (ap.blocked > 0 || ap.discAd > 0)) {
        playUrl = m3u8FilterUrl(url);
        showTip(`已过滤 ${ap.blocked + ap.discAd} 段插播广告`);
      }
    } catch { /* 分析失败不影响正常播放 */ }
  }
  clearError();
  titleEl.textContent = `${playState.title || '播放'} · ${list[playState.index].name || ('第 ' + (playState.index + 1) + ' 集')}`;
  renderEpisodes();
  try {
    await ensureVendor(playUrl);
    if (!playState.open || token !== playState.playToken) return;
    await createArt(playUrl);
    if (token !== playState.playToken) { destroyArt(); return; }
    scheduleWaitTimeout();
  } catch (err) {
    if (auto) autoSwitch('播放器组件加载失败');
    else showError(err?.message || '播放器组件加载失败');
  }
}

function onLoadedMetadata() {
  const v = art?.video;
  if (!v) return;
  const resume = readResume();
  if (resume > 5 && (!v.duration || resume < v.duration - 10)) {
    try { v.currentTime = resume; } catch { /* ignore */ }
    showTip(`已从 ${fmt(resume)} 继续播放`);
  } else {
    const intro = Number(getSetting('skipIntro') || 0);
    if (intro > 0 && !playState.introSkipped && v.currentTime < intro && v.duration > intro) {
      playState.introSkipped = true;
      try { v.currentTime = intro; } catch { /* ignore */ }
    }
  }
  if (loadingEl) loadingEl.hidden = true;
}
let lastResumeSave = 0;
function onTimeUpdate() {
  const v = art?.video;
  if (!v) return;
  if (Date.now() - lastResumeSave > 10000) { lastResumeSave = Date.now(); saveResume(); }
  const d = v.duration || 0;
  const t = v.currentTime || 0;
  const outro = Number(getSetting('skipOutro') || 0);
  if (d > 0 && outro > 0 && t >= d - outro && t < d - 1 && !playState.outroTriggered) {
    playState.outroTriggered = true;
    onEnded();
  }
}
function onEnded() {
  if (!playState.open || !getSetting('autoNext')) return;
  const eps = playState.episodes;
  if (playState.upMode) {
    if (playState.index + 1 < eps.length) playIndex(playState.index + 1);
    return;
  }
  const sameLine = eps.filter((x) => !playState.line || lineOf(x) === playState.line);
  const pos = sameLine.indexOf(eps[playState.index]);
  const nextEp = sameLine[pos + 1];
  if (nextEp) playIndex(eps.indexOf(nextEp));
}

/* ---------------- 影片信息标签 ---------------- */
function renderInfo() {
  if (!metaEl) return;
  const d = playState.detail || {};
  const rows = [];
  const push = (k, v) => { if (v != null && v !== '') rows.push([k, String(v)]); };
  push('评分', d.score || d.rating);
  push('年份', d.year);
  push('地区', d.area);
  push('语言', d.language);
  if (Array.isArray(d.genres) && d.genres.length) push('类型', d.genres.join(' / '));
  if (d.episodeCount) push('集数', String(d.episodeCount) + (d.seasonCount ? '（' + d.seasonCount + ' 季）' : ''));
  push('线路', playState.lines.length ? playState.lines.join(' / ') : '');
  push('本线路剧集', String(epsOfLine().length) + ' 集');
  const cast = (label, arr) => (Array.isArray(arr) && arr.length
    ? `<div class="ais-player__cast"><b>${label}</b>${arr.slice(0, 12).map((x) => `<span>${e(String(x))}</span>`).join('')}</div>`
    : '');
  metaEl.innerHTML = `
    <div class="ais-player__meta-title">${e(playState.title || '')}</div>
    <div class="ais-player__meta-rows">${rows.map(([k, v]) => `<div><b>${e(k)}</b><span>${e(v)}</span></div>`).join('')}</div>
    ${cast('导演', d.directors)}
    ${cast('主演', d.actors)}
    <div class="ais-player__desc">${e(d.description || '内容源未提供简介')}</div>
    <div class="ais-player__meta-foot">
      内核 ArtPlayer · 弹幕插件 · HLS；跨域片源${playState.proxied ? '经本机中转' : '直连'}；
      站点未提供弹幕接口，弹幕仅本地发送
    </div>`;
}

/* ---------------- 打开 / 关闭 ---------------- */
async function open(result) {
  if (!host) build();
  const eps = Array.isArray(result.episodes) ? result.episodes.filter((x) => x && (x.url || x.token)) : [];
  if (!eps.length) return;
  playState.open = true;
  playState.title = result.title || result.detail?.title || document.title || 'AIStream 影视';
  playState.contentId = result.contentId || result.detail?.id || playState.title;
  playState.detail = result.detail || null;
  playState.episodes = eps;
  playState.upMode = result.mode === 'up' || eps.some((x) => x.token);
  playState.skip = 0;
  playState.keepLabel = '';
  playState.lastIndex = -1;
  playState.lines = playState.upMode ? ['官方线路'] : linesOf(eps);
  playState.line = playState.lines[0] || '';
  playState.index = 0;
  playState.page = 0;
  playState.tab = 'eps';
  playState.failed.clear();
  playState.switchCount = 0;
  renderLines();
  renderEpisodes();
  renderInfo();
  switchTab('eps');
  host.hidden = false;
  host.dataset.platform = platform();
  document.documentElement.classList.add('ais-player-open');
  await playIndex(0);
  focusFirst();
  // 长剧：第一页分集先播，剩余分页后台补全（站点 player.js 的 fill 模式）
  if (result.hasMore && playState.upMode) fillMoreEpisodes();
}

/** 后台拉全量分集：只增不减，保持当前集与线路 */
async function fillMoreEpisodes() {
  const id = playState.contentId;
  if (!id) return;
  try {
    const d = await fetchUpDetail(id, { phase: 0 });
    if (!d.ok || !d.episodes?.length) return;
    // 用内容 id 判定：用户换集不应中止补全，只有关闭播放器或换了另一部片才放弃
    if (!playState.open || playState.contentId !== id) return;
    if (d.episodes.length <= playState.episodes.length) return;
    const curName = currentEp()?.name || '';
    playState.episodes = d.episodes;
    const idx = playState.episodes.findIndex((x) => x.name === curName);
    if (idx >= 0) playState.index = idx;
    playState.lastIndex = -1;
    renderEpisodes();
    showTip(`已加载全部 ${d.episodes.length} 集`);
  } catch { /* 后台补全失败不影响首屏播放 */ }
}

function linesOf(episodes) {
  const set = new Set();
  episodes.forEach((ep) => set.add(lineOf(ep)));
  return [...set];
}

function switchTab(tab) {
  playState.tab = tab;
  host?.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
  host?.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  if (tab === 'info') renderInfo();
}

function close() {
  if (!playState.open) return false;
  playState.open = false;
  clearTimeout(playState.waitTimer);
  playState.waitTimer = null;
  playState.failed.clear();
  playState.switchCount = 0;
  playState.playToken++;
  saveResume();
  destroyArt();
  host.hidden = true;
  document.documentElement.classList.remove('ais-player-open');
  return true;
}

/* ---------------- 弹幕与扩展 ---------------- */
function toggleDanmuku() {
  const d = danmukuPlugin();
  playState.danmukuOn = !playState.danmukuOn;
  dmToggle?.classList.toggle('is-on', playState.danmukuOn);
  try {
    if (playState.danmukuOn) d?.show?.(); else d?.hide?.();
  } catch { /* ignore */ }
}
function sendDanmuku(text, opt = {}) {
  const t = String(text || '').trim().slice(0, 60);
  if (!t) return;
  const d = danmukuPlugin();
  try {
    d?.emit?.({ text: t, color: opt.color || '#FFFFFF', mode: opt.mode ?? 0, border: !!opt.border });
    if (dmInput) dmInput.value = '';
    if (!playState.danmukuOn) toggleDanmuku();
  } catch { showError('弹幕发送失败，请确认弹幕插件已加载'); }
}

function onClick(ev) {
  const btn = ev.target.closest('[data-pact]');
  if (!btn) return;
  const act = btn.dataset.pact;
  if (act === 'close') return close();
  if (act === 'switch') return autoSwitch('手动换源');
  if (act === 'prev') return playIndex(playState.index - 1);
  if (act === 'next') return playIndex(playState.index + 1);
  if (act === 'ep') return playIndex(Number(btn.dataset.index));
  if (act === 'page') { playState.page = Number(btn.dataset.page) || 0; renderEpisodes(); return; }
  if (act === 'line') {
    if (btn.dataset.line === playState.line) return;
    playState.line = btn.dataset.line;
    playState.page = 0;
    renderEpisodes();
    const first = playState.episodes.findIndex((x) => lineOf(x) === playState.line);
    if (first >= 0) playIndex(first);
    return;
  }
  if (act === 'tab') return switchTab(btn.dataset.tab);
  if (act === 'danmuku-toggle') return toggleDanmuku();
  if (act === 'danmuku-send') return sendDanmuku(dmInput?.value);
  const url = currentUrl();
  if (act === 'external' && url) window.open(playableUrl(url), '_blank', 'noopener');
  if (act === 'copy' && url) navigator.clipboard?.writeText(url).catch(() => {});
}

/* ---------------- 键盘 / TV 遥控器 ---------------- */
function focusables() {
  return [...host.querySelectorAll('[data-pfocus="1"]')].filter((x) => x.offsetParent !== null && !x.disabled);
}
function focusFirst() {
  const tbar = host.querySelector('[data-pact="danmuku-toggle"]');
  (tbar || focusables()[0])?.focus();
}

/** 几何方向键导航：对标签、线路、剧集网格、分页条都成立 */
function moveFocus(dir) {
  const list = focusables();
  if (!list.length) return;
  const cur = document.activeElement;
  if (!list.includes(cur)) { list[0].focus(); return; }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best = null;
  let bestScore = Infinity;
  list.forEach((el) => {
    if (el === cur) return;
    const b = el.getBoundingClientRect();
    const dx = (b.left + b.width / 2) - cx;
    const dy = (b.top + b.height / 2) - cy;
    if (dir === 'left' && dx > -2) return;
    if (dir === 'right' && dx < 2) return;
    if (dir === 'up' && dy > -2) return;
    if (dir === 'down' && dy < 2) return;
    const primary = Math.abs(dir === 'left' || dir === 'right' ? dx : dy);
    const secondary = Math.abs(dir === 'left' || dir === 'right' ? dy : dx);
    const score = primary + secondary * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  });
  if (best) best.focus();
}

document.addEventListener('keydown', (ev) => {
  if (!playState.open) return;         // 关闭时完全不拦截登录框 / 搜索框 / 设置面板
  const k = ev.key;
  const isBack = k === 'Escape' || k === 'Backspace' || ev.keyCode === 4 || ev.keyCode === 461;
  const isOk = k === 'Enter' || k === ' ' || k === 'Spacebar' || ev.keyCode === 23 || ev.keyCode === 66;
  const arrow = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k]
    || { 21: 'left', 22: 'right', 19: 'up', 20: 'down' }[ev.keyCode];
  const inField = document.activeElement === dmInput;

  if (inField && !isBack) {
    if (k === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); sendDanmuku(dmInput.value); }
    return;                            // 弹幕输入时放行所有字符与方向键
  }
  if (!isBack && !isOk && !arrow && !['m', 'f', 'p'].includes(k)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();       // 播放器优先于三端全局快捷键与 TV FocusManager

  if (isBack) { close(); return; }
  if (arrow) {
    if (platform() === 'tv') { moveFocus(arrow); return; }
    const v = art?.video;
    if (!v) return;
    if (arrow === 'left' || arrow === 'right') v.currentTime = Math.max(0, (v.currentTime || 0) + (arrow === 'left' ? -10 : 10));
    else v.volume = Math.max(0, Math.min(1, (v.volume || 0) + (arrow === 'up' ? 0.1 : -0.1)));
    return;
  }
  if (isOk) {
    const active = document.activeElement;
    if (active && host.contains(active) && active.matches('button,[data-pact]')) { active.click(); return; }
    if (art) art.toggle();
    return;
  }
  if (k === 'm' && art) art.muted = !art.muted;
  if (k === 'f' && art) art.fullscreen = !art.fullscreen;
  if (k === 'p') playIndex(playState.index + 1);
}, true);

/** Android TV 原生壳 BACK 键：播放器打开时优先关闭 */
window.__aisPlayerBack = () => close();

/** 开源播放器扩展口：可注册 ArtPlayer 插件、发送弹幕、读取实例 */
window.AIStreamPlayer = {
  version: { artplayer: '5.2.3', danmuku: '5.3.0', ui: '腾讯视频风格' },
  use(plugin) { if (typeof plugin === 'function') extraPlugins.push(plugin); return window.AIStreamPlayer; },
  art: () => art,
  danmuku: () => danmukuPlugin(),
  emitDanmuku: (text, opt) => sendDanmuku(text, opt),
  proxied: () => playState.proxied,
};

/* ---------------- 接入统一业务逻辑 ---------------- */
bus.on(EVT.PLAY, (result) => {
  if (getSetting('playMode') !== 'internal') return;
  // 解析失败：撤销 pending 外壳，避免加载遮罩一直挂着
  if (!result?.ok || !(result.playUrl || result.episodes?.length)) {
    if (playState.open && !art) close();
    return;
  }
  open(result);
});

/** 点击卡片即刻反馈：先挂载播放器外壳 + 显示加载态，避免解析地址期间的空白等待 */
export function openPending(title) {
  if (getSetting('playMode') !== 'internal') return;
  if (!host) build();
  playState.open = true;
  // pending 只是提前显示外壳，标题先填；真正的 open() 会用完整标题覆盖
  if (title && titleEl) titleEl.textContent = String(title);
  if (errorEl) errorEl.hidden = true;
  if (loadingEl) {
    loadingEl.hidden = false;
    loadingEl.textContent = '正在加载播放地址…';
  }
  host.hidden = false;
  host.dataset.platform = platform();
  document.documentElement.classList.add('ais-player-open');
}

bus.on(EVT.PLAY_PENDING, (payload) => openPending(payload?.title));

export function isPlayerOpen() { return playState.open; }
export function closePlayer() { return close(); }
