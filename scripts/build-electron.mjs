import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-electron');

fs.mkdirSync(outDir, { recursive: true });

const sharedConfig = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: false,
  external: ['electron', 'node:sqlite'],
  logLevel: 'info',
};

await Promise.all([
  build({
    ...sharedConfig,
    entryPoints: [path.join(rootDir, 'src/main/index.ts')],
    outfile: path.join(outDir, 'main.cjs'),
  }),
  build({
    ...sharedConfig,
    entryPoints: [path.join(rootDir, 'src/main/preload.ts')],
    outfile: path.join(outDir, 'preload.cjs'),
  }),
]);

console.log('Built dist-electron/main.cjs and dist-electron/preload.cjs');
