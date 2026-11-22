import { describe, expect, it } from 'vitest';
import { BOARD_PINS, bladeKind, wiringConfirmed, wiringFingerprint, wiringProblems, withWiringConfirmation, type ModelBlade, type SaberConfigModel } from '../src';

const main: ModelBlade = { id: 'main', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const crystal: ModelBlade = { id: 'crystal', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } };
const saber: SaberConfigModel = { name: 'hiltwright_test', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263', blades: [main, crystal], presets: [{ font: 'common', track: '', name: 'Preset 1' }] };
const confirmed = withWiringConfirmation(saber, true, '2026-09-24T10:00:00.000Z');

describe('wiring confirmation', () => {
  it('counts for the layout it was given for', () => {
    expect(wiringConfirmed(saber)).toBe(false);
    expect(wiringConfirmed(confirmed)).toBe(true);
    expect(confirmed.wiringConfirmation).toEqual({ at: '2026-09-24T10:00:00.000Z', layout: wiringFingerprint('V2', [main, crystal]) });
  });

  it('is withdrawn by any change to a blade', () => {
    const pin = { ...crystal, wiring: { kind: 'own' as const, dataPin: 'blade3Pin', powerPins: ['bladePowerPin4'] } };
    expect(wiringConfirmed({ ...confirmed, blades: [main, pin] })).toBe(false);
    expect(wiringConfirmed({ ...confirmed, blades: [main, { ...crystal, pixels: 3 }] })).toBe(false);
    expect(wiringConfirmed({ ...confirmed, blades: [main, { ...crystal, type: 'simple' }] })).toBe(false);
    expect(wiringConfirmed({ ...confirmed, blades: [main] })).toBe(false);
  });

  it('#16 counts a brightness limit, and a blade without one keeps the fingerprint it always had', () => {
    // Pinned: the fingerprint of a layout confirmed before limits were kept must not change on update.
    expect(wiringFingerprint('V2', [main, crystal])).toBe('d479cc6fdbe9');
    expect(wiringFingerprint('V2', [main, { ...crystal, dim: undefined }])).toBe(wiringFingerprint('V2', [main, crystal]));
    expect(wiringConfirmed({ ...confirmed, blades: [main, { ...crystal, dim: 50 }] })).toBe(false);
  });

  it('is withdrawn by a change of board', () => {
    expect(wiringConfirmed({ ...confirmed, board: 'V3' })).toBe(false);
  });

  it('survives changes that cannot misroute power: prop, buttons, presets', () => {
    expect(wiringConfirmed({ ...confirmed, prop: 'sa22c', buttons: 1, presets: [] })).toBe(true);
  });

  it('does not depend on the order fields were written in', () => {
    const reordered = JSON.parse(JSON.stringify({ wiring: crystal.wiring, parallel: 1, leds: [], extra: [], order: 'GRB', pixels: 2, type: 'pixel', role: 'crystal', id: 'crystal' })) as ModelBlade;
    expect(wiringFingerprint('V2', [main, reordered])).toBe(wiringFingerprint('V2', [main, crystal]));
  });

  it('comes back when the layout is changed back', () => {
    const changed = { ...confirmed, blades: [main, { ...crystal, pixels: 3 }] };
    expect(wiringConfirmed(changed)).toBe(false);
    expect(wiringConfirmed({ ...changed, blades: [main, crystal] })).toBe(true);
  });

  it('can be turned off, and an old timestamp-only confirmation never counts', () => {
    const off = withWiringConfirmation(confirmed, false);
    expect(wiringConfirmed(off)).toBe(false);
    expect(off.wiringConfirmation).toBeUndefined();
    const legacy: SaberConfigModel = { ...saber, wiringConfirmedAt: '2026-09-22T10:00:00.000Z' };
    expect(wiringConfirmed(legacy)).toBe(false);
    expect(withWiringConfirmation(legacy, true).wiringConfirmedAt).toBeUndefined();
  });
});

// wiring-validation: one set of wiring rules for the page and the build (rules 1-11 of design D1).
describe('wiring problems', () => {
  const simple = (id: string, role: ModelBlade['role'], pins: string[], star = false): ModelBlade => ({
    id, role, type: 'simple', pixels: star ? 3 : 1, order: '', extra: [], parallel: 1,
    leds: star ? ['CreeXPE2RedTemplate<1000>', 'CreeXPE2GreenTemplate<0>', 'CreeXPE2BlueTemplate<240>', 'NoLED'] : ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'],
    wiring: { kind: 'power', pins },
  });
  const chained = (id: string, after: string): ModelBlade => ({ ...crystal, id, wiring: { kind: 'chain', after } });
  const messages = (blades: ModelBlade[], board: 'V2' | 'V3' = 'V2') => wiringProblems(blades, board).map((p) => p.message);

  it('a valid saber has none', () => {
    expect(messages([main, crystal])).toEqual([]);
    expect(messages([main, chained('c', 'main'), simple('a', 'accent', ['bladePowerPin1'])])).toEqual([]);
  });
  it('1 no main blade', () => { expect(messages([crystal])).toContain('One blade must be the main blade.'); });
  it('2 a pixel count below 1', () => { expect(messages([main, { ...crystal, pixels: 0 }])).toContain('Blade 2 needs a pixel count.'); });
  it('3 an own-line strip with no power pin', () => { expect(messages([main, { ...crystal, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: [] } }])).toContain('Blade 2 needs at least one power pin.'); });
  it('4 a power-wired blade with no pin', () => { expect(messages([main, simple('a', 'accent', [])])).toContain('Blade 2 needs a power pin.'); });
  it('5 two strips on one data pin', () => {
    const p = wiringProblems([main, { ...crystal, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin4'] } }], 'V2');
    expect(p[0]).toEqual({ message: 'bladePin has 2 separate strips on it (Blade 1, Blade 2). Chain them, or use different data pins.', pins: ['bladePin'], blades: ['main', 'crystal'] });
  });
  it('6 a chain whose parent is missing, or is not a pixel strip on its own line', () => {
    expect(messages([main, chained('c', 'gone')])).toEqual(['Blade 2 continues a blade that is not a pixel strip on its own data line.']);
    expect(messages([main, simple('a', 'accent', ['bladePowerPin1']), chained('c', 'a')])).toEqual(['Blade 3 continues a blade that is not a pixel strip on its own data line.']);
  });
  it('7 a chain placed before its parent', () => {
    expect(messages([chained('c', 'main'), main])).toEqual(['Blade 1 continues Blade 2, which comes after it. Move it below Blade 2.']);
  });
  it('8 a pin the board does not have', () => {
    expect(messages([main, { ...crystal, wiring: { kind: 'own', dataPin: 'blade6Pin', powerPins: ['bladePowerPin4'] } }])).toEqual(['Blade 2 uses blade6Pin, which the Proffieboard V2 does not have.']);
    expect(messages([main, simple('a', 'accent', ['blade5Pin'])])).toEqual(['Blade 2 uses blade5Pin, which the Proffieboard V2 does not have.']);
    expect(messages([main, simple('a', 'accent', ['blade5Pin'])], 'V3')).toEqual([]);
  });
  it('9 a low-current PWM pin driving a motor or a star LED', () => {
    expect(messages([main, simple('m', 'motor', ['blade5Pin'])], 'V3')).toEqual(['Free 1 is a low-current PWM pin: it cannot drive a motor.']);
    expect(messages([main, simple('s', 'accent', ['blade5Pin', 'bladePowerPin4', 'bladePowerPin5'], true)], 'V3')).toEqual(['Free 1 is a low-current PWM pin: it cannot drive a star LED.']);
  });
  it('10 one pin used as a data line and as PWM power', () => {
    const p = wiringProblems([main, { ...crystal, wiring: { kind: 'own', dataPin: 'blade5Pin', powerPins: ['bladePowerPin4'] } }, simple('a', 'accent', ['blade5Pin'])], 'V3');
    expect(p.map((x) => x.message)).toEqual(['blade5Pin is used as a data line by Blade 2 and as a low-current power pin by Blade 3.']);
    expect(p[0].pins).toEqual(['blade5Pin']);
  });
  it('11 the same pin twice within one blade', () => {
    expect(messages([main, simple('s', 'accent', ['bladePowerPin4', 'bladePowerPin4', 'bladePowerPin4'], true)])).toEqual(['Blade 2 uses LED 4 more than once.']);
  });
  it('knows each board\'s pins and a blade\'s kind', () => {
    expect(BOARD_PINS.V3.freeData).toEqual(['blade5Pin', 'blade6Pin', 'blade7Pin']);
    expect(BOARD_PINS.V2.power.every((o) => o.kind === 'fet')).toBe(true);
    expect([bladeKind(main), bladeKind(simple('m', 'motor', ['bladePowerPin1'])), bladeKind(simple('s', 'accent', ['a', 'b', 'c'], true))]).toEqual(['pixel', 'motor', 'star']);
  });
});
