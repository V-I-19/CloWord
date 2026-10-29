'use strict';
// Редактор CloWord
(() => {
  const { $, $$, h, api, theme, toast, modal, prompt, menu, popup, closeMenu, escape, fmtDate, fmtSize, nf, plural } = CW;
  CW.fillIcons();
  theme.bind($('#themeBtn'));

  const ed = $('#editor'), sheet = $('#sheet'), ws = $('#workspace'), titleInput = $('#docTitle');
  const docId = new URLSearchParams(location.search).get('id');
  let doc = null;
  let settings = CW.normSettings({});
  // на телефоне по умолчанию «Веб-документ»: текст переносится по ширине экрана
  const view = { zoom: +lsGet('cw-zoom') || 100, mode: lsGet('cw-view') || (innerWidth < 700 ? 'web' : 'print'), autoFit: false };
  const exec = (c, v = null) => document.execCommand(c, false, v);
  const MM = 96 / 25.4;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* квота или приватный режим */ } }

  const FONTS = [
    ['Calibri', 'Calibri, Carlito, sans-serif'], ['Calibri Light', "'Calibri Light', Carlito, sans-serif"],
    ['Arial', 'Arial, Arimo, sans-serif'], ['Times New Roman', "'Times New Roman', Tinos, serif"],
    ['Cambria', 'Cambria, Caladea, serif'], ['Georgia', 'Georgia, serif'], ['Verdana', 'Verdana, sans-serif'],
    ['Tahoma', 'Tahoma, sans-serif'], ['Trebuchet MS', "'Trebuchet MS', sans-serif"], ['Segoe UI', "'Segoe UI', Roboto, sans-serif"],
    ['Courier New', "'Courier New', Cousine, monospace"], ['Consolas', "Consolas, 'Fira Code', monospace"],
    ['Roboto', 'Roboto, sans-serif'], ['Open Sans', "'Open Sans', sans-serif"], ['Montserrat', 'Montserrat, sans-serif'],
    ['PT Sans', "'PT Sans', sans-serif"], ['PT Serif', "'PT Serif', serif"], ['Lora', 'Lora, serif'],
    ['Merriweather', 'Merriweather, serif'], ['Playfair Display', "'Playfair Display', serif"], ['Fira Code', "'Fira Code', monospace"],
    ['Comfortaa', 'Comfortaa, sans-serif'], ['Caveat', 'Caveat, cursive'], ['Comic Sans MS', "'Comic Sans MS', cursive"],
  ];
  const FONT_ALIAS = { Carlito: 'Calibri', Tinos: 'Times New Roman', Arimo: 'Arial', Caladea: 'Cambria', Cousine: 'Courier New' };
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  const STYLES = [
    { id: 'normal', name: 'Обычный', tag: 'p', cls: '', prev: 'font:11pt Calibri,Carlito,sans-serif' },
    { id: 'nospace', name: 'Без интервала', tag: 'p', cls: 'cw-nospace', prev: 'font:11pt Calibri,Carlito,sans-serif' },
    { id: 'h1', name: 'Заголовок 1', tag: 'h1', cls: '', prev: 'font:15pt "Calibri Light",Carlito,sans-serif;color:#2f5496' },
    { id: 'h2', name: 'Заголовок 2', tag: 'h2', cls: '', prev: 'font:13pt "Calibri Light",Carlito,sans-serif;color:#2f5496' },
    { id: 'h3', name: 'Заголовок 3', tag: 'h3', cls: '', prev: 'font:12pt "Calibri Light",Carlito,sans-serif;color:#1f3763' },
    { id: 'title', name: 'Название', tag: 'p', cls: 'cw-title', prev: 'font:19pt "Calibri Light",Carlito,sans-serif' },
    { id: 'subtitle', name: 'Подзаголовок', tag: 'p', cls: 'cw-subtitle', prev: 'font:11pt Calibri,Carlito,sans-serif;color:#5a5a5a;letter-spacing:.75pt' },
    { id: 'quote', name: 'Цитата', tag: 'p', cls: 'cw-quote', prev: 'font:italic 11pt Calibri,Carlito,sans-serif;color:#404040' },
    { id: 'code', name: 'Код', tag: 'p', cls: 'cw-code', prev: 'font:10pt Consolas,"Fira Code",monospace;background:#f3f4f6' },
  ];
  const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div,td,th';
  const TOP_BLOCK = /^(P|H[1-6]|UL|OL|TABLE|BLOCKQUOTE|PRE|DIV|HR|FIGURE)$/;

  // ================================================================ выделение
  let savedRange = null;
  const inEditor = n => !!n && (n === ed || ed.contains(n));
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && inEditor(s.anchorNode)) {
      savedRange = s.getRangeAt(0).cloneRange();
      if (selImg && (!ed.contains(selImg) || !savedRange.intersectsNode(selImg))) deselectImage();
      queueUI();
    }
  });
  function currentRange() {
    const s = getSelection();
    if (s.rangeCount && inEditor(s.anchorNode)) return s.getRangeAt(0);
    return savedRange && inEditor(savedRange.startContainer) ? savedRange : null;
  }
  function focusEditor() {
    const s = getSelection();
    if (document.activeElement === ed && s.rangeCount && inEditor(s.anchorNode)) return;
    ed.focus({ preventScroll: true });
    if (savedRange && inEditor(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); }
  }
  function setCaret(node, offset = 0) {
    const r = document.createRange();
    r.setStart(node, offset); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    savedRange = r.cloneRange();
  }
  function anchorEl() {
    const r = currentRange();
    if (!r) return null;
    const n = r.startContainer;
    const el = n.nodeType === 1 ? (n.childNodes[r.startOffset]?.nodeType === 1 ? n.childNodes[r.startOffset] : n) : n.parentElement;
    return inEditor(el) ? el : null;
  }
  function closestTag(sel) {
    const el = anchorEl();
    const t = el && el.closest(sel);
    return t && inEditor(t) && t !== ed ? t : null;
  }
  function closestBlock(node) {
    let n = node && (node.nodeType === 1 ? node : node.parentElement);
    while (n && n !== ed) {
      if (n.matches(BLOCK_SEL) && !n.classList.contains('page-break') && !n.classList.contains('cw-toc')) return n;
      n = n.parentElement;
    }
    return null;
  }
  function boundaryNode(c, o, end) {
    if (c.nodeType === 3) return c;
    return c.childNodes[end ? Math.max(0, o - 1) : o] || c;
  }
  function selectedBlocks() {
    const r = currentRange();
    if (!r) return [];
    const sb = closestBlock(boundaryNode(r.startContainer, r.startOffset, false));
    const eb = closestBlock(boundaryNode(r.endContainer, r.endOffset, true));
    if (r.collapsed || sb === eb) return sb ? [sb] : [];
    const out = [];
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.matches(BLOCK_SEL) && !n.classList.contains('page-break') && !n.querySelector(BLOCK_SEL) && r.intersectsNode(n)) out.push(n);
    }
    return out.length ? out : (sb ? [sb] : []);
  }
  // сохраняет выделение при перестановке узлов (map: старый узел → новый)
  function preserveSel(fn) {
    const s = getSelection();
    const r = s.rangeCount ? s.getRangeAt(0) : null;
    const saved = r && inEditor(r.startContainer) ? [r.startContainer, r.startOffset, r.endContainer, r.endOffset] : null;
    const map = new Map();
    fn(map);
    if (!saved) return;
    const m = n => map.get(n) || n;
    try {
      const nr = document.createRange();
      nr.setStart(m(saved[0]), saved[1]); nr.setEnd(m(saved[2]), saved[3]);
      s.removeAllRanges(); s.addRange(nr);
    } catch (e) { /* узел исчез */ }
  }
  function nodePath(node) {
    const path = [];
    while (node && node !== ed) {
      const p = node.parentNode;
      if (!p) return null;
      path.unshift(Array.prototype.indexOf.call(p.childNodes, node));
      node = p;
    }
    return node === ed ? path : null;
  }
  function nodeAt(path) {
    let n = ed;
    for (const i of path || []) { n = n.childNodes[i]; if (!n) return null; }
    return n;
  }
  function saveSelPath() {
    const s = getSelection();
    if (!s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!inEditor(r.startContainer)) return null;
    return { s: nodePath(r.startContainer), so: r.startOffset, e: nodePath(r.endContainer), eo: r.endOffset };
  }
  function restoreSelPath(p) {
    if (!p || !p.s || !p.e) return;
    const sn = nodeAt(p.s), en = nodeAt(p.e);
    if (!sn || !en) return;
    const max = n => n.nodeType === 3 ? n.length : n.childNodes.length;
    try {
      const r = document.createRange();
      r.setStart(sn, Math.min(p.so, max(sn))); r.setEnd(en, Math.min(p.eo, max(en)));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      savedRange = r.cloneRange();
    } catch (e) { /* ignore */ }
  }

  // ================================================================ история (отмена / возврат)
  const History = {
    stack: [], idx: -1, timer: null,
    snap() { return { html: ed.innerHTML, sel: saveSelPath() }; },
    reset() { clearTimeout(this.timer); this.timer = null; this.stack = [this.snap()]; this.idx = 0; updateUndo(); },
    record() {
      clearTimeout(this.timer); this.timer = null;
      const s = this.snap(), cur = this.stack[this.idx];
      if (cur && cur.html === s.html) { cur.sel = s.sel; return; }
      this.stack.splice(this.idx + 1);
      this.stack.push(s);
      const limit = s.html.length > 2e6 ? 20 : s.html.length > 4e5 ? 60 : 200;
      while (this.stack.length > limit) this.stack.shift();
      this.idx = this.stack.length - 1;
      updateUndo();
    },
    schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.record(), 450); },
    flush() { if (this.timer) this.record(); },
    undo() { this.flush(); if (this.idx <= 0) return; this.idx--; this.restore(this.stack[this.idx]); },
    redo() { this.flush(); if (this.idx >= this.stack.length - 1) return; this.idx++; this.restore(this.stack[this.idx]); },
    restore(s) {
      deselectImage();
      ed.innerHTML = s.html;
      ed.focus({ preventScroll: true });
      restoreSelPath(s.sel);
      updateUndo(); changed();
    },
  };
  function updateUndo() {
    $$('[data-a="undo"]').forEach(b => { b.disabled = History.idx <= 0; });
    $$('[data-a="redo"]').forEach(b => { b.disabled = History.idx >= History.stack.length - 1; });
  }

  // выполнить правку как одно действие истории
  function run(fn) {
    History.flush();
    focusEditor();
    exec('styleWithCSS', true);
    try { fn(); } finally {
      normalize();
      History.record();
      changed();
    }
  }
  const cmd = c => run(() => exec(c));

  // текст вне абзацев оборачиваем в <p>
  function normalize() {
    const s = getSelection();
    const r = s.rangeCount ? s.getRangeAt(0) : null;
    const saved = r && inEditor(r.startContainer) ? [r.startContainer, r.startOffset, r.endContainer, r.endOffset] : null;
    let moved = false, wrap = null;
    for (const n of [...ed.childNodes]) {
      let inline;
      if (n.nodeType === 3) inline = n.data.length > 0 && !(!n.data.trim() && /\n/.test(n.data));
      else if (n.nodeType === 1) inline = !TOP_BLOCK.test(n.tagName);
      else { n.remove(); continue; }
      if (inline) {
        if (!wrap) { wrap = document.createElement('p'); n.before(wrap); }
        wrap.append(n); moved = true;
      } else wrap = null;
    }
    if (!ed.firstElementChild && !ed.textContent) {
      ed.innerHTML = '<p><br></p>';
      if (document.activeElement === ed) setCaret(ed.firstChild, 0);
      return;
    }
    if (moved && saved) {
      try {
        const nr = document.createRange();
        nr.setStart(saved[0], saved[1]); nr.setEnd(saved[2], saved[3]);
        s.removeAllRanges(); s.addRange(nr);
      } catch (e) { /* ignore */ }
    }
  }

  // ================================================================ изменения и сохранение
  let dirty = false, saving = false, saveTimer = null, forceOverwrite = false, forceSnapshot = false, retryTimer = null;

  function changed() { markDirty(); queueLayout(); queueUI(); }
  function markDirty() {
    if (!doc) return;
    dirty = true;
    setStatus('unsaved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1100);
  }
  function setStatus(s) {
    const el = $('#saveStatus');
    const t = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const map = {
      saved: ['cloudCheck', 'Сохранено в облаке', `Все изменения сохранены в ${t}`],
      saving: ['cloud', 'Сохранение…', 'Сохраняем изменения'],
      unsaved: ['cloud', 'Изменения…', 'Изменения будут сохранены автоматически'],
      offline: ['cloudOff', 'Нет связи', 'Нет связи с сервером. Изменения сохранены на этом устройстве и будут отправлены позже.'],
      error: ['cloudOff', 'Не сохранено', 'Ошибка сохранения'],
      conflict: ['alert', 'Конфликт версий', 'Документ изменён на другом устройстве'],
    }[s];
    el.className = 'save-status ' + s;
    el.querySelector('.ss-ic').innerHTML = icon(map[0], 14);
    el.querySelector('.ss-text').textContent = map[1];
    el.title = map[2];
  }
  function contentHTML() {
    const c = ed.cloneNode(true);
    c.querySelectorAll('.is-selected').forEach(x => { x.classList.remove('is-selected'); if (!x.className) x.removeAttribute('class'); });
    return c.innerHTML;
  }
  const draftKey = () => 'cw-draft-' + docId;
  function writeDraft(p) { lsSet(draftKey(), JSON.stringify({ title: p.title, content: p.content, settings: p.settings, base: doc.updated, at: Date.now() })); }
  function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) { /* ignore */ } }
  const docTitle = () => titleInput.value.trim() || 'Без названия';

  async function save() {
    clearTimeout(saveTimer); clearTimeout(retryTimer);
    if (!doc || !dirty) return;
    if (saving) { saveTimer = setTimeout(save, 600); return; }
    saving = true; dirty = false;
    setStatus('saving');
    const payload = { title: docTitle(), content: contentHTML(), settings, base_updated: doc.updated };
    if (forceOverwrite) payload.force = true;
    if (forceSnapshot) payload.snapshot = true;
    writeDraft(payload);
    try {
      const r = await api('PUT', `/api/docs/${doc.id}`, payload);
      doc.updated = r.updated; doc.title = r.title;
      forceOverwrite = forceSnapshot = false;
      if (!dirty) clearDraft();
      setStatus(dirty ? 'unsaved' : 'saved');
    } catch (e) {
      dirty = true;
      if (e.status === 409) { saving = false; return handleConflict(); }
      if (e.offline) { setStatus('offline'); retryTimer = setTimeout(save, 5000); }
      else { setStatus('error'); toast(e.message, 'error'); retryTimer = setTimeout(save, 15000); }
    } finally {
      saving = false;
    }
    if (dirty) saveTimer = setTimeout(save, 900);
  }
  async function saveNow() {
    History.flush();
    if (!dirty) { setStatus('saved'); return; }
    await save();
  }
  async function handleConflict() {
    setStatus('conflict');
    const choice = await modal({
      title: 'Документ изменён на другом устройстве', width: '520px', dismissible: false,
      body: h('p', { class: 'modal-text' }, 'Пока вы редактировали, этот документ был сохранён на другом устройстве или в другой вкладке. Что сделать с вашими изменениями?'),
      buttons: [
        { label: 'Сохранить мою как копию', value: 'copy', left: true },
        { label: 'Загрузить с сервера', value: 'load' },
        { label: 'Перезаписать моей', primary: true, value: 'overwrite' },
      ],
    });
    if (choice === 'overwrite') { forceOverwrite = true; dirty = true; save(); }
    else if (choice === 'load') { await reloadFromServer(); }
    else if (choice === 'copy') {
      try {
        await api('POST', '/api/docs', { title: docTitle() + ' (моя версия)', content: contentHTML(), settings });
        await reloadFromServer();
        toast('Ваша версия сохранена копией в «Мои документы»', 'success', 4500);
      } catch (e) { toast(e.message, 'error'); }
    }
  }
  async function reloadFromServer() {
    const r = await api('GET', `/api/docs/${docId}`);
    loadDoc(r.doc, true);
    dirty = false; clearDraft(); setStatus('saved');
  }
  async function checkRemote() {
    if (!doc || document.hidden || dirty || saving) return;
    try {
      const m = await api('GET', `/api/docs/${doc.id}/meta`, undefined, { noRedirect: true });
      if (m.updated > doc.updated + 0.0005) {
        const r = await api('GET', `/api/docs/${doc.id}`);
        if (dirty || saving) return;
        loadDoc(r.doc, true);
        toast('Документ обновлён: изменения с другого устройства');
      }
    } catch (e) { /* нет связи — проверим позже */ }
  }
  setInterval(checkRemote, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (dirty) save(); } else checkRemote(); });
  window.addEventListener('beforeunload', e => {
    if (dirty || saving) {
      try { writeDraft({ title: docTitle(), content: contentHTML(), settings }); } catch (err) { /* ignore */ }
      e.preventDefault(); e.returnValue = '';
    }
  });
  window.addEventListener('online', () => { if (dirty) save(); });

  function loadDoc(d, keep) {
    doc = { id: d.id, title: d.title, updated: d.updated, created: d.created, deleted: d.deleted };
    titleInput.value = d.title;
    document.title = d.title + ' — CloWord';
    settings = CW.normSettings(d.settings);
    const sel = keep ? saveSelPath() : null, sc = ws.scrollTop;
    deselectImage();
    ed.innerHTML = CW.sanitize(d.content) || '<p><br></p>';
    normalize();
    applyLayout();
    History.reset();
    if (keep) { ws.scrollTop = sc; restoreSelPath(sel); }
    queueLayout(); queueUI();
  }
  async function checkDraft(d) {
    let draft = null;
    try { draft = JSON.parse(lsGet(draftKey()) || 'null'); } catch (e) { /* ignore */ }
    if (!draft || !draft.content || draft.content === d.content || draft.at < d.updated * 1000 - 1000) { clearDraft(); return; }
    const ok = await modal({
      title: 'Найдены несохранённые изменения', width: '480px',
      body: h('p', { class: 'modal-text' }, `На этом устройстве есть изменения от ${new Date(draft.at).toLocaleString('ru-RU')}, которые не успели сохраниться в облако. Восстановить их?`),
      buttons: [{ label: 'Отбросить', value: false }, { label: 'Восстановить', primary: true, value: true }],
    });
    if (ok) {
      ed.innerHTML = CW.sanitize(draft.content) || '<p><br></p>';
      if (draft.title) titleInput.value = draft.title;
      if (draft.settings) { settings = CW.normSettings(draft.settings); applyLayout(); }
      History.record(); changed();
      toast('Изменения восстановлены', 'success');
    } else clearDraft();
  }

  // ================================================================ события редактора
  ed.addEventListener('beforeinput', e => {
    if (e.inputType === 'historyUndo') { e.preventDefault(); History.undo(); }
    else if (e.inputType === 'historyRedo') { e.preventDefault(); History.redo(); }
  });
  ed.addEventListener('input', e => {
    fixFontSizes();
    if (e.inputType === 'insertParagraph') afterEnter();
    normalize();
    History.schedule();
    changed();
  });
  function afterEnter() {
    const r = currentRange();
    if (!r) return;
    const b = closestBlock(r.startContainer);
    if (!b || b.textContent !== '') return;
    if (b.tagName === 'LI' && b.hasAttribute('data-checked')) { b.removeAttribute('data-checked'); return; }
    const special = /^H[1-6]$/.test(b.tagName) || [...b.classList].some(c => /^cw-(title|subtitle|quote|toc-)/.test(c));
    if (!special || b.tagName === 'LI') return;
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    b.replaceWith(p);
    setCaret(p, 0);
  }

  ed.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const li = closestTag('li'), cell = closestTag('td,th');
      if (li) run(() => exec(e.shiftKey ? 'outdent' : 'indent'));
      else if (cell) moveCell(cell, e.shiftKey ? -1 : 1);
      else if (!e.shiftKey) run(() => exec('insertText', '\t'));
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selImg) {
      e.preventDefault();
      const img = selImg;
      run(() => { deselectImage(); img.remove(); });
    }
    if (e.key === 'Control' || e.key === 'Meta') ed.classList.add('ctrl');
  });
  ed.addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') ed.classList.remove('ctrl'); });
  window.addEventListener('blur', () => ed.classList.remove('ctrl'));

  ed.addEventListener('click', e => {
    const t = e.target;
    const li = t.closest && t.closest('ul.cw-checklist > li');
    if (li && t === li) {
      const rect = li.getBoundingClientRect();
      if (e.clientX - rect.left < 18 * view.zoom / 100) { run(() => li.toggleAttribute('data-checked')); return; }
    }
    const a = t.closest && t.closest('a');
    if (a && (e.ctrlKey || e.metaKey || ed.contentEditable === 'false')) {
      e.preventDefault();
      followLink(a);
      return;
    }
    if (t.tagName === 'IMG') selectImage(t);
    else if (selImg) deselectImage();
  });
  function followLink(a) {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) {
      const target = document.getElementById(href.slice(1));
      if (target && ed.contains(target)) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (href) window.open(href, '_blank', 'noopener');
  }

  ed.addEventListener('paste', e => {
    const dt = e.clipboardData;
    if (!dt) return;
    const html = dt.getData('text/html');
    const imgs = [...dt.files].filter(f => f.type.startsWith('image/'));
    if (imgs.length && !html) { e.preventDefault(); insertImageFiles(imgs); return; }
    if (html) {
      e.preventDefault();
      const clean = CW.sanitize(html);
      if (clean) run(() => exec('insertHTML', clean));
      return;
    }
    const text = dt.getData('text/plain');
    if (text) { e.preventDefault(); run(() => insertPlainText(text)); }
  });
  function insertPlainText(t) {
    const lines = t.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length === 1) { exec('insertText', t); return; }
    exec('insertHTML', lines.map(l => `<p>${l ? escape(l) : '<br>'}</p>`).join(''));
  }
  ed.addEventListener('drop', e => {
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (pos && inEditor(pos.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(pos); savedRange = pos.cloneRange(); }
    insertImageFiles(files);
  });
  window.addEventListener('dragover', e => { if (!inEditor(e.target)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (!inEditor(e.target)) e.preventDefault(); });

  // ================================================================ форматирование текста
  let pendingSize = null;
  function setFontSize(pt) {
    if (!pt || isNaN(pt)) return;
    pt = Math.max(1, Math.min(400, Math.round(pt * 2) / 2));
    pendingSize = pt;
    $('#fontSize').value = fmtNum(pt);
    run(() => { exec('fontSize', '7'); fixFontSizes(); });
  }
  function fixFontSizes() {
    if (!pendingSize) return;
    ed.querySelectorAll('[style*="xxx-large"]').forEach(el => { el.style.fontSize = pendingSize + 'pt'; });
    ed.querySelectorAll('font[size="7"]').forEach(f => { f.removeAttribute('size'); f.style.fontSize = pendingSize + 'pt'; });
  }
  const fmtNum = v => String(Math.round(v * 2) / 2).replace('.', ',');
  function currentSize() { return parseFloat(String($('#fontSize').value).replace(',', '.')) || 11; }
  function stepSize(dir) {
    const cur = currentSize();
    const next = dir > 0 ? (SIZES.find(s => s > cur) ?? cur + 10) : ([...SIZES].reverse().find(s => s < cur) ?? Math.max(1, cur - 1));
    setFontSize(next);
  }
  function fontLabel(ff) {
    const first = String(ff || '').split(',')[0].replace(/["']/g, '').trim();
    return FONT_ALIAS[first] || first || 'Calibri';
  }

  let lastColor = '#c00000', lastHilite = '#ffff00';
  function applyColor(c) {
    lastColor = c; $('#colorSwatch').style.background = c;
    run(() => exec('foreColor', c));
  }
  function applyHilite(c) {
    if (c) { lastHilite = c; $('#hiliteSwatch').style.background = c; }
    run(() => exec('hiliteColor', c || 'transparent'));
  }

  function changeCase(mode) {
    const r = currentRange();
    if (!r || r.collapsed) { toast('Выделите текст'); return; }
    run(() => {
      const nodes = splitTextNodesInRange();
      if (!nodes.length) return;
      const up = c => { const u = c.toUpperCase(); return u.length === c.length ? u : c; };
      const low = c => { const l = c.toLowerCase(); return l.length === c.length ? l : c; };
      let start = true, prevLetter = false;
      for (const n of nodes) {
        let out = '';
        for (const ch of n.data) {
          const isL = ch.toLowerCase() !== ch.toUpperCase();
          let c = ch;
          if (mode === 'upper') c = up(ch);
          else if (mode === 'lower') c = low(ch);
          else if (mode === 'title') c = isL ? (prevLetter ? low(ch) : up(ch)) : ch;
          else if (mode === 'sentence') { if (isL) { c = start ? up(ch) : low(ch); start = false; } else if (/[.!?]/.test(ch)) start = true; }
          else if (mode === 'toggle') c = ch === up(ch) ? low(ch) : up(ch);
          prevLetter = isL || /[\d'’]/.test(ch);
          out += c;
        }
        n.data = out;
      }
      const nr = document.createRange();
      nr.setStart(nodes[0], 0); nr.setEnd(nodes[nodes.length - 1], nodes[nodes.length - 1].length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(nr);
    });
  }
  function splitTextNodesInRange() {
    const s = getSelection();
    if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    if (r.collapsed) return [];
    let sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    if (ec.nodeType === 3 && eo < ec.length) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0) {
      const nn = sc.splitText(so);
      if (ec === sc) { ec = nn; eo -= so; }
      sc = nn; so = 0;
    }
    const range = document.createRange();
    range.setStart(sc, so);
    range.setEnd(ec, ec.nodeType === 3 ? ec.length : eo);
    const out = [];
    const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.length && range.intersectsNode(n)) out.push(n);
    return out;
  }

  function clearFormatting() {
    run(() => {
      exec('removeFormat');
      const blocks = selectedBlocks();
      preserveSel(map => {
        for (const b of blocks) {
          b.removeAttribute('style');
          if (/^H[1-6]$/.test(b.tagName) || [...b.classList].some(c => /^cw-(title|subtitle|quote|code|nospace)$/.test(c))) {
            const p = document.createElement('p');
            p.append(...b.childNodes);
            b.replaceWith(p);
            map.set(b, p);
          }
        }
      });
    });
  }

  function setBlockStyle(st) {
    run(() => {
      const blocks = selectedBlocks();
      preserveSel(map => {
        for (const b of blocks) {
          if (b.matches('li,td,th')) {
            if (st.id === 'normal') continue;
            const n = document.createElement(st.tag);
            if (st.cls) n.className = st.cls;
            n.append(...b.childNodes);
            b.append(n);
            continue;
          }
          const n = document.createElement(st.tag);
          if (st.cls) n.className = st.cls;
          const style = b.getAttribute('style');
          if (style) n.setAttribute('style', style);
          if (b.id) n.id = b.id;
          n.append(...b.childNodes);
          b.replaceWith(n);
          map.set(b, n);
        }
      });
    });
  }
  function setBlocks(styles) {
    run(() => { for (const b of selectedBlocks()) Object.assign(b.style, styles); });
  }
  function indent(dir) {
    run(() => {
      if (closestTag('li')) { exec(dir > 0 ? 'indent' : 'outdent'); return; }
      for (const b of selectedBlocks()) {
        if (b.matches('td,th')) continue;
        const cm = (parseFloat(getComputedStyle(b).marginLeft) || 0) / (MM * 10);
        const v = Math.max(0, Math.round((cm + dir * 1.25) / 1.25) * 1.25);
        b.style.marginLeft = v ? v + 'cm' : '';
      }
    });
  }
  function toggleChecklist() {
    run(() => {
      const ul = closestTag('ul');
      if (ul && ul.classList.contains('cw-checklist')) { exec('insertUnorderedList'); return; }
      if (!ul) exec('insertUnorderedList');
      const u = closestTag('ul');
      if (u) u.classList.add('cw-checklist');
    });
  }
  function handleCmd(c) {
    if (c === 'insertUnorderedList') {
      const ul = closestTag('ul');
      if (ul && ul.classList.contains('cw-checklist')) { run(() => ul.classList.remove('cw-checklist')); return; }
    }
    cmd(c);
  }

  // формат по образцу
  let painter = null;
  function togglePainter() {
    if (painter) { painter = null; ed.classList.remove('painting'); queueUI(); return; }
    const el = anchorEl();
    if (!el) { toast('Поставьте курсор в текст-образец'); return; }
    const cs = getComputedStyle(el);
    let bg = null;
    for (let n = el; n && n !== ed && !n.matches(BLOCK_SEL); n = n.parentElement) { if (n.style?.backgroundColor) { bg = n.style.backgroundColor; break; } }
    painter = {
      font: cs.fontFamily, size: parseFloat(cs.fontSize) * 0.75, color: cs.color, bg,
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'), strike: document.queryCommandState('strikeThrough'),
    };
    ed.classList.add('painting');
    toast('Выделите текст, к которому применить формат');
    queueUI();
  }
  function applyPainter() {
    const r = currentRange();
    if (!painter || !r || r.collapsed) return;
    const p = painter;
    painter = null; ed.classList.remove('painting');
    run(() => {
      exec('removeFormat');
      exec('fontName', p.font);
      pendingSize = Math.round(p.size * 2) / 2; exec('fontSize', '7'); fixFontSizes();
      if (p.bold) exec('bold');
      if (p.italic) exec('italic');
      if (p.underline) exec('underline');
      if (p.strike) exec('strikeThrough');
      exec('foreColor', p.color);
      if (p.bg) exec('hiliteColor', p.bg);
    });
  }
  ed.addEventListener('mouseup', () => { if (painter) setTimeout(applyPainter, 0); });
  ed.addEventListener('touchend', () => { if (painter) setTimeout(applyPainter, 300); });

  // ================================================================ вставка объектов
  function insertHTML(html) { run(() => exec('insertHTML', html)); }
  function insertPageBreak() { insertHTML('<div class="page-break" contenteditable="false"></div><p><br></p>'); }
  function tableHTML(rows, cols) {
    let html = '<table class="cw-table" style="width: 100%"><tbody>';
    for (let r = 0; r < rows; r++) html += '<tr>' + '<td><br></td>'.repeat(cols) + '</tr>';
    return html + '</tbody></table><p><br></p>';
  }
  function contentWidthPx() {
    const { w } = CW.pageDims(settings);
    const m = settings.margins;
    return (w - m.left - m.right) * MM / (settings.columns || 1);
  }
  const loadImg = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  const readAsDataURL = f => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(f); });
  async function prepareImage(file) {
    const url = await readAsDataURL(file);
    if (/gif|svg/.test(file.type)) return url;
    const img = await loadImg(url);
    const max = 1800;
    if (img.naturalWidth <= max && file.size < 900_000) return url;
    const k = Math.min(1, max / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    const png = file.type === 'image/png';
    let out = '';
    if (png) { ctx.drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL('image/png'); }
    if (!png || out.length > 2e6) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL('image/jpeg', 0.88); }
    return out;
  }
  async function insertImageFiles(files) {
    let html = '';
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        const url = await prepareImage(f);
        const img = await loadImg(url);
        const w = Math.min(img.naturalWidth, contentWidthPx());
        html += `<img src="${url}" alt="${escape(f.name.replace(/\.[^.]+$/, ''))}" style="width: ${Math.round(w)}px">`;
      } catch (e) { toast(`Не удалось вставить «${f.name}»`, 'error'); }
    }
    if (html) insertHTML(html);
  }
  async function insertImageUrl() {
    const url = await prompt('Рисунок из интернета', 'Адрес изображения (https://…)', '', 'Вставить');
    if (!url) return;
    if (!/^https?:\/\//i.test(url.trim())) { toast('Нужна ссылка, начинающаяся с https://', 'error'); return; }
    try {
      const img = await loadImg(url.trim());
      const w = Math.min(img.naturalWidth, contentWidthPx());
      insertHTML(`<img src="${escape(url.trim())}" alt="" style="width: ${Math.round(w)}px">`);
    } catch (e) { toast('Не удалось загрузить изображение по ссылке', 'error'); }
  }
  function normUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:|#)/i.test(u)) return u;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u)) return 'mailto:' + u;
    return 'https://' + u;
  }
  async function linkDialog(existing) {
    const r = currentRange();
    const a = existing || closestTag('a');
    const selText = a ? a.textContent : (r && !r.collapsed ? r.toString() : '');
    const res = await modal({
      title: a ? 'Изменить ссылку' : 'Вставить ссылку', width: '460px',
      body: h('div', {},
        h('label', { class: 'field' }, h('span', {}, 'Текст'), h('input', { class: 'input', name: 'text', value: selText, placeholder: 'Текст ссылки' })),
        h('label', { class: 'field' }, h('span', {}, 'Адрес'), h('input', { class: 'input', name: 'url', value: a ? a.getAttribute('href') : '', placeholder: 'https://example.com или e-mail' }))),
      buttons: [
        ...(a ? [{ label: 'Удалить ссылку', value: 'unlink', left: true }] : []),
        { label: 'Отмена', value: null },
        { label: 'OK', primary: true, value: c => ({ text: c.querySelector('[name=text]').value, url: c.querySelector('[name=url]').value }) },
      ],
      onOpen: Object.assign(c => setTimeout(() => c.querySelector(selText ? '[name=url]' : '[name=text]').focus(), 60), { noFocus: true }),
    });
    if (!res) return;
    if (res === 'unlink') { run(() => a.replaceWith(...a.childNodes)); return; }
    const url = normUrl(res.url);
    if (!url) return;
    run(() => {
      if (a) {
        a.setAttribute('href', url);
        if (res.text && res.text !== a.textContent) a.textContent = res.text;
        return;
      }
      if (r && !r.collapsed && (!res.text || res.text === selText)) {
        exec('createLink', url);
      } else {
        exec('insertHTML', `<a href="${escape(url)}">${escape(res.text || url)}</a>\u00a0`);
      }
      ed.querySelectorAll('a').forEach(x => {
        if ((x.getAttribute('href') || '').startsWith('#')) return;
        x.target = '_blank'; x.rel = 'noopener noreferrer';
      });
    });
  }
  function buildToc() {
    const hs = [...ed.querySelectorAll('h1,h2,h3')].filter(x => !x.closest('.cw-toc') && x.textContent.trim());
    if (!hs.length) return null;
    let html = '<div class="cw-toc"><p class="cw-toc-title">Оглавление</p>';
    for (const hd of hs) {
      if (!hd.id) hd.id = 'h-' + Math.random().toString(36).slice(2, 9);
      html += `<p class="cw-toc-${hd.tagName[1]}"><a href="#${hd.id}">${escape(hd.textContent.trim())}</a></p>`;
    }
    return html + '</div>';
  }
  function insertToc() {
    if (![...ed.querySelectorAll('h1,h2,h3')].some(x => !x.closest('.cw-toc') && x.textContent.trim())) {
      toast('Сначала оформите заголовки стилями «Заголовок 1–3»', 'info', 4000);
      return;
    }
    run(() => {
      const existing = ed.querySelector('.cw-toc');
      const html = buildToc();
      if (existing) {
        const t = document.createElement('div'); t.innerHTML = html;
        existing.replaceWith(t.firstChild);
        toast('Оглавление обновлено', 'success');
      } else exec('insertHTML', html + '<p><br></p>');
    });
  }

  // ================================================================ таблицы
  function currentCell() { return closestTag('td,th'); }
  function moveCell(cell, dir) {
    const table = cell.closest('table');
    const cells = [...table.querySelectorAll('td,th')].filter(c => c.closest('table') === table);
    let i = cells.indexOf(cell) + dir;
    if (i >= cells.length) { tableOp('rowBelow'); return moveCell(cell, dir); }
    if (i < 0) return;
    const target = cells[i];
    const r = document.createRange(); r.selectNodeContents(target);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function tableOp(op) {
    const cell = currentCell();
    if (!cell) return;
    run(() => {
      const row = cell.parentElement, table = cell.closest('table');
      const ci = [...row.cells].indexOf(cell);
      const newCell = like => {
        const c = document.createElement(like?.tagName === 'TH' ? 'th' : 'td');
        c.innerHTML = '<br>';
        const st = like?.getAttribute('style');
        if (st) c.setAttribute('style', st);
        return c;
      };
      let caret = null;
      switch (op) {
        case 'rowAbove': case 'rowBelow': {
          const nr = document.createElement('tr');
          for (const c of row.cells) { const n = newCell(c); if (c.colSpan > 1) n.colSpan = c.colSpan; nr.append(n); }
          op === 'rowAbove' ? row.before(nr) : row.after(nr);
          caret = nr.cells[Math.max(0, ci)] || nr.cells[0];
          break;
        }
        case 'colLeft': case 'colRight':
          for (const tr of table.rows) {
            const ref = tr.cells[Math.min(ci, tr.cells.length - 1)];
            if (!ref) continue;
            const n = newCell(ref);
            op === 'colLeft' ? ref.before(n) : ref.after(n);
            if (tr === row) caret = n;
          }
          break;
        case 'delRow': {
          const other = row.nextElementSibling || row.previousElementSibling;
          row.remove();
          if (!table.rows.length) { caret = replaceWithP(table); } else caret = other?.cells[Math.min(ci, other.cells.length - 1)];
          break;
        }
        case 'delCol':
          for (const tr of [...table.rows]) {
            const c = tr.cells[ci];
            if (c) { if (c.colSpan > 1) c.colSpan--; else c.remove(); }
            if (!tr.cells.length) tr.remove();
          }
          caret = table.rows.length ? row.cells[Math.min(ci, row.cells.length - 1)] || table.rows[0].cells[0] : replaceWithP(table);
          break;
        case 'delTable': caret = replaceWithP(table); break;
        case 'merge': {
          const next = cell.nextElementSibling;
          if (!next) { toast('Справа нет ячейки для объединения'); break; }
          if (next.textContent.trim() || next.querySelector('img')) { cell.append(' ', ...next.childNodes); }
          cell.colSpan = (cell.colSpan || 1) + (next.colSpan || 1);
          next.remove();
          caret = cell;
          break;
        }
      }
      if (caret && ed.contains(caret)) setCaret(caret, 0);
    });
    function replaceWithP(t) { const p = document.createElement('p'); p.innerHTML = '<br>'; t.replaceWith(p); return p; }
  }
  function setTableStyle(cls) {
    const t = closestTag('table');
    if (t) run(() => { t.className = cls; });
  }

  // ================================================================ рисунки
  let selImg = null;
  const handle = $('#imgHandle');
  function selectImage(img) {
    if (selImg && selImg !== img) selImg.classList.remove('is-selected');
    selImg = img;
    img.classList.add('is-selected');
    const r = document.createRange(); r.selectNode(img);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    savedRange = r.cloneRange();
    positionImgHandle(); queueUI();
  }
  function deselectImage() {
    if (!selImg) return;
    selImg.classList.remove('is-selected');
    if (!selImg.className) selImg.removeAttribute('class');
    selImg = null; handle.hidden = true; queueUI();
  }
  function positionImgHandle() {
    if (!selImg || !ed.contains(selImg) || view.mode === 'read') { handle.hidden = true; return; }
    const r = selImg.getBoundingClientRect();
    const wr = ws.getBoundingClientRect();
    if (r.bottom < wr.top || r.bottom > wr.bottom) { handle.hidden = true; return; }
    handle.hidden = false;
    handle.style.left = (r.right - 8) + 'px';
    handle.style.top = (r.bottom - 8) + 'px';
  }
  ws.addEventListener('scroll', () => { positionImgHandle(); }, { passive: true });
  window.addEventListener('resize', () => { positionImgHandle(); if (view.autoFit) fitWidth(); });
  handle.addEventListener('pointerdown', e => {
    if (!selImg) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const img = selImg, z = view.zoom / 100, startX = e.clientX;
    const startW = img.getBoundingClientRect().width / z;
    const maxW = contentWidthPx();
    History.flush();
    const move = ev => {
      img.style.width = Math.round(Math.max(24, Math.min(maxW, startW + (ev.clientX - startX) / z))) + 'px';
      img.style.height = 'auto';
      positionImgHandle();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      History.record(); changed();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  function imgOp(op, val) {
    const img = selImg;
    if (!img) return;
    run(() => {
      const block = closestBlock(img);
      switch (op) {
        case 'width': img.style.width = val; img.style.height = 'auto'; break;
        case 'inline': img.style.float = ''; img.style.margin = ''; img.style.display = ''; if (block) block.style.textAlign = ''; break;
        case 'center': img.style.float = ''; img.style.margin = ''; img.style.display = ''; if (block) block.style.textAlign = 'center'; break;
        case 'left': img.style.float = 'left'; img.style.margin = '0 12px 8px 0'; break;
        case 'right': img.style.float = 'right'; img.style.margin = '0 0 8px 12px'; break;
        case 'delete': deselectImage(); img.remove(); break;
      }
      if (!img.getAttribute('style')) img.removeAttribute('style');
    });
    if (op !== 'delete' && ed.contains(img)) selectImage(img);
  }

  // ================================================================ страница и макет
  function applyLayout() {
    const { w, h: ph } = CW.pageDims(settings);
    const m = settings.margins;
    const st = sheet.style;
    st.setProperty('--page-w', w + 'mm'); st.setProperty('--page-h', ph + 'mm');
    st.setProperty('--mt', m.top + 'mm'); st.setProperty('--mr', m.right + 'mm');
    st.setProperty('--mb', m.bottom + 'mm'); st.setProperty('--ml', m.left + 'mm');
    st.setProperty('--paper', settings.pageColor || '#fff');
    ed.style.columnCount = settings.columns > 1 ? settings.columns : '';
    ed.style.columnGap = settings.columns > 1 ? '1.25cm' : '';
    renderHF();
    $('#pageStyle').textContent = pageCss();
    if (view.autoFit) fitWidth();
    queueLayout();
  }
  const cssStr = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';
  function pageCss() {
    const { w, h: ph } = CW.pageDims(settings);
    const m = settings.margins;
    const boxes = {};
    const add = (pos, c) => { boxes[pos] = boxes[pos] ? boxes[pos] + ' "   " ' + c : c; };
    if (settings.header) add('top-center', cssStr(settings.header));
    if (settings.footer) add('bottom-center', cssStr(settings.footer));
    if (settings.pageNumbers && settings.pageNumbers !== 'none') add(settings.pageNumbers, 'counter(page)');
    let inner = '';
    for (const [pos, c] of Object.entries(boxes)) inner += `@${pos}{content:${c};font:10pt Calibri,Carlito,Arial,sans-serif;color:#555;}`;
    return `@page{size:${w}mm ${ph}mm;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;${inner}}`;
  }
  function renderHF() {
    const pn = settings.pageNumbers || 'none';
    for (const [el, text, pos, ph] of [[$('#hfTop'), settings.header, 'top', 'Верхний колонтитул'], [$('#hfBottom'), settings.footer, 'bottom', 'Нижний колонтитул']]) {
      el.innerHTML = '';
      el.dataset.ph = ph;
      if (text) el.append(h('span', { class: 'hf-text' }, text));
      if (pn.startsWith(pos)) el.append(h('span', { class: 'hf-num ' + pn.split('-')[1] }, '1'));
    }
  }

  // разметка страниц: пунктир там, где при печати начнётся новая страница
  let totalPages = 1, pageMarksY = [];
  function updatePages() {
    const marks = $('#pageMarks');
    const area = $('#pageProbe').offsetHeight;
    if (view.mode === 'web' || !area) {
      marks.innerHTML = ''; sheet.style.minHeight = '';
      totalPages = Math.max(1, Math.ceil(ed.offsetHeight / (area || 1000)));
      pageMarksY = [];
      updatePageStatus();
      return;
    }
    const H = ed.offsetHeight;
    const breaks = [...ed.children].filter(c => c.classList.contains('page-break'));
    const pts = breaks.map(b => [b.offsetTop, b.offsetTop + b.offsetHeight]);
    pts.push([H, H]);
    let segStart = 0, pages = 0;
    const list = [];
    for (const [top, bottom] of pts) {
      const n = Math.max(1, Math.ceil((top - segStart) / area - 0.01));
      for (let k = 1; k < n; k++) list.push({ y: segStart + k * area, page: pages + k + 1 });
      pages += n;
      segStart = bottom;
    }
    totalPages = pages;
    pageMarksY = list.map(x => x.y);
    const areaCss = '(var(--page-h) - var(--mt) - var(--mb))';
    marks.innerHTML = list.map(x => `<div class="page-mark" style="top: calc(var(--mt) + ${(x.y / area).toFixed(4)} * ${areaCss})"><span>стр. ${x.page}</span></div>`).join('');
    sheet.style.minHeight = `calc(var(--mt) + var(--mb) + ${pages} * ${areaCss})`;
    updatePageStatus();
  }
  function updatePageStatus() {
    let cur = 1;
    const r = currentRange();
    if (r && pageMarksY.length) {
      const rect = (r.getClientRects()[0] || (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).getBoundingClientRect());
      const er = ed.getBoundingClientRect();
      const scale = ed.offsetHeight / (er.height || 1);
      const y = (rect.top - er.top) * scale;
      const breaksBefore = [...ed.children].filter(c => c.classList.contains('page-break') && c.offsetTop < y).length;
      cur = 1 + pageMarksY.filter(m => m <= y).length + breaksBefore;
    } else if (r) {
      const rect = r.getClientRects()[0];
      if (rect) {
        const y = rect.top - ed.getBoundingClientRect().top;
        cur = 1 + [...ed.children].filter(c => c.classList.contains('page-break') && c.getBoundingClientRect().top - ed.getBoundingClientRect().top < y).length;
      }
    }
    $('#stPage').textContent = `Страница ${Math.min(cur, totalPages)} из ${totalPages}`;
  }
  const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
  function textStats() {
    const text = ed.innerText.replace(/\u200b/g, '');
    const words = (text.match(WORD_RE) || []).length;
    const chars = text.replace(/\n/g, '').length;
    const charsNoSp = text.replace(/\s/g, '').length;
    const paras = [...ed.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,blockquote')].filter(p => p.textContent.trim() && !p.querySelector('p,li')).length;
    return { words, chars, charsNoSp, paras };
  }
  function updateStats() {
    const s = textStats();
    $('#stWords').textContent = `${nf(s.words)} ${plural(s.words, 'слово', 'слова', 'слов')}`;
  }
  let layoutTimer = null;
  function queueLayout() {
    if (layoutTimer) return;
    layoutTimer = setTimeout(() => { layoutTimer = null; updatePages(); updateStats(); positionImgHandle(); }, 160);
  }

  // ================================================================ состояние ленты
  let uiQueued = false;
  function queueUI() { if (!uiQueued) { uiQueued = true; requestAnimationFrame(updateUI); } }
  function updateUI() {
    uiQueued = false;
    const r = currentRange();
    for (const b of $$('[data-cmd]')) {
      let on = false;
      if (r) { try { on = document.queryCommandState(b.dataset.cmd); } catch (e) { /* ignore */ } }
      b.classList.toggle('active', on);
    }
    const el = anchorEl();
    if (el) {
      const cs = getComputedStyle(el);
      $('#fontName').textContent = fontLabel(cs.fontFamily);
      if (document.activeElement !== $('#fontSize')) $('#fontSize').value = fmtNum(parseFloat(cs.fontSize) * 0.75);
      const b = closestBlock(el);
      const sid = b ? styleIdOf(b) : 'normal';
      $$('.style-item').forEach(x => x.classList.toggle('active', x.dataset.style === sid));
      const ul = el.closest('ul');
      $$('[data-a="checklist"]').forEach(x => x.classList.toggle('active', !!ul && ul.classList.contains('cw-checklist') && inEditor(ul)));
      if (ul && ul.classList.contains('cw-checklist')) $$('[data-cmd="insertUnorderedList"]').forEach(x => x.classList.remove('active'));
    }
    $$('[data-a="painter"]').forEach(x => x.classList.toggle('active', !!painter));
    $$('[data-a="marks"]').forEach(x => x.classList.toggle('active', ed.classList.contains('show-marks')));
    $$('[data-a="darkpaper"]').forEach(x => x.classList.toggle('active', document.body.classList.contains('dark-paper')));
    $('#spellBtn').classList.toggle('active', ed.spellcheck);
    $$('[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === view.mode));
    updateCtx(el);
    updatePageStatus();
  }
  function styleIdOf(b) {
    const tag = b.tagName.toLowerCase();
    for (const st of STYLES) {
      if (st.tag === tag && (st.cls ? b.classList.contains(st.cls) : !STYLES.some(o => o.cls && b.classList.contains(o.cls)))) return st.id;
    }
    return '';
  }

  // контекстная панель
  let ctxType = '', ctxTarget = null;
  function updateCtx(el) {
    let type = '', target = null;
    if (selImg && ed.contains(selImg)) { type = 'img'; target = selImg; }
    else if (el) {
      const a = el.closest('a'), cell = el.closest('td,th');
      if (a && inEditor(a)) { type = 'link'; target = a; }
      else if (cell && inEditor(cell)) { type = 'table'; target = cell.closest('table'); }
    }
    if (type === ctxType && target === ctxTarget) return;
    ctxType = type; ctxTarget = target;
    const bar = $('#ctxBar');
    bar.innerHTML = '';
    bar.hidden = !type;
    if (!type) return;
    const btn = (ic, label, fn, title) => h('button', { class: 'rb-txt', type: 'button', title: title || label, onclick: fn, html: icon(ic, 16) + (label ? `<span class="hide-xs">${escape(label)}</span>` : '') });
    const sep = () => h('span', { class: 'sep' });
    if (type === 'table') {
      bar.append(h('span', { class: 'ctx-title' }, 'Таблица'),
        btn('rowAbove', 'Строка выше', () => tableOp('rowAbove')), btn('rowBelow', 'Строка ниже', () => tableOp('rowBelow')),
        btn('colLeft', 'Столбец слева', () => tableOp('colLeft')), btn('colRight', 'Столбец справа', () => tableOp('colRight')), sep(),
        btn('merge', 'Объединить', () => tableOp('merge'), 'Объединить с ячейкой справа'),
        btn('bucket', 'Заливка', e => colorPalette(e.currentTarget, {
          title: 'Заливка ячейки', noneLabel: 'Нет заливки',
          onPick: c => { const cell = currentCell(); if (cell) run(() => { cell.style.backgroundColor = c || ''; }); },
        })),
        btn('grid', 'Стиль', e => menu(e.currentTarget, [
          { label: 'Сетка таблицы', checked: !ctxTarget.className || ctxTarget.classList.contains('cw-table'), onClick: () => setTableStyle('cw-table') },
          { label: 'Без границ', checked: ctxTarget.classList.contains('cw-table-plain'), onClick: () => setTableStyle('cw-table-plain') },
          { label: 'Цветная с заголовком', checked: ctxTarget.classList.contains('cw-table-accent'), onClick: () => setTableStyle('cw-table-accent') },
        ])), sep(),
        btn('delRow', 'Удалить строку', () => tableOp('delRow')), btn('x', 'Удалить столбец', () => tableOp('delCol')),
        btn('trash', 'Удалить таблицу', () => tableOp('delTable')));
    } else if (type === 'img') {
      bar.append(h('span', { class: 'ctx-title' }, 'Рисунок'),
        ...['25%', '50%', '75%', '100%'].map(v => h('button', { class: 'rb-txt', type: 'button', onclick: () => imgOp('width', v) }, v)), sep(),
        btn('inline', 'В тексте', () => imgOp('inline')), btn('wrapCenter', 'По центру', () => imgOp('center')),
        btn('wrapLeft', 'Обтекание слева', () => imgOp('left')), btn('wrapRight', 'Обтекание справа', () => imgOp('right')), sep(),
        btn('edit', 'Описание', async () => {
          const img = selImg;
          const t = await prompt('Замещающий текст', 'Описание рисунка', img.alt || '', 'Сохранить');
          if (t != null) run(() => { img.alt = t; });
        }),
        btn('trash', 'Удалить', () => imgOp('delete')));
    } else if (type === 'link') {
      const a = target;
      bar.append(h('span', { class: 'ctx-title' }, 'Ссылка'),
        h('span', { class: 'ctx-link', title: a.getAttribute('href') }, a.getAttribute('href')),
        btn('external', 'Открыть', () => followLink(a)), btn('edit', 'Изменить', () => linkDialog(a)),
        btn('unlink', 'Удалить ссылку', () => run(() => a.replaceWith(...a.childNodes))));
    }
  }

  // ================================================================ палитры и всплывающие панели
  const THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
  const STANDARD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
  const HILITE = ['#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#0000FF', '#FF0000', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#C0C0C0', '#000000'];
  function mix(hex, to, t) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const ch = (x, s) => (x >> s) & 255;
    const m = s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
    return '#' + [16, 8, 0].map(s => m(s).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function colorPalette(anchor, { title, onPick, autoLabel, noneLabel, hilite }) {
    const wrap = h('div', { class: 'palette' });
    const sw = c => h('button', { type: 'button', title: c, style: { background: c }, onclick: () => { closeMenu(); onPick(c); } });
    if (hilite) {
      wrap.append(h('div', { class: 'pal-head' }, title), h('div', { class: 'pal-grid' }, HILITE.map(sw)));
    } else {
      wrap.append(h('div', { class: 'pal-head' }, title || 'Цвета темы'));
      const grid = h('div', { class: 'pal-grid' });
      THEME.forEach(c => grid.append(sw(c)));
      const steps = [[0.8, '#FFFFFF'], [0.6, '#FFFFFF'], [0.4, '#FFFFFF'], [0.25, '#000000'], [0.5, '#000000']];
      for (const [t, to] of steps) THEME.forEach(c => {
        let v;
        if (c === '#FFFFFF') v = mix(c, '#000000', { 0.8: 0.05, 0.6: 0.15, 0.4: 0.25, 0.25: 0.35, 0.5: 0.5 }[t]);
        else if (c === '#000000') v = mix(c, '#FFFFFF', { 0.8: 0.5, 0.6: 0.35, 0.4: 0.25, 0.25: 0.15, 0.5: 0.05 }[t]);
        else v = mix(c, to, t);
        grid.append(sw(v));
      });
      wrap.append(grid, h('div', { class: 'pal-head' }, 'Стандартные цвета'), h('div', { class: 'pal-grid' }, STANDARD.map(sw)));
    }
    const actions = h('div', { class: 'pal-actions' });
    if (autoLabel) actions.append(h('button', { type: 'button', onclick: () => { closeMenu(); onPick('#000000'); } }, h('span', { class: 'swatch-inline', style: { width: '18px', height: '18px', borderRadius: '4px', background: '#000' } }), autoLabel));
    if (noneLabel) actions.append(h('button', { type: 'button', onclick: () => { closeMenu(); onPick(''); } }, h('span', { class: 'no-color' }), noneLabel));
    if (!hilite) {
      const inp = h('input', { type: 'color', value: '#4c62f5' });
      inp.addEventListener('change', () => { closeMenu(); onPick(inp.value); });
      actions.append(h('label', {}, inp, 'Другие цвета…'));
    }
    wrap.append(actions);
    popup(anchor, wrap);
  }
  function tableGrid(anchor) {
    const wrap = h('div', { class: 'tgrid' });
    const label = h('div', { class: 'tgrid-label' }, 'Вставка таблицы');
    const cells = h('div', { class: 'tgrid-cells' });
    const R = 8, C = 10;
    for (let r = 1; r <= R; r++) for (let c = 1; c <= C; c++) {
      cells.append(h('i', {
        'data-r': r, 'data-c': c,
        onmouseenter: () => {
          label.textContent = `Таблица ${c} × ${r}`;
          cells.querySelectorAll('i').forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c));
        },
        onclick: () => { closeMenu(); insertHTML(tableHTML(r, c)); },
      }));
    }
    const more = h('button', { class: 'menu-item', type: 'button', html: icon('table', 16) + 'Вставить таблицу…', onclick: async () => {
      closeMenu();
      const res = await modal({
        title: 'Вставка таблицы', width: '380px',
        body: h('div', { class: 'field-row' },
          h('label', { class: 'field' }, h('span', {}, 'Число столбцов'), h('input', { class: 'input', type: 'number', min: '1', max: '30', value: '3', name: 'c' })),
          h('label', { class: 'field' }, h('span', {}, 'Число строк'), h('input', { class: 'input', type: 'number', min: '1', max: '200', value: '3', name: 'r' }))),
        buttons: [{ label: 'Отмена', value: null }, { label: 'Вставить', primary: true, value: c => [+c.querySelector('[name=r]').value, +c.querySelector('[name=c]').value] }],
      });
      if (res && res[0] > 0 && res[1] > 0) insertHTML(tableHTML(Math.min(200, res[0]), Math.min(30, res[1])));
    } });
    wrap.append(label, cells, h('div', { class: 'menu-sep' }), more);
    popup(anchor, wrap);
  }
  const SYMBOLS = '© ® ™ § ¶ † ‡ • · … — – « » „ “ ” ‘ ’ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ ∏ π Ω α β γ δ ε λ μ σ φ ω € £ ¥ ₽ $ ¢ ← → ↑ ↓ ↔ ⇒ ⇔ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ ☐ ☑ № ½ ¼ ¾ ² ³ ¹ ‰ ∆ ∂ ∫ ∈ ∉ ∩ ∪ ⊂ ⊃ ∀ ∃ ¬ ∧ ∨ ∅ ∇ ℃ ☺ ☎ ✉ ✂ ✎ ⚠'.split(' ');
  function symbolPopup(anchor) {
    const grid = h('div', { class: 'sym-grid' }, SYMBOLS.map(s => h('button', { type: 'button', title: s, onclick: () => { closeMenu(); run(() => exec('insertText', s)); } }, s)));
    popup(anchor, grid);
  }
  function dateMenu(anchor) {
    const d = new Date();
    const opts = [
      d.toLocaleDateString('ru-RU'),
      d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
      d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      d.toISOString().slice(0, 10),
    ];
    menu(anchor, opts.map(o => ({ label: o, onClick: () => run(() => exec('insertText', o)) })));
  }

  // ================================================================ диалоги
  async function paragraphDialog() {
    const blocks = selectedBlocks();
    const b = blocks[0];
    if (!b) return;
    const cs = getComputedStyle(b);
    const fs = parseFloat(cs.fontSize) || 14.67;
    const toCm = px => +((parseFloat(px) || 0) / (MM * 10)).toFixed(2);
    const toPt = px => Math.round((parseFloat(px) || 0) * 0.75 * 10) / 10;
    const inlineLH = b.style.lineHeight;
    const lh = /^[\d.]+$/.test(inlineLH) ? +inlineLH : cs.lineHeight === 'normal' ? 1.15 : +(parseFloat(cs.lineHeight) / fs).toFixed(2);
    const ti = toCm(cs.textIndent);
    const num = (name, value, step, min = 0) => h('input', { class: 'input', type: 'number', name, value: String(value), step, min: String(min) });
    const align = h('select', { class: 'input', name: 'align' },
      ...[['left', 'По левому краю'], ['center', 'По центру'], ['right', 'По правому краю'], ['justify', 'По ширине']].map(([v, l]) => h('option', { value: v }, l)));
    align.value = /center|right|justify/.test(cs.textAlign) ? cs.textAlign : 'left';
    const first = h('select', { class: 'input', name: 'first' }, h('option', { value: 'none' }, '(нет)'), h('option', { value: 'indent' }, 'Отступ'), h('option', { value: 'hang' }, 'Выступ'));
    first.value = ti > 0 ? 'indent' : ti < 0 ? 'hang' : 'none';
    const body = h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Выравнивание'), align),
      h('div', { class: 'field-row' },
        h('label', { class: 'field' }, h('span', {}, 'Отступ слева, см'), num('left', toCm(cs.marginLeft), '0.25')),
        h('label', { class: 'field' }, h('span', {}, 'Отступ справа, см'), num('right', toCm(cs.marginRight), '0.25'))),
      h('div', { class: 'field-row' },
        h('label', { class: 'field' }, h('span', {}, 'Первая строка'), first),
        h('label', { class: 'field' }, h('span', {}, 'на, см'), num('firstVal', Math.abs(ti) || 1.25, '0.25'))),
      h('div', { class: 'field-row' },
        h('label', { class: 'field' }, h('span', {}, 'Интервал перед, пт'), num('before', toPt(cs.marginTop), '1')),
        h('label', { class: 'field' }, h('span', {}, 'Интервал после, пт'), num('after', toPt(cs.marginBottom), '1')),
        h('label', { class: 'field' }, h('span', {}, 'Междустрочный'), num('line', lh, '0.05', 0.5))));
    const res = await modal({
      title: 'Абзац', width: '520px', body,
      buttons: [{ label: 'Отмена', value: null }, { label: 'Применить', primary: true, value: c => Object.fromEntries(new FormData(wrapForm(c))) }],
    });
    if (!res) return;
    const f = v => parseFloat(String(v).replace(',', '.')) || 0;
    const firstVal = f(res.firstVal);
    run(() => {
      for (const blk of blocks) {
        Object.assign(blk.style, {
          textAlign: res.align === 'left' ? '' : res.align,
          marginLeft: f(res.left) ? f(res.left) + 'cm' : '',
          marginRight: f(res.right) ? f(res.right) + 'cm' : '',
          textIndent: res.first === 'indent' ? firstVal + 'cm' : res.first === 'hang' ? -firstVal + 'cm' : '',
          marginTop: f(res.before) + 'pt',
          marginBottom: f(res.after) + 'pt',
          lineHeight: String(Math.max(0.5, f(res.line) || 1.15)),
        });
        if (res.first === 'hang' && !f(res.left)) blk.style.marginLeft = firstVal + 'cm';
      }
    });
  }
  function wrapForm(c) { const f = document.createElement('form'); f.append(...c.childNodes); c.append(f); return f; }

  async function headerFooterDialog() {
    const sel = h('select', { class: 'input', name: 'pn' },
      ...[['none', 'Нет'], ['bottom-center', 'Внизу по центру'], ['bottom-right', 'Внизу справа'], ['bottom-left', 'Внизу слева'],
        ['top-right', 'Вверху справа'], ['top-center', 'Вверху по центру']].map(([v, l]) => h('option', { value: v }, l)));
    sel.value = settings.pageNumbers || 'none';
    const res = await modal({
      title: 'Колонтитулы и номера страниц', width: '500px',
      body: h('div', {},
        h('label', { class: 'field' }, h('span', {}, 'Верхний колонтитул'), h('input', { class: 'input', name: 'header', value: settings.header || '', placeholder: 'Например: название документа' })),
        h('label', { class: 'field' }, h('span', {}, 'Нижний колонтитул'), h('input', { class: 'input', name: 'footer', value: settings.footer || '', placeholder: 'Например: © Компания' })),
        h('label', { class: 'field' }, h('span', {}, 'Номер страницы'), sel),
        h('p', { class: 'modal-text', style: { fontSize: '12.5px' } }, 'Колонтитулы и нумерация появляются на каждой странице при печати, сохранении в PDF и в файле .docx.')),
      buttons: [{ label: 'Отмена', value: null }, { label: 'Сохранить', primary: true, value: c => ({ header: c.querySelector('[name=header]').value, footer: c.querySelector('[name=footer]').value, pn: sel.value }) }],
    });
    if (!res) return;
    updateSettings({ header: res.header.trim(), footer: res.footer.trim(), pageNumbers: res.pn });
  }
  function updateSettings(patch) {
    settings = CW.normSettings({ ...settings, ...patch });
    applyLayout();
    markDirty();
  }
  async function customMargins() {
    const m = settings.margins;
    const inp = (name, v) => h('label', { class: 'field' }, h('span', {}, { top: 'Верхнее', bottom: 'Нижнее', left: 'Левое', right: 'Правое' }[name] + ', см'),
      h('input', { class: 'input', type: 'number', step: '0.1', min: '0', max: '10', name, value: String(+(v / 10).toFixed(2)) }));
    const res = await modal({
      title: 'Настраиваемые поля', width: '420px',
      body: h('div', { class: 'field-row' }, inp('top', m.top), inp('bottom', m.bottom), inp('left', m.left), inp('right', m.right)),
      buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, value: c => Object.fromEntries([...c.querySelectorAll('input')].map(i => [i.name, Math.max(0, Math.min(100, (parseFloat(i.value.replace(',', '.')) || 0) * 10))])) }],
    });
    if (res) updateSettings({ margins: res });
  }
  function showStats() {
    const s = textStats();
    const rows = [['Страниц', totalPages], ['Слов', s.words], ['Знаков (без пробелов)', s.charsNoSp], ['Знаков (с пробелами)', s.chars], ['Абзацев', s.paras]];
    const r = currentRange();
    let selRow = null;
    if (r && !r.collapsed) {
      const t = r.toString();
      selRow = h('p', { class: 'modal-text', style: { marginTop: '12px' } }, `В выделенном фрагменте: ${nf((t.match(WORD_RE) || []).length)} слов, ${nf(t.length)} знаков`);
    }
    modal({
      title: 'Статистика', width: '400px',
      body: h('div', {}, h('table', { class: 'stats-table' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, nf(v)))))), selRow),
      buttons: [{ label: 'Закрыть', primary: true, value: null }],
    });
  }
  let speaking = false;
  function speak() {
    if (!('speechSynthesis' in window)) { toast('Браузер не поддерживает чтение вслух', 'error'); return; }
    if (speaking) { speechSynthesis.cancel(); speaking = false; $('#speakBtn').classList.remove('active'); return; }
    const r = currentRange();
    const text = (r && !r.collapsed ? r.toString() : ed.innerText).trim();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text.slice(0, 30000));
    u.lang = 'ru-RU';
    const voice = speechSynthesis.getVoices().find(v => v.lang?.startsWith('ru'));
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => { speaking = false; $('#speakBtn').classList.remove('active'); };
    speechSynthesis.speak(u);
    speaking = true; $('#speakBtn').classList.add('active');
  }

  async function showVersions() {
    await saveNow();
    let list;
    try { list = (await api('GET', `/api/docs/${doc.id}/versions`)).versions; } catch (e) { toast(e.message, 'error'); return; }
    const listEl = h('div', { class: 'v-list' });
    const prev = h('div', { class: 'v-preview' }, h('div', { class: 'v-empty' }, list.length
      ? 'Выберите версию слева, чтобы посмотреть её'
      : 'Пока нет сохранённых версий. Они создаются автоматически во время работы — не чаще раза в 5 минут.'));
    let chosen = null;
    for (const v of list) {
      const it = h('button', {
        class: 'v-item', type: 'button',
        onclick: async () => {
          listEl.querySelectorAll('.v-item').forEach(x => x.classList.toggle('active', x === it));
          prev.innerHTML = '<div class="v-empty"><div class="spinner"></div></div>';
          try {
            const r = await api('GET', `/api/docs/${doc.id}/versions/${v.id}`);
            chosen = r.version;
            prev.innerHTML = '';
            prev.append(h('div', { class: 'doc', html: CW.sanitize(r.version.content) }));
          } catch (e) { prev.innerHTML = ''; prev.append(h('div', { class: 'v-empty' }, e.message)); }
        },
      }, h('b', {}, fmtDate(v.created, true)), h('span', {}, `${nf(v.words)} ${plural(v.words, 'слово', 'слова', 'слов')} · ${fmtSize(v.size)}`));
      listEl.append(it);
    }
    const res = await modal({
      title: 'История версий', width: '920px', body: h('div', { class: 'versions' }, listEl, prev),
      buttons: [{ label: 'Закрыть', value: null }, {
        label: 'Восстановить эту версию', primary: true, value: 'restore',
        validate: () => { if (!chosen) { toast('Сначала выберите версию'); return false; } return true; },
      }],
    });
    if (res === 'restore' && chosen) {
      run(() => { ed.innerHTML = CW.sanitize(chosen.content) || '<p><br></p>'; });
      settings = CW.normSettings(chosen.settings);
      applyLayout();
      forceSnapshot = true; dirty = true;
      await save();
      toast('Версия восстановлена. Прежний текст сохранён в истории.', 'success', 4000);
    }
  }

  // ================================================================ поиск и замена
  const Find = {
    panel: $('#findPanel'), input: $('#findInput'), rep: $('#replaceInput'), matches: [], cur: -1,
    open(replace) {
      this.panel.hidden = false;
      $('#replaceRow').hidden = !replace;
      const r = currentRange();
      if (r && !r.collapsed && r.toString().length < 100 && !r.toString().includes('\n')) this.input.value = r.toString();
      this.input.focus(); this.input.select();
      this.search();
    },
    close() {
      this.panel.hidden = true;
      CSS.highlights?.delete('cw-find'); CSS.highlights?.delete('cw-find-cur');
      const m = this.matches[this.cur];
      if (m) { ed.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(m); }
      this.matches = [];
    },
    search(keepIndex) {
      const q = this.input.value;
      const mc = $('#findCase').checked;
      this.matches = [];
      if (q) {
        const nodes = [];
        let text = '', prevBlock = null;
        const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const b = closestBlock(n);
          if (prevBlock && b !== prevBlock) text += '\n';
          prevBlock = b;
          nodes.push({ n, start: text.length });
          text += n.data;
        }
        const hay = mc ? text : text.toLowerCase(), needle = mc ? q : q.toLowerCase();
        const locate = (pos, end) => {
          for (let i = nodes.length - 1; i >= 0; i--) {
            const nd = nodes[i];
            if (end ? nd.start < pos : nd.start <= pos) {
              if (pos - nd.start <= nd.n.length) return [nd.n, pos - nd.start];
              return null;
            }
          }
          return null;
        };
        let i = 0;
        while ((i = hay.indexOf(needle, i)) !== -1 && this.matches.length < 5000) {
          const a = locate(i, false), b = locate(i + needle.length, true);
          if (a && b) {
            const r = document.createRange();
            try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); this.matches.push(r); } catch (e) { /* ignore */ }
          }
          i += Math.max(1, needle.length);
        }
      }
      if (!keepIndex) this.cur = this.matches.length ? 0 : -1;
      else this.cur = Math.min(this.cur, this.matches.length - 1);
      this.paint(true);
    },
    paint(scroll) {
      $('#findCount').textContent = this.input.value ? (this.matches.length ? `${this.cur + 1} из ${this.matches.length}` : 'Не найдено') : '';
      if (window.CSS && CSS.highlights && window.Highlight) {
        CSS.highlights.set('cw-find', new Highlight(...this.matches));
        if (this.matches[this.cur]) CSS.highlights.set('cw-find-cur', new Highlight(this.matches[this.cur]));
        else CSS.highlights.delete('cw-find-cur');
      }
      const m = this.matches[this.cur];
      if (scroll && m) {
        const rect = m.getBoundingClientRect(), wr = ws.getBoundingClientRect();
        if (rect.top < wr.top + 60 || rect.bottom > wr.bottom - 60) ws.scrollTop += rect.top - wr.top - wr.height / 3;
      }
    },
    step(d) {
      if (!this.matches.length) return;
      this.cur = (this.cur + d + this.matches.length) % this.matches.length;
      this.paint(true);
    },
    replaceOne() {
      const m = this.matches[this.cur];
      if (!m) return;
      const rep = this.rep.value;
      run(() => { m.deleteContents(); if (rep) m.insertNode(document.createTextNode(rep)); });
      this.search(true);
    },
    replaceAll() {
      if (!this.matches.length) return;
      const n = this.matches.length, rep = this.rep.value;
      run(() => { for (const m of [...this.matches].reverse()) { m.deleteContents(); if (rep) m.insertNode(document.createTextNode(rep)); } });
      this.search();
      toast(`Заменено: ${n}`, 'success');
    },
  };
  Find.input.addEventListener('input', () => Find.search());
  $('#findCase').addEventListener('change', () => Find.search());
  Find.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); Find.step(e.shiftKey ? -1 : 1); } });
  Find.rep.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); Find.replaceOne(); } });
  $('#findNext').addEventListener('click', () => Find.step(1));
  $('#findPrev').addEventListener('click', () => Find.step(-1));
  $('#findClose').addEventListener('click', () => Find.close());
  $('#findToggleReplace').addEventListener('click', () => { $('#replaceRow').hidden = !$('#replaceRow').hidden; });
  $('#replaceOne').addEventListener('click', () => Find.replaceOne());
  $('#replaceAll').addEventListener('click', () => Find.replaceAll());

  // ================================================================ вид и масштаб
  function setZoom(z, fit = false) {
    z = Math.max(25, Math.min(300, Math.round(z)));
    view.zoom = z; view.autoFit = fit;
    sheet.style.setProperty('--zoom', z / 100);
    $('#zoomRange').value = z;
    $('#zoomVal').textContent = z + '%';
    if (!fit) lsSet('cw-zoom', z);
    positionImgHandle();
    queueLayout();
  }
  function fitWidth() {
    if (view.mode === 'web') { setZoom(100, true); return; }
    const avail = ws.clientWidth - 24;
    const px = CW.pageDims(settings).w * MM;
    setZoom(Math.min(200, Math.floor(avail / px * 100)), true);
  }
  function setView(mode) {
    view.mode = mode;
    lsSet('cw-view', mode);
    ws.classList.toggle('view-web', mode === 'web');
    document.body.classList.toggle('reading', mode === 'read');
    ed.contentEditable = mode === 'read' ? 'false' : 'true';
    let exit = $('#readExit');
    if (mode === 'read' && !exit) {
      exit = h('button', { id: 'readExit', class: 'btn glass-strong read-exit', type: 'button', onclick: () => setView('print') }, h('span', { html: icon('x', 16) }), 'Выйти из режима чтения');
      document.body.append(exit);
    } else if (mode !== 'read' && exit) exit.remove();
    if (mode === 'read') deselectImage();
    if (doc) {
      const stored = +lsGet('cw-zoom') || 100;
      if (mode === 'web') setZoom(100, true);
      else if (ws.clientWidth < CW.pageDims(settings).w * MM * stored / 100 + 24) fitWidth();
      else setZoom(stored);
    }
    queueLayout(); queueUI();
  }

  // ================================================================ экспорт и печать
  async function exportDocx() {
    toast('Создаю файл .docx…');
    try {
      History.flush();
      const blob = await CWDocx.build({ root: ed, title: docTitle(), settings, author: CW.user?.name });
      CW.download(blob, CW.safeName(docTitle()) + '.docx');
    } catch (e) { console.error(e); toast('Не удалось создать .docx: ' + e.message, 'error', 5000); }
  }
  async function exportHtml() {
    let css = '';
    try { css = await fetch('/css/doc.css').then(r => r.text()); } catch (e) { /* без стилей */ }
    const { w } = CW.pageDims(settings);
    const m = settings.margins;
    const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(docTitle())}</title>
