import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { LIBRARY_LOOKS, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { buildFirmware } from '../src/main/build';

// Compiles every Hiltwright look with the real toolchain and measures what each costs in flash on a V2.
// Needs HILTWRIGHT_TOOLCHAIN_DIR; HILTWRIGHT_LOOK_SIZES=<file.json> writes the measurements out.
const root = process.env.HILTWRIGHT_TOOLCHAIN_DIR;
const out = process.env.HILTWRIGHT_LOOK_SIZES;
// HILTWRIGHT_LOOK_ONLY=hw_a,hw_b measures just those looks (each compile takes most of a minute).
const only = process.env.HILTWRIGHT_LOOK_ONLY?.split(',').map((x) => x.trim()).filter(Boolean) ?? null;

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const crystal: ModelBlade = { id: 'b2', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } };

/** Two presets on a blade plus a crystal; preset two optionally swaps in one look on the blade of its role. */
function model(name: string, lookId: string | null): SaberConfigModel {
  const look = LIBRARY_LOOKS.find((l) => l.id === lookId);
  const onMain = look ? look.roles.includes('main') : false;
  return {
    name, board: 'V2', buttons: 2, prop: 'sa22c', blades: [main, crystal],
    presets: [{ font: 'A;common', track: '', name: 'One' }, { font: 'B;common', track: '', name: 'Two', ...(look ? { looks: onMain ? [look.id, null] : [null, look.id] } : {}) }],
  };
}

describe.skipIf(!root)('look library on the real toolchain', () => {
  it('every look compiles, and its flash cost is known', async () => {
    const base = await buildFirmware({ toolchainRoot: root!, saberId: 'look-sizes', model: model('hw_sizes_base', null), force: true });
    expect(base.ok, base.problems.join(' ')).toBe(true);
    const sizes: Record<string, number> = {};
    const failures: string[] = [];
    for (const l of LIBRARY_LOOKS) {
      if (only && !only.includes(l.id)) continue;
      if (l.roles.includes('motor')) continue; // a motor needs a simple blade; covered by the generator tests and the default build
      const r = await buildFirmware({ toolchainRoot: root!, saberId: 'look-sizes', model: model(`hw_sizes_${l.id}`, l.id), force: true });
      if (!r.ok || r.textBytes == null || base.textBytes == null) { failures.push(`${l.id}: ${r.problems[0] ?? 'no size'}\n${r.output.slice(0, 1500)}`); continue; }
      sizes[l.id] = Math.max(0, r.textBytes - base.textBytes);
      console.log(`[look] ${l.id.padEnd(12)} +${(sizes[l.id] / 1024).toFixed(1)} KB  (${r.flashPct}% of V2 flash, ${(r.ms / 1000).toFixed(0)} s)`);
    }
    console.log(`[look] baseline ${(base.textBytes! / 1024).toFixed(1)} KB = ${base.flashPct}% of V2 flash`);
    if (out) await writeFile(out, JSON.stringify({ baseline: base.textBytes, sizes }, null, 2));
    expect(failures).toEqual([]);
  }, 30 * 60 * 1000);
});
