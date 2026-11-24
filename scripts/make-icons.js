'use strict';

// Rasterises the supplied logo into the PNG sizes Electron/builder need
// without any image library: the logo is decoded by Chromium itself.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
app.disableHardwareAcceleration();

const ROOT = path.resolve(__dirname, '..');
const LOGO = fs.readFileSync(path.join(ROOT, 'logo.png')).toString('base64');
const OUT = path.join(ROOT, 'build');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 1100,
    webPreferences: { offscreen: true }
  });

  // Square icon: logo trimmed to its ink, centred on white with a hairline
  // frame so it stays legible on dark docks.
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#fff">
    <div id="stage" style="position:relative;width:1024px;height:1024px;background:#fff;overflow:hidden">
      <img id="logo" style="position:absolute;left:0;top:0;width:1024px;height:auto" />
    </div>
    <script>
      const img = document.getElementById('logo');
      window.ready = new Promise((resolve) => {
        const go = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              const i = (y * c.width + x) * 4;
              if (d[i] < 128 && d[i + 3] > 8) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
              }
            }
          }
          resolve({ minX, minY, maxX, maxY, w: c.width, h: c.height });
        };
        if (img.complete && img.naturalWidth) go(); else img.onload = go;
      });
    </script></body></html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await win.webContents.executeJavaScript(
    `document.getElementById('logo').src = 'data:image/png;base64,${LOGO}'`
  );
  const box = await win.webContents.executeJavaScript('window.ready');
  const objW = box.maxX - box.minX + 1;
  const objH = box.maxY - box.minY + 1;

  const size = 1024;
  const pad = Math.round(size * 0.1);
  const scale = Math.min((size - pad * 2) / objW, (size - pad * 2) / objH);
  const drawW = objW * scale;
  const drawH = objH * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;

  await win.webContents.executeJavaScript(`(() => {
    const stage = document.getElementById('stage');
    const img = document.getElementById('logo');
    stage.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = ${size}; canvas.height = ${size};
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ${size}, ${size});
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ${box.minX}, ${box.minY}, ${objW}, ${objH}, ${dx}, ${dy}, ${drawW}, ${drawH});
    window.master = canvas.toDataURL('image/png');
    stage.innerHTML = '<img src="' + window.master + '" style="width:1024px;height:1024px">';
    return true;
  })()`);

  const master = await win.webContents.executeJavaScript('window.master');
  const masterBuf = Buffer.from(master.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, 'icon.png'), masterBuf);

  for (const s of SIZES) {
    if (s === size) {
      fs.writeFileSync(path.join(OUT, `icon-${s}.png`), masterBuf);
      continue;
    }
    const data = await win.webContents.executeJavaScript(`(() => {
      const im = new Image();
      im.src = window.master;
      return new Promise((res) => { im.onload = () => {
        const c = document.createElement('canvas'); c.width = ${s}; c.height = ${s};
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(im, 0, 0, ${s}, ${s});
        res(c.toDataURL('image/png'));
      }; });
    })()`);
    fs.writeFileSync(path.join(OUT, `icon-${s}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }

  // iconset for macOS (iconutil)
  const iconset = path.join(OUT, 'icon.iconset');
  fs.mkdirSync(iconset, { recursive: true });
  const mapping = { 16: [16, 32], 32: [32, 64], 128: [128, 256], 256: [256, 512], 512: [512, 1024] };
  for (const [base, [one, two]] of Object.entries(mapping)) {
    fs.copyFileSync(path.join(OUT, `icon-${one}.png`), path.join(iconset, `icon_${base}x${base}.png`));
    fs.copyFileSync(path.join(OUT, `icon-${two}.png`), path.join(iconset, `icon_${base}x${base}@2x.png`));
  }
  if (process.platform === 'darwin') {
    require('child_process').execFileSync('iconutil', [
      '-c', 'icns', iconset, '-o', path.join(OUT, 'icon.icns')
    ]);
  }
  console.log('icons written', { objW, objH, scale: scale.toFixed(3) });
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
