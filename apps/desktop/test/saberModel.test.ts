import { describe, expect, it } from 'vitest';
import { STARTER_LOOKS, generateConfig, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { withLookInSlot } from '../src/renderer/src/slotModel';

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const crystal: ModelBlade = { id: 'b2', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } };
const model: SaberConfigModel = { name: 'hiltwright_test', board: 'V2', buttons: 2, prop: 'sa22c', blades: [main, crystal], presets: [{ font: 'A;common', track: '', name: 'One' }, { font: 'B;common', track: '', name: 'Two' }] };
const fire = STARTER_LOOKS.find((l) => l.id === 'hw_fire')!;
const heart = STARTER_LOOKS.find((l) => l.id === 'hw_heartbeat')!;

describe('queuing a look with the colours chosen for it', () => {
  it('keeps the colours beside the look, per blade', () => {
    const a = withLookInSlot(model, fire, 1, 1, '0,65535,0 65535,65535,65535');
    expect(a.presets[1].looks).toEqual(['hw_fire', null]);
    expect(a.presets[1].lookArgs).toEqual(['0,65535,0 65535,65535,65535', null]);
    expect(a.presets[0].lookArgs).toBeUndefined();

    const b = withLookInSlot(a, heart, 1, 2, '65535,0,65535');
    expect(b.presets[1].looks).toEqual(['hw_fire', 'hw_heartbeat']);
    expect(b.presets[1].lookArgs).toEqual(['0,65535,0 65535,65535,65535', '65535,0,65535']);
  });

  it('forgets old colours when the slot gets a look without any', () => {
    const a = withLookInSlot(model, fire, 0, 1, '65535,0,0');
    const b = withLookInSlot(a, fire, 0, 1);
    expect(b.presets[0].lookArgs).toBeUndefined();
  });

  it('never reaches the firmware: colours live in the saber\'s presets, not the config', () => {
    const plain = generateConfig(withLookInSlot(model, fire, 1, 1));
    const coloured = generateConfig(withLookInSlot(model, fire, 1, 1, '0,65535,0'));
    expect(coloured.text).toBe(plain.text);
    expect(coloured.hash).toBe(plain.hash);
  });
});
