// Import from another board's SD card. Today: Xenopixel (XENO3). The source is only ever read; converted fonts
// are written to the ProffieOS card the owner chose.

import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseXenoFontConfig, planXenoFont, proffieFolderName, xenoColorHex, xenoColorWord, XENO_BLADE_EFFECTS } from '@hiltwright/core';
import { checkFontDir, type FontEntry } from './sd';

export interface XenoFontInfo {
  /** Folder on the source card, e.g. "7". */
  slot: string;
  path: string;
  /** Name from fontconfig.ini, or "Font 7" when the file is missing. */
  name: string;
  /** Folder name the font would get on the ProffieOS card. */
  folder: string;
  hex: string;
  /** Colour as a ProffieOS style argument word (16-bit r,g,b). */
  colorWord: string;
  effect: string | null;
  sounds: number;
  tracks: number;
  bytes: number;
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/** Numbered font folders on a Xenopixel card (or a copy of one), in slot order. */
export async function scanXenoCard(root: string): Promise<XenoFontInfo[]> {
  const out: XenoFontInfo[] = [];
  let names: string[] = [];
  try { names = await readdir(root); } catch { return out; }
  const used = new Set<string>();
  for (const slot of names.filter((n) => /^\d{1,3}$/.test(n)).sort((a, b) => Number(a) - Number(b))) {
    const path = join(root, slot);
    if (!(await isDir(path))) continue;
    const files = await readdir(path).catch(() => [] as string[]);
    const plan = planXenoFont(files);
    if (!plan.sounds) continue;
    let text = '';
    const ini = files.find((f) => f.toLowerCase() === 'fontconfig.ini');
    if (ini) { try { text = await readFile(join(path, ini), 'latin1'); } catch { /* unreadable */ } }
    const cfg = parseXenoFontConfig(text);
    let bytes = 0;
    for (const m of plan.moves) { try { bytes += (await stat(join(path, m.from))).size; } catch { /* vanished */ } }
    let folder = proffieFolderName(cfg?.name ?? '', `Xeno font ${slot}`);
    if (/^font\s*\d+$/i.test(folder)) folder = `Xeno font ${slot}`;
    while (used.has(folder.toLowerCase())) folder = `${folder} ${slot}`;
    used.add(folder.toLowerCase());
    const color = cfg?.color ?? { r: 0, g: 0, b: 255 };
    out.push({
      slot, path, name: cfg?.name || `Font ${slot}`, folder, hex: xenoColorHex(color), colorWord: xenoColorWord(color),
      effect: cfg?.bladeEffect != null ? XENO_BLADE_EFFECTS[cfg.bladeEffect] ?? null : null,
      sounds: plan.sounds, tracks: plan.tracks, bytes,
    });
  }
  return out;
}

/** Copy one Xenopixel font to `<destRoot>/<folder>` with ProffieOS names. Never overwrites unless asked. */
export async function importXenoFont(srcDir: string, destRoot: string, folder: string, replace: boolean): Promise<FontEntry> {
  if (!/^[^\\/:*?"<>|;,]+$/.test(folder) || folder === '.' || folder === '..') throw new Error('That folder name cannot be used on the card');
  const dest = join(destRoot, folder);
  if (!replace && await isDir(dest)) throw new Error(`${folder} is already on the card`);
  const plan = planXenoFont(await readdir(srcDir));
  if (!plan.sounds) throw new Error('No sounds found in that folder');
  for (const m of plan.moves) {
    const to = join(dest, m.to);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(srcDir, m.from), to);
  }
  return checkFontDir(dest);
}
