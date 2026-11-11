// Comprime la web una sola vez, al construir la imagen: deja al lado de cada archivo su versión .br (Brotli,
// la más pequeña) y .gz. Caddy entrega la que acepte el navegador (`precompressed` en el Caddyfile) sin
// tener que comprimir en cada visita.
// Uso: node precompress.mjs <carpeta>
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const COMPRESSIBLE = new Set([".js", ".mjs", ".wasm", ".html", ".css", ".json", ".webmanifest", ".txt", ".svg", ".map"]);
const MIN_BYTES = 1024;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const root = process.argv[2];
if (!root) {
  console.error("Uso: node precompress.mjs <carpeta>");
  process.exit(1);
}

let before = 0;
let after = 0;
for (const path of files(root)) {
  if (!COMPRESSIBLE.has(extname(path)) || statSync(path).size < MIN_BYTES) continue;
  const data = readFileSync(path);
  const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  writeFileSync(`${path}.br`, br);
  writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }));
  before += data.length;
  after += br.length;
}
console.log(`Comprimido: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB con Brotli.`);
