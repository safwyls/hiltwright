import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFontDir, copyFont, isEmptyCard, listFonts, listTracks, parseRemovableDrives, readVoicePack } from '../src/main/sd';

/** A minimal 16-bit mono 44.1 kHz PCM wav header with no samples. */
function wav(): Buffer {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0); b.writeUInt32LE(36, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(0, 40);
  return b;
}

describe('fonts on a card', () => {
  it('finds fonts laid out flat and fonts with one folder per sound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hw-card-'));
    // Flat: hum01.wav in the font folder.
    await mkdir(join(root, 'Flat'));
    for (const n of ['hum01.wav', 'out01.wav', 'in01.wav', 'clsh01.wav']) await writeFile(join(root, 'Flat', n), wav());
    // Folders: hum/hum01.wav and clsh/001.wav.
    for (const d of ['hum', 'out', 'in', 'clsh']) await mkdir(join(root, 'Foldered', d), { recursive: true });
    await writeFile(join(root, 'Foldered', 'hum', 'hum01.wav'), wav());
    await writeFile(join(root, 'Foldered', 'out', 'out01.wav'), wav());
    await writeFile(join(root, 'Foldered', 'in', 'in01.wav'), wav());
    await writeFile(join(root, 'Foldered', 'clsh', '001.wav'), wav());
    await writeFile(join(root, 'Foldered', 'clsh', '002.wav'), wav());
    // Not a font: a folder of something else, and the common folder.
    await mkdir(join(root, 'tracks')); await writeFile(join(root, 'tracks', 'song.wav'), wav());
    await mkdir(join(root, 'common')); await writeFile(join(root, 'common', 'voicepack.ini'), 'voice_pack_version=2\n');

    const fonts = await listFonts(root);
    expect(fonts.map((f) => f.name)).toEqual(['Flat', 'Foldered']);
    const foldered = fonts[1].report;
    expect(foldered.files).toBe(5);
    expect(foldered.effects.hum).toBeTruthy();
    expect(foldered.effects.clash?.poly).toBe(2); // 001.wav under clsh/ counts as a clash
    expect(foldered.issues.find((i) => i.kind === 'missing-hum')).toBeUndefined();
  });
});

// Audit of baseline-sd-fonts, sd-card (sd-fonts-test-coverage). A temporary folder stands in for the card.
describe('sd-card audit', () => {
  /** A card with two fonts, a tracks folder and a version 2 voice pack with its menu sounds. */
  async function card(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'hw-card-'));
    await mkdir(join(root, 'Ember'));
    for (const n of ['hum01.wav', 'out01.wav', 'in01.wav', 'clsh01.wav', 'clsh02.wav']) await writeFile(join(root, 'Ember', n), wav());
    for (const d of ['hum', 'clsh']) await mkdir(join(root, 'Grey', d), { recursive: true });
    await writeFile(join(root, 'Grey', 'hum', 'hum01.wav'), wav()); await writeFile(join(root, 'Grey', 'clsh', '001.wav'), wav());
    await mkdir(join(root, 'tracks'));
    await writeFile(join(root, 'tracks', 'theme.wav'), Buffer.concat([wav(), Buffer.alloc(100)]));
    await writeFile(join(root, 'tracks', 'battle.wav'), wav());
    await mkdir(join(root, 'common'));
    await writeFile(join(root, 'common', 'voicepack.ini'), 'voice_pack_version=2\n');
    await writeFile(join(root, 'common', 'mnum1.wav'), wav()); await writeFile(join(root, 'common', 'mnum2.wav'), wav());
    return root;
  }
  /** Every path under a folder, with its size and time, so two readings can be compared. */
  async function tree(dir: string, rel = ''): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const st = await stat(join(dir, r));
      out.push(`${r} ${e.isDirectory() ? 'dir' : st.size} ${st.mtimeMs}`);
      if (e.isDirectory()) out.push(...await tree(dir, r));
    }
    return out.sort();
  }

  it('2.4 browsing the card: both fonts with type, count, size and status, and the tracks with their sizes', async () => {
    const root = await card();
    const fonts = await listFonts(root);
    expect(fonts.map((f) => f.name)).toEqual(['Ember', 'Grey']);
    for (const f of fonts) {
      expect(f.report.type).toMatch(/^(polyphonic|monophonic|mixed|unknown)$/);
      expect(f.report.files).toBeGreaterThan(0);
      expect(f.report.bytes).toBeGreaterThan(0);
      expect(Array.isArray(f.report.issues)).toBe(true);
    }
    expect(fonts[0].report.files).toBe(5);
    expect(await listTracks(root)).toEqual([{ name: 'tracks/battle.wav', size: 44 }, { name: 'tracks/theme.wav', size: 144 }]);
  });

  it('2.7 a version 2 voice pack with its menu sounds is read as version 2 from the card', async () => {
    expect(await readVoicePack(await card())).toEqual({ ini: true, version: 2, menuSounds: true });
  });

  it('2.8 copying a new font puts it on the card under its folder name, and leaves the original unchanged', async () => {
    const root = await card();
    const src = await mkdtemp(join(tmpdir(), 'hw-src-'));
    await mkdir(join(src, 'Kyber'));
    for (const n of ['hum01.wav', 'clsh01.wav']) await writeFile(join(src, 'Kyber', n), wav());
    const before = await tree(src);
    const entry = await copyFont(join(src, 'Kyber'), root);
    expect(entry.name).toBe('Kyber');
    expect(entry.report.files).toBe(2);
    expect((await listFonts(root)).map((f) => f.name)).toContain('Kyber');
    expect(await tree(src)).toEqual(before);
  });

  it('2.9 a font already on the card is not copied, and the words say it is already there', async () => {
    const root = await card();
    const src = await mkdtemp(join(tmpdir(), 'hw-src-'));
    await mkdir(join(src, 'Ember')); await writeFile(join(src, 'Ember', 'hum01.wav'), Buffer.concat([wav(), Buffer.alloc(10)]));
    const before = await tree(root);
    await expect(copyFont(join(src, 'Ember'), root)).rejects.toThrow('Ember is already on the card');
    expect(await tree(root)).toEqual(before);
    expect((await readFile(join(root, 'Ember', 'hum01.wav'))).length).toBe(44);
  });

  it('2.14 browsing and checking only: nothing on the card changes', async () => {
    const root = await card();
    const before = await tree(root);
    const fonts = await listFonts(root);
    for (const f of fonts) await checkFontDir(f.path);
    await listTracks(root);
    await readVoicePack(root);
    expect(await tree(root)).toEqual(before);
  });
});

