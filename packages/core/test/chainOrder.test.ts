// A continuation (SubBlade(..., NULL)) joins the strip of the most recent SubBlade that was given a strip of its own,
// in blade order (ProffieOS blades/sub_blade.h: a SubBlade with a blade starts a new chain; one with NULL joins the
// latest). So a blade that continues Blade 1 but comes after another chained strip lands on that other strip (issue #35).

import { describe, expect, it } from 'vitest';
import { bladeTables, generateConfig, parseConfig, rowToBlades, validateModel, wiringProblems, type ModelBlade, type SaberConfigModel } from '../src';

const own = (id: string, role: ModelBlade['role'], pin: string, power: string, pixels: number): ModelBlade => ({ id, role, type: 'pixel', pixels, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: pin, powerPins: [power] } });
const after = (id: string, role: ModelBlade['role'], parent: string, pixels: number): ModelBlade => ({ id, role, type: 'pixel', pixels, order: '', extra: [], leds: [], parallel: 1, wiring: { kind: 'chain', after: parent } });
const model = (blades: ModelBlade[]): SaberConfigModel => ({ name: 'hw_chains', board: 'V3', boardFrom: 'owner', buttons: 2, prop: 'sa22c', blades, presets: [{ font: 'A', track: '', name: 'One' }] });
const readBack = (m: SaberConfigModel) => rowToBlades(bladeTables(parseConfig(generateConfig(m).text))[0].rows[0]);

describe('a continuation joins the most recent chained strip before it', () => {
  const a = own('a', 'main', 'bladePin', 'bladePowerPin2', 10);
  const b = own('b', 'side', 'blade2Pin', 'bladePowerPin3', 10);
  const c = after('c', 'crystal', 'a', 5);
  const d = after('d', 'accent', 'b', 5);

  it('Blade 3 continuing Blade 1 after Blade 2 started its own chained strip would land on Blade 2: refused', () => {
    const problems = wiringProblems([a, b, c, d], 'V3').map((p) => p.message);
    expect(problems).toEqual([expect.stringMatching(/^Blade 3 continues Blade 1, but Blade 2 starts another shared strip between them\./)]);
    expect(validateModel(model([a, b, c, d]))).toHaveLength(1);
  });

  it('what ProffieOS would make of it: the continuation is read back on the other strip', () => {
    // Generated without the check, to show the firmware's reading of the blade row.
    const blades = readBack({ ...model([a, b, c, d]) });
    expect(blades[2].wiring).toEqual({ kind: 'chain', after: 'b2' });
  });

  it('each continuation right after its own strip is accepted, and reads back on that strip', () => {
    const m = model([a, c, b, d]);
    expect(validateModel(m)).toEqual([]);
    const blades = readBack(m);
    expect(blades[1].wiring).toEqual({ kind: 'chain', after: 'b1' });
    expect(blades[3].wiring).toEqual({ kind: 'chain', after: 'b3' });
  });

  it('a strip on its own data line between them does not count: it starts no chain', () => {
    const plain = own('p', 'side', 'blade3Pin', 'bladePowerPin4', 3);
    const m = model([a, plain, c]);
    expect(validateModel(m)).toEqual([]);
    expect(readBack(m)[2].wiring).toEqual({ kind: 'chain', after: 'b1' });
  });

  it('a chain of a chain counts as its root strip: Blade 3 after Blade 2 after Blade 1 is fine', () => {
    expect(validateModel(model([a, after('c2', 'crystal', 'a', 5), after('c3', 'accent', 'c2', 5)]))).toEqual([]);
  });
});
