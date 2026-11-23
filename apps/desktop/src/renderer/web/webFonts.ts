// Sound fonts in the workshop on the website: a folder the visitor opens, read in the page and sent nowhere. It stands
// in for the app's font library in the demo room, for the visit only: the browser keeps the files the visitor chose,
// not copies, and forgets them when the tab closes.
//
// The visitor can open one font's folder, or a folder of fonts: a folder is a font when a sound a listen needs is in
// it (shared/fontSounds.ts), as hum01.wav or hum/hum1.wav.

import type { FontReport } from '@hiltwright/core';
import type { FontSounds, ImportResult, LibraryFont } from '../../shared/api';
import { FONT_BYTES_CAP, parseFontIni, playableKey } from '../../shared/fontSounds';

interface OpenFont { folder: string; files: Map<string, File>; added: string }
const fonts = new Map<string, OpenFont>();

/** Ask for a folder. Resolves with its files, or null when the visitor backs out. */
function pickFolder(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    let done = false;
    const finish = (files: File[] | null) => { if (done) return; done = true; input.remove(); resolve(files); };
    input.addEventListener('change', () => finish(input.files ? Array.from(input.files) : null));
    input.addEventListener('cancel', () => finish(null));
    input.style.display = 'none';
    document.body.append(input);
    input.click();
  });
}

/** The fonts in a picked folder, by folder name: the folder itself, or each folder in it. */
export function fontsInFolder(files: { file: File; path: string }[]): Map<string, Map<string, File>> {
  const found = new Map<string, Map<string, File>>();
  const add = (folder: string, within: string, file: File) => { const f = found.get(folder) ?? new Map<string, File>(); f.set(within, file); found.set(folder, f); };
  const parts = files.map((f) => ({ ...f, parts: f.path.split('/').filter(Boolean) }));
  // The picked folder is one font when a sound sits in it directly.
  const rootIsFont = parts.some((f) => playableKey(f.parts.slice(1)) !== null);
  for (const f of parts) {
    if (f.parts.length < 2) continue;
    if (rootIsFont) add(f.parts[0], f.parts.slice(1).join('/'), f.file);
    else if (f.parts.length >= 3) add(f.parts[1], f.parts.slice(2).join('/'), f.file);
  }
  for (const [folder, within] of found) if (![...within.keys()].some((k) => playableKey(k.split('/')) !== null)) found.delete(folder);
  return found;
}

export async function openFontFolder(): Promise<ImportResult | null> {
  const picked = await pickFolder();
  return picked ? rememberFonts(picked.map((file) => ({ file, path: file.webkitRelativePath || file.name }))) : null;
}

/** Keep the fonts in a picked folder's files (`path` from the picked folder's own name down) for this visit. */
export function rememberFonts(picked: { file: File; path: string }[]): ImportResult {
  const found = fontsInFolder(picked);
  const top = picked[0]?.path.split('/')[0] || 'That folder';
  if (!found.size) return { added: [], skipped: [{ name: top, why: 'No sound font was found in it: no hum, clash or other saber sound.' }] };
  const added = new Date().toISOString();
  for (const [folder, files] of found) fonts.set(folder, { folder, files, added });
  return { added: [...found.keys()], skipped: [] };
}

const sizeOf = (f: OpenFont) => [...f.files.values()].reduce((n, x) => n + x.size, 0);

export function listOpenFonts(): LibraryFont[] {
  return [...fonts.values()].map((f) => {
    const wavs = [...f.files.keys()].filter((k) => /\.wav$/i.test(k));
    const report: FontReport = { files: wavs.length, bytes: sizeOf(f), type: 'unknown', effects: {}, issues: [] };
    return {
      folder: f.folder,
      meta: { name: f.folder, maker: '', notes: '', added: f.added },
      report,
      support: { type: 'unknown', smoothSwing: f.files.has('smoothsw.ini'), effects: [], special: [], tracks: 0 },
      bytes: report.bytes,
    };
  });
}

/** A font's sounds for the demo room, as the app reads them (main/sd.ts readFontSounds). */
export async function readOpenFont(folder: string): Promise<FontSounds> {
  const f = fonts.get(folder);
  if (!f) throw new Error(`The font "${folder}" is not open here. Open its folder again.`);
  const files: Record<string, ArrayBuffer> = {};
  let bytes = 0; let skipped = 0;
  for (const [within, file] of [...f.files].sort(([a], [b]) => a.localeCompare(b))) {
    const key = playableKey(within.split('/'));
    if (!key) continue;
    if (bytes + file.size > FONT_BYTES_CAP) { skipped++; continue; }
    try { files[key] = await file.arrayBuffer(); bytes += file.size; } catch { skipped++; }
  }
  const ini = async (name: string) => { const file = f.files.get(name); try { return file ? parseFontIni(await file.text()) : {}; } catch { return {}; } };
  return { name: folder, files, ini: await ini('config.ini'), smoothsw: await ini('smoothsw.ini'), bytes, skipped };
}