describe("which removable drive is a saber's own card (card-safety D3)", () => {
  it('a drive under a Proffieboard carries its serial; a card reader slot and a malformed entry do not', () => {
    // The shape the PowerShell walk prints. H: as hote2 sharing its card is constructed; D: and E: are as captured
    // from the owner's Multi-Reader, 2026-11-14 (empty slots), with E: given a card.
    const out = JSON.stringify([
      { DeviceID: 'D:', VolumeName: null, FreeSpace: null, Size: null, Owner: null },
      { DeviceID: 'E:', VolumeName: 'KYLO', FreeSpace: 21_000_000_000, Size: 31_900_000_000, Owner: null },
      { DeviceID: 'H:', VolumeName: '', FreeSpace: 7_000_000_000, Size: 7_900_000_000, Owner: '209133815232' },
      { VolumeName: 'no drive letter', Owner: '209133815232' },
      { DeviceID: 'J:', Owner: 'not a serial; rm -rf' },
    ]);
    expect(parseRemovableDrives(out)).toEqual([
      { root: 'D:\\', label: null, free: null, total: null, saberSerial: null, fileSystem: null, volumeSerial: null },
      { root: 'E:\\', label: 'KYLO', free: 21_000_000_000, total: 31_900_000_000, saberSerial: null, fileSystem: null, volumeSerial: null },
      { root: 'H:\\', label: null, free: 7_000_000_000, total: 7_900_000_000, saberSerial: '209133815232', fileSystem: null, volumeSerial: null },
      { root: 'J:\\', label: null, free: null, total: null, saberSerial: null, fileSystem: null, volumeSerial: null },
    ]);
  });
  it('the volume serial number Windows reports is read, in capitals, and anything else is not one', () => {
    const out = JSON.stringify([
      { DeviceID: 'E:', VolumeSerial: '5a1c3f0e' },
      { DeviceID: 'F:', VolumeSerial: 'not hex!' },
      { DeviceID: 'G:', VolumeSerial: null },
    ]);
    expect(parseRemovableDrives(out).map((d) => d.volumeSerial)).toEqual(['5A1C3F0E', null, null]);
  });
  it("the file system Windows reports for each drive is read, and a drive with none stays unknown", () => {
    // The shape Windows prints (ConvertTo-Json of Win32_LogicalDisk): a 64 GB card as exFAT, a 16 GB card as FAT32,
    // an empty reader slot with a null file system.
    const out = '[{"DeviceID":"E:","VolumeName":"KYLO","FreeSpace":61000000000,"Size":63800000000,"FileSystem":"exFAT","Owner":null},'
      + '{"DeviceID":"F:","VolumeName":"SABER","FreeSpace":15000000000,"Size":15900000000,"FileSystem":"FAT32","Owner":null},'
      + '{"DeviceID":"G:","VolumeName":null,"FreeSpace":null,"Size":null,"FileSystem":null,"Owner":null},'
      + '{"DeviceID":"H:","VolumeName":"X","FileSystem":"  ","Owner":null}]';
    expect(parseRemovableDrives(out).map((d) => d.fileSystem)).toEqual(['exFAT', 'FAT32', null, null]);
  });
  it("a card with only the system's own entries is empty; one file of the owner's makes it not", () => {
    expect(isEmptyCard([])).toBe(true);
    expect(isEmptyCard(['System Volume Information', '$RECYCLE.BIN', '.Spotlight-V100', '.fseventsd'])).toBe(true);
    expect(isEmptyCard(['System Volume Information', 'holiday.jpg'])).toBe(false);
    expect(isEmptyCard(['presets.ini'])).toBe(false);
  });
  it('one drive printed as an object, and nothing at all, both read', () => {
    expect(parseRemovableDrives(JSON.stringify({ DeviceID: 'H:', Owner: '209133815232' }))[0].saberSerial).toBe('209133815232');
    expect(parseRemovableDrives('')).toEqual([]);
    expect(parseRemovableDrives('not json')).toEqual([]);
  });
});
