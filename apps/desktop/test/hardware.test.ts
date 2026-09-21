import { describe, expect, it } from 'vitest';
import { generateConfig, validateModel, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { bladeSummary, kindOf, newBlade, pinTable, withKind } from '../src/renderer/src/hardwareModel';

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const model = (blades: ModelBlade[], board: 'V2' | 'V3' = 'V2'): SaberConfigModel => ({ name: 'hw_editor', board, buttons: 2, prop: 'sa22c', blades, presets: [{ font: 'A', track: '', name: 'One' }] });

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
