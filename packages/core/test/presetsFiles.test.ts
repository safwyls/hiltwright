// Issue #25: which of presets.ini and presets.tmp ProffieOS loads. The files here are built the way v8.10's
// BufferedFileWriter writes them: two equal 16-byte headers, the install time, the text at byte 512, zero padding.

import { describe, expect, it } from 'vitest';
import { activePresets, emitPresetsIni, readPresetsFile, savedPresetsHeader, type PresetRecord } from '../src';

const INSTALLED = 'Nov 20 2026 10:00:00';
const preset = (name: string): PresetRecord => ({ font: name, track: '', styles: ['builtin 0 1'], name, variation: 0 });
const text = (names: string[], installed = INSTALLED) => emitPresetsIni({ installed, presets: names.map(preset), terminated: true });
const bytes = (s: string) => new TextEncoder().encode(s);

/** A file as the firmware saves it. */
function saved(names: string[], iteration: number, opts: { installed?: string; size?: number } = {}): Uint8Array {
  const installed = opts.installed ?? INSTALLED;
  const body = bytes(text(names, installed));
  let sum = 0;
  for (const b of body) sum = (Math.imul(sum, 997) + b) >>> 0;
  const file = new Uint8Array(opts.size ?? 256 * 1024);
  const v = new DataView(file.buffer);
  for (const at of [0, 16]) {
    v.setUint32(at, 0xff1e5afe, true);
    v.setUint32(at + 4, sum, true);
    v.setUint32(at + 8, iteration, true);
    v.setUint32(at + 12, body.length, true);
  }
  file.set(bytes(installed), 32);
  file.set(body.subarray(0, Math.max(0, file.length - 512)), 512);
  return file;
}

const names = (files: Parameters<typeof activePresets>[0]) => {
  const a = activePresets(files);
  return a && { file: a.file, names: a.ini.presets.map((p) => p.name) };
};

describe('the presets file ProffieOS loads (issue #25)', () => {
  it('reads the header of a saved file, and none from a plain one', () => {
    expect(savedPresetsHeader(saved(['A'], 7))).toMatchObject({ iteration: 7, length: bytes(text(['A'])).length });
    expect(savedPresetsHeader(bytes(text(['A'])))).toBeNull();
    const torn = saved(['A'], 7);
    torn[24] ^= 1; // the second copy of the header differs from the first
    expect(savedPresetsHeader(torn)).toBeNull();
    expect(readPresetsFile(torn)).toBeNull();
  });

  it('takes the saved file with the higher iteration, presets.ini on a tie', () => {
    expect(names({ ini: saved(['Old'], 5), tmp: saved(['Edited', 'On the saber'], 6) })).toEqual({ file: 'presets.tmp', names: ['Edited', 'On the saber'] });
    expect(names({ ini: saved(['Newer'], 8), tmp: saved(['Older'], 7) })).toEqual({ file: 'presets.ini', names: ['Newer'] });
    expect(names({ ini: saved(['Ini'], 4), tmp: saved(['Tmp'], 4) })).toEqual({ file: 'presets.ini', names: ['Ini'] });
  });

  it('passes over a save whose checksum does not match, or that is cut short', () => {
    const bad = saved(['Half written', 'Second'], 9);
    bad[600] ^= 0x20;
    expect(names({ ini: saved(['Good'], 8), tmp: bad })).toEqual({ file: 'presets.ini', names: ['Good'] });
    const short = saved(['A', 'B', 'C'], 9, { size: 560 }); // the header says more text than the file holds
    expect(readPresetsFile(short)).toBeNull();
    expect(names({ ini: saved(['Good'], 8), tmp: short })).toEqual({ file: 'presets.ini', names: ['Good'] });
  });

  it('prefers a good save to a plain file, then takes a complete plain file, presets.ini first', () => {
    expect(names({ ini: bytes(text(['Plain'])), tmp: saved(['Saved'], 1) })).toEqual({ file: 'presets.tmp', names: ['Saved'] });
    expect(names({ ini: bytes(text(['Plain ini'])), tmp: bytes(text(['Plain tmp'])) })).toEqual({ file: 'presets.ini', names: ['Plain ini'] });
    expect(names({ tmp: bytes(text(['Only tmp'])) })).toEqual({ file: 'presets.tmp', names: ['Only tmp'] });
  });

  it('ignores a plain file cut short, one without installed= first, and one with more after its end', () => {
    const cut = text(['Cut', 'Short']);
    expect(readPresetsFile(bytes(cut.slice(0, cut.lastIndexOf('end'))))).toBeNull();
    expect(names({ ini: bytes(cut.slice(0, cut.lastIndexOf('end'))), tmp: saved(['Saved'], 3) })).toEqual({ file: 'presets.tmp', names: ['Saved'] });
    expect(readPresetsFile(bytes(`# notes\n${text(['A'])}`))).toBeNull();
    expect(readPresetsFile(bytes(emitPresetsIni({ installed: null, presets: [preset('A')], terminated: true })))).toBeNull();
    expect(readPresetsFile(bytes(`${text(['A'])}new_preset\nfont=B\n`))).toBeNull();
    expect(readPresetsFile(bytes(`${text(['A'])}\n\n  \n`))).toMatchObject({ kind: 'plain' });
  });

  it('cannot tell when the loadable files carry different install times, or when nothing would load', () => {
    expect(activePresets({ ini: saved(['From the old build'], 57, { installed: 'Jan  1 2026 09:00:00' }), tmp: saved(['From the new build'], 1) })).toBeNull();
    expect(activePresets({})).toBeNull();
    expect(activePresets({ ini: new Uint8Array(256 * 1024) })).toBeNull();
  });
});
