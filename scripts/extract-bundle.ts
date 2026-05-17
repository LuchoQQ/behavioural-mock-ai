import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const path = process.argv[2];
const outDir = process.argv[3] ?? '/tmp/bundle';
if (!path) {
  console.error('Usage: pnpm tsx scripts/extract-bundle.ts <html> [outDir]');
  process.exit(2);
}

const html = readFileSync(path, 'utf8');
const m = html.match(
  /<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/,
);
if (!m) throw new Error('manifest not found');
const manifest = JSON.parse(m[1]!);

mkdirSync(outDir, { recursive: true });

const summary: Array<{ uuid: string; mime: string; size: number }> = [];
for (const [uuid, entry] of Object.entries(manifest) as [string, { data: string; mime: string; compressed?: boolean }][]) {
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = gunzipSync(bytes);
  // pick an extension hint
  let ext = '';
  if (entry.mime?.includes('javascript') || entry.mime?.includes('jsx') || entry.mime?.includes('text/babel')) ext = '.jsx';
  else if (entry.mime?.includes('json')) ext = '.json';
  else if (entry.mime?.includes('html')) ext = '.html';
  else if (entry.mime?.includes('svg')) ext = '.svg';
  else if (entry.mime?.includes('woff2')) ext = '.woff2';
  else if (entry.mime?.includes('css')) ext = '.css';
  writeFileSync(`${outDir}/${uuid}${ext}`, bytes);
  summary.push({ uuid, mime: entry.mime, size: bytes.length });
}
summary.sort((a, b) => a.mime.localeCompare(b.mime) || b.size - a.size);
for (const s of summary) console.log(s);
