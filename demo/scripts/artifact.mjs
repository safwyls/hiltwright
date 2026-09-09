// Turns the single-file Vite build into a page fragment the Artifact tool accepts:
// no <!doctype>, <html>, <head> or <body> tags, just <title>, <link>, <style> and <script>.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const keep = head
  .split(/(?=<(?:title|link|style|script)\b)/i)
  .filter((chunk) => /^<(title|link|style|script)\b/i.test(chunk))
  .map((chunk) => chunk.replace(/\s+crossorigin(="[^"]*")?/g, ''))
  .join('\n');
const out = `<title>Hiltwright Demo</title>\n${keep.replace(/<title>[\s\S]*?<\/title>\s*/i, '')}\n${body}`;
writeFileSync(new URL('../dist/hiltwright-demo.html', import.meta.url), out);
console.log(`wrote dist/hiltwright-demo.html (${(out.length / 1024).toFixed(0)} KB)`);
