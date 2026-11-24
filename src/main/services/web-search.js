'use strict';

const ENDPOINT = 'https://html.duckduckgo.com/html/';
const MAX_QUERY_LENGTH = 400;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 500;
const REQUEST_TIMEOUT_MS = 12000;

const TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the public web when current information or external references are needed. Returns titles, snippets, and source URLs.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A focused web search query.' }
      },
      required: ['query'],
      additionalProperties: false
    }
  }
};

function decodeEntities(value) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
    ndash: '–', mdash: '—', hellip: '…'
  };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const number = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    if (!Number.isInteger(number) || number < 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) return '�';
    return String.fromCodePoint(number);
  });
}

function plainText(value, maxLength) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function resultUrl(href) {
  let url;
  try {
    url = new URL(href, ENDPOINT);
    if (url.hostname === 'duckduckgo.com' && url.pathname === '/l/') {
      const target = url.searchParams.get('uddg');
      if (!target) return '';
      url = new URL(target);
    }
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
  return url.href;
}

function parseResults(html) {
  const anchors = [...String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)]
    .map((match) => ({ attributes: match[1], body: match[2], index: match.index }))
    .map((anchor) => ({
      ...anchor,
      classes: attribute(anchor.attributes, 'class').split(/\s+/),
      href: attribute(anchor.attributes, 'href')
    }));
  const titles = anchors.filter((anchor) => anchor.classes.includes('result__a'));
  const results = [];

  for (let i = 0; i < titles.length && results.length < MAX_RESULTS; i++) {
    const title = titles[i];
    const nextTitle = titles[i + 1]?.index ?? String(html).length;
    const snippet = anchors.find((anchor) =>
      anchor.index > title.index && anchor.index < nextTitle && anchor.classes.includes('result__snippet')
    );
    const url = resultUrl(title.href);
    const text = plainText(title.body, 200);
    if (!url || !text) continue;
    results.push({
      title: text,
      url,
      snippet: snippet ? plainText(snippet.body, MAX_SNIPPET_LENGTH) : ''
    });
  }
  return results;
}

async function responseText(response) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Search response is too large.');
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Search response is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function search(query) {
  if (typeof query !== 'string') throw new Error('Search query must be text.');
  const normalized = query.trim();
  if (!normalized) throw new Error('Search query cannot be empty.');
  if (normalized.length > MAX_QUERY_LENGTH) throw new Error(`Search query must be ${MAX_QUERY_LENGTH} characters or fewer.`);

  const url = new URL(ENDPOINT);
  url.searchParams.set('q', normalized);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': 'ComradeAgency/1.0' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`DuckDuckGo search failed with HTTP ${response.status}.`);
    const results = parseResults(await responseText(response));
    if (!results.length) return `DuckDuckGo returned no results for "${normalized}".`;
    return `Web search results from DuckDuckGo for "${normalized}":\n\n${results.map((result, index) =>
      `${index + 1}. ${result.title}\n${result.snippet}\nSource: ${result.url}`
    ).join('\n\n')}`;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Internet search timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { TOOL, search, parseResults };
