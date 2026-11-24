/* ------------------------------------------------------------------ *
 * Artifact collector
 * All code an agent writes inside fenced blocks becomes ONE artifact
 * (one file). Each assistant message produces a version of the artifact
 * for its chat; HTML documents are merged into a single runnable file.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const U = window.U;

  const EXT_LANG = {
    html: 'html', htm: 'html', css: 'css', js: 'js', javascript: 'js', mjs: 'js',
    ts: 'ts', typescript: 'ts', jsx: 'jsx', tsx: 'tsx', json: 'json', py: 'python',
    python: 'python', md: 'md', markdown: 'md', sh: 'bash', bash: 'bash', shell: 'bash',
    yml: 'yaml', yaml: 'yaml', sql: 'sql', go: 'go', rust: 'rust', rs: 'rust',
    java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php',
    svg: 'svg', xml: 'xml', txt: 'text', text: 'text', diff: 'diff'
  };

  const escapeHtml = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** Extract fenced code blocks from a markdown string. */
  function extractBlocks(markdown) {
    const blocks = [];
    const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
    let m;
    while ((m = re.exec(markdown || ''))) {
      const langRaw = (m[1] || '').toLowerCase();
      const code = m[2].replace(/\n+$/, '');
      if (!code.trim()) continue;
      blocks.push({ langRaw, code, lang: EXT_LANG[langRaw] || langRaw || 'text' });
    }
    return blocks;
  }

  function isHtmlBlock(b) {
    if (b.lang === 'html') return true;
    return /<(!doctype\s+html|html|head|body|div|style|canvas|script|svg)\b/i.test(b.code) && !b.langRaw;
  }

  function isDocument(c) {
    return /<!doctype html|<html[\s>]|<body[\s>]/i.test(c);
  }

  function scriptType(code) {
    if (/^\s*(import|export)\s/m.test(code)) return 'module';
    return '';
  }

  /** Merge HTML + CSS + JS (+ optional JSON/extra HTML) into one document. */
  function composeHtml(parts) {
    const htmlParts = [];
    let css = [];
    let js = [];
    let appHtml = '';
    let jsx = [];

    for (const p of parts) {
      if (p.kind === 'html') {
        if (isDocument(p.code)) {
          htmlParts.push(p.code);
          css = css.concat(p.css || []);
          js = js.concat(p.js || []);
        } else {
          appHtml += (appHtml ? '\n' : '') + p.code;
          css = css.concat(p.css || []);
          js = js.concat(p.js || []);
        }
      } else if (p.kind === 'css') css.push(p.code);
      else if (p.kind === 'js') js.push(p.code);
      else if (p.kind === 'jsx' || p.kind === 'tsx') jsx.push(p.code);
      else if (p.kind === 'json') {
        const key = String(p.tag || p.name || 'data').replace(/\W/g, '_');
        js.push(`window.${key} = ${p.code.trim()};`);
      } else if (p.kind === 'ts' || p.kind === 'tsx') {
        js.push(`/* TS block kept as-is (no transpiler bundled)\n${p.code}\n*/`);
      }
    }

    const cssText = css.join('\n\n');
    const jsText = js.join('\n\n');
    const modType = scriptType(jsText);

    if (htmlParts.length) {
      let doc = htmlParts.join('\n');
      const cssTag = cssText ? `<style>\n${cssText}\n</style>` : '';
      const jsTag = jsText ? `<script${modType ? ` type="${modType}"` : ''}>\n${jsText}\n</script>` : '';
      if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, `${cssTag}\n</head>`);
      else if (/<body[^>]*>/i.test(doc)) doc = doc.replace(/(<body[^>]*>)/i, `$1\n${cssTag}`);
      else doc = cssTag + '\n' + doc;
      if (/<\/body>/i.test(doc)) doc = doc.replace(/<\/body>/i, `${jsTag}\n</body>`);
      else doc += `\n${jsTag}`;
      if (!isDocument(doc)) doc = wrapDocument(doc);
      return doc;
    }

    const jsxNote = jsx.length
      ? '<p style="color:#777">⚠ JSX was not compiled — copy the source and build with your own toolchain.</p>'
      : '';

    return wrapDocument(
      appHtml ||
        (jsText
          ? jsxNote || '<div id="app-root" style="padding:24px;font-family:monospace;color:#777">(rendered by script)</div>'
          : '<p style="color:#777">Nothing to render.</p>'),
      cssText,
      jsText,
      modType
    );
  }

  function wrapDocument(body, css = '', js = '', modType = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Artifact</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script${modType ? ` type="${modType}"` : ''}>
${js}
</script>
</body>
</html>`;
  }

  /**
   * Build artifact payload from assistant markdown.
   * @returns {null | {code, lang, label, mime, ext, name, html, blocks, mode}}
   */
  function build(markdown, opts = {}) {
    const source = String(markdown || '');
    const raw = extractBlocks(markdown).filter((b) => b.lang !== 'diff' && !(b.lang === 'text' && b.code.length < 3));
    if (!raw.length) {
      const code = source.trim();
      if (!code) return null;
      const base = String(opts.name || 'response')
        .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '-')
        .replace(/\.[^.]+$/, '')
        .trim()
        .slice(0, 100) || 'response';
      const kind = U.artifactKind('md', code, `${base}.md`);
      return {
        code,
        lang: 'markdown',
        label: 'Markdown',
        mime: kind.mime,
        ext: kind.ext,
        name: kind.name,
        mode: 'markdown',
        blocks: []
      };
    }
    const blocks = raw.map((b) => ({
      ...b,
      kind: isHtmlBlock(b) ? 'html' : b.lang
    }));

    const hasMarkup = blocks.some((b) => b.kind === 'html');
    const niceName = (opts.name || '').match(/[a-zA-Z0-9_-]{2,}[\w-]*/);
    const htmlLike = hasMarkup || blocks.some((b) => ['css'].includes(b.kind));
    const onlyCss = blocks.every((b) => b.kind === 'css');

    if (!htmlLike) {
      const block = blocks[0];
      const kind = U.artifactKind(block.langRaw || block.kind, block.code, opts.name);
      if (blocks.length === 1) {
        return {
          code: block.code,
          lang: block.kind,
          label: kind.label,
          mime: kind.mime,
          ext: kind.ext,
          name: kind.name,
          mode: 'plain',
          blocks
        };
      }
      // Several code blocks of the same language are concatenated into one file.
      const code = blocks.map((b) => b.code).join('\n\n');
      return {
        code,
        lang: block.kind,
        label: kind.label,
        mime: kind.mime,
        ext: kind.ext,
        name: kind.name,
        mode: 'plain',
        blocks
      };
    }

    const code = composeHtml(blocks);
    const base = (niceName && niceName[0]) || (hasMarkup ? 'index' : 'style');
    return {
      code,
      lang: 'html',
      label: 'HTML',
      mime: 'text/html',
      ext: 'html',
      name: `${base === 'style' ? 'style' : base}.html`.replace(/\.html\.html$/, '.html'),
      html: code,
      mode: 'html',
      blocks
    };
  }

  window.Artifact = { build, extractBlocks, composeHtml, escapeHtml };
})();
