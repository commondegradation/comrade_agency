'use strict';
const fs = require('fs');
const { nativeImage } = require('electron');
const MAX_BYTES = 8 * 1024 * 1024;
function fromFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Выберите изображение размером до 8 МБ');
  const image = nativeImage.createFromBuffer(fs.readFileSync(file));
  if (image.isEmpty()) throw new Error('Файл не является поддерживаемым изображением');
  const size = image.getSize();
  if (size.width > 8192 || size.height > 8192) throw new Error('Максимальный размер изображения — 8192 × 8192');
  const side = Math.min(size.width, size.height);
  return image.crop({ x: Math.floor((size.width - side) / 2), y: Math.floor((size.height - side) / 2), width: side, height: side })
    .resize({ width: 256, height: 256, quality: 'best' }).toDataURL();
}

function bannerFromFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Выберите изображение размером до 8 МБ');
  const image = nativeImage.createFromBuffer(fs.readFileSync(file));
  if (image.isEmpty()) throw new Error('Файл не является поддерживаемым изображением');
  const size = image.getSize();
  if (size.width > 8192 || size.height > 8192) throw new Error('Максимальный размер изображения — 8192 × 8192');
  const scale = Math.min(1, 1600 / size.width, 500 / size.height);
  return image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: 'best'
  }).toDataURL();
}

module.exports = { fromFile, bannerFromFile };
