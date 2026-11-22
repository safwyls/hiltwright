import { describe, expect, it } from 'vitest';
import { STARTER_LOOKS, generateConfig, lookFingerprint, type LookDef, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { installedLookIds, queuedLookIds, withLookInSlot, withSlotChoice } from '../src/renderer/src/slotModel';
import type { SaberRecord } from '../src/shared/api';

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const crystal: ModelBlade = { id: 'b2', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } };
const model: SaberConfigModel = { name: 'hiltwright_test', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'sa22c', blades: [main, crystal], presets: [{ font: 'A;common', track: '', name: 'One' }, { font: 'B;common', track: '', name: 'Two' }] };
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

// preset-editing 6.14 (baseline audit): a style chosen for a live preset that the installed firmware lacks is queued
// for the next Build & Flash, and is counted once.
describe('a new style on a live saber', () => {
  const firmware = (ids: string[]): SaberRecord['firmware'] => ({ hash: 'h', os: 'v8.10', at: '2026-09-25T00:00:00Z', looks: ids.map((id) => ({ id, name: id, args: [] })), presets: [] });

  it('6.14 counts as queued when the firmware does not have it, once however many slots use it', () => {
    const one = withLookInSlot(model, fire, 0, 1);
    expect(queuedLookIds(one, firmware(['hw_heartbeat']))).toEqual(['hw_fire']);
    const twice = withLookInSlot(one, fire, 1, 2);
    expect(queuedLookIds(twice, firmware(['hw_heartbeat']))).toEqual(['hw_fire']);
  });

  it('6.14 is not queued when the installed firmware already has it', () => {
    expect(queuedLookIds(withLookInSlot(model, heart, 0, 1), firmware(['hw_heartbeat']))).toEqual([]);
  });

  it('6.14 is queued, every chosen style, on firmware Hiltwright did not build', () => {
    expect(queuedLookIds(withLookInSlot(withLookInSlot(model, fire, 0, 1), heart, 1, 1), undefined).sort()).toEqual(['hw_fire', 'hw_heartbeat']);
    expect(queuedLookIds(undefined, undefined)).toEqual([]);
  });
});

// style-library "A style's state on the working saber is shown" (style-save-integrity ST2).
describe('a style edited since the install', () => {
  const mine: LookDef = { id: 'look_mine', name: 'Mine', source: 'built', by: 'you', code: 'StylePtr<Red>()', header: null, roles: ['main'], args: [], preview: '#ff0000', description: '' };
  const edited: LookDef = { ...mine, code: 'StylePtr<Blue>()' };
  const planWith = (look: LookDef) => withLookInSlot(model, look, 0, 1);
  const installed = (look: LookDef, withHash = true): SaberRecord['firmware'] => ({ hash: 'h', os: 'v8.10', at: '2026-09-26T00:00:00Z', looks: [{ id: look.id, name: look.name, args: [], ...(withHash ? { hash: lookFingerprint(look) } : {}) }], presets: [] });

  it('is queued again once the plan holds a new version', () => {
    const plan = { ...planWith(mine), looks: [edited] };
    expect(queuedLookIds(plan, installed(mine))).toEqual(['look_mine']);
  });

  it('is not queued while the plan holds the installed version', () => {
    expect(queuedLookIds(planWith(mine), installed(mine))).toEqual([]);
  });

  it('counts as installed on firmware from before fingerprints', () => {
    const plan = { ...planWith(mine), looks: [edited] };
    expect(queuedLookIds(plan, installed(mine, false))).toEqual([]);
    expect([...installedLookIds(installed(mine, false), () => edited)]).toEqual(['look_mine']);
  });

  it('shows on the saber only for the installed version', () => {
    expect([...installedLookIds(installed(mine), () => mine)]).toEqual(['look_mine']);
    expect([...installedLookIds(installed(mine), () => edited)]).toEqual([]);
  });
});

// preset-editor-fixes D1: the one rule for what a slot holds, live or queued (F37).
describe('the slot holds the latest choice', () => {
  const firmware = (ids: string[]): SaberRecord['firmware'] => ({ hash: 'h', os: 'v8.10', at: '2026-09-29T00:00:00Z', looks: ids.map((id) => ({ id, name: id, args: [] })), presets: [] });

  it('a look with colours still to write, a look written live with none, and no style at all', () => {
    const queued = withSlotChoice(model, 0, 1, fire, '0,65535,0');
    expect(queued.presets[0]).toMatchObject({ looks: ['hw_fire', null], lookArgs: ['0,65535,0', null] });
    const live = withSlotChoice(queued, 0, 1, heart, null);
    expect(live.presets[0].looks).toEqual(['hw_heartbeat', null]);
    expect(live.presets[0].lookArgs).toBeUndefined();
    const none = withSlotChoice(live, 0, 1, null, 'ignored');
    expect(none.presets[0].looks).toBeUndefined();
    expect(none.presets[0].lookArgs).toBeUndefined();
  });

  it('F37 a queued style replaced live by one the firmware has: nothing is queued for the next build', () => {
    const queued = withSlotChoice(model, 0, 1, fire, null);
    expect(queuedLookIds(queued, firmware(['hw_heartbeat']))).toEqual(['hw_fire']);
    const chosenLive = withSlotChoice(queued, 0, 1, heart, null);
    expect(queuedLookIds(chosenLive, firmware(['hw_heartbeat']))).toEqual([]);
    expect(generateConfig(chosenLive).manifest.presets[0].looks[0]).toBe('hw_heartbeat');
  });

  it("a style of the owner's own is added to the model once", () => {
    const mine: LookDef = { id: 'look_mine', name: 'Mine', source: 'built', by: 'you', code: 'StylePtr<Red>()', header: null, roles: ['main'], args: [], preview: '#ff0000', description: '' };
    const a = withSlotChoice(withSlotChoice(model, 0, 1, mine, null), 1, 1, mine, null);
    expect(a.looks?.filter((l) => l.id === 'look_mine')).toHaveLength(1);
  });
});
