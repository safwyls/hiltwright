import { describe, expect, it } from 'vitest';
import { generateConfig, validateModel, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { bladeSummary, freeDataPins, kindOf, newBlade, pinTable, withBladeCount, withContinuation, withKind } from '../src/renderer/src/hardwareModel';

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const model = (blades: ModelBlade[], board: 'V2' | 'V3' = 'V2'): SaberConfigModel => ({ name: 'hw_editor', board, boardFrom: 'owner', buttons: 2, prop: 'sa22c', blades, presets: [{ font: 'A', track: '', name: 'One' }] });

describe('hardware editor model', () => {
  it('a new blade takes the first free data pin and power pin', () => {
    const b = newBlade('b2', 'crystal', 'V2', { data: ['bladePin'], power: ['bladePowerPin2', 'bladePowerPin3'] });
    expect(b.wiring).toEqual({ kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin1'] });
    expect(kindOf(b)).toBe('pixel');
  });

  it('switching what a blade is built from yields something the generator accepts', () => {
    const accent = newBlade('b2', 'accent', 'V3', { data: ['bladePin'], power: ['bladePowerPin2', 'bladePowerPin3'] });
    expect(kindOf(accent)).toBe('single');
    const star = withKind(accent, 'star', 'V3');
    expect(kindOf(star)).toBe('star');
    expect((star.wiring as { pins: string[] }).pins).toHaveLength(3);
    const motor = withKind({ ...accent, role: 'motor' }, 'motor', 'V3');
    expect(kindOf(motor)).toBe('motor');
    const back = withKind(star, 'pixel', 'V3');
    expect(back.type).toBe('pixel');
    expect(back.wiring.kind).toBe('own');
    for (const blades of [[main, accent], [main, star], [main, motor], [main, { ...back, wiring: { kind: 'own' as const, dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } }]]) {
      expect(validateModel(model(blades, 'V3'))).toEqual([]);
      expect(generateConfig(model(blades, 'V3')).text).toContain('BladeConfig blades[]');
    }
  });

  it('flags two separate strips on one data pin, but not a chained one', () => {
    const second: ModelBlade = { ...main, id: 'b2', role: 'side', pixels: 20, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin4'] } };
    const clash = pinTable([main, second], 'V2');
    expect(clash.problems.join(' ')).toMatch(/bladePin has 2 separate strips/);
    expect(clash.data[0].conflict).toBe(true);
    const chained: ModelBlade = { ...second, order: '', wiring: { kind: 'chain', after: 'b1' } };
    const ok = pinTable([main, chained], 'V2');
    expect(ok.problems).toEqual([]);
    expect(ok.data[0].users).toEqual(['b1', 'b2']);
    expect(bladeSummary([main, chained], chained, 'V2')).toBe("20 px · continues Blade 1's wire · pixels 132–151");
  });

  it('shared power is a note, PWM pins refuse motors and star LEDs, and a main blade is required', () => {
    const accent: ModelBlade = { id: 'b2', role: 'accent', type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin3'] } };
    const shared = pinTable([main, accent], 'V2');
    expect(shared.problems).toEqual([]);
    expect(shared.shared).toEqual(['LED 3']);
    const motorOnPwm: ModelBlade = { id: 'b3', role: 'motor', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['blade5Pin'] } };
    expect(pinTable([main, motorOnPwm], 'V3').problems.join(' ')).toMatch(/Free 1 is a low-current PWM pin: it cannot drive a motor/);
    const led = { ...motorOnPwm, role: 'accent' as const };
    expect(pinTable([main, led], 'V3').problems).toEqual([]);
    expect(pinTable([{ ...main, role: 'side' }], 'V2').problems).toContain('One blade must be the main blade.');
  });
});

// Baseline audit (baseline-firmware hardware-wiring 1.3, 1.10).
describe('hardware-wiring audit', () => {
  it('1.3 adding a crystal: raising the count from 1 to 2 adds a crystal chamber on the next free data and power pins', () => {
    const two = withBladeCount([main], 2, 'V2')!;
    expect(two).toHaveLength(2);
    expect(two[0]).toBe(main);
    expect(two[1]).toMatchObject({ id: 'b2', role: 'crystal', type: 'pixel', pixels: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin1'] } });
    expect(withBladeCount(two, 3, 'V2')![2].role).toBe('accent');
    expect(withBladeCount(two, 1, 'V2')).toEqual([main]);
    expect(withBladeCount([main], 0, 'V2')).toBeNull();
    expect(withBladeCount([main], 9, 'V2')).toBeNull();
  });

  it('1.10 a free pin: a data pin no blade uses has no users (the pin table shows it as free)', () => {
    const { data, power } = pinTable([main], 'V2');
    expect(data.find((r) => r.pin === 'bladePin')!.users).toEqual(['b1']);
    const free = data.filter((r) => r.pin !== 'bladePin');
    expect(free.length).toBeGreaterThan(0);
    for (const r of free) expect(r.users).toEqual([]);
    expect(power.filter((r) => !r.users.length).map((r) => r.pin)).toEqual(expect.arrayContaining(['bladePowerPin1', 'bladePowerPin4']));
  });
});

// FST-3, fixed in wiring-validation: a new star LED's three channels each get a pin no other channel or blade uses.
it('a new star LED gets three pins of its own', () => {
  const accent = newBlade('b2', 'accent', 'V2', { data: ['bladePin'], power: ['bladePowerPin2', 'bladePowerPin3'] });
  const star = withKind(accent, 'star', 'V2', ['bladePowerPin2', 'bladePowerPin3']);
  const pins = (star.wiring as { pins: string[] }).pins;
  expect(new Set(pins).size).toBe(3);
  expect(pins.some((p) => ['bladePowerPin2', 'bladePowerPin3'].includes(p))).toBe(false);
});

// wiring-validation: the page shows exactly the problems the build refuses, in the same words.
describe('the page and the build agree', () => {
  it('pinTable and validateModel give the same wiring problems', () => {
    const accentOnPwm = { ...withKind(newBlade('b2', 'motor', 'V3', { data: ['bladePin'], power: ['bladePowerPin2', 'bladePowerPin3'] }), 'motor', 'V3'), role: 'motor' as const, wiring: { kind: 'power' as const, pins: ['blade5Pin'] } };
    const chainFirst = { ...main, id: 'b3', role: 'side' as const, pixels: 10, wiring: { kind: 'chain' as const, after: 'b1' } };
    const blades = [chainFirst, main, accentOnPwm];
    const t = pinTable(blades, 'V3');
    const build = validateModel(model(blades, 'V3'));
    expect(t.problems.length).toBeGreaterThanOrEqual(2);
    for (const p of t.problems) expect(build).toContain(p);
    expect(t.power.find((r) => r.pin === 'blade5Pin')!.conflict).toBe(true);
  });
  it('labels only the V3-only data pins as free', () => {
    expect(freeDataPins('V3')).toEqual(['blade5Pin', 'blade6Pin', 'blade7Pin']);
    expect(freeDataPins('V2')).toEqual([]);
  });
  it('#15 an imported LED with an empty slot between its pins: the placeholder is no pin in the table or the summary', () => {
    const sparse: ModelBlade = { id: 'b2', role: 'accent', type: 'simple', pixels: 2, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'CreeXPE2BlueTemplate<240>', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin4', '-1', 'bladePowerPin6'] } };
    const t = pinTable([main, sparse], 'V3');
    expect(t.problems).toEqual([]);
    expect(t.power.filter((r) => r.users.includes('b2')).map((r) => r.pin)).toEqual(['bladePowerPin4', 'bladePowerPin6']);
    expect(bladeSummary([main, sparse], sparse, 'V3')).toBe('Single LED · LED 4 + LED 6');
  });
  it('#17 making a strip with a blade chained to it a continuation moves that blade onto the same strip, never a chain of a chain', () => {
    const b2: ModelBlade = { ...main, id: 'b2', role: 'side', pixels: 20, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } };
    const b3: ModelBlade = { ...main, id: 'b3', role: 'side', pixels: 30, order: '', wiring: { kind: 'chain', after: 'b2', reverse: true } };
    const next = withContinuation([{ ...main, pixels: 10 }, b2, b3], 'b2', 'b1');
    expect(next.map((b) => b.wiring)).toEqual([main.wiring, { kind: 'chain', after: 'b1' }, { kind: 'chain', after: 'b1', reverse: true }]);
    expect(pinTable(next, 'V3').problems).toEqual([]);
    expect(bladeSummary(next, next[2], 'V3')).toBe("30 px · continues Blade 1's wire · pixels 30–59");
  });
  it("#16 a blade's brightness limit shows in its summary", () => {
    expect(bladeSummary([{ ...main, dim: 20 }], { ...main, dim: 20 }, 'V2')).toBe('132 px · bladePin · LED 2 + LED 3 · 20% brightness');
  });
});
