'use strict';

// Builds a multi-size Windows .ico from the PNGs written by make-icons.js
// (PNG-compressed entries, supported by Windows Vista and later).
const fs = require('fs');
const path = require('path');

const BUILD = path.resolve(__dirname, '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const pngs = SIZES.map((size) => ({ size, data: fs.readFileSync(path.join(BUILD, `icon-${size}.png`)) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);

const entries = [];
let offset = 6 + pngs.length * 16;
for (const { size, data } of pngs) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += data.length;
  entries.push(entry);
}

const ico = Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);
console.log(`icon.ico written (${ico.length} bytes, ${pngs.length} sizes)`);
