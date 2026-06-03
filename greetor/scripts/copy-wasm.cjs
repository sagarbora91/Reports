/* copy-wasm.cjs - local-dev convenience: copy sql.js UMD assets into www/assets/
 * so the web/preview SQLite path (window.initSqlJs) can load without a bundler.
 * CI does the same copy inline (see greetor-apk.yml); this mirrors it for local
 * `npm run copy-wasm`. No-op-safe: creates www/assets/ if missing. Run from the
 * greetor/ project root (npm sets cwd there). */
"use strict";
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "sql.js", "dist");
const dest = path.join(__dirname, "..", "www", "assets");
const files = ["sql-wasm.js", "sql-wasm.wasm"];

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const f of files) {
  const from = path.join(src, f);
  if (!fs.existsSync(from)) {
    console.error("missing " + from + " - run `npm install` first (sql.js not installed).");
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(dest, f));
  copied++;
}
console.log("copied " + copied + " sql.js asset(s) to www/assets/ (" + files.join(", ") + ")");
