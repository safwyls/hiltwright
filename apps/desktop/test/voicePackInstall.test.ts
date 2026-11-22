import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { clearVoiceLeftovers, inspectVoicePack, installVoicePack } from '../src/main/voicePackInstall';

/** A zip with every entry deflated and its real CRC-32. */
function zip(files: Record<string, Buffer | string>): Buffer {
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const data = Buffer.from(raw);
    const n = Buffer.from(name, 'utf8'); const body = deflateRawSync(data); const sum = crc32(data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(sum, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(sum, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, body); central.push(ch, n); offset += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const tmp = (p: string) => mkdtemp(join(tmpdir(), p));

/** A version 2 pack wrapped the way the downloads are: a folder, then common/. */
async function v2Zip(dir: string, version = 2): Promise<string> {
  const file = join(dir, 'ProffieOS_V2_Voicepack_Test.zip');
  await writeFile(file, zip({
    'ProffieOS_V2_Voicepack_Test/a_ReadMe.txt': 'Test voice pack - Somebody 2024\r\n\r\nthanks',
    'ProffieOS_V2_Voicepack_Test/common/voicepack.ini': `voice_pack_version=${version}\n`,
    'ProffieOS_V2_Voicepack_Test/common/mnum/mnum1.wav': 'one',
    'ProffieOS_V2_Voicepack_Test/common/mnum/mnum2.wav': 'two',
    'ProffieOS_V2_Voicepack_Test/common/mup.wav': 'up v2',
    'ProffieOS_V2_Voicepack_Test/common/LICENSE.txt': 'Menu prompts (c) 2024 Somebody, CC BY 4.0',
  }));
  return file;
}

/** A card with a version 1 pack in common, an old numbered sound the new pack lacks, and a sound of the owner's. */
async function v1Card(): Promise<string> {
  const root = await tmp('hw-voicecard-');
  await mkdir(join(root, 'common', 'mnum'), { recursive: true });
  await writeFile(join(root, 'common', 'mnum', 'mnum1.wav'), 'old one');
  await writeFile(join(root, 'common', 'mnum', 'mnum30.wav'), 'old thirty');
  await writeFile(join(root, 'common', 'mup.wav'), 'up v1');
  await writeFile(join(root, 'common', 'boot.wav'), 'owner boot');
  return root;
}

describe('voice pack install', () => {
  it('reads a pack zip without copying it: version, files and credit', async () => {
    const info = await inspectVoicePack(await v2Zip(await tmp('hw-voicezip-')));
    expect(info).toMatchObject({ name: 'ProffieOS V2 Voicepack Test', version: 2, files: 5, prefix: 'ProffieOS_V2_Voicepack_Test/common/', credit: 'Menu prompts (c) 2024 Somebody, CC BY 4.0' });
  });

  it('puts a version 2 pack in common, replacing each of its entries whole and keeping the owner\'s own sounds', async () => {
    const root = await v1Card();
    const backupDir = join(await tmp('hw-voiceback-'), 'b');
    const seen: number[] = [];
    const r = await installVoicePack(await v2Zip(await tmp('hw-voicezip-')), root, { backupDir, freeBytes: null, onProgress: (d) => seen.push(d) });
    expect(r.status).toEqual({ ini: true, version: 2, menuSounds: true, mixed: [] });
    expect(seen.at(-1)).toBe(5);
    expect((await readdir(join(root, 'common', 'mnum'))).sort()).toEqual(['mnum1.wav', 'mnum2.wav']);
    expect(await readFile(join(root, 'common', 'mup.wav'), 'utf8')).toBe('up v2');
    expect(await readFile(join(root, 'common', 'boot.wav'), 'utf8')).toBe('owner boot');
    // What it replaced is on this computer, and nothing it did not replace.
    expect(r.backup).toBe(backupDir);
    expect(r.replaced).toBe(2);
    expect((await readdir(backupDir)).sort()).toEqual(['mnum', 'mup.wav']);
    expect(await readFile(join(backupDir, 'mnum', 'mnum30.wav'), 'utf8')).toBe('old thirty');
    expect((await readdir(root)).filter((n) => n.startsWith('.hiltwright'))).toEqual([]);
  });

  it('moves aside an old pack\'s loose numbered files when the new pack keeps that sound in a folder', async () => {
    const root = await tmp('hw-voiceloose-');
    await mkdir(join(root, 'common'), { recursive: true });
    for (const n of ['mnum1.wav', 'mnum2.wav', 'mnum3.wav']) await writeFile(join(root, 'common', n), `old ${n}`);
    await writeFile(join(root, 'common', 'mnumber.wav'), 'owner sound');
    await writeFile(join(root, 'common', 'boot.wav'), 'owner boot');
    const backupDir = join(await tmp('hw-voiceback-'), 'b');
    const r = await installVoicePack(await v2Zip(await tmp('hw-voicezip-')), root, { backupDir, freeBytes: null });
    expect((await readdir(join(root, 'common'))).sort()).toEqual(['LICENSE.txt', 'boot.wav', 'mnum', 'mnumber.wav', 'mup.wav', 'voicepack.ini']);
    expect((await readdir(join(root, 'common', 'mnum'))).sort()).toEqual(['mnum1.wav', 'mnum2.wav']);
    expect(r.replaced).toBe(3);
    expect((await readdir(backupDir)).sort()).toEqual(['mnum1.wav', 'mnum2.wav', 'mnum3.wav']);
    expect(r.status.mixed).toEqual([]);
  });

  it('replaces a card\'s mnum folder when the new pack has loose mnum files, and puts both back if the move fails', async () => {
    const dir = await tmp('hw-voicezip-');
    const file = join(dir, 'flat.zip');
    await writeFile(file, zip({ 'common/voicepack.ini': 'voice_pack_version=2\n', 'common/mnum1.wav': 'one', 'common/mnum2.wav': 'two' }));
    const root = await v1Card();
    const r = await installVoicePack(file, root, { backupDir: join(dir, 'b'), freeBytes: null });
    expect((await readdir(join(root, 'common'))).sort()).toEqual(['boot.wav', 'mnum1.wav', 'mnum2.wav', 'mup.wav', 'voicepack.ini']);
    expect(await readFile(join(dir, 'b', 'mnum', 'mnum30.wav'), 'utf8')).toBe('old thirty');
    expect(r.replaced).toBe(1);

    const again = await v1Card();
    const { rename } = await import('node:fs/promises');
    const moveIn = async (from: string, to: string) => { if (/mnum2\.wav$/.test(to)) throw Object.assign(new Error('EIO: card gone'), { code: 'EIO' }); await rename(from, to); };
    await expect(installVoicePack(file, again, { backupDir: join(dir, 'b2'), freeBytes: null, moveIn })).rejects.toThrow(/old voice pack was put back/);
    expect((await readdir(join(again, 'common'))).sort()).toEqual(['boot.wav', 'mnum', 'mup.wav']);
    expect((await readdir(join(again, 'common', 'mnum'))).sort()).toEqual(['mnum1.wav', 'mnum30.wav']);
  });

  it('makes common on a card that has none, and keeps no backup when nothing is replaced', async () => {
    const root = await tmp('hw-voiceempty-');
    const backupDir = join(await tmp('hw-voiceback-'), 'b');
    const r = await installVoicePack(await v2Zip(await tmp('hw-voicezip-')), root, { backupDir, freeBytes: null });
    expect(r).toMatchObject({ backup: null, replaced: 0, status: { version: 2, menuSounds: true } });
    expect(existsSync(backupDir)).toBe(false);
  });

  it('refuses a pack older than version 2, and a zip with no voice pack, leaving the card alone', async () => {
    const root = await v1Card();
    const dir = await tmp('hw-voicezip-');
    await expect(installVoicePack(await v2Zip(dir, 1), root, { backupDir: join(dir, 'b'), freeBytes: null })).rejects.toThrow(/version 1.*need version 2/);
    const font = join(dir, 'font.zip');
    await writeFile(font, zip({ 'TeensySF/hum.wav': 'hum', 'TeensySF/config.ini': '' }));
    await expect(installVoicePack(font, root, { backupDir: join(dir, 'b'), freeBytes: null })).rejects.toThrow(/no voice pack/);
    expect(await readFile(join(root, 'common', 'mup.wav'), 'utf8')).toBe('up v1');
  });

  it('refuses a card without room for the pack beside the old one', async () => {
    const root = await v1Card();
    const dir = await tmp('hw-voicezip-');
    await expect(installVoicePack(await v2Zip(dir), root, { backupDir: join(dir, 'b'), freeBytes: 10 })).rejects.toThrow(/MB free/);
  });

  it('puts the old pack back when the move into common fails part way', async () => {
    const root = await v1Card();
    const dir = await tmp('hw-voicezip-');
    const { rename } = await import('node:fs/promises');
    const moveIn = async (from: string, to: string) => { if (/mup\.wav$/.test(to)) throw Object.assign(new Error('EIO: card gone'), { code: 'EIO' }); await rename(from, to); };
    await expect(installVoicePack(await v2Zip(dir), root, { backupDir: join(dir, 'b'), freeBytes: null, moveIn })).rejects.toThrow(/old voice pack was put back/);
    expect((await readdir(join(root, 'common', 'mnum'))).sort()).toEqual(['mnum1.wav', 'mnum30.wav']);
    expect(await readFile(join(root, 'common', 'mup.wav'), 'utf8')).toBe('up v1');
    expect(existsSync(join(root, 'common', 'voicepack.ini'))).toBe(false);
    expect((await readdir(root)).filter((n) => n.startsWith('.hiltwright'))).toEqual([]);
  });

  it('after a run of an older version cut short (no journal), puts back what was moved aside and had no replacement', async () => {
    const root = await tmp('hw-voiceleft-');
    await mkdir(join(root, 'common'), { recursive: true });
    await mkdir(join(root, '.hiltwright-voice-old'), { recursive: true });
    await mkdir(join(root, '.hiltwright-voice-new'), { recursive: true });
    await writeFile(join(root, '.hiltwright-voice-old', 'voicepack.ini'), 'voice_pack_version=1');
    await writeFile(join(root, '.hiltwright-voice-old', 'mup.wav'), 'up v1');
    await writeFile(join(root, 'common', 'mup.wav'), 'up v2');
    await clearVoiceLeftovers(root);
    expect(await readFile(join(root, 'common', 'voicepack.ini'), 'utf8')).toBe('voice_pack_version=1');
    expect(await readFile(join(root, 'common', 'mup.wav'), 'utf8')).toBe('up v2');
    expect((await readdir(root)).sort()).toEqual(['common']);
  });

  it('after a run of an older version cut short, never puts loose files back beside a folder of the same sound', async () => {
    const root = await tmp('hw-voiceleft-');
    await mkdir(join(root, 'common', 'mnum'), { recursive: true });
    await writeFile(join(root, 'common', 'mnum', 'mnum1.wav'), 'new one');
    await mkdir(join(root, '.hiltwright-voice-old'), { recursive: true });
    for (const n of ['mnum1.wav', 'mnum2.wav']) await writeFile(join(root, '.hiltwright-voice-old', n), `old ${n}`);
    expect(await clearVoiceLeftovers(root)).toEqual([]);
    expect((await readdir(join(root, 'common'))).sort()).toEqual(['mnum']);
    expect((await readdir(root)).sort()).toEqual(['common']);
  });
});

/** Every file and folder under `dir`, with each file's text, so a card's common folder can be compared whole. */
async function snapshot(dir: string, rel = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { out[`${p}/`] = ''; Object.assign(out, await snapshot(dir, p)); }
    else out[p] = await readFile(join(dir, p), 'utf8');
  }
  return out;
}

/** A card whose old pack keeps its numbers as loose files. */
async function looseCard(): Promise<string> {
  const root = await tmp('hw-voicecard-');
  await mkdir(join(root, 'common'), { recursive: true });
  for (const n of ['mnum1.wav', 'mnum2.wav', 'mnum3.wav']) await writeFile(join(root, 'common', n), `old ${n}`);
  await writeFile(join(root, 'common', 'mup.wav'), 'up v1');
  await writeFile(join(root, 'common', 'voicepack.ini'), 'voice_pack_version=1\n');
  await writeFile(join(root, 'common', 'boot.wav'), 'owner boot');
  return root;
}

/** A pack that keeps its numbers as loose files. */
async function looseZip(dir: string): Promise<string> {
  const file = join(dir, 'loose.zip');
  await writeFile(file, zip({ 'common/voicepack.ini': 'voice_pack_version=2\n', 'common/mnum1.wav': 'one', 'common/mnum2.wav': 'two', 'common/mup.wav': 'up v2' }));
  return file;
}

/**
 * Hooks for the swap's moves (set aside, move in), counted together in order. At move `k` the swap stops: `throws`
 * fails it there (the in-app undo runs), otherwise it hangs, as if the app was closed or the card pulled at that
 * moment. `after`: the move is made first.
 */
function stopAt(k: number, after: boolean, throws: boolean) {
  let i = 0;
  let reached!: () => void;
  const at = new Promise<void>((r) => { reached = r; });
  const stop = () => { reached(); if (throws) throw Object.assign(new Error('EIO: card gone'), { code: 'EIO' }); return new Promise<void>(() => undefined); };
  const step = async (from: string, to: string) => {
    const mine = i++;
    if (mine === k && !after) return stop();
    const { rename } = await import('node:fs/promises');
    await rename(from, to);
    if (mine === k) return stop();
  };
  return { at, hooks: { moveIn: step, setAside: step } };
}

describe('a voice pack swap cut short at each step (issue #18)', () => {
  const directions = [
    { name: 'a folder pack over loose files', card: looseCard, pack: v2Zip },
    { name: 'a loose pack over a folder', card: v1Card, pack: looseZip },
  ];

  for (const d of directions) {
    it(`${d.name}: the card ends up exactly as it was, or exactly as a whole install leaves it`, async () => {
      const dir = await tmp('hw-voicezip-');
      const file = await d.pack(dir);
      const before = await snapshot(join(await d.card(), 'common'));
      const done = await d.card();
      let moves = 0;
      const count = async (from: string, to: string) => { moves++; const { rename } = await import('node:fs/promises'); await rename(from, to); };
      await installVoicePack(file, done, { backupDir: join(dir, 'whole'), freeBytes: null, moveIn: count, setAside: count });
      const after = await snapshot(join(done, 'common'));
      expect(moves).toBeGreaterThan(4);

      for (let k = 0; k < moves; k++) {
        for (const made of [false, true]) {
          const committed = k === moves - 1 && made; // the new voicepack.ini, moved last, is in
          const want = committed ? after : before;
          const what = `move ${k + 1} of ${moves}, ${made ? 'after' : 'before'} it`;

          // The app closed (or the card pulled) there: the next run puts it right.
          const cut = await d.card();
          const hang = stopAt(k, made, false);
          void installVoicePack(file, cut, { backupDir: join(dir, `cut-${k}-${made}`), freeBytes: null, ...hang.hooks }).catch(() => undefined);
          await hang.at;
          expect(await clearVoiceLeftovers(cut), what).toEqual([]);
          expect(await snapshot(join(cut, 'common')), what).toEqual(want);
          expect((await readdir(cut)).filter((n) => n.startsWith('.hiltwright')), what).toEqual([]);

          // The move failed there: the app undoes it at once, and says so only when it did.
          const failed = await d.card();
          const fail = stopAt(k, made, true);
          const run = installVoicePack(file, failed, { backupDir: join(dir, `fail-${k}-${made}`), freeBytes: null, ...fail.hooks });
          if (committed) await expect(run, what).resolves.toMatchObject({ status: { version: 2 } });
          else await expect(run, what).rejects.toThrow(/old voice pack was put back/);
          expect(await snapshot(join(failed, 'common')), what).toEqual(want);
          expect((await readdir(failed)).filter((n) => n.startsWith('.hiltwright')), what).toEqual([]);
        }
      }
    });
  }

  it('says what could not be put back and where the copy is, keeps it on the card, and finishes on the next run', async () => {
    const dir = await tmp('hw-voicezip-');
    const file = await v2Zip(dir);
    const root = await looseCard();
    const before = await snapshot(join(root, 'common'));
    const { rename, rm } = await import('node:fs/promises');
    // The move of mnum/ fails, and something has taken mnum1.wav's place in common by then.
    const moveIn = async (from: string, to: string) => {
      if (/mnum$/.test(to)) { await writeFile(join(root, 'common', 'mnum1.wav'), 'in the way'); throw Object.assign(new Error('EIO: card gone'), { code: 'EIO' }); }
      await rename(from, to);
    };
    const backupDir = join(dir, 'b');
    const err = await installVoicePack(file, root, { backupDir, freeBytes: null, moveIn }).catch((e: Error) => e);
    expect(String(err)).toMatch(/could not put all of the card's old voice pack back: mnum1\.wav did not go back/);
    expect(String(err)).toContain(`on this computer, in ${backupDir}`);
    expect(String(err)).not.toMatch(/was put back/);
    expect(await readFile(join(backupDir, 'mnum1.wav'), 'utf8')).toBe('old mnum1.wav');
    expect(existsSync(join(root, '.hiltwright-voice-old', 'aside', 'mnum1.wav'))).toBe(true);

    // While it is still in the way, a new install stops before copying anything.
    await expect(installVoicePack(file, root, { backupDir: join(dir, 'b2'), freeBytes: null })).rejects.toThrow(/cut short, and Hiltwright could not put back mnum1\.wav.*Nothing new was copied/);

    await rm(join(root, 'common', 'mnum1.wav'));
    expect(await clearVoiceLeftovers(root)).toEqual([]);
    expect(await snapshot(join(root, 'common'))).toEqual(before);
    expect((await readdir(root)).filter((n) => n.startsWith('.hiltwright'))).toEqual([]);
  });
});
