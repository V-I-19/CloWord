'use strict';
// Личный кабинет: список документов, шаблоны, импорт, профиль
(() => {
  const { $, $$, h, api, theme, toast, modal, prompt, confirm, menu, fmtDate, fmtSize, plural, nf, initials, escape } = CW;
  CW.fillIcons();
  theme.bind($('#themeBtn'));

  const state = {
    view: 'all', query: '', docs: [], trash: [],
    sort: localStorage.getItem('cw-sort') || 'updated',
    layout: localStorage.getItem('cw-layout') || 'grid',
    stats: null,
  };

  // ---------- приветствие
  function greet(name) {
    const hr = new Date().getHours();
    const g = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : hr < 23 ? 'Добрый вечер' : 'Доброй ночи';
    $('#greeting').textContent = `${g}, ${name.split(' ')[0]}`;
  }

  function setUser(user, stats) {
    CW.user = user;
    if (stats) state.stats = stats;
    $('#userName').textContent = user.name;
    $('#userEmail').textContent = user.email;
    $('#avatar').textContent = $('#avatarMobile').textContent = initials(user.name);
    greet(user.name);
    if (state.stats) {
      $('#storage').innerHTML = `<span data-i="cloud" data-size="15"></span>${nf(state.stats.docs)} ${plural(state.stats.docs, 'документ', 'документа', 'документов')} · ${fmtSize(state.stats.size)}`;
      CW.fillIcons($('#storage'));
    }
  }

  // ---------- шаблоны
  function renderTemplates() {
    const row = $('#templates');
    row.innerHTML = '';
    for (const t of CWTemplates) {
      row.append(h('button', { class: 'tpl glass', type: 'button', onclick: () => createFrom(t) },
        h('div', { class: `tpl-page tpl-${t.id}` }, t.id === 'blank' ? h('span', { class: 'tpl-plus', html: icon('plus', 34) }) : tplLines(t.id)),
        h('div', { class: 'tpl-name' }, t.name),
        h('div', { class: 'tpl-desc' }, t.desc)));
    }
  }
  function tplLines(id) {
    const wrap = h('div', { class: 'tpl-lines' });
    const pattern = { essay: 'c c c _ _ T c c _ _ r r _ c', letter: 'r r _ c l l l _ s s', resume: 'T s h l l h l l l', report: 'T s h l l t t t h l', notes: 'H k k k h l q' }[id] || '';
    for (const k of pattern.split(' ')) wrap.append(h('i', { class: 'ln ln-' + (k === '_' ? 'gap' : k) }));
    return wrap;
  }
  async function createFrom(t, extra) {
    try {
      const d = t.build();
      const r = await api('POST', '/api/docs', extra || d);
      location.href = `/editor?id=${r.doc.id}`;
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- загрузка списка
  async function load() {
    try {
      const [me, docs, trash] = await Promise.all([
        api('GET', '/api/me'), api('GET', '/api/docs'), api('GET', '/api/docs?trash=1'),
      ]);
      theme.adoptFromUser(me.user);
      setUser(me.user, me.stats);
      state.docs = docs.docs; state.trash = trash.docs;
      render();
    } catch (e) {
      if (e.status !== 401) {
        $('#docs').innerHTML = '';
        $('#docs').append(emptyState('cloudOff', 'Не удалось загрузить документы', e.message, h('button', { class: 'btn', onclick: load }, 'Повторить')));
      }
    }
  }

  function currentList() {
    let list = state.view === 'trash' ? state.trash : state.view === 'starred' ? state.docs.filter(d => d.starred) : state.docs;
    const q = state.query.trim().toLowerCase();
    if (q) list = list.filter(d => d.title.toLowerCase().includes(q) || (d.preview || '').toLowerCase().includes(q));
    const by = state.sort;
    return [...list].sort((a, b) => by === 'title' ? a.title.localeCompare(b.title, 'ru') : by === 'created' ? b.created - a.created : b.updated - a.updated);
  }

  function render() {
    $('#cntAll').textContent = state.docs.length || '';
    $('#cntStar').textContent = state.docs.filter(d => d.starred).length || '';
    $('#cntTrash').textContent = state.trash.length || '';
    $('#listTitle').textContent = { all: 'Все документы', starred: 'Избранное', trash: 'Корзина' }[state.view];
    $('#templatesSection').hidden = state.view === 'trash';
    $('#emptyTrash').hidden = !(state.view === 'trash' && state.trash.length);
    const box = $('#docs');
    box.className = 'docs ' + state.layout;
    box.innerHTML = '';
    const list = currentList();
    if (!list.length) {
      if (state.query) box.append(emptyState('search', 'Ничего не найдено', 'Попробуйте изменить запрос'));
      else if (state.view === 'trash') box.append(emptyState('trash', 'Корзина пуста', 'Удалённые документы хранятся здесь, пока вы не очистите корзину'));
      else if (state.view === 'starred') box.append(emptyState('star', 'Нет избранных', 'Отмечайте важные документы звёздочкой'));
      else box.append(emptyState('filePlus', 'Пока нет документов', 'Создайте первый документ или импортируйте файл Word',
        h('button', { class: 'btn btn-primary', onclick: () => createFrom(CWTemplates[0]) }, 'Создать документ')));
      return;
    }
    for (const d of list) box.append(card(d));
  }

  function emptyState(ic, title, text, action) {
    return h('div', { class: 'empty glass' }, h('div', { class: 'empty-ic', html: icon(ic, 30) }), h('h3', {}, title), h('p', { class: 'muted' }, text), action || null);
  }

  function card(d) {
    const inTrash = state.view === 'trash';
    const open = () => { if (!inTrash) location.href = `/editor?id=${d.id}`; };
    const lines = (d.preview || '').split('\n').slice(0, 14);
    const el = h('article', { class: 'doc-card glass', tabindex: '0', 'data-id': d.id },
      h('div', { class: 'doc-thumb', onclick: open },
        h('div', { class: 'mini-page' },
          h('div', { class: 'mini-title' }, lines[0] || d.title),
          h('div', { class: 'mini-text' }, lines.slice(1).join('\n')))),
      h('div', { class: 'doc-info' },
        h('span', { class: 'doc-ic', html: icon('fileText', 18) }),
        h('div', { class: 'doc-text', onclick: open },
          h('div', { class: 'doc-name', title: d.title }, d.title),
          h('div', { class: 'doc-meta' }, inTrash ? `Удалён ${fmtDate(d.deleted)}` : `Изменён ${fmtDate(d.updated)}`,
            h('span', { class: 'list-only' }, ` · ${nf(d.words)} ${plural(d.words, 'слово', 'слова', 'слов')} · ${fmtSize(d.size)}`))),
        inTrash ? null : h('button', {
          class: 'icon-btn sm star' + (d.starred ? ' on' : ''), type: 'button', title: d.starred ? 'Убрать из избранного' : 'В избранное',
          html: icon('star', 17), onclick: e => { e.stopPropagation(); toggleStar(d); },
        }),
        h('button', { class: 'icon-btn sm', type: 'button', title: 'Действия', html: icon('more', 18), onclick: e => { e.stopPropagation(); cardMenu(e.currentTarget, d); } })));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === el) open(); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); cardMenu(el.querySelector('.doc-info .icon-btn:last-child'), d); });
    return el;
  }

  function cardMenu(anchor, d) {
    if (state.view === 'trash') {
      return menu(anchor, [
        { label: 'Восстановить', icon: 'restore', onClick: () => restore(d) },
        '-',
        { label: 'Удалить навсегда', icon: 'trash', danger: true, onClick: () => destroy(d) },
      ], { align: 'right' });
    }
    menu(anchor, [
      { label: 'Открыть', icon: 'fileText', onClick: () => { location.href = `/editor?id=${d.id}`; } },
      { label: 'Открыть в новой вкладке', icon: 'external', onClick: () => window.open(`/editor?id=${d.id}`, '_blank') },
      '-',
      { label: 'Переименовать', icon: 'edit', onClick: () => rename(d) },
      { label: 'Создать копию', icon: 'copy', onClick: () => duplicate(d) },
      { label: d.starred ? 'Убрать из избранного' : 'В избранное', icon: 'star', onClick: () => toggleStar(d) },
      '-',
      { label: 'Скачать .docx', icon: 'download', onClick: () => downloadDocx(d) },
      '-',
      { label: 'Удалить', icon: 'trash', danger: true, onClick: () => remove(d) },
    ], { align: 'right' });
  }

  async function toggleStar(d) {
    d.starred = !d.starred; render();
    try { await api('PUT', `/api/docs/${d.id}`, { starred: d.starred }); } catch (e) { d.starred = !d.starred; render(); toast(e.message, 'error'); }
  }
  async function rename(d) {
    const t = await prompt('Переименовать', 'Название документа', d.title, 'Сохранить');
    if (t == null || !t.trim() || t.trim() === d.title) return;
    try { const r = await api('PUT', `/api/docs/${d.id}`, { title: t }); d.title = r.title; d.updated = r.updated; render(); } catch (e) { toast(e.message, 'error'); }
  }
  async function duplicate(d) {
    try { const r = await api('POST', `/api/docs/${d.id}/duplicate`); state.docs.unshift(r.doc); render(); toast('Копия создана', 'success'); } catch (e) { toast(e.message, 'error'); }
  }
  async function remove(d) {
    try {
      await api('DELETE', `/api/docs/${d.id}`);
      state.docs = state.docs.filter(x => x.id !== d.id);
      d.deleted = Date.now() / 1000; state.trash.unshift(d);
      render(); toast('Документ перемещён в корзину');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function restore(d) {
    try {
      await api('POST', `/api/docs/${d.id}/restore`);
      state.trash = state.trash.filter(x => x.id !== d.id); d.deleted = null; state.docs.unshift(d);
      render(); toast('Документ восстановлен', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function destroy(d) {
    if (!(await confirm('Удалить навсегда?', `Документ «${d.title}» будет удалён без возможности восстановления.`, 'Удалить', true))) return;
    try { await api('DELETE', `/api/docs/${d.id}?permanent=1`); state.trash = state.trash.filter(x => x.id !== d.id); render(); } catch (e) { toast(e.message, 'error'); }
  }
  async function downloadDocx(d) {
    toast('Готовлю файл .docx…');
    try {
      const r = await api('GET', `/api/docs/${d.id}`);
      const blob = await CWDocx.build({ html: r.doc.content, title: r.doc.title, settings: r.doc.settings, author: CW.user?.name });
      CW.download(blob, CW.safeName(r.doc.title) + '.docx');
    } catch (e) { toast(e.message, 'error'); }
  }

  // ---------- импорт
  async function importFiles(files) {
    for (const f of files) {
      try {
        toast(`Импорт «${f.name}»…`);
        const d = await CWImport.importFile(f);
        const r = await api('POST', '/api/docs', d);
        if (files.length === 1) { location.href = `/editor?id=${r.doc.id}`; return; }
        state.docs.unshift(r.doc);
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error', 5000); }
    }
    render();
  }
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('#dropOverlay').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').hidden = true; } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('#dropOverlay').hidden = true;
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) importFiles(files);
  });

  // ---------- навигация и инструменты
  $$('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    $$('.nav-item[data-view]').forEach(x => x.classList.toggle('active', x === b));
    document.body.classList.remove('side-open');
    render();
  }));
  $('#search').addEventListener('input', e => { state.query = e.target.value; render(); });
  $$('[data-layout]').forEach(b => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
    b.addEventListener('click', () => {
      state.layout = b.dataset.layout; localStorage.setItem('cw-layout', state.layout);
      $$('[data-layout]').forEach(x => x.classList.toggle('active', x === b)); render();
    });
  });
  $('#sortBtn').addEventListener('click', e => menu(e.currentTarget, [
    { header: 'Сортировка' },
    ...[['updated', 'По дате изменения'], ['created', 'По дате создания'], ['title', 'По названию']].map(([k, label]) => ({
      label, checked: state.sort === k, onClick: () => { state.sort = k; localStorage.setItem('cw-sort', k); render(); },
    })),
  ], { align: 'right' }));
  $('#emptyTrash').addEventListener('click', async () => {
    if (!(await confirm('Очистить корзину?', `Будет удалено навсегда: ${state.trash.length} ${plural(state.trash.length, 'документ', 'документа', 'документов')}.`, 'Очистить', true))) return;
    try { await api('DELETE', '/api/trash'); state.trash = []; render(); toast('Корзина очищена', 'success'); } catch (e) { toast(e.message, 'error'); }
  });
  $('#newBtn').addEventListener('click', () => createFrom(CWTemplates[0]));
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('side-open'));
  document.addEventListener('click', e => {
    if (document.body.classList.contains('side-open') && !e.target.closest('#sidebar,#menuBtn')) document.body.classList.remove('side-open');
  });

  // ---------- профиль
  $('#profileBtn').addEventListener('click', openProfile);
  $('#avatarMobile').addEventListener('click', openProfile);

  function openProfile() {
    const u = CW.user;
    if (!u) return;
    const s = state.stats || { docs: 0, words: 0, size: 0 };
    const body = h('div', { class: 'profile' },
      h('div', { class: 'profile-head' },
        h('span', { class: 'avatar avatar-lg' }, initials(u.name)),
        h('div', {}, h('b', { class: 'p-name' }, u.name), h('div', { class: 'muted' }, u.email),
          h('div', { class: 'muted small' }, `С нами с ${new Date(u.created * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`))),
      h('div', { class: 'stat-row' },
        stat(nf(s.docs), plural(s.docs, 'документ', 'документа', 'документов')),
        stat(nf(s.words), plural(s.words, 'слово', 'слова', 'слов')),
        stat(fmtSize(s.size), 'в облаке')),
      h('h4', {}, 'Оформление'),
      h('div', { class: 'seg', id: 'themeSeg' },
        ...[['light', 'sun', 'Светлая'], ['dark', 'moon', 'Тёмная'], ['system', 'monitor', 'Как в системе']].map(([k, ic, label]) =>
          h('button', { type: 'button', class: theme.pref === k ? 'active' : '', 'data-t': k, html: icon(ic, 16) + escape(label) }))),
      h('h4', {}, 'Имя'),
      h('div', { class: 'inline-form' }, h('input', { class: 'input', id: 'pName', value: u.name, maxlength: '60' }), h('button', { class: 'btn', type: 'button', id: 'pNameSave' }, 'Сохранить')),
      h('h4', {}, 'Сменить пароль'),
      h('div', { class: 'field-row' },
        h('input', { class: 'input', type: 'password', id: 'pOld', placeholder: 'Текущий пароль', autocomplete: 'current-password' }),
        h('input', { class: 'input', type: 'password', id: 'pNew', placeholder: 'Новый пароль', autocomplete: 'new-password' })),
      h('button', { class: 'btn', type: 'button', id: 'pPassSave', style: { marginTop: '10px' } }, h('span', { html: icon('key', 16) }), 'Изменить пароль'),
      h('div', { class: 'danger-zone' },
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', id: 'pDelete' }, 'Удалить аккаунт')));

    modal({
      title: 'Личный кабинет', body, width: '560px',
      buttons: [{ label: 'Выйти из аккаунта', value: 'logout', left: true }, { label: 'Готово', primary: true, value: null }],
      onOpen: Object.assign((c, close) => {
        c.querySelectorAll('#themeSeg button').forEach(b => b.addEventListener('click', () => {
          theme.set(b.dataset.t);
          c.querySelectorAll('#themeSeg button').forEach(x => x.classList.toggle('active', x === b));
        }));
        c.querySelector('#pNameSave').addEventListener('click', async () => {
          try { const r = await api('PUT', '/api/me', { name: c.querySelector('#pName').value }); setUser(r.user); c.querySelector('.p-name').textContent = r.user.name; toast('Имя сохранено', 'success'); } catch (e) { toast(e.message, 'error'); }
        });
        c.querySelector('#pPassSave').addEventListener('click', async () => {
          try {
            await api('POST', '/api/me/password', { current: c.querySelector('#pOld').value, new: c.querySelector('#pNew').value });
            c.querySelector('#pOld').value = c.querySelector('#pNew').value = '';
            toast('Пароль изменён. На других устройствах нужно войти заново.', 'success', 4500);
          } catch (e) { toast(e.message, 'error'); }
        });
        c.querySelector('#pDelete').addEventListener('click', async () => {
          close(null);
          const pw = await modal({
            title: 'Удалить аккаунт?', width: '440px',
            body: h('div', {}, h('p', { class: 'modal-text' }, 'Все документы будут удалены без возможности восстановления. Введите пароль для подтверждения.'),
              h('input', { class: 'input', type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' })),
            buttons: [{ label: 'Отмена', value: null }, { label: 'Удалить навсегда', danger: true, value: c2 => c2.querySelector('input').value }],
          });
          if (pw == null) return;
          try { await api('DELETE', '/api/me', { password: pw }); location.replace('/'); } catch (e) { toast(e.message, 'error'); }
        });
      }, { noFocus: true }),
    }).then(async v => {
      if (v === 'logout') { await api('POST', '/api/logout').catch(() => {}); location.replace('/'); }
    });
    function stat(v, l) { return h('div', { class: 'stat glass' }, h('b', {}, v), h('span', {}, l)); }
  }

  renderTemplates();
  load();
  // обновляем список, когда возвращаемся на вкладку (документ могли изменить на другом устройстве)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
