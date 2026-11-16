/** 四端共用设置面板：播放模式、播放偏好、界面与搜索 */
import {
  SETTING_SCHEMA, getSettings, setSetting, resetSettings,
  clearSearchHistory, getSearchHistory, applyPreferences,
} from '../core/settings.js';
import { APP_VERSION } from '../core/config.js';

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fieldHTML(item, value) {
  const common = `data-focusable="1" data-zone="settings" data-setting="${item.key}"`;
  if (item.type === 'select') {
    return `<select ${common}>${item.options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  }
  if (item.type === 'toggle') {
    return `<label class="stg-switch"><input type="checkbox" ${common} ${value ? 'checked' : ''} /><span></span></label>`;
  }
  if (item.type === 'range') {
    return `<div class="stg-range"><input type="range" ${common} min="${item.min}" max="${item.max}" step="${item.step}" value="${value}" /><b data-range-val="${item.key}">${value}s</b></div>`;
  }
  if (item.type === 'text') {
    return `<input type="text" class="stg-input" ${common} value="${esc(value)}" placeholder="${esc(item.placeholder || '')}" />`;
  }
  return '';
}

function panelHTML() {
  const s = getSettings();
  const groups = [...new Set(SETTING_SCHEMA.map((i) => i.group))];
  const hist = getSearchHistory();
  return `<div class="stg-panel" role="dialog" aria-label="设置">
    <header class="stg-head">
      <div><b>设置</b><span>偏好仅保存在本设备</span></div>
      <button data-focusable="1" data-zone="settings" data-stg="close" aria-label="关闭">✕</button>
    </header>
    <div class="stg-body">
      ${groups.map((g) => `<section class="stg-group">
        <h3>${esc(g)}</h3>
        ${SETTING_SCHEMA.filter((i) => i.group === g).map((i) => `<div class="stg-row">
          <div class="stg-row__label"><b>${esc(i.label)}</b>${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</div>
          <div class="stg-row__ctrl">${fieldHTML(i, s[i.key])}</div>
        </div>`).join('')}
      </section>`).join('')}
      <section class="stg-group">
        <h3>搜索历史</h3>
        <div class="stg-row">
          <div class="stg-row__label"><b>最近搜索</b><small>共 ${hist.length} 条，仅存本设备</small></div>
          <div class="stg-row__ctrl"><button class="btn-ghost" data-focusable="1" data-zone="settings" data-stg="clear-history">清空</button></div>
        </div>
        ${hist.length ? `<div class="stg-history">${hist.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
      </section>
      <div class="stg-foot">
        <span>AIStream 影视 · v${APP_VERSION}</span>
        <button class="btn-ghost" data-focusable="1" data-zone="settings" data-stg="reset">恢复默认</button>
      </div>
      <p class="stg-note">「播放模式」立即生效；清晰度、自动下一集、跳过片头片尾为播放器偏好，已保存，接入播放器后生效。</p>
    </div>
  </div>`;
}

export function mountSettings(container) {
  const gate = document.createElement('div');
  gate.className = 'stg-gate';
  container.appendChild(gate);
  applyPreferences();

  function open() {
    gate.innerHTML = panelHTML();
    gate.classList.add('is-open');
    window.dispatchEvent(new CustomEvent('aistream:settings-open', { detail: gate }));
  }
  function close() {
    gate.classList.remove('is-open');
    gate.innerHTML = '';
    window.dispatchEvent(new CustomEvent('aistream:settings-close'));
  }
  function refresh() { if (gate.classList.contains('is-open')) gate.innerHTML = panelHTML(); }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="settings"]')) { open(); return; }
    if (!gate.classList.contains('is-open')) return;
    const btn = e.target.closest('[data-stg]');
    if (btn) {
      const a = btn.dataset.stg;
      if (a === 'close') close();
      else if (a === 'reset') { resetSettings(); refresh(); }
      else if (a === 'clear-history') { clearSearchHistory(); refresh(); }
      return;
    }
    if (e.target === gate) close();
  });

  gate.addEventListener('change', (e) => {
    const el = e.target.closest('[data-setting]');
    if (!el) return;
    const key = el.dataset.setting;
    const value = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? Number(el.value) : el.value);
    setSetting(key, value);
    if (el.type === 'range') {
      const b = gate.querySelector(`[data-range-val="${key}"]`);
      if (b) b.textContent = value + 's';
    }
  });
  gate.addEventListener('input', (e) => {
    const el = e.target.closest('input[type="range"][data-setting]');
    if (!el) return;
    const b = gate.querySelector(`[data-range-val="${el.dataset.setting}"]`);
    if (b) b.textContent = el.value + 's';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gate.classList.contains('is-open')) close();
  });
  window.addEventListener('aistream:settings-changed', refresh);

  return { open, close, refresh, el: gate };
}
