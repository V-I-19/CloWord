'use strict';
// Импорт файлов: .docx (через mammoth.js), .txt, .md, .html
window.CWImport = (() => {
  const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
  const STYLE_MAP = [
    "p[style-name='Title'] => p.cw-title:fresh",
    "p[style-name='Заголовок'] => p.cw-title:fresh",
    "p[style-name='Subtitle'] => p.cw-subtitle:fresh",
    "p[style-name='Подзаголовок'] => p.cw-subtitle:fresh",
    "p[style-name='Quote'] => p.cw-quote:fresh",
    "p[style-name='Intense Quote'] => p.cw-quote:fresh",
    "p[style-name='Цитата'] => p.cw-quote:fresh",
    "p[style-name='No Spacing'] => p.cw-nospace:fresh",
    "p[style-name='Без интервала'] => p.cw-nospace:fresh",
    "p[style-name='Code'] => p.cw-code:fresh",
    "u => u",
    "strike => s",
  ];

  function inlineMd(s) {
    return CW.escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/`([^`]+)`/g, '<span style="font-family: Consolas, monospace">$1</span>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  }
  function markdown(text) {
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
      const line = raw.trimEnd();
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { close(); out.push(`<h${m[1].length}>${inlineMd(m[2])}</h${m[1].length}>`); }
      else if ((m = line.match(/^\s*[-*+]\s+\[( |x)\]\s+(.*)$/i))) {
        if (list !== 'ul class="cw-checklist"') { close(); out.push('<ul class="cw-checklist">'); list = 'ul class="cw-checklist"'; }
        out.push(`<li${m[1].trim() ? ' data-checked=""' : ''}>${inlineMd(m[2])}</li>`);
      }
      else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inlineMd(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inlineMd(m[1])}</li>`); }
      else if ((m = line.match(/^>\s?(.*)$/))) { close(); out.push(`<p class="cw-quote">${inlineMd(m[1])}</p>`); }
      else if (/^(-{3,}|\*{3,})$/.test(line)) { close(); out.push('<hr>'); }
      else { close(); out.push(line ? `<p>${inlineMd(line)}</p>` : ''); }
    }
    close();
    return out.join('');
  }

  async function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const title = file.name.replace(/\.[^.]+$/, '') || 'Импорт';
    if (file.size > 40 * 1024 * 1024) throw new Error('Файл слишком большой (максимум 40 МБ)');
    let html;
    if (ext === 'docx') {
      await CW.loadScript(MAMMOTH);
      const res = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: STYLE_MAP });
      html = res.value;
    } else if (ext === 'html' || ext === 'htm') {
      html = new DOMParser().parseFromString(await file.text(), 'text/html').body.innerHTML;
    } else if (ext === 'md' || ext === 'markdown') {
      html = markdown(await file.text());
    } else if (ext === 'txt' || file.type.startsWith('text/')) {
      html = (await file.text()).replace(/\r\n?/g, '\n').split('\n').map(l => `<p>${l ? CW.escape(l) : '<br>'}</p>`).join('');
    } else if (ext === 'doc') {
      throw new Error('Старый формат .doc не поддерживается — сохраните файл в Word как .docx');
    } else {
      throw new Error('Поддерживаются файлы .docx, .txt, .md и .html');
    }
    return { title, content: CW.sanitize(html) || '<p><br></p>', settings: {} };
  }

  return { importFile };
})();
