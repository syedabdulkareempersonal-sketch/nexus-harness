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
    <linearGradient id="bgGrad" x1="64" y1="40" x2="448" y2="472" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#221D1A"/>
      <stop offset="55%" stop-color="#171514"/>
      <stop offset="100%" stop-color="#101114"/>
    </linearGradient>
    <linearGradient id="auraOuter" x1="140" y1="108" x2="372" y2="356" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F59E6C"/>
      <stop offset="50%" stop-color="#D96B34"/>
      <stop offset="100%" stop-color="#9A3F17"/>
    </linearGradient>
    <linearGradient id="auraCore" x1="200" y1="160" x2="312" y2="288" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFF7F0"/>
      <stop offset="100%" stop-color="#F6B98E"/>
    </linearGradient>
    <linearGradient id="deskPlane" x1="96" y1="336" x2="416" y2="404" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FAF6F2"/>
      <stop offset="100%" stop-color="#D7CEC4"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#bgGrad)"/>
  <rect x="26" y="26" width="460" height="460" rx="110" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="4"/>
  <!-- Outer Luminous Aperture Ring -->
  <circle cx="256" cy="226" r="118" stroke="url(#auraOuter)" stroke-width="26" stroke-opacity="0.92"/>
  <!-- Inner Harmonic Ring -->
  <circle cx="256" cy="226" r="68" fill="url(#auraCore)"/>
  <!-- Grounded Desk Horizon Plane -->
  <path d="M116 352C116 340.954 124.954 332 136 332H376C387.046 332 396 340.954 396 352V362C396 380.778 380.778 396 362 396H150C131.222 396 116 380.778 116 362V352Z" fill="url(#deskPlane)"/>
  <!-- Subtle Desk Reflection Accent -->
  <rect x="176" y="356" width="160" height="12" rx="6" fill="#B8501E" fill-opacity="0.55"/>
</svg>
`;

fs.writeFileSync(path.join(buildDir, 'icon.svg'), svgLogo, 'utf8');
fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgLogo, 'utf8');

// Pure JS antialiased SDF renderer for AuraDesk icon (zero native binary dependencies)
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

      // 1. Rounded squircle background
      const bgDist = sdRoundedBox(px, py, 256, 256, 232, 232, 112);
      const bgAlpha = 1 - smoothstep(-aa, aa, bgDist);
      if (bgAlpha > 0) {
        const t = clamp(((px - 64) + (py - 40)) / 816, 0, 1);
        const r = 34 * (1 - t) + 16 * t;
        const g = 29 * (1 - t) + 17 * t;
        const b = 26 * (1 - t) + 20 * t;
        blend(pixel, r, g, b, bgAlpha);

        // Subtle inner border
        const borderDist = Math.abs(bgDist + 3) - 1.6;
        const borderAlpha = (1 - smoothstep(-aa, aa, borderDist)) * 0.14 * bgAlpha;
        blend(pixel, 255, 255, 255, borderAlpha);

        // Soft warm ambient glow behind aperture
        const dCenter = Math.hypot(px - 256, py - 226);
        const glow = Math.exp(-(dCenter * dCenter) / (2 * 135 * 135)) * 0.24;
        blend(pixel, 232, 122, 62, glow * bgAlpha);

        // 2. Outer Aperture Ring
        const ringDist = Math.abs(dCenter - 118) - 13;
        const ringAlpha = (1 - smoothstep(-aa, aa, ringDist)) * 0.95;
        if (ringAlpha > 0) {
          const rt = clamp((py - 108) / 248, 0, 1);
          const rr = 245 * (1 - rt) + 168 * rt;
          const rg = 158 * (1 - rt) + 72 * rt;
          const rb = 108 * (1 - rt) + 30 * rt;
          blend(pixel, rr, rg, rb, ringAlpha);
        }

        // 3. Inner Luminous Core
        const coreDist = dCenter - 66;
        const coreAlpha = 1 - smoothstep(-aa, aa, coreDist);
        if (coreAlpha > 0) {
          const ct = clamp((py - 160) / 132, 0, 1);
          const cr = 255 * (1 - ct) + 246 * ct;
          const cg = 248 * (1 - ct) + 185 * ct;
          const cb = 240 * (1 - ct) + 142 * ct;
          blend(pixel, cr, cg, cb, coreAlpha);
        }

        // 4. Desk Horizon Bar
        const deskDist = sdRoundedBox(px, py, 256, 364, 140, 32, 22);
        const deskAlpha = 1 - smoothstep(-aa, aa, deskDist);
        if (deskAlpha > 0) {
          const dt = clamp((py - 332) / 64, 0, 1);
          const dr = 250 * (1 - dt) + 215 * dt;
          const dg = 246 * (1 - dt) + 206 * dt;
          const db = 242 * (1 - dt) + 196 * dt;
          blend(pixel, dr, dg, db, deskAlpha);
        }

        // 5. Desk Accent Slot
        const slotDist = sdRoundedBox(px, py, 256, 364, 78, 6, 6);
        const slotAlpha = (1 - smoothstep(-aa, aa, slotDist)) * 0.65;
        blend(pixel, 184, 80, 30, slotAlpha);
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

// CRC32 table for PNG chunks
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
    raw[rowStart] = 0; // filter none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const { size, png } of pngBuffersWithSizes) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
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

console.log('Generated build/icon.svg, build/icon.png (512x512), and build/icon.ico (multi-res).');
