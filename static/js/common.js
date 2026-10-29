'use strict';
// Общие утилиты CloWord: API, тема, модальные окна, меню, уведомления, очистка HTML
const CW = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value' && 'value' in el) el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- API
  async function api(method, url, body, opts = {}) {
    let res;
    try {
      res = await fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CloWord' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      const err = new Error('Нет связи с сервером'); err.offline = true; throw err;
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* пустой ответ */ }
    if (res.status === 401 && !opts.noRedirect) { location.href = '/'; }
    if (!res.ok) {
      const err = new Error(data.error || `Ошибка ${res.status}`);
      err.status = res.status; err.data = data; throw err;
    }
    return data;
  }

  // ---------- тема
  const theme = {
    get pref() { try { return localStorage.getItem('cw-theme') || 'system'; } catch (e) { return 'system'; } },
    resolved() {
      const p = this.pref;
      return p === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p;
    },
    apply() {
      document.documentElement.dataset.theme = this.resolved();
      document.dispatchEvent(new CustomEvent('cw-theme'));
    },
    set(p, sync = true) {
      try { localStorage.setItem('cw-theme', p); } catch (e) { /* приватный режим */ }
      this.apply();
      if (sync && CW.user) api('PUT', '/api/me', { prefs: { theme: p } }, { noRedirect: true }).catch(() => {});
    },
    toggle() { this.set(this.resolved() === 'dark' ? 'light' : 'dark'); },
    bind(btn) {
      const upd = () => {
        const dark = this.resolved() === 'dark';
        btn.innerHTML = icon(dark ? 'sun' : 'moon');
        btn.title = dark ? 'Светлая тема' : 'Тёмная тема';
      };
      upd();
      document.addEventListener('cw-theme', upd);
      btn.addEventListener('click', () => this.toggle());
    },
    adoptFromUser(user) {
      const p = user?.prefs?.theme;
      if (p && p !== this.pref) this.set(p, false);
    },
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (theme.pref === 'system') theme.apply(); });

  // ---------- уведомления
  function toast(msg, type = 'info', ms = 3000) {
    let box = $('#toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const ic = { error: 'alert', success: 'check', info: 'info' }[type] || 'info';
    const t = h('div', { class: `toast glass-strong ${type}` }, h('span', { class: 'toast-ic', html: icon(ic, 16) }), h('span', {}, msg));
    box.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // ---------- модальные окна
  function modal({ title, body, buttons = [{ label: 'OK', value: true, primary: true }], width, onOpen, dismissible = true, className = '' }) {
    return new Promise(resolve => {
      closeMenu();
      const back = h('div', { class: 'modal-back' });
      const m = h('div', { class: 'modal glass-strong ' + className, role: 'dialog', 'aria-modal': 'true' });
      if (width) m.style.width = width;
      const head = h('div', { class: 'modal-head' }, h('h3', {}, title || ''),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', html: icon('x'), onclick: () => close(null) }));
      const content = h('div', { class: 'modal-body' });
      if (typeof body === 'string') content.innerHTML = body; else if (body) content.append(body);
      const foot = h('div', { class: 'modal-foot' });
      for (const b of buttons) {
        foot.append(h('button', {
          type: 'button', class: 'btn ' + (b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : '') + (b.left ? ' push-left' : ''),
          onclick: async () => {
            if (b.validate && !(await b.validate(content))) return;
            close(typeof b.value === 'function' ? b.value(content) : b.value);
          },
        }, b.label));
      }
      m.append(head, content);
      if (buttons.length) m.append(foot);
      back.append(m);
      document.body.append(back);
      const prevFocus = document.activeElement;
      function close(v) {
        back.classList.remove('in');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => back.remove(), 180);
        try { prevFocus?.focus?.({ preventScroll: true }); } catch (e) { /* ignore */ }
        resolve(v);
      }
      function onKey(e) {
        if (!document.body.contains(back)) return;
        if (e.key === 'Escape' && dismissible) { e.preventDefault(); e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
          const p = foot.querySelector('.btn-primary'); if (p) { e.preventDefault(); p.click(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('mousedown', e => { if (e.target === back && dismissible) close(null); });
      requestAnimationFrame(() => back.classList.add('in'));
      onOpen && onOpen(content, close);
      const f = content.querySelector('input:not([type=checkbox]):not([type=color]),textarea,select');
      if (f && !onOpen?.noFocus) setTimeout(() => { f.focus(); f.select?.(); }, 60);
    });
  }
  function prompt(title, label, value = '', okLabel = 'OK') {
    return modal({
      title, width: '420px',
      body: h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input', value })),
      buttons: [{ label: 'Отмена', value: null }, { label: okLabel, primary: true, value: c => c.querySelector('input').value }],
    });
  }
  async function confirm(title, text, okLabel = 'OK', danger = false) {
    const v = await modal({
      title, width: '440px', body: h('p', { class: 'modal-text' }, text),
      buttons: [{ label: 'Отмена', value: false }, { label: okLabel, value: true, primary: !danger, danger }],
    });
    return !!v;
  }

  // ---------- всплывающие меню
  let openPopup = null, outsideHandler = null;
  function closeMenu() {
    if (openPopup) { openPopup.remove(); openPopup = null; }
    if (outsideHandler) { document.removeEventListener('pointerdown', outsideHandler, true); outsideHandler = null; }
  }
  function popup(anchor, content, { align = 'left', className = '' } = {}) {
    closeMenu();
    const p = h('div', { class: 'popup glass-strong ' + className });
    p.append(content);
    p.addEventListener('mousedown', e => { if (!e.target.closest('input,select,textarea')) e.preventDefault(); });
    document.body.append(p);
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let x = align === 'right' ? r.right - pw : r.left;
    x = Math.max(8, Math.min(x, innerWidth - pw - 8));
    let y = r.bottom + 6;
    if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
    if (y + ph > innerHeight - 8) { p.style.maxHeight = (innerHeight - y - 8) + 'px'; }
    p.style.left = x + 'px'; p.style.top = y + 'px';
    openPopup = p;
    outsideHandler = e => { if (!p.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    setTimeout(() => document.addEventListener('pointerdown', outsideHandler, true), 0);
    return p;
  }
  function menu(anchor, items, opts) {
    const list = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { list.append(h('div', { class: 'menu-sep' })); continue; }
      if (it.header) { list.append(h('div', { class: 'menu-head' }, it.header)); continue; }
      list.append(h('button', {
        type: 'button', role: 'menuitem',
        class: 'menu-item' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : ''),
        onclick: () => { closeMenu(); it.onClick && it.onClick(); },
      },
        h('span', { class: 'mi-ic', html: it.checked ? icon('check', 16) : it.icon ? icon(it.icon, 16) : '' }),
        h('span', { class: 'mi-label', style: it.style || null }, it.label),
        it.hint ? h('span', { class: 'mi-hint' }, it.hint) : null));
    }
    return popup(anchor, list, opts);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPopup) closeMenu(); });
  window.addEventListener('resize', () => closeMenu());

  // ---------- очистка HTML (вставка, импорт, загрузка)
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'HEAD', 'NOSCRIPT', 'SVG', 'MATH',
    'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'TEMPLATE', 'INPUT', 'CANVAS', 'VIDEO', 'AUDIO', 'FRAME', 'FRAMESET', 'APPLET', 'BASE', 'XML', 'DIALOG']);
  const KEEP = new Set(['P', 'DIV', 'SPAN', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUB', 'SUP',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
    'COLGROUP', 'COL', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'MARK', 'SMALL', 'CAPTION', 'FIGURE', 'FIGCAPTION']);
  const STYLE_OK = new Set(['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color',
    'font-size', 'font-family', 'text-align', 'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'text-indent',
    'line-height', 'width', 'height', 'max-width', 'list-style-type', 'vertical-align', 'border', 'border-top', 'border-bottom',
    'border-left', 'border-right', 'border-collapse', 'border-color', 'border-width', 'border-style', 'padding', 'float', 'display',
    'letter-spacing', 'text-transform', 'white-space']);
  const PRESERVE_WS = new Set(['PRE', 'CODE']);

  function cleanStyle(s) {
    const out = [];
    for (const part of s.split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const p = part.slice(0, i).trim().toLowerCase();
      const v = part.slice(i + 1).trim();
      if (!STYLE_OK.has(p) || !v) continue;
      if (/url\s*\(|expression|javascript:|@import|behavior|var\(/i.test(v)) continue;
      if (p === 'display' && !/^(block|inline|inline-block)$/i.test(v)) continue;
      out.push(`${p}: ${v}`);
    }
    return out.join('; ');
  }
  function cleanAttrs(el) {
    const tag = el.tagName;
    const isBreak = (el.getAttribute('class') || '').split(/\s+/).includes('page-break');
    let align = null;
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = a.value.trim();
      if (n === 'style') {
        const s = cleanStyle(v);
        if (s) el.setAttribute('style', s); else el.removeAttribute('style');
        continue;
      }
      if (n === 'class') {
        const c = v.split(/\s+/).filter(x => /^(cw-[\w-]+|page-break)$/.test(x)).join(' ');
        if (c) el.setAttribute('class', c); else el.removeAttribute('class');
        continue;
      }
      let keep = false;
      if (n === 'href' && tag === 'A') keep = /^(https?:|mailto:|tel:|#)/i.test(v);
      else if (n === 'src' && tag === 'IMG') keep = /^(data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);|https?:|blob:)/i.test(v);
      else if (['alt', 'title', 'colspan', 'rowspan', 'data-checked', 'start', 'reversed'].includes(n)) keep = true;
      else if ((n === 'width' || n === 'height') && /^(IMG|TD|TH|COL|TABLE)$/.test(tag)) keep = /^\d+(\.\d+)?%?$/.test(v);
      else if (n === 'type' && tag === 'OL') keep = /^[1aAiI]$/.test(v);
      else if (n === 'contenteditable' && isBreak) keep = v === 'false';
      else if (n === 'id' && /^H[1-6]$/.test(tag)) keep = /^[\w-]{1,64}$/.test(v);
      else if (n === 'align') { align = v; }
      if (!keep) el.removeAttribute(a.name);
    }
    if (align && /^(left|right|center|justify)$/i.test(align) && !el.style.textAlign) el.style.textAlign = align.toLowerCase();
    if (tag === 'A' && !(el.getAttribute('href') || '').startsWith('#')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
  }
  function cleanNode(node, pre) {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        if (!pre && /[\r\n]/.test(n.data)) {
          if (!n.data.trim()) { n.remove(); continue; }
          n.data = n.data.replace(/\s*[\r\n]+\s*/g, ' ');
        }
        continue;
      }
      if (n.nodeType !== 1) { n.remove(); continue; }
      const tag = n.tagName.toUpperCase();
      if (DROP.has(tag) || tag.includes(':')) { n.remove(); continue; }
      if (tag === 'FONT') {
        const s = document.createElement('span');
        const face = n.getAttribute('face'), color = n.getAttribute('color'), size = n.getAttribute('size');
        if (face) s.style.fontFamily = face;
        if (color) s.style.color = color;
        if (size) s.style.fontSize = ({ 1: '8pt', 2: '10pt', 3: '12pt', 4: '14pt', 5: '18pt', 6: '24pt', 7: '36pt' })[size] || '';
        if (n.getAttribute('style')) s.setAttribute('style', (s.getAttribute('style') || '') + ';' + n.getAttribute('style'));
        s.append(...n.childNodes);
        n.replaceWith(s);
        cleanAttrs(s); cleanNode(s, pre);
        continue;
      }
      if (!KEEP.has(tag)) {
        cleanNode(n, pre);
        n.replaceWith(...n.childNodes);
        continue;
      }
      cleanAttrs(n);
      cleanNode(n, pre || PRESERVE_WS.has(tag) || n.classList.contains('cw-code'));
    }
  }
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    cleanNode(doc.body, false);
    return doc.body.innerHTML.trim();
  }

  // ---------- форматирование
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function fmtDate(ts, full = false) {
    if (!ts) return '';
    const d = new Date(ts * 1000), now = new Date();
    const diff = (now - d) / 1000;
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (!full) {
      if (diff < 60) return 'только что';
      if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    }
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return `сегодня в ${hm}`;
    if (d.toDateString() === y.toDateString()) return `вчера в ${hm}`;
    const sameYear = d.getFullYear() === now.getFullYear();
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}${full ? ' в ' + hm : ''}`;
  }
  function fmtSize(b) {
    if (b == null) return '';
    if (b < 1024) return b + ' Б';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1).replace('.', ',') + ' КБ';
    return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ';
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const nf = n => Number(n || 0).toLocaleString('ru-RU');
  function initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
  }

  // ---------- файлы
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const safeName = t => (String(t || 'Документ').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 120) || 'Документ');
  const scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((ok, fail) => {
        const s = h('script', { src, crossorigin: 'anonymous' });
        s.onload = ok;
        s.onerror = () => { delete scripts[src]; fail(new Error('Не удалось загрузить модуль. Проверьте подключение к интернету.')); };
        document.head.append(s);
      });
    }
    return scripts[src];
  }

  // ---------- страницы документа
  const PAGE_SIZES = {
    A4: { w: 210, h: 297, label: 'A4', hint: '21 × 29,7 см' },
    A5: { w: 148, h: 210, label: 'A5', hint: '14,8 × 21 см' },
    A3: { w: 297, h: 420, label: 'A3', hint: '29,7 × 42 см' },
    B5: { w: 176, h: 250, label: 'B5', hint: '17,6 × 25 см' },
    Letter: { w: 215.9, h: 279.4, label: 'Letter', hint: '21,59 × 27,94 см' },
    Legal: { w: 215.9, h: 355.6, label: 'Legal', hint: '21,59 × 35,56 см' },
  };
  const DEFAULT_SETTINGS = {
    size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 30 },
    columns: 1, header: '', footer: '', pageNumbers: 'none', pageColor: '',
  };
  function normSettings(s) {
    s = s && typeof s === 'object' ? s : {};
    return { ...DEFAULT_SETTINGS, ...s, margins: { ...DEFAULT_SETTINGS.margins, ...(s.margins || {}) } };
  }
  function pageDims(s) {
    const p = PAGE_SIZES[s.size] || PAGE_SIZES.A4;
    return s.orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
  }

  function fillIcons(root = document) {
    $$('[data-i]', root).forEach(el => { el.innerHTML = icon(el.dataset.i, +el.dataset.size || undefined); el.classList.add('i'); });
    $$('[data-logo]', root).forEach(el => { el.innerHTML = CW_LOGO(+el.dataset.logo || 30); });
  }

  return {
    $, $$, h, escape, api, theme, toast, modal, prompt, confirm, popup, menu, closeMenu, sanitize,
    fmtDate, fmtSize, plural, nf, initials, download, safeName, loadScript, PAGE_SIZES, DEFAULT_SETTINGS, normSettings,
    pageDims, fillIcons, user: null,
  };
})();
