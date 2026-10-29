'use strict';
(() => {
  const { $, $$, api, theme, fillIcons } = CW;
  fillIcons();
  theme.bind($('#themeBtn'));

  // уже вошли — сразу в кабинет
  api('GET', '/api/me', undefined, { noRedirect: true }).then(() => { location.replace('/app'); }).catch(() => {});

  const forms = { login: $('#loginForm'), register: $('#registerForm') };
  function show(tab) {
    $$('.seg button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    for (const [k, f] of Object.entries(forms)) f.hidden = k !== tab;
    forms[tab].querySelector('input').focus();
  }
  $$('.seg button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  if (location.hash === '#register') show('register');

  $$('.eye').forEach(b => b.addEventListener('click', () => {
    const inp = b.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    b.classList.toggle('on', inp.type === 'text');
  }));

  for (const [kind, form] of Object.entries(forms)) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const err = form.querySelector('.form-error');
      const btn = form.querySelector('button[type=submit]');
      const data = Object.fromEntries(new FormData(form));
      err.hidden = true;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) return fail('Введите корректный e-mail');
      if ((data.password || '').length < (kind === 'register' ? 6 : 1)) return fail(kind === 'register' ? 'Пароль должен быть не короче 6 символов' : 'Введите пароль');
      btn.disabled = true;
      const label = btn.textContent;
      btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;border-color:rgba(255,255,255,.35);border-top-color:#fff"></span>';
      try {
        await api('POST', kind === 'login' ? '/api/login' : '/api/register', data, { noRedirect: true });
        location.replace('/app');
      } catch (ex) {
        fail(ex.message);
        btn.disabled = false; btn.textContent = label;
      }
      function fail(msg) { err.textContent = msg; err.hidden = false; }
    });
  }
})();
