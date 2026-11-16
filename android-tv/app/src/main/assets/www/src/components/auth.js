/**
 * 四端共用登录组件
 * ------------------------------------------------------------------
 * 实测内容源 needLogin=true，登录接口 POST api/auth/login → {token}。
 * 账号由使用者在应用内自行输入，本项目不内置、不上传、不猜测任何凭据。
 * 登录成功后 token 存 localStorage('aistream_token')，与主站一致。
 */
import * as store from '../core/store.js';
import { bus, EVT } from '../core/events.js';

const REMEMBER_KEY = 'aistream_remember';
function readRemember() {
  try {
    const v = JSON.parse(localStorage.getItem(REMEMBER_KEY) || '{}') || {};
    return { u: v.u || '', p: v.p || '', remember: v.remember !== false };
  } catch { return { u: '', p: '', remember: true }; }
}
function saveRemember(u, p, remember) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ u, p: remember ? p : '', remember }));
  } catch { /* ignore */ }
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function mountAuthGate(container) {
  const gate = document.createElement('div');
  gate.className = 'auth-gate';
  container.appendChild(gate);
  let mode = 'login';
  let lastKey = '';
  let caps = false;
  let lastFieldId = '';
  const isTV = () => document.documentElement.dataset.platform === 'tv'
    || /tv\.html/i.test(location.pathname);

  /* ---------------- TV 遥控器虚拟键盘 ----------------
   * 实测站点只有 api/auth/login（用户名 + 密码），没有扫码 / 设备码 / 短信登录，
   * 因此 TV 端用大焦点虚拟键盘逐字输入，避免遥控器调系统输入法。
   */
  const KB_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'],
    ['u', 'v', 'w', 'x', 'y', 'z', '.', '-', '_', '@'],
  ];

  function activeField() {
    const cur = document.activeElement;
    if (cur && gate.contains(cur) && cur.matches('input[type="text"],input[type="password"]')) return cur;
    if (lastFieldId) {
      const f = gate.querySelector('#' + lastFieldId);
      if (f) return f;
    }
    return gate.querySelector('#auth-user');
  }

  function insertKey(k) {
    const f = activeField();
    if (!f) return;
    const ch = caps ? String(k).toUpperCase() : k;
    try {
      const s = f.selectionStart;
      const en = f.selectionEnd;
      if (typeof s === 'number') {
        f.value = f.value.slice(0, s) + ch + f.value.slice(en);
        const pos = s + ch.length;
        f.setSelectionRange(pos, pos);
      } else {
        f.value += ch;
      }
    } catch { f.value += ch; }
  }

  function keyboardHTML() {
    if (!isTV()) return '';
    const rows = KB_ROWS.map((row) => `<div class="auth-kb__row">${row.map((k) => {
      const label = caps ? k.toUpperCase() : k;
      return `<button class="auth-kb__key" data-focusable="1" data-zone="auth" data-auth="key" data-key="${esc(k)}">${esc(label)}</button>`;
    }).join('')}</div>`).join('');
    return `<div class="auth-keyboard" aria-label="遥控器键盘">
      ${rows}
      <div class="auth-kb__row auth-kb__row--fn">
        <button class="auth-kb__key auth-kb__key--fn ${caps ? 'is-on' : ''}" data-focusable="1" data-zone="auth" data-auth="kb-caps">大写</button>
        <button class="auth-kb__key auth-kb__key--fn" data-focusable="1" data-zone="auth" data-auth="kb-back">⌫ 退格</button>
        <button class="auth-kb__key auth-kb__key--fn" data-focusable="1" data-zone="auth" data-auth="kb-clear">清空</button>
        <button class="auth-kb__key auth-kb__key--fn" data-focusable="1" data-zone="auth" data-auth="kb-show">显示密码</button>
      </div>
      <div class="auth-kb__hint">遥控器方向键选字，OK 输入；先选中输入框可切换用户/密码</div>
    </div>`;
  }

  function html(state) {
    const a = state.auth;
    const isReg = mode === 'register';
    const canReg = a.regEnabled && a.publicOk;
    const saved = readRemember();
    return `<div class="auth-card">
      <div class="auth-logo"><span class="auth-logo-mark"></span><b>AIStream</b><i>影视</i></div>
      <h2>${esc(a.siteName || 'AIStream 影视')}</h2>
      <p class="auth-sub">${isReg ? '注册内容源账号' : '登录内容源后浏览真实影视内容'}</p>
      ${a.publicError ? `<div class="auth-warn">内容源探测失败：${esc(a.publicError)}（请检查网络或代理配置）</div>` : ''}
      ${a.error ? `<div class="auth-err">${esc(a.error)}</div>` : ''}
      <input data-focusable="1" data-zone="auth" id="auth-user" type="text" autocomplete="username" placeholder="用户名" value="${esc(saved.u)}" />
      <input data-focusable="1" data-zone="auth" id="auth-pass" type="password" autocomplete="${isReg ? 'new-password' : 'current-password'}" placeholder="密码" value="${esc(saved.p)}" />
      ${isReg ? `
        <input data-focusable="1" data-zone="auth" id="auth-pass2" type="password" autocomplete="new-password" placeholder="确认密码" />
        ${a.inviteRequired ? '<input id="auth-invite" type="text" placeholder="邀请码（必填）" />' : ''}
      ` : ''}
      <label class="auth-remember">
        <input data-focusable="1" data-zone="auth" type="checkbox" id="auth-remember" ${saved.remember ? 'checked' : ''} />
        <span>记住账号密码</span><small>仅保存在本机，公共设备请取消勾选</small>
      </label>
      <div class="auth-actions">
        <button data-focusable="1" data-zone="auth" class="btn-primary auth-submit" data-auth="${isReg ? 'register' : 'login'}" ${a.busy ? 'disabled' : ''}>
          ${a.busy ? '请稍候…' : (isReg ? '注 册' : '登 录')}
        </button>
        ${canReg ? `<button data-focusable="1" data-zone="auth" class="btn-ghost auth-switch" data-auth="${isReg ? 'switch-login' : 'switch-reg'}">
          ${isReg ? '返回登录' : '注册新账号'}</button>` : ''}
      </div>
      ${keyboardHTML()}
    </div>`;
  }

  function render(state) {
    const show = state.auth.required && !state.auth.loggedIn && state.status !== 'loading';
    gate.classList.toggle('is-open', show);
    if (!show) { gate.innerHTML = ''; lastKey = ''; return; }
    // 只在登录相关状态变化时重绘：避免后台加载/慢提示等状态刷新把输入焦点和光标重置
    const key = [mode, state.auth.error, state.auth.busy, state.auth.siteName,
      state.auth.publicError, state.auth.regEnabled, state.auth.inviteRequired].join('|');
    if (key === lastKey) return;
    lastKey = key;
    const prev = { u: gate.querySelector('#auth-user')?.value || '', p: gate.querySelector('#auth-pass')?.value || '' };
    gate.innerHTML = html(state);
    const u = gate.querySelector('#auth-user');
    const p = gate.querySelector('#auth-pass');
    if (u && prev.u) u.value = prev.u;
    if (p && prev.p) p.value = prev.p;
  }

  async function submit() {
    const u = gate.querySelector('#auth-user')?.value.trim() || '';
    const p = gate.querySelector('#auth-pass')?.value || '';
    if (!u || !p) { store.toast('请输入用户名和密码'); return; }
    const remember = !!gate.querySelector('#auth-remember')?.checked;
    saveRemember(u, p, remember);
    if (mode === 'register') {
      const p2 = gate.querySelector('#auth-pass2')?.value || '';
      if (p !== p2) { store.toast('两次输入的密码不一致'); return; }
      const invite = gate.querySelector('#auth-invite')?.value.trim() || '';
      await store.register(u, p, invite);
    } else {
      await store.login(u, p);
    }
  }

  // 记住遥控器最后停留的输入框（虚拟键盘按 id 回找，避免重渲染后丢失）
  gate.addEventListener('focusin', (e) => {
    if (e.target.matches?.('input[type="text"],input[type="password"]')) lastFieldId = e.target.id || '';
  });

  gate.addEventListener('click', (e) => {
    const b = e.target.closest('[data-auth]');
    if (!b) return;
    const act = b.dataset.auth;
    if (act === 'switch-reg') { mode = 'register'; render(store.getState()); return; }
    if (act === 'switch-login') { mode = 'login'; render(store.getState()); return; }
    if (act === 'login' || act === 'register') { submit(); return; }
    // 遥控器虚拟键盘
    if (act === 'key') { insertKey(b.dataset.key); return; }
    if (act === 'kb-caps') { caps = !caps; render(store.getState()); return; }
    if (act === 'kb-back') { const f = activeField(); if (f) f.value = f.value.slice(0, -1); return; }
    if (act === 'kb-clear') { const f = activeField(); if (f) f.value = ''; return; }
    if (act === 'kb-show') {
      const f = activeField();
      if (f) f.type = f.type === 'password' ? 'text' : 'password';
    }
  });
  gate.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  bus.on(EVT.STATE, render);
  render(store.getState());
  return gate;
}
