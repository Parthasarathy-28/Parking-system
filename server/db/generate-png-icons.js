// Generate valid PNG icons (192x192 and 512x512) for PWA compliance without external dependencies
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ (-1)) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const c = crc32(typeAndData);
  chunk.writeUInt32BE(c, 8 + len);
  return chunk;
}

function createPng(size, outPath) {
  const width = size;
  const height = size;
  const scanlines = Buffer.alloc(height * (1 + width * 4));

  const cx = width / 2;
  const cy = height / 2;
  const rBg = size * 0.46;
  const rCircle = size * 0.32;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[offset++] = 0; // Filter: none
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default transparent
      let r = 16, g = 185, b = 129, a = 255; // Emerald #10b981

      // Rounded rect / circle body
      if (Math.abs(dx) < rBg && Math.abs(dy) < rBg) {
        // Soft gradient from top to bottom
        const t = y / height;
        r = Math.round(16 * (1 - t) + 5 * t);
        g = Math.round(185 * (1 - t) + 150 * t);
        b = Math.round(129 * (1 - t) + 105 * t);

        // White inner circle badge
        if (dist <= rCircle) {
          r = 255; g = 255; b = 255;

          // Render 'P' letter inside
          const nx = (x - cx) / (size * 0.22);
          const ny = (y - cy) / (size * 0.22);

          // Vertical stem of P
          const inStem = (nx >= -0.45 && nx <= -0.15 && ny >= -0.65 && ny <= 0.65);
          // Loop of P
          const inLoop = (nx >= -0.15 && nx <= 0.45 && ny >= -0.65 && ny <= 0.1);
          const inHole = (nx >= -0.15 && nx <= 0.2 && ny >= -0.42 && ny <= -0.12);

          if (inStem || (inLoop && !inHole)) {
            r = 5; g = 150; b = 105; // Dark emerald
          }
        }
      } else {
        a = 0;
      }

      scanlines[offset++] = r;
      scanlines[offset++] = g;
      scanlines[offset++] = b;
      scanlines[offset++] = a;
    }
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', zlib.deflateSync(scanlines));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${size}x${size}, ${png.length} bytes)`);
}

const targetDir = path.join(__dirname, '..', '..', 'client', 'public');
createPng(192, path.join(targetDir, 'pwa-192x192.png'));
createPng(512, path.join(targetDir, 'pwa-512x512.png'));
createPng(512, path.join(targetDir, 'maskable-icon-512x512.png'));
createPng(180, path.join(targetDir, 'apple-touch-icon.png'));
