/* copy-wasm.cjs - copy offline UMD assets into www/assets/ so the no-bundler
 * web/preview paths load without a bundler:
 *   - sql.js   (window.initSqlJs)        -> SQLite web/preview engine
 *   - pdfmake  (window.pdfMake + vfs)    -> PDF report generation (vector)
 *   - pdf.js   (window.pdfjsLib, legacy) -> in-app PDF preview to <canvas>
 * CI runs `npm run copy-wasm` too (single source of truth, no drift).
 * Safe to re-run. Run from greetor/ project root (npm sets cwd there). */
"use strict";
const fs = require("fs");
const path = require("path");

const nm = path.join(__dirname, "..", "node_modules");
const dest = path.join(__dirname, "..", "www", "assets");

// Each group = one source dir + the files to copy from it.
// pdf.js MUST be the legacy/build (UMD that attaches window.pdfjsLib); the
// modern build is ESM-only (.mjs) and cannot load via a classic <script>.
const groups = [
  { srcDir: path.join(nm, "sql.js", "dist"),                files: ["sql-wasm.js", "sql-wasm.wasm"] },
  { srcDir: path.join(nm, "pdfmake", "build"),              files: ["pdfmake.min.js", "vfs_fonts.js"] },
  { srcDir: path.join(nm, "pdfjs-dist", "legacy", "build"), files: ["pdf.min.js", "pdf.worker.min.js"] },
];

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
const missing = [];
for (const g of groups) {
  for (const f of g.files) {
    const from = path.join(g.srcDir, f);
    if (!fs.existsSync(from)) { missing.push(from); continue; }
    fs.copyFileSync(from, path.join(dest, f));
    copied++;
  }
}
if (missing.length) {
  console.error(
    "copy-wasm: missing " + missing.length + " source file(s) - run `npm install` first:\n  " +
    missing.join("\n  ")
  );
  process.exit(1);
}
console.log("copy-wasm: copied " + copied + " offline asset(s) to www/assets/");
