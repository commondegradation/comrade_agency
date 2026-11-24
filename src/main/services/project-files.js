'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_TEXT_CHARS = 40000;
const MAX_FILES_PER_PICK = 10;
const MAX_PDF_PAGES = 200;
const MAX_DOCX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'rst', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'toml',
  'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'sql', 'sh', 'bash',
  'swift', 'kt', 'kts', 'scala', 'rb', 'r', 'pl', 'lua', 'dart', 'ex', 'exs', 'graphql',
  'proto', 'log', 'ini', 'conf', 'cfg', 'properties'
];
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, 'pdf', 'docx']);

function validateDocxArchive(buffer) {
  if (buffer.length < 22) throw new Error('Invalid DOCX archive.');
  const searchStart = Math.max(0, buffer.length - 22 - 65535);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50
      && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('Invalid DOCX archive.');
  const entries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
    || entries > 2000 || centralOffset + centralSize > endOffset) {
    throw new Error('Unsupported or malformed DOCX archive.');
  }
  let cursor = centralOffset;
  let expandedSize = 0;
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > centralOffset + centralSize || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid DOCX archive.');
    }
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (uncompressedSize === 0xffffffff) throw new Error('Unsupported DOCX archive.');
    expandedSize += uncompressedSize;
    if (expandedSize > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw new Error('DOCX contents exceed the 32 MB extraction limit.');
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Invalid DOCX archive.');
}

async function extractPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')), '../../standard_fonts/')
  });
  const pdf = await task.promise;
  const parts = [];
  let length = 0;
  let truncated = pdf.numPages > MAX_PDF_PAGES;
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PDF_PAGES); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str || '').filter(Boolean).join(' ');
      if (!text) continue;
      const remaining = MAX_FILE_TEXT_CHARS - length;
      parts.push(text.slice(0, remaining));
      length += Math.min(text.length, remaining);
      if (text.length > remaining || length >= MAX_FILE_TEXT_CHARS) {
        truncated = true;
        break;
      }
      parts.push('\n');
    }
  } finally {
    await pdf.destroy();
  }
  return { text: parts.join('').trim(), truncated };
}

async function extractDocument(buffer, extension) {
  if (extension === '.pdf') return extractPdf(buffer);
  if (extension === '.docx') {
    validateDocxArchive(buffer);
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, truncated: false };
  }
  if (buffer.includes(0)) throw new Error('Binary files are not supported.');
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), truncated: false };
  } catch {
    throw new Error('Text files must use UTF-8 encoding.');
  }
}

async function readFile(filePath) {
  const name = path.basename(filePath);
  const extension = path.extname(name).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension.slice(1))) {
    throw new Error(`${name}: unsupported file type.`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`${name}: not a file.`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`${name}: files must be 8 MB or smaller.`);

  const buffer = fs.readFileSync(filePath);
  try {
    const extracted = await extractDocument(buffer, extension);
    const text = extracted.text.trim();
    if (!text) throw new Error('No readable text was found.');
    const truncated = extracted.truncated || text.length > MAX_FILE_TEXT_CHARS;
    return {
      id: crypto.createHash('sha256').update(name).update(buffer).digest('hex'),
      name,
      size: stat.size,
      text: text.slice(0, MAX_FILE_TEXT_CHARS),
      truncated
    };
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
}

async function readFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length > MAX_FILES_PER_PICK) {
    throw new Error(`Select no more than ${MAX_FILES_PER_PICK} files at a time.`);
  }
  const files = [];
  for (const filePath of filePaths) files.push(await readFile(filePath));
  return files;
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_FILE_TEXT_CHARS,
  MAX_FILES_PER_PICK,
  TEXT_EXTENSIONS,
  readFile,
  readFiles
};
