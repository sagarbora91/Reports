// Rasterizes assets/icon.svg + assets/splash.svg to PNGs that
// @capacitor/assets generate consumes to produce all Android variants.
//
// We render the source SVG at high density so sharp upscales cleanly,
// then resize to the canonical 1024 / 2732 square sizes.

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

async function svgToPng(srcPath, outPath, size) {
  mkdirSync(dirname(outPath), { recursive: true });
  const svg = readFileSync(srcPath);
  await sharp(svg, { density: 600 })
    .resize(size, size, { fit: 'contain', background: { r: 11, g: 31, b: 58, alpha: 1 } })
    .png()
    .toFile(outPath);
  console.log(`  ${srcPath} -> ${outPath} (${size}x${size})`);
}

console.log('Building Capacitor asset PNGs from SVG sources...');
await svgToPng('assets/icon.svg',   'assets/icon.png',   1024);
await svgToPng('assets/splash.svg', 'assets/splash.png', 2732);
console.log('Done.');
