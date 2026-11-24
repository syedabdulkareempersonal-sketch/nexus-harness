import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const publicDir = path.join(rootDir, 'src', 'renderer', 'public');

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const svgLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bgGrad" x1="48" y1="32" x2="464" y2="480" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0F2547"/>
      <stop offset="52%" stop-color="#0B1930"/>
      <stop offset="100%" stop-color="#08101E"/>
    </linearGradient>
    <linearGradient id="auraOuter" x1="128" y1="96" x2="384" y2="368" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#60D5FF"/>
      <stop offset="50%" stop-color="#2589F5"/>
      <stop offset="100%" stop-color="#005FB8"/>
    </linearGradient>
    <linearGradient id="auraCore" x1="192" y1="160" x2="320" y2="296" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F0FAFF"/>
      <stop offset="100%" stop-color="#7DD3FC"/>
    </linearGradient>
    <linearGradient id="deskPlane" x1="96" y1="336" x2="416" y2="404" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F1F7FF"/>
      <stop offset="100%" stop-color="#C8DCF8"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="116" fill="url(#bgGrad)"/>
  <rect x="26" y="26" width="460" height="460" rx="114" stroke="#7DD3FC" stroke-opacity="0.24" stroke-width="4"/>
  <circle cx="256" cy="224" r="116" stroke="url(#auraOuter)" stroke-width="28"/>
  <circle cx="256" cy="224" r="64" fill="url(#auraCore)"/>
  <path d="M116 354C116 342.954 124.954 334 136 334H376C387.046 334 396 342.954 396 354V362C396 380.778 380.778 396 362 396H150C131.222 396 116 380.778 116 362V354Z" fill="url(#deskPlane)"/>
  <rect x="180" y="358" width="152" height="14" rx="7" fill="#005FB8"/>
</svg>
`;

fs.writeFileSync(path.join(buildDir, 'icon.svg'), svgLogo, 'utf8');
fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgLogo, 'utf8');

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - r;
}

function blend(dst, srcR, srcG, srcB, srcA) {
  const a = clamp(srcA, 0, 1);
  if (a <= 0) return;
  const outA = a + dst[3] * (1 - a);
  if (outA <= 0) return;
  dst[0] = (srcR * a + dst[0] * dst[3] * (1 - a)) / outA;
  dst[1] = (srcG * a + dst[1] * dst[3] * (1 - a)) / outA;
  dst[2] = (srcB * a + dst[2] * dst[3] * (1 - a)) / outA;
  dst[3] = outA;
}

function renderIconRGBA(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const aa = 1.35 / scale;

  for (let y = 0; y < size; y++) {
    const py = (y + 0.5) / scale;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / scale;
      const pixel = [0, 0, 0, 0];

      const bgDist = sdRoundedBox(px, py, 256, 256, 232, 232, 116);
      const bgAlpha = 1 - smoothstep(-aa, aa, bgDist);
      if (bgAlpha > 0) {
        const t = clamp((px - 48 + (py - 32)) / 864, 0, 1);
        const r = 15 * (1 - t) + 8 * t;
        const g = 37 * (1 - t) + 16 * t;
        const b = 71 * (1 - t) + 30 * t;
        blend(pixel, r, g, b, bgAlpha);

        const borderDist = Math.abs(bgDist + 3) - 1.6;
        const borderAlpha = (1 - smoothstep(-aa, aa, borderDist)) * 0.24 * bgAlpha;
        blend(pixel, 125, 211, 252, borderAlpha);

        const dCenter = Math.hypot(px - 256, py - 224);
        const glow = Math.exp(-(dCenter * dCenter) / (2 * 140 * 140)) * 0.28;
        blend(pixel, 37, 137, 245, glow * bgAlpha);

        // Sapphire-Cyan Aperture Ring
        const ringDist = Math.abs(dCenter - 116) - 14;
        const ringAlpha = (1 - smoothstep(-aa, aa, ringDist)) * 0.98;
        if (ringAlpha > 0) {
          const rt = clamp((py - 96) / 260, 0, 1);
          const rr = 96 * (1 - rt) + 0 * rt;
          const rg = 213 * (1 - rt) + 95 * rt;
          const rb = 255 * (1 - rt) + 184 * rt;
          blend(pixel, rr, rg, rb, ringAlpha);
        }

        // Luminous Sky Core
        const coreDist = dCenter - 64;
        const coreAlpha = 1 - smoothstep(-aa, aa, coreDist);
        if (coreAlpha > 0) {
          const ct = clamp((py - 160) / 128, 0, 1);
          const cr = 240 * (1 - ct) + 125 * ct;
          const cg = 250 * (1 - ct) + 211 * ct;
          const cb = 255 * (1 - ct) + 252 * ct;
          blend(pixel, cr, cg, cb, coreAlpha);
        }

        // Mica Desk Horizon
        const deskDist = sdRoundedBox(px, py, 256, 365, 140, 31, 22);
        const deskAlpha = 1 - smoothstep(-aa, aa, deskDist);
        if (deskAlpha > 0) {
          const dt = clamp((py - 334) / 62, 0, 1);
          const dr = 241 * (1 - dt) + 200 * dt;
          const dg = 247 * (1 - dt) + 220 * dt;
          const db = 255 * (1 - dt) + 248 * dt;
          blend(pixel, dr, dg, db, deskAlpha);
        }

        // Fluent Cobalt Pill
        const slotDist = sdRoundedBox(px, py, 256, 365, 76, 7, 7);
        const slotAlpha = (1 - smoothstep(-aa, aa, slotDist)) * 0.9;
        blend(pixel, 0, 95, 184, slotAlpha);
      }

      const idx = (y * size + x) * 4;
      buf[idx] = Math.round(clamp(pixel[0], 0, 255));
      buf[idx + 1] = Math.round(clamp(pixel[1], 0, 255));
      buf[idx + 2] = Math.round(clamp(pixel[2], 0, 255));
      buf[idx + 3] = Math.round(clamp(pixel[3] * 255, 0, 255));
    }
  }
  return buf;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeICO(pngBuffersWithSizes) {
  const count = pngBuffersWithSizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngBuffersWithSizes) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffersWithSizes.map((x) => x.png)]);
}

const png512 = encodePNG(512, renderIconRGBA(512));
const png256 = encodePNG(256, renderIconRGBA(256));
const png64 = encodePNG(64, renderIconRGBA(64));
const png32 = encodePNG(32, renderIconRGBA(32));
const png16 = encodePNG(16, renderIconRGBA(16));

fs.writeFileSync(path.join(buildDir, 'icon.png'), png512);
fs.writeFileSync(path.join(publicDir, 'icon.png'), png256);

const ico = encodeICO([
  { size: 256, png: png256 },
  { size: 64, png: png64 },
  { size: 32, png: png32 },
  { size: 16, png: png16 },
]);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);

console.log('Generated Windows 12 Pro Sapphire icons (icon.svg, icon.png, icon.ico).');