<style>${css}
body{margin:0;padding:30px 10px;background:#eef0f6}
.page{max-width:${w}mm;margin:0 auto;background:${settings.pageColor || '#fff'};padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;box-shadow:0 6px 30px rgba(0,0,0,.12);box-sizing:border-box}
.doc{${settings.columns > 1 ? `column-count:${settings.columns};column-gap:1.25cm;` : ''}}
@media print{body{background:none;padding:0}.page{box-shadow:none;padding:0;max-width:none}}
@media (max-width:700px){.page{padding:18px}}
</style></head><body><div class="page"><div class="doc">${contentHTML()}</div></div></body></html>`;
    CW.download(new Blob([html], { type: 'text/html;charset=utf-8' }), CW.safeName(docTitle()) + '.html');
  }
  function exportTxt() {
    const t = ed.innerText.replace(/\u200b/g, '').replace(/\n/g, '\r\n');
    CW.download(new Blob(['\ufeff' + t], { type: 'text/plain;charset=utf-8' }), CW.safeName(docTitle()) + '.txt');
  }
  function exportPdf() {
    toast('В окне печати выберите принтер «Сохранить как PDF»', 'info', 6000);
    setTimeout(doPrint, 500);
  }
  function doPrint() {
    closeBackstage(); closeMenu(); deselectImage();
    const prevView = view.mode;
    if (prevView === 'web') ws.classList.remove('view-web');
    setTimeout(() => {
      window.print();
      if (prevView === 'web') ws.classList.add('view-web');
    }, 50);
  }

  // ================================================================ меню «Файл»
  function closeBackstage() { $('#backstage').hidden = true; $('#backstage').innerHTML = ''; }
  function openBackstage(section = 'info') {
    const bs = $('#backstage');
    bs.hidden = false;
    bs.innerHTML = '';
    const items = [
      ['info', 'info', 'Сведения'], ['new', 'filePlus', 'Создать'], ['open', 'folder', 'Открыть'], ['copy', 'copy', 'Сохранить копию'],
      ['export', 'download', 'Экспорт'], ['print', 'printer', 'Печать'], ['history', 'history', 'История версий'],
    ];
    const nav = h('nav', { class: 'bs-nav' },
      h('button', { class: 'bs-back', type: 'button', onclick: closeBackstage, html: icon('arrowLeft') + '<span>Назад</span>' }),
      ...items.map(([k, ic, label]) => h('button', { type: 'button', 'data-s': k, class: k === section ? 'active' : '', html: icon(ic) + `<span>${label}</span>`, onclick: () => openBackstage(k) })),
      h('div', { class: 'bs-sep' }),
      h('button', { type: 'button', html: icon('x') + '<span>Закрыть документ</span>', onclick: async () => { await saveNow(); location.href = '/app'; } }));
    const main = h('section', { class: 'bs-main glass-strong' });
    bs.append(nav, main);
    bs.onclick = e => { if (e.target === bs) closeBackstage(); };
    const card = (ic, color, title, text, fn) => h('button', { class: 'bs-card', type: 'button', onclick: fn },
      h('span', { class: 'bc-ic', style: { background: color }, html: ic.length <= 4 ? escape(ic) : icon(ic, 20) }), h('div', {}, h('b', {}, title), h('span', {}, text)));
    switch (section) {
      case 'info': {
        const s = textStats();
        const p = CW.PAGE_SIZES[settings.size] || CW.PAGE_SIZES.A4;
        main.append(h('h2', {}, 'Сведения'),
          h('dl', { class: 'info-grid' },
            h('dt', {}, 'Название'), h('dd', {}, docTitle()),
            h('dt', {}, 'Создан'), h('dd', {}, fmtDate(doc.created, true)),
            h('dt', {}, 'Изменён'), h('dd', {}, fmtDate(doc.updated, true)),
            h('dt', {}, 'Страниц'), h('dd', {}, String(totalPages)),
            h('dt', {}, 'Слов'), h('dd', {}, nf(s.words)),
            h('dt', {}, 'Знаков'), h('dd', {}, nf(s.chars)),
            h('dt', {}, 'Размер'), h('dd', {}, fmtSize(new Blob([contentHTML()]).size)),
            h('dt', {}, 'Страница'), h('dd', {}, `${p.label}, ${settings.orientation === 'landscape' ? 'альбомная' : 'книжная'}`),
            h('dt', {}, 'Хранится'), h('dd', {}, 'В облаке CloWord — доступен на всех ваших устройствах')),
          h('h3', {}, 'Действия'),
          h('div', { class: 'bs-cards' },
            card('edit', '#4c62f5', 'Переименовать', 'Изменить название документа', () => { closeBackstage(); titleInput.focus(); titleInput.select(); }),
            card('history', '#8b5cf6', 'История версий', 'Просмотреть и восстановить', () => { closeBackstage(); showVersions(); })));
        break;
      }
      case 'new':
        main.append(h('h2', {}, 'Создать'), h('div', { class: 'bs-tpls' }, CWTemplates.map(t => h('button', {
          type: 'button', onclick: async () => {
            try { await saveNow(); const r = await api('POST', '/api/docs', t.build()); location.href = `/editor?id=${r.doc.id}`; } catch (e) { toast(e.message, 'error'); }
          },
        }, h('b', {}, t.name), h('span', {}, t.desc)))));
        break;
      case 'open':
        main.append(h('h2', {}, 'Открыть'), h('div', { class: 'bs-cards' },
          card('folder', '#4c62f5', 'Мои документы', 'Все документы в вашем облаке', async () => { await saveNow(); location.href = '/app'; }),
          card('upload', '#18a058', 'Импорт файла', 'Word (.docx), текст, HTML, Markdown — откроется как новый документ', () => $('#importFile').click())));
        break;
      case 'copy':
        main.append(h('h2', {}, 'Сохранить копию'), h('p', { class: 'muted' }, 'Документ сохраняется автоматически. Здесь можно создать его копию в облаке или скачать файл на устройство.'),
          h('div', { class: 'bs-cards' },
            card('copy', '#4c62f5', 'Копия в облаке', 'Создать копию и открыть её', async () => {
              try { await saveNow(); const r = await api('POST', `/api/docs/${doc.id}/duplicate`); location.href = `/editor?id=${r.doc.id}`; } catch (e) { toast(e.message, 'error'); }
            }),
            card('DOCX', '#2b579a', 'Скачать .docx', 'Документ Word', () => { closeBackstage(); exportDocx(); })));
        break;
      case 'export':
        main.append(h('h2', {}, 'Экспорт'), h('div', { class: 'bs-cards' },
          card('DOCX', '#2b579a', 'Документ Word (.docx)', 'Открывается в Word, Google Docs, LibreOffice', () => { closeBackstage(); exportDocx(); }),
          card('PDF', '#d93025', 'PDF', 'Через печать → «Сохранить как PDF»', () => { closeBackstage(); exportPdf(); }),
          card('HTML', '#e8710a', 'Веб-страница (.html)', 'Со всеми стилями и рисунками', () => { closeBackstage(); exportHtml(); }),
          card('TXT', '#5f6368', 'Обычный текст (.txt)', 'Только текст, без оформления', () => { closeBackstage(); exportTxt(); })));
        break;
      case 'print': {
        const p = CW.PAGE_SIZES[settings.size] || CW.PAGE_SIZES.A4;
        const m = settings.margins;
        main.append(h('h2', {}, 'Печать'),
          h('dl', { class: 'info-grid' },
            h('dt', {}, 'Страниц'), h('dd', {}, String(totalPages)),
            h('dt', {}, 'Размер'), h('dd', {}, `${p.label} (${p.hint})`),
            h('dt', {}, 'Ориентация'), h('dd', {}, settings.orientation === 'landscape' ? 'Альбомная' : 'Книжная'),
            h('dt', {}, 'Поля'), h('dd', {}, `верх ${m.top / 10} см, низ ${m.bottom / 10} см, лево ${m.left / 10} см, право ${m.right / 10} см`.replace(/\./g, ',')),
            h('dt', {}, 'Колонтитулы'), h('dd', {}, [settings.header, settings.footer].filter(Boolean).join(' / ') || 'нет'),
            h('dt', {}, 'Номера страниц'), h('dd', {}, settings.pageNumbers === 'none' ? 'нет' : 'да')),
          h('div', { style: { display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' } },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: doPrint, html: icon('printer', 18) + 'Печать' }),
            h('button', { class: 'btn', type: 'button', onclick: () => { closeBackstage(); exportPdf(); }, html: icon('download', 18) + 'Сохранить как PDF' })),
          h('p', { class: 'muted', style: { marginTop: '16px', fontSize: '12.5px' } }, 'Совет: в настройках печати браузера отключите «Колонтитулы», чтобы не печатались адрес страницы и дата.'));
        break;
      }
      case 'history':
        closeBackstage(); showVersions();
        return;
    }
  }
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      toast(`Импорт «${f.name}»…`);
      const d = await CWImport.importFile(f);
      await saveNow();
      const r = await api('POST', '/api/docs', d);
      location.href = `/editor?id=${r.doc.id}`;
    } catch (err) { toast(err.message, 'error', 5000); }
  });

  // ================================================================ действия ленты
  const ACTIONS = {
    backstage: () => openBackstage('info'),
    'toggle-ribbon': b => {
      const rb = $('#ribbon');
      rb.classList.toggle('collapsed');
      b.innerHTML = icon(rb.classList.contains('collapsed') ? 'chevDown' : 'chevUp', 16);
      lsSet('cw-ribbon', rb.classList.contains('collapsed') ? '0' : '1');
      if (view.autoFit) fitWidth();
    },
    undo: () => History.undo(),
    redo: () => History.redo(),
    paste: async () => {
      focusEditor();
      try {
        if (navigator.clipboard?.read) {
          const items = await navigator.clipboard.read();
          for (const it of items) {
            if (it.types.includes('text/html')) { const html = await (await it.getType('text/html')).text(); run(() => exec('insertHTML', CW.sanitize(html))); return; }
            const imgType = it.types.find(t => t.startsWith('image/'));
            if (imgType) { const b = await it.getType(imgType); insertImageFiles([new File([b], 'image', { type: imgType })]); return; }
          }
        }
        const text = await navigator.clipboard.readText();
        if (text) run(() => insertPlainText(text));
      } catch (e) { toast('Браузер не дал доступ к буферу. Используйте Ctrl+V', 'info', 4000); }
    },
    cut: () => run(() => { if (!exec('cut')) toast('Используйте Ctrl+X'); }),
    copy: () => { focusEditor(); if (!exec('copy')) toast('Используйте Ctrl+C'); },
    painter: () => togglePainter(),
    'font-menu': b => menu(b, FONTS.map(([name, stack]) => ({
      label: name, style: `font-family:${stack}`, checked: name === $('#fontName').textContent,
      onClick: () => { $('#fontName').textContent = name; run(() => exec('fontName', stack)); },
    })), { className: 'font-menu' }),
    'size-menu': b => menu(b.closest('.size-combo'), SIZES.map(s => ({ label: fmtNum(s), checked: s === currentSize(), onClick: () => setFontSize(s) })), { className: 'size-menu' }),
    grow: () => stepSize(1),
    shrink: () => stepSize(-1),
    'case-menu': b => menu(b, [
      { label: 'Как в предложениях.', onClick: () => changeCase('sentence') },
      { label: 'все строчные', onClick: () => changeCase('lower') },
      { label: 'ВСЕ ПРОПИСНЫЕ', onClick: () => changeCase('upper') },
      { label: 'Начинать С Прописных', onClick: () => changeCase('title') },
      { label: 'иЗМЕНИТЬ рЕГИСТР', onClick: () => changeCase('toggle') },
    ]),
    clear: () => clearFormatting(),
    color: () => applyColor(lastColor),
    'color-menu': b => colorPalette(b.closest('.split'), { title: 'Цвета темы', autoLabel: 'Авто', onPick: c => applyColor(c || '#000000') }),
    hilite: () => applyHilite(lastHilite),
    'hilite-menu': b => colorPalette(b.closest('.split'), { title: 'Цвет выделения', hilite: true, noneLabel: 'Нет цвета', onPick: c => applyHilite(c) }),
    'ol-menu': b => menu(b.closest('.split'), [
      ['decimal', '1. 2. 3.'], ['lower-alpha', 'a. b. c.'], ['upper-alpha', 'A. B. C.'], ['lower-roman', 'i. ii. iii.'], ['upper-roman', 'I. II. III.'],
    ].map(([t, label]) => ({
      label, onClick: () => run(() => {
        let ol = closestTag('ol');
        if (!ol) { exec('insertOrderedList'); ol = closestTag('ol'); }
        if (ol) ol.style.listStyleType = t === 'decimal' ? '' : t;
      }),
    }))),
    checklist: () => toggleChecklist(),
    indent: () => indent(1),
    outdent: () => indent(-1),
    marks: () => { ed.classList.toggle('show-marks'); queueUI(); },
    'spacing-menu': b => {
      const blk = selectedBlocks()[0];
      const cur = blk?.style.lineHeight || '';
      const cs = blk ? getComputedStyle(blk) : null;
      const hasBefore = cs && parseFloat(cs.marginTop) > 0, hasAfter = cs && parseFloat(cs.marginBottom) > 0;
      menu(b, [
        { header: 'Междустрочный интервал' },
        ...['1', '1.15', '1.5', '2', '2.5', '3'].map(v => ({ label: v.replace('.', ','), checked: cur === v, onClick: () => setBlocks({ lineHeight: v }) })),
        '-',
        { label: hasBefore ? 'Удалить интервал перед абзацем' : 'Добавить интервал перед абзацем', onClick: () => setBlocks({ marginTop: hasBefore ? '0pt' : '12pt' }) },
        { label: hasAfter ? 'Удалить интервал после абзаца' : 'Добавить интервал после абзаца', onClick: () => setBlocks({ marginBottom: hasAfter ? '0pt' : '8pt' }) },
        '-',
        { label: 'Другие варианты…', icon: 'lineSpacing', onClick: paragraphDialog },
      ]);
    },
    'shading-menu': b => colorPalette(b, { title: 'Заливка абзаца', noneLabel: 'Нет заливки', onPick: c => setBlocks({ backgroundColor: c || '' }) }),
    paragraph: () => paragraphDialog(),
    find: () => Find.open(false),
    replace: () => Find.open(true),
    'select-all': () => { focusEditor(); const r = document.createRange(); r.selectNodeContents(ed); const s = getSelection(); s.removeAllRanges(); s.addRange(r); },
    pagebreak: () => insertPageBreak(),
    toc: () => insertToc(),
    'table-menu': b => tableGrid(b),
    image: () => $('#imgFile').click(),
    'image-url': () => insertImageUrl(),
    link: () => linkDialog(),
    headerfooter: () => headerFooterDialog(),
    'pagenum-menu': b => menu(b, [
      ...[['none', 'Без номеров'], ['bottom-center', 'Внизу по центру'], ['bottom-right', 'Внизу справа'], ['bottom-left', 'Внизу слева'], ['top-right', 'Вверху справа'], ['top-center', 'Вверху по центру']]
        .map(([v, l]) => ({ label: l, checked: settings.pageNumbers === v, onClick: () => updateSettings({ pageNumbers: v }) })),
    ]),
    hr: () => insertHTML('<hr><p><br></p>'),
    'datetime-menu': b => dateMenu(b),
    'symbol-menu': b => symbolPopup(b),
    'margins-menu': b => {
      const presets = [
        ['Обычные', { top: 20, bottom: 20, left: 30, right: 15 }, 'В 2 см · Н 2 см · Л 3 см · П 1,5 см'],
        ['Узкие', { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 }, 'Все по 1,27 см'],
        ['Средние', { top: 25.4, bottom: 25.4, left: 19.1, right: 19.1 }, 'В/Н 2,54 см · Л/П 1,91 см'],
        ['Широкие', { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 }, 'В/Н 2,54 см · Л/П 5,08 см'],
      ];
      const m = settings.margins;
      menu(b, [...presets.map(([l, v, hint]) => ({
        label: l, hint, checked: m.top === v.top && m.left === v.left && m.right === v.right && m.bottom === v.bottom, onClick: () => updateSettings({ margins: v }),
      })), '-', { label: 'Настраиваемые поля…', icon: 'margins', onClick: customMargins }]);
    },
    'orient-menu': b => menu(b, [
      { label: 'Книжная', checked: settings.orientation !== 'landscape', onClick: () => updateSettings({ orientation: 'portrait' }) },
      { label: 'Альбомная', checked: settings.orientation === 'landscape', onClick: () => updateSettings({ orientation: 'landscape' }) },
    ]),
    'size-page-menu': b => menu(b, Object.entries(CW.PAGE_SIZES).map(([k, p]) => ({ label: p.label, hint: p.hint, checked: settings.size === k, onClick: () => updateSettings({ size: k }) }))),
    'columns-menu': b => menu(b, [1, 2, 3].map(n => ({ label: ['Одна', 'Две', 'Три'][n - 1], checked: (settings.columns || 1) === n, onClick: () => updateSettings({ columns: n }) }))),
    redline: () => {
      const b0 = selectedBlocks()[0];
      const on = b0 && parseFloat(getComputedStyle(b0).textIndent) > 0;
      setBlocks({ textIndent: on ? '' : '1.25cm' });
    },
    'pagecolor-menu': b => {
      const colors = ['#FFFFFF', '#FFF8E7', '#FDF2F8', '#EEF2FF', '#ECFDF5', '#F0F9FF', '#FEFCE8', '#F5F5F4', '#E7E6E6', '#DEEAF6'];
      const grid = h('div', { class: 'palette' }, h('div', { class: 'pal-head' }, 'Цвет страницы'),
        h('div', { class: 'pal-grid' }, colors.map(c => h('button', { type: 'button', title: c, style: { background: c }, onclick: () => { closeMenu(); updateSettings({ pageColor: c === '#FFFFFF' ? '' : c }); } }))),
        h('div', { class: 'pal-actions' }, h('button', { type: 'button', onclick: () => { closeMenu(); updateSettings({ pageColor: '' }); } }, h('span', { class: 'no-color' }), 'Без цвета')));
      popup(b, grid);
    },
    spell: () => { ed.spellcheck = !ed.spellcheck; ed.blur(); focusEditor(); queueUI(); toast(ed.spellcheck ? 'Проверка орфографии включена' : 'Проверка орфографии выключена'); },
    stats: () => showStats(),
    speak: () => speak(),
    versions: () => showVersions(),
    'view-print': () => setView('print'),
    'view-web': () => setView('web'),
    'view-read': () => setView('read'),
    'zoom-100': () => setZoom(100),
    'zoom-fit': () => fitWidth(),
    'zoom-in': () => setZoom(view.zoom + 10),
    'zoom-out': () => setZoom(view.zoom - 10),
    'zoom-menu': b => menu(b, [50, 75, 100, 125, 150, 200].map(z => ({ label: z + '%', checked: view.zoom === z, onClick: () => setZoom(z) })).concat(['-', { label: 'По ширине страницы', icon: 'fitWidth', onClick: fitWidth }]), { align: 'right' }),
    darkpaper: () => { document.body.classList.toggle('dark-paper'); lsSet('cw-darkpaper', document.body.classList.contains('dark-paper') ? '1' : '0'); queueUI(); },
    fullscreen: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => toast('Полноэкранный режим недоступен')); },
    print: () => doPrint(),
    'export-docx': () => exportDocx(),
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-a],[data-cmd]');
    if (!b || b.closest('#editor')) return;
    if (b.dataset.cmd) { handleCmd(b.dataset.cmd); return; }
    const fn = ACTIONS[b.dataset.a];
    if (fn) fn(b, e);
  });
  for (const el of [$('#ribbon'), $('#ctxBar'), $('#rtabs')]) {
    el.addEventListener('mousedown', e => { if (!e.target.closest('input,select,textarea')) e.preventDefault(); });
  }
  $$('.rtab[data-tab]').forEach(t => t.addEventListener('click', () => {
    $$('.rtab[data-tab]').forEach(x => x.classList.toggle('active', x === t));
    $$('.rpanel').forEach(p => p.classList.toggle('active', p.dataset.panel === t.dataset.tab));
    const rb = $('#ribbon');
    if (rb.classList.contains('collapsed')) { rb.classList.remove('collapsed'); $('[data-a="toggle-ribbon"]').innerHTML = icon('chevUp', 16); }
  }));
  $$('.rtab[data-tab]').forEach(t => t.addEventListener('dblclick', () => ACTIONS['toggle-ribbon']($('[data-a="toggle-ribbon"]'))));

  // галерея стилей
  $('#styles').append(...STYLES.map(st => h('button', {
    class: 'style-item', type: 'button', 'data-style': st.id, title: st.name, onclick: () => setBlockStyle(st),
  }, h('span', { class: 'si-prev', style: st.prev }, 'АаБбВв'), h('span', { class: 'si-name' }, st.name))));

  // поле размера шрифта
  const sizeInput = $('#fontSize');
  sizeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); setFontSize(currentSize()); }
    if (e.key === 'Escape') { focusEditor(); }
  });
  sizeInput.addEventListener('change', () => setFontSize(currentSize()));
  sizeInput.addEventListener('focus', () => sizeInput.select());

  $('#imgFile').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; insertImageFiles(files); });
  $('#zoomRange').addEventListener('input', e => setZoom(+e.target.value));

  titleInput.addEventListener('input', () => { document.title = docTitle() + ' — CloWord'; markDirty(); });
  titleInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (!titleInput.value.trim()) titleInput.value = doc?.title || 'Без названия'; focusEditor(); } });
  titleInput.addEventListener('blur', () => { if (!titleInput.value.trim()) { titleInput.value = doc?.title || 'Без названия'; } });

  $('#avatarBtn').addEventListener('click', e => {
    const u = CW.user || {};
    menu(e.currentTarget, [
      { header: u.email || '' },
      { label: 'Мои документы', icon: 'folder', onClick: async () => { await saveNow(); location.href = '/app'; } },
      { label: 'Новый документ', icon: 'filePlus', onClick: () => openBackstage('new') },
      '-',
      { label: 'Светлая тема', icon: 'sun', checked: theme.pref === 'light', onClick: () => theme.set('light') },
      { label: 'Тёмная тема', icon: 'moon', checked: theme.pref === 'dark', onClick: () => theme.set('dark') },
      { label: 'Как в системе', icon: 'monitor', checked: theme.pref === 'system', onClick: () => theme.set('system') },
      '-',
      { label: 'Выйти', icon: 'logout', onClick: async () => { await saveNow(); await api('POST', '/api/logout').catch(() => {}); location.replace('/'); } },
    ], { align: 'right' });
  });

  // ================================================================ горячие клавиши
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#backstage').hidden) { closeBackstage(); return; }
      if (!Find.panel.hidden && !document.querySelector('.modal-back')) { Find.close(); return; }
      if (painter) { painter = null; ed.classList.remove('painting'); queueUI(); return; }
      if (view.mode === 'read') { setView('print'); return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || document.querySelector('.modal-back')) return;
    const code = e.code;
    if (code === 'KeyS') { e.preventDefault(); saveNow(); return; }
    if (code === 'KeyP') { e.preventDefault(); doPrint(); return; }
    if (code === 'KeyF' && !e.shiftKey) { e.preventDefault(); Find.open(false); return; }
    if (code === 'KeyH') { e.preventDefault(); Find.open(true); return; }
    if (!inEditor(document.activeElement) || view.mode === 'read') return;
    if (e.altKey && /^Digit[1-3]$/.test(code)) { e.preventDefault(); setBlockStyle(STYLES.find(s => s.id === 'h' + code.slice(-1))); return; }
    if (e.altKey) return;
    const map = {
      KeyB: () => cmd('bold'), KeyI: () => cmd('italic'), KeyU: () => cmd('underline'),
      KeyE: () => cmd('justifyCenter'), KeyR: () => cmd('justifyRight'), KeyJ: () => cmd('justifyFull'),
      KeyL: () => (e.shiftKey ? handleCmd('insertUnorderedList') : cmd('justifyLeft')),
      KeyK: () => linkDialog(), KeyZ: () => (e.shiftKey ? History.redo() : History.undo()), KeyY: () => History.redo(),
      BracketRight: () => stepSize(1), BracketLeft: () => stepSize(-1),
      Equal: () => cmd(e.shiftKey ? 'superscript' : 'subscript'), Enter: () => insertPageBreak(),
    };
    const f = map[code];
    if (f) { e.preventDefault(); f(); }
  });

  // ================================================================ запуск
  async function init() {
    if (!docId) { location.replace('/app'); return; }
    if (lsGet('cw-ribbon') === '0') { $('#ribbon').classList.add('collapsed'); $('[data-a="toggle-ribbon"]').innerHTML = icon('chevDown', 16); }
    if (lsGet('cw-darkpaper') === '1') document.body.classList.add('dark-paper');
    try {
      const [me, r] = await Promise.all([api('GET', '/api/me'), api('GET', `/api/docs/${docId}`)]);
      CW.user = me.user;
      theme.adoptFromUser(me.user);
      $('#avatarBtn').textContent = CW.initials(me.user.name);
      $('#avatarBtn').title = `${me.user.name} (${me.user.email})`;
      exec('defaultParagraphSeparator', 'p');
      exec('styleWithCSS', true);
      loadDoc(r.doc);
      document.body.classList.add('loaded');
      queueLayout();
      setStatus('saved');
      setView(view.mode === 'read' ? 'print' : view.mode);
      const pagePx = CW.pageDims(settings).w * MM;
      if (view.mode !== 'web' && ws.clientWidth < pagePx * (view.zoom / 100) + 24) fitWidth(); else setZoom(view.mode === 'web' && innerWidth < 700 ? 100 : view.zoom);
      if (r.doc.deleted) toast('Этот документ находится в корзине', 'info', 5000);
      if (matchMedia('(pointer: fine)').matches) { ed.focus({ preventScroll: true }); setCaret(ed.firstElementChild || ed, 0); }
      checkDraft(r.doc);
    } catch (e) {
      if (e.status === 404) { toast('Документ не найден', 'error'); setTimeout(() => location.replace('/app'), 1200); return; }
      if (e.status === 401) return;
      const box = $('#loadingDoc');
      box.innerHTML = '';
      box.append(h('div', { class: 'empty glass', style: { maxWidth: '420px', padding: '30px', borderRadius: '20px', textAlign: 'center' } },
        h('h3', {}, 'Не удалось открыть документ'), h('p', { class: 'muted' }, e.message),
        h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Повторить')));
    }
  }
  init();
})();
