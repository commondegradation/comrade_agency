/* ------------------------------------------------------------------ *
 * Comrade Agency — utilities
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const U = {};

  U.uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  U.esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  U.debounce = (fn, ms = 400) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  U.throttle = (fn, ms = 90) => {
    let last = 0;
    let timer = null;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn(...args);
        }, ms - (now - last));
      }
    };
  };

  U.initials = (name) =>
    String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

  U.time = (ts) =>
    new Date(ts).toLocaleTimeString(window.S?.data.ui.locale === 'en' ? 'en-US' : 'ru-RU', { hour: '2-digit', minute: '2-digit' });

  U.relTime = (ts) => {
    const diff = (Date.now() - ts) / 1000;
    const ru = window.S?.data.ui.locale !== 'en';
    if (diff < 60) return ru ? 'сейчас' : 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}${ru ? ' мин' : 'm'}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}${ru ? ' ч' : 'h'}`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}${ru ? ' дн' : 'd'}`;
    return new Date(ts).toLocaleDateString(window.S?.data.ui.locale === 'en' ? 'en-US' : 'ru-RU', { month: 'short', day: 'numeric' });
  };

  U.bytes = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  U.truncate = (s, n = 160) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  /** Minimal, safe Markdown -> HTML. Raw HTML is escaped first. */
  U.md = (text) => {
    let src = U.esc(text || '');
    const blocks = [];
    src = src.replace(/```([\w+#.-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
      const i = blocks.length;
      blocks.push(
        `<div class="code-block"><div class="code-head"><span>${U.esc(lang || 'text')}</span>` +
          `<button class="copy-btn" data-copy="${i}">Copy</button></div>` +
          `<pre><code>${code.replace(/\n$/, '')}</code></pre></div>`
      );
      return `\u0000B${i}\u0000`;
    });
    if (/^\s*\|.*\|\s*\n\s*\|[\s:|-]+\|/m.test(src)) src = U.mdTable(src);

    src = src
      .replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    const lines = src.split('\n');
    let html = '';
    let list = null;
    const closeList = () => {
      if (list) html += `</${list}>`;
      list = null;
    };
    for (const line of lines) {
      const bm = line.match(/^\u0000B(\d+)\u0000$/);
      if (bm) {
        closeList();
        html += blocks[Number(bm[1])];
        continue;
      }
      const hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) {
        closeList();
        const lvl = Math.min(hm[1].length + 1, 6);
        html += `<h${lvl}>${hm[2]}</h${lvl}>`;
        continue;
      }
      const qm = line.match(/^&gt;\s?(.*)$/);
      if (qm) {
        closeList();
        html += `<blockquote>${qm[1]}</blockquote>`;
        continue;
      }
      const ulm = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ulm) {
        if (list !== 'ul') {
          closeList();
          list = 'ul';
          html += '<ul>';
        }
        html += `<li>${ulm[1]}</li>`;
        continue;
      }
      const olm = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (olm) {
        if (list !== 'ol') {
          closeList();
          list = 'ol';
          html += '<ol>';
        }
        html += `<li>${olm[1]}</li>`;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        closeList();
        html += '<hr>';
        continue;
      }
      if (!line.trim()) {
        closeList();
        continue;
      }
      closeList();
      html += `<p>${line}</p>`;
    }
    closeList();
    return html;
  };

  U.mdTable = (src) =>
    src.replace(/(^\s*\|.*\|\s*\n\s*\|[\s:|-]+\|\s*\n(?:\s*\|.*\|\s*\n?)+)/gm, (table) => {
      const rows = table.trim().split('\n').map((r) =>
        r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      );
      const head = rows[0];
      const body = rows.slice(2);
      return (
        '<table><thead><tr>' +
        head.map((c) => `<th>${c}</th>`).join('') +
        '</tr></thead><tbody>' +
        body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
        '</tbody></table>'
      );
    });

  U.clipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };

  U.download = (filename, content, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  U.qs = (sel, root = document) => root.querySelector(sel);
  U.qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  U.fileExt = (name) => {
    const m = String(name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  };

  /** Pick a sensible filename extension + mime for an artifact. */
  U.artifactKind = (lang, code, name) => {
    const l = String(lang || '').toLowerCase();
    const existingExt = U.fileExt(name);
    const base = name ? String(name).replace(/\.[^.]+$/, '') : '';
    const table = {
      html: ['html', 'text/html'],
      htm: ['html', 'text/html'],
      xml: ['xml', 'application/xml'],
      svg: ['svg', 'image/svg+xml'],
      css: ['css', 'text/css'],
      js: ['js', 'text/javascript'],
      javascript: ['js', 'text/javascript'],
      mjs: ['js', 'text/javascript'],
      ts: ['ts', 'text/plain'],
      typescript: ['ts', 'text/plain'],
      tsx: ['tsx', 'text/plain'],
      jsx: ['jsx', 'text/plain'],
      py: ['py', 'text/x-python'],
      python: ['py', 'text/x-python'],
      json: ['json', 'application/json'],
      md: ['md', 'text/markdown'],
      markdown: ['md', 'text/markdown'],
      sh: ['sh', 'text/x-shellscript'],
      bash: ['sh', 'text/x-shellscript'],
      yml: ['yml', 'text/yaml'],
      yaml: ['yaml', 'text/yaml'],
      sql: ['sql', 'text/plain'],
      go: ['go', 'text/plain'],
      rs: ['rs', 'text/plain'],
      java: ['java', 'text/plain'],
      c: ['c', 'text/plain'],
      cpp: ['cpp', 'text/plain'],
      cs: ['cs', 'text/plain'],
      rb: ['rb', 'text/plain'],
      php: ['php', 'text/plain'],
      txt: ['txt', 'text/plain'],
      toml: ['toml', 'text/plain'],
      env: ['txt', 'text/plain']
    };
    const ext = existingExt || table[l]?.[0] || (l && /^[a-z]{1,4}$/.test(l) ? l : 'txt');
    const mime = table[ext]?.[1] || 'text/plain';
    const label = ext.toUpperCase();
    const looksHtml = /:\s*(text\/html|html)\b/i.test(code || '') || /<(!doctype html|html|div|body|canvas)\b/i.test(code || '');
    return {
      ext,
      mime: existingExt === 'html' || (l === 'html' && !existingExt) ? 'text/html' : mime,
      label,
      name: name || `${base || (looksHtml ? 'artifact' : 'output')}.${ext}`,
      isHtml: ext === 'html' || (looksHtml && (l === '' || l === 'html' || l === 'htm'))
    };
  };

  window.U = U;
})();
