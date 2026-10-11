// Single self-contained HTML file (for sharing a demo without hosting).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = new URL('../dist-single/', import.meta.url).pathname;
let html = readFileSync(join(dir, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_m, f) => `<script type="module">${readFileSync(join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_m, f) => `<style>${readFileSync(join(dir, f), 'utf8')}</style>`);
html = html.replace(/<link rel="manifest"[^>]*>/, '');
writeFileSync(join(dir, 'hisaab.html'), html);
console.log(`dist-single/hisaab.html ${(html.length / 1024).toFixed(0)} kB`);
