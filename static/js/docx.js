'use strict';
// Экспорт документа в настоящий .docx (Office Open XML): стили, списки, таблицы, рисунки, ссылки, колонтитулы
window.CWDocx = (() => {
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const MM_TW = 56.6929;
  const PX_EMU = 9525;

  const esc = s => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿​]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE', 'FIGCAPTION', 'SECTION', 'ARTICLE', 'CAPTION']);
  const STYLE_BY_TAG = { H1: 'Heading1', H2: 'Heading2', H3: 'Heading3', H4: 'Heading4', H5: 'Heading4', H6: 'Heading4', PRE: 'Code' };
  const STYLE_BY_CLASS = {
    'cw-title': 'Title', 'cw-subtitle': 'Subtitle', 'cw-quote': 'Quote', 'cw-code': 'Code', 'cw-nospace': 'NoSpacing',
    'cw-toc-title': 'TOCHeading', 'cw-toc-1': 'TOC1', 'cw-toc-2': 'TOC2', 'cw-toc-3': 'TOC3',
  };
  const isBlock = n => n.nodeType === 1 && (BLOCK.has(n.tagName) || n.classList.contains('page-break'));
  const hasBlockChild = el => [...el.children].some(isBlock);

  // ---------- цвета и размеры
  const cctx = document.createElement('canvas').getContext('2d');
  function hex(c) {
    if (!c) return null;
    c = String(c).trim();
    if (/^(transparent|inherit|initial|unset|currentcolor|none)$/i.test(c)) return null;
    const m0 = c.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/);
    if (m0 && +m0[1] < 0.1) return null;
    cctx.fillStyle = '#010203';
    cctx.fillStyle = c;
    const v = cctx.fillStyle;
    if (v === '#010203' && !/^#?010203$/i.test(c)) return null;
    if (v.startsWith('#')) return v.slice(1).toUpperCase();
    const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && +m[4] < 0.1)) return null;
    return [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const KW = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };
  function toPt(v, base = 11) {
    if (v == null || v === '') return null;
    v = String(v).trim();
    if (KW[v]) return KW[v];
    const m = v.match(/^(-?[\d.]+)\s*(pt|px|cm|mm|in|em|rem|%)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    switch ((m[2] || 'px').toLowerCase()) {
      case 'pt': return n;
      case 'px': return n * 0.75;
      case 'cm': return n * 28.3465;
      case 'mm': return n * 2.83465;
      case 'in': return n * 72;
      case 'em': case 'rem': return n * base;
      case '%': return n / 100 * base;
    }
    return null;
  }
  const tw = pt => Math.round(pt * 20);

  // ---------- построитель
  function makeBuilder(opts) {
    const st = {
      rels: [], media: [], images: new Map(), nums: [], abstracts: new Map(), docPr: 1,
      contentTw: opts.contentTw, contentPx: opts.contentTw / 15,
    };
    const rel = (type, target, external) => {
      const id = 'rId' + (100 + st.rels.length);
      st.rels.push({ id, type, target, external });
      return id;
    };

    function abstractFor(fmt) {
      if (st.abstracts.has(fmt)) return st.abstracts.get(fmt);
      const id = st.abstracts.size + 1;
      st.abstracts.set(fmt, id);
      return id;
    }
    function newNum(fmt, start) {
      const numId = st.nums.length + 1;
      st.nums.push({ numId, abs: abstractFor(fmt), start: start || 1 });
      return numId;
    }

    // свойства текста
    function inherit(el, ctx) {
      const c = { ...ctx };
      const t = el.tagName;
      if (t === 'B' || t === 'STRONG' || t === 'TH') c.b = true;
      if (t === 'I' || t === 'EM') c.i = true;
      if (t === 'U' || t === 'INS') c.u = true;
      if (t === 'S' || t === 'STRIKE' || t === 'DEL') c.s = true;
      if (t === 'SUP') c.va = 'superscript';
      if (t === 'SUB') c.va = 'subscript';
      if (t === 'MARK') c.shd = 'FFFF00';
      if (t === 'CODE' || t === 'PRE') c.font = 'Consolas';
      if (t === 'PRE' || el.classList?.contains('cw-code')) c.pre = true;
      const s = el.style;
      if (s) {
        const fw = s.fontWeight;
        if (fw) c.b = fw === 'bold' || fw === 'bolder' || +fw >= 600;
        if (s.fontStyle) c.i = /italic|oblique/.test(s.fontStyle);
        const td = s.textDecorationLine || s.textDecoration;
        if (td) {
          if (td.includes('underline')) c.u = true;
          if (td.includes('line-through')) c.s = true;
          if (/^none/.test(td)) { c.u = false; c.s = false; }
        }
        if (s.color) { const x = hex(s.color); if (x) c.color = x; }
        if (s.backgroundColor && !isBlock(el) && el.tagName !== 'TD' && el.tagName !== 'TH') { c.shd = hex(s.backgroundColor) || undefined; }
        if (s.fontSize) { const p = toPt(s.fontSize, c.sz || 11); if (p) c.sz = p; }
        if (s.fontFamily) c.font = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (s.verticalAlign === 'super') c.va = 'superscript';
        if (s.verticalAlign === 'sub') c.va = 'subscript';
        if (s.textTransform === 'uppercase') c.caps = true;
        if (/^pre/.test(s.whiteSpace)) c.pre = true;
      }
      return c;
    }
    function rPr(c) {
      let x = '';
      if (c.rStyle) x += `<w:rStyle w:val="${c.rStyle}"/>`;
      if (c.font) { const f = esc(c.font); x += `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>`; }
      if (c.b) x += '<w:b/><w:bCs/>'; else if (c.b === false) x += '<w:b w:val="0"/><w:bCs w:val="0"/>';
      if (c.i) x += '<w:i/><w:iCs/>'; else if (c.i === false) x += '<w:i w:val="0"/>';
      if (c.caps) x += '<w:caps/>';
      if (c.s) x += '<w:strike/>';
      if (c.color) x += `<w:color w:val="${c.color}"/>`;
      if (c.sz) { const v = Math.max(2, Math.round(c.sz * 2)); x += `<w:sz w:val="${v}"/><w:szCs w:val="${v}"/>`; }
      if (c.u) x += '<w:u w:val="single"/>'; else if (c.u === false && c.rStyle) x += '<w:u w:val="none"/>';
      if (c.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${c.shd}"/>`;
      if (c.va) x += `<w:vertAlign w:val="${c.va}"/>`;
      return x ? `<w:rPr>${x}</w:rPr>` : '';
    }

    class Para {
      constructor(p) { this.p = p || {}; this.runs = ''; this.has = false; }
      text(s, c) {
        if (!c.pre) s = s.replace(/[\r\n]+/g, ' ');
        if (!s) return;
        let x = '';
        const lines = s.split('\n');
        lines.forEach((line, li) => {
          if (li) x += '<w:br/>';
          line.split('\t').forEach((part, i) => {
            if (i) x += '<w:tab/>';
            if (part) x += `<w:t xml:space="preserve">${esc(part.replace(/ /g, ' '))}</w:t>`;
          });
        });
        if (x) { this.runs += `<w:r>${rPr(c)}${x}</w:r>`; this.has = true; }
      }
      raw(x) { this.runs += x; this.has = true; }
      // завершающий <br> в HTML не создаёт новую строку — убираем его
      xml() { return `<w:p>${pPr(this.p)}${this.runs.replace(/<w:r><w:br\/><\/w:r>$/, '')}</w:p>`; }
    }
    function pPr(p) {
      let x = '';
      if (p.style) x += `<w:pStyle w:val="${p.style}"/>`;
      if (p.keepNext) x += '<w:keepNext/>';
      if (p.num) x += `<w:numPr><w:ilvl w:val="${p.num.ilvl}"/><w:numId w:val="${p.num.id}"/></w:numPr>`;
      if (p.bdrBottom) x += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr>';
      if (p.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shd}"/>`;
      if (p.before != null || p.after != null || p.line) {
        x += '<w:spacing' + (p.before != null ? ` w:before="${p.before}"` : '') + (p.after != null ? ` w:after="${p.after}"` : '') +
          (p.line ? ` w:line="${p.line.v}" w:lineRule="${p.line.rule}"` : '') + '/>';
      }
      if (p.left != null || p.right != null || p.firstLine != null) {
        x += '<w:ind' + (p.left != null ? ` w:left="${p.left}"` : '') + (p.right != null ? ` w:right="${p.right}"` : '') +
          (p.firstLine != null ? (p.firstLine >= 0 ? ` w:firstLine="${p.firstLine}"` : ` w:hanging="${-p.firstLine}"`) : '') + '/>';
      }
      if (p.jc) x += `<w:jc w:val="${p.jc}"/>`;
      return x ? `<w:pPr>${x}</w:pPr>` : '';
    }
    function paraProps(el, base) {
      const p = { ...(base || {}) };
      if (STYLE_BY_TAG[el.tagName]) p.style = STYLE_BY_TAG[el.tagName];
      for (const cl of el.classList || []) if (STYLE_BY_CLASS[cl]) p.style = STYLE_BY_CLASS[cl];
      if (el.tagName === 'BLOCKQUOTE') p.left = (p.left || 0) + 720;
      const s = el.style;
      if (!s) return p;
      const ta = s.textAlign || el.getAttribute('align');
      if (ta) p.jc = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', justify: 'both' }[ta] || p.jc;
      const lh = s.lineHeight;
      if (lh && lh !== 'normal') {
        if (/^[\d.]+$/.test(lh)) p.line = { v: Math.round(+lh * 240), rule: 'auto' };
        else if (/%$/.test(lh)) p.line = { v: Math.round(parseFloat(lh) / 100 * 240), rule: 'auto' };
        else { const pt = toPt(lh); if (pt) p.line = { v: tw(pt), rule: 'exact' }; }
      }
      const mt = toPt(s.marginTop); if (mt != null) p.before = Math.max(0, tw(mt));
      const mb = toPt(s.marginBottom); if (mb != null) p.after = Math.max(0, tw(mb));
      const ml = toPt(s.marginLeft); if (ml != null) p.left = Math.max(0, (base?.left || 0) + tw(ml));
      const mr = toPt(s.marginRight); if (mr != null) p.right = Math.max(0, tw(mr));
      const ti = toPt(s.textIndent); if (ti != null) p.firstLine = tw(ti);
      const bg = hex(s.backgroundColor); if (bg) p.shd = bg;
      return p;
    }

    // ---------- инлайн-содержимое
    function inline(n, ctx, para) {
      if (n.nodeType === 3) { para.text(n.data, ctx); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName;
      if (t === 'BR') { para.raw('<w:r><w:br/></w:r>'); return; }
      if (t === 'IMG') { para.raw(imageRun(n)); return; }
      if (n.classList.contains('page-break')) { para.raw('<w:r><w:br w:type="page"/></w:r>'); return; }
      const c = inherit(n, ctx);
      if (t === 'A') {
        const href = n.getAttribute('href') || '';
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          const id = rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', href, true);
          const inner = new Para();
          c.rStyle = 'Hyperlink';
          for (const k of n.childNodes) inline(k, c, inner);
          para.raw(`<w:hyperlink r:id="${id}" w:history="1">${inner.runs}</w:hyperlink>`);
          return;
        }
      }
      for (const k of n.childNodes) inline(k, c, para);
    }
    function imageRun(img) {
      const info = st.images.get(img);
      if (!info) {
        const alt = img.getAttribute('alt');
        return alt ? `<w:r><w:t xml:space="preserve">[${esc(alt)}]</w:t></w:r>` : '';
      }
      let wpx = null;
      const sw = img.style.width;
      if (sw && sw.endsWith('%')) wpx = st.contentPx * parseFloat(sw) / 100;
      else if (sw) { const pt = toPt(sw); if (pt) wpx = pt / 0.75; }
      if (!wpx && img.getAttribute('width') && !/%/.test(img.getAttribute('width'))) wpx = +img.getAttribute('width');
      if (!wpx) wpx = info.w;
      wpx = Math.min(wpx, st.contentPx);
      const hpx = info.w ? wpx * info.h / info.w : wpx;
      const cx = Math.round(wpx * PX_EMU), cy = Math.round(hpx * PX_EMU);
      const id = st.docPr++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
        `<wp:docPr id="${id}" name="Рисунок ${id}" descr="${esc(img.getAttribute('alt') || '')}"/>` +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
        `<pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.${info.ext}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="${info.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }

    // ---------- блоки
    function container(el, ctx, pBase) {
      let xml = '', para = null;
      const flush = () => { if (para) { xml += para.xml(); para = null; } };
      for (const n of el.childNodes) {
        if (n.nodeType === 3 || (n.nodeType === 1 && !isBlock(n))) {
          if (n.nodeType === 3 && !para && !n.data.trim()) continue;
          if (!para) para = new Para(pBase);
          inline(n, ctx, para);
        } else if (n.nodeType === 1) { flush(); xml += block(n, ctx, pBase); }
      }
      flush();
      return xml;
    }
    function block(el, ctx, pBase) {
      const t = el.tagName;
      if (el.classList.contains('page-break')) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (t === 'HR') return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A0A0A0"/></w:pBdr></w:pPr></w:p>';
      const c = inherit(el, ctx);
      if (t === 'TABLE') return table(el, c);
      if (t === 'UL' || t === 'OL') return list(el, ctx, null);
      const p = paraProps(el, pBase);
      if (hasBlockChild(el)) return container(el, c, p);
      const para = new Para(p);
      for (const n of el.childNodes) inline(n, c, para);
      return para.xml();
    }
    const OL_FMT = { 'lower-alpha': 'lowerLetter', 'lower-latin': 'lowerLetter', 'upper-alpha': 'upperLetter', 'upper-latin': 'upperLetter', 'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman', decimal: 'decimal' };
    const OL_TYPE = { a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman', 1: 'decimal' };
    function list(el, ctx, parent) {
      const ordered = el.tagName === 'OL';
      const level = parent ? Math.min(parent.level + 1, 8) : 0;
      const check = el.classList.contains('cw-checklist');
      const fmt = ordered ? (OL_FMT[el.style.listStyleType || OL_TYPE[el.getAttribute('type')]] || 'decimal') : 'bullet';
      let numId = null;
      if (!check) {
        if (parent && parent.numId && parent.family === (ordered ? 'o' : 'b')) numId = parent.numId;
        else numId = newNum(level === 0 ? fmt : (ordered ? 'decimal' : 'bullet'), ordered ? (+el.getAttribute('start') || 1) : 1);
      }
      const info = { level, numId, family: ordered ? 'o' : 'b' };
      let xml = '';
      for (const li of el.children) {
        if (li.tagName === 'UL' || li.tagName === 'OL') { xml += list(li, ctx, info); continue; }
        if (li.tagName !== 'LI') { xml += block(li, ctx, {}); continue; }
        const c = inherit(li, ctx);
        const p = paraProps(li, {});
        if (!p.style) p.style = 'ListParagraph';
        if (check) { if (p.left == null) p.left = 360 + level * 360; } else p.num = { id: numId, ilvl: level };
        let first = true, para = null;
        const nextP = () => {
          if (first) {
            first = false;
            const np = new Para(p);
            if (check) np.text(li.hasAttribute('data-checked') ? '☑ ' : '☐ ', c);
            return np;
          }
          return new Para({ ...p, num: undefined, left: 720 * (level + 1) });
        };
        for (const n of li.childNodes) {
          if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) {
            if (para) { xml += para.xml(); para = null; }
            if (first) xml += nextP().xml();
            xml += list(n, ctx, info);
          } else if (n.nodeType === 1 && isBlock(n)) {
            if (para) { xml += para.xml(); para = null; }
            const np = nextP();
            const cc = inherit(n, c);
            const pp = paraProps(n, np.p);
            if (hasBlockChild(n) || n.tagName === 'TABLE') xml += (n.tagName === 'TABLE' ? table(n, cc) : container(n, cc, pp));
            else { const q = new Para(pp); q.runs = np.runs; for (const k of n.childNodes) inline(k, cc, q); xml += q.xml(); }
          } else {
            if (!para) para = nextP();
            inline(n, c, para);
          }
        }
        if (para) xml += para.xml();
        else if (first) xml += nextP().xml();
      }
      return xml;
    }
    function table(el, ctx) {
      const rows = [...el.rows];
      if (!rows.length) return '';
      const plain = el.classList.contains('cw-table-plain'), accent = el.classList.contains('cw-table-accent');
      let cols = 0;
      rows.forEach(r => { let n = 0; for (const c of r.cells) n += c.colSpan || 1; cols = Math.max(cols, n); });
      let tblW = st.contentTw;
      const sw = el.style.width;
      if (sw && sw.endsWith('%')) tblW = Math.round(st.contentTw * Math.min(100, parseFloat(sw)) / 100);
      else if (sw) { const pt = toPt(sw); if (pt) tblW = Math.min(st.contentTw, tw(pt)); }
      const colW = Math.floor(tblW / cols);
      const bc = accent ? '8EAADB' : '000000';
      const sides = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
      const borders = sides.map(s => plain ? `<w:${s} w:val="nil"/>` : `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="${bc}"/>`).join('');
      let x = `<w:tbl><w:tblPr><w:tblW w:w="${tblW}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
        '<w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr>' +
        `<w:tblGrid>${`<w:gridCol w:w="${colW}"/>`.repeat(cols)}</w:tblGrid>`;
      rows.forEach((r, ri) => {
        x += '<w:tr>';
        if (ri === 0 && (r.parentElement.tagName === 'THEAD' || [...r.cells].every(c => c.tagName === 'TH'))) x += '<w:trPr><w:tblHeader/></w:trPr>';
        let n = 0;
        for (const cell of r.cells) {
          const span = cell.colSpan || 1;
          n += span;
          const cc = inherit(cell, ctx);
          let fill = hex(cell.style.backgroundColor);
          if (accent) {
            if (ri === 0) { fill = fill || '4472C4'; cc.color = cc.color || 'FFFFFF'; cc.b = true; }
            else if (ri % 2 === 1) fill = fill || 'D9E2F3';
          }
          const va = cell.style.verticalAlign;
          x += `<w:tc><w:tcPr><w:tcW w:w="${colW * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}` +
            `${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${va === 'middle' ? '<w:vAlign w:val="center"/>' : va === 'bottom' ? '<w:vAlign w:val="bottom"/>' : ''}</w:tcPr>`;
          const base = { after: 0 };
          const ta = cell.style.textAlign;
          if (ta) base.jc = { left: 'left', center: 'center', right: 'right', justify: 'both' }[ta];
          let inner = container(cell, cc, base);
          if (!/<\/w:p>$|<w:p\/>$/.test(inner)) inner += '<w:p/>';
          x += inner + '</w:tc>';
        }
        for (; n < cols; n++) x += `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
        x += '</w:tr>';
      });
      return x + '</w:tbl>';
    }

    return { st, rel, container, newNum };
  }

  // ---------- картинки
  const loadImg = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  async function prepareImages(root, b) {
    const imgs = [...root.querySelectorAll('img')];
    let n = 0;
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src) continue;
      try {
        const res = await fetch(src);
        let blob = await res.blob();
        const url = URL.createObjectURL(blob);
        let el;
        try { el = await loadImg(url); } finally { URL.revokeObjectURL(url); }
        let type = blob.type;
        if (!/^image\/(png|jpeg|gif)$/.test(type)) {
          const c = document.createElement('canvas');
          c.width = el.naturalWidth || 300; c.height = el.naturalHeight || 150;
          c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
          blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
          type = 'image/png';
        }
        const ext = type === 'image/jpeg' ? 'jpeg' : type.split('/')[1];
        const name = `image${++n}.${ext}`;
        b.st.media.push({ name, data: await blob.arrayBuffer() });
        const rid = b.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/' + name);
        b.st.images.set(img, { rid, ext, w: el.naturalWidth || 300, h: el.naturalHeight || 150 });
      } catch (e) {
        console.warn('Рисунок не удалось добавить в .docx', src.slice(0, 80), e);
      }
    }
  }

  // ---------- части пакета
  function numberingXml(b) {
    const BUL = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
    let x = XML + `<w:numbering ${NS}>`;
    for (const [fmt, id] of b.st.abstracts) {
      x += `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>`;
      for (let i = 0; i < 9; i++) {
        const bullet = fmt === 'bullet';
        const f = bullet ? 'bullet' : i === 0 ? fmt : ['decimal', 'lowerLetter', 'lowerRoman'][i % 3];
        const text = bullet ? BUL[i] : `%${i + 1}.`;
        x += `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${f}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
          `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>` +
          (bullet ? '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/></w:rPr>' : '') + '</w:lvl>';
      }
      x += '</w:abstractNum>';
    }
    for (const n of b.st.nums) {
      x += `<w:num w:numId="${n.numId}"><w:abstractNumId w:val="${n.abs}"/>` +
        `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.start}"/></w:lvlOverride></w:num>`;
    }
    return x + '</w:numbering>';
  }
  function stylesXml() {
    const ps = (id, name, ppr, rpr, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}</w:style>`;
    const light = '<w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light" w:cs="Calibri Light" w:eastAsia="Calibri Light"/>';
    return XML + `<w:styles ${NS}>` +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Times New Roman"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      ps('Heading1', 'heading 1', '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/>', `${light}<w:color w:val="2F5496"/><w:sz w:val="32"/><w:szCs w:val="32"/>`) +
      ps('Heading2', 'heading 2', '<w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="1"/>', `${light}<w:color w:val="2F5496"/><w:sz w:val="26"/><w:szCs w:val="26"/>`) +
      ps('Heading3', 'heading 3', '<w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/>', `${light}<w:color w:val="1F3763"/><w:sz w:val="24"/><w:szCs w:val="24"/>`) +
      ps('Heading4', 'heading 4', '<w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="3"/>', `${light}<w:i/><w:iCs/><w:color w:val="2F5496"/>`) +
      ps('Title', 'Title', '<w:spacing w:after="160" w:line="240" w:lineRule="auto"/><w:contextualSpacing/>', `${light}<w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz w:val="56"/><w:szCs w:val="56"/>`) +
      ps('Subtitle', 'Subtitle', '', '<w:color w:val="5A5A5A"/><w:spacing w:val="15"/>') +
      ps('Quote', 'Quote', '<w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/>', '<w:i/><w:iCs/><w:color w:val="404040"/>') +
      ps('Code', 'Code', '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/>') +
      ps('NoSpacing', 'No Spacing', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '') +
      ps('ListParagraph', 'List Paragraph', '<w:ind w:left="720"/><w:contextualSpacing/>', '') +
      ps('TOCHeading', 'TOC Heading', '<w:keepNext/><w:spacing w:before="240" w:after="120"/>', `${light}<w:color w:val="2F5496"/><w:sz w:val="32"/><w:szCs w:val="32"/>`) +
      ps('TOC1', 'toc 1', '<w:spacing w:after="60"/>', '') +
      ps('TOC2', 'toc 2', '<w:spacing w:after="60"/><w:ind w:left="220"/>', '') +
      ps('TOC3', 'toc 3', '<w:spacing w:after="60"/><w:ind w:left="440"/>', '') +
      ps('Header', 'header', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:color w:val="595959"/><w:sz w:val="20"/>') +
      ps('Footer', 'footer', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:color w:val="595959"/><w:sz w:val="20"/>') +
      '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
      '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
  }
  function hfXml(kind, text, numPos) {
    const tag = kind === 'header' ? 'w:hdr' : 'w:ftr';
    const style = kind === 'header' ? 'Header' : 'Footer';
    let paras = '';
    if (text) paras += `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
    if (numPos) {
      paras += `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:jc w:val="${numPos}"/></w:pPr>` +
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    }
    return XML + `<${tag} ${NS}>${paras || '<w:p/>'}</${tag}>`;
  }

  async function build({ html, root, title, settings, author }) {
    await CW.loadScript(JSZIP);
    const s = CW.normSettings(settings);
    if (!root) { root = document.createElement('div'); root.innerHTML = CW.sanitize(html || ''); }
    const { w, h } = CW.pageDims(s);
    const m = s.margins;
    const cols = Math.max(1, s.columns || 1);
    const contentTw = Math.round(((w - m.left - m.right) * MM_TW - (cols - 1) * 708) / cols);
    const b = makeBuilder({ contentTw });
    await prepareImages(root, b);

    let body = b.container(root, {}, {});
    if (!body || /<\/w:tbl>$/.test(body)) body += '<w:p/>';

    const pn = s.pageNumbers && s.pageNumbers !== 'none' ? s.pageNumbers.split('-') : null;
    const numJc = pn ? { left: 'left', center: 'center', right: 'right' }[pn[1]] : null;
    const needHeader = !!(s.header || (pn && pn[0] === 'top'));
    const needFooter = !!(s.footer || (pn && pn[0] === 'bottom'));
    const zip = new JSZip();
    let refs = '';
    if (needHeader) {
      const id = b.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', 'header1.xml');
      zip.file('word/header1.xml', hfXml('header', s.header, pn && pn[0] === 'top' ? numJc : null));
      refs += `<w:headerReference w:type="default" r:id="${id}"/>`;
    }
    if (needFooter) {
      const id = b.rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer', 'footer1.xml');
      zip.file('word/footer1.xml', hfXml('footer', s.footer, pn && pn[0] === 'bottom' ? numJc : null));
      refs += `<w:footerReference w:type="default" r:id="${id}"/>`;
    }
    const landscape = s.orientation === 'landscape';
    const sect = `<w:sectPr>${refs}<w:pgSz w:w="${Math.round(w * MM_TW)}" w:h="${Math.round(h * MM_TW)}"${landscape ? ' w:orient="landscape"' : ''}/>` +
      `<w:pgMar w:top="${Math.round(m.top * MM_TW)}" w:right="${Math.round(m.right * MM_TW)}" w:bottom="${Math.round(m.bottom * MM_TW)}" w:left="${Math.round(m.left * MM_TW)}" w:header="708" w:footer="708" w:gutter="0"/>` +
      `<w:cols${cols > 1 ? ` w:num="${cols}"` : ''} w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
    const bg = s.pageColor ? hex(s.pageColor) : null;
    const documentXml = XML + `<w:document ${NS}>${bg ? `<w:background w:color="${bg}"/>` : ''}<w:body>${body}${sect}</w:body></w:document>`;

    const hasNum = b.st.nums.length > 0;
    let rels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      (hasNum ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : '');
    for (const r of b.st.rels) rels += `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`;
    rels += '</Relationships>';

    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const who = esc(author || 'CloWord');
    zip.file('[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      (hasNum ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : '') +
      (needHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '') +
      (needFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
    zip.file('_rels/.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    zip.file('docProps/core.xml', XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${esc(title || '')}</dc:title><dc:creator>${who}</dc:creator><cp:lastModifiedBy>${who}</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.file('docProps/app.xml', XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>CloWord</Application></Properties>');
    zip.file('word/document.xml', documentXml);
    zip.file('word/styles.xml', stylesXml());
    zip.file('word/settings.xml', XML + `<w:settings ${NS}>${bg ? '<w:displayBackgroundShape/>' : ''}<w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/>` +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>');
    if (hasNum) zip.file('word/numbering.xml', numberingXml(b));
    zip.file('word/_rels/document.xml.rels', rels);
    for (const md of b.st.media) zip.file('word/media/' + md.name, md.data);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
  }

  return { build };
})();
