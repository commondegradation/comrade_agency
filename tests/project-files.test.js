'use strict';

const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const projectFiles = require('../src/main/services/project-files');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-files-test-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeFile(name, data) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, data);
  return file;
}

function makePdf(text) {
  const content = `BT /F1 14 Tf 40 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeDocx(text, uncompressedSize = null) {
  const name = Buffer.from('word/document.xml');
  const xml = Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  const compressed = zlib.deflateRawSync(xml);
  const crc = crc32(xml);
  const declaredSize = uncompressedSize ?? xml.length;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declaredSize, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

test('reads UTF-8 project text and preserves its display name', async () => {
  const result = await projectFiles.readFile(writeFile('notes.md', 'Project notes in UTF-8'));
  assert.equal(result.name, 'notes.md');
  assert.equal(result.text, 'Project notes in UTF-8');
  assert.equal(result.truncated, false);
  assert.equal(result.id.length, 64);
});

test('extracts text from PDF and DOCX project files', async () => {
  const pdf = await projectFiles.readFile(writeFile('reference.pdf', makePdf('PDF project context')));
  const docx = await projectFiles.readFile(writeFile('reference.docx', makeDocx('Word project context')));
  assert.match(pdf.text, /PDF project context/);
  assert.match(docx.text, /Word project context/);
});

test('reports unsupported, oversized, and over-limit selections explicitly', async () => {
  await assert.rejects(projectFiles.readFile(writeFile('image.bin', Buffer.from('binary'))), /unsupported file type/);
  await assert.rejects(
    projectFiles.readFile(writeFile('large.txt', Buffer.alloc(projectFiles.MAX_FILE_BYTES + 1, 0x61))),
    /8 MB or smaller/
  );
  await assert.rejects(projectFiles.readFiles(Array(11).fill('unused.txt')), /no more than 10 files/);
});

test('rejects DOCX archives whose declared expanded contents exceed the limit', async () => {
  const file = writeFile('expanded.docx', makeDocx('x', 33 * 1024 * 1024));
  await assert.rejects(projectFiles.readFile(file), /32 MB extraction limit/);
});
