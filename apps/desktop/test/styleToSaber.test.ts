// style-to-saber-fixes: "Use it in <preset>" on the Styles page (ST3-ST6, HW-2026-09-26a).
import { describe, expect, it } from 'vitest';
import { STARTER_LOOKS, lookFingerprint, type FirmwareManifest, type LookDef, type ModelBlade, type PresetRecord, type SaberConfigModel } from '@hiltwright/core';
import { coloursText, mergeArgs, modelAfterPutIn, planPutIn, putInResult, putInWords, type PutInInput } from '../src/renderer/src/styleToSaber';
import { queuedLookIds, withSlotChoice } from '../src/renderer/src/slotModel';

const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const crystal: ModelBlade = { id: 'b2', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } };
const ember: LookDef = { id: 'look_ember', name: 'Ember', source: 'pasted', by: 'Hiltwright', code: 'StylePtr<Layers<RgbArg<BASE_COLOR_ARG,Red>>>()', header: null, roles: ['main', 'side'], args: [1, 9, 10], preview: '#ff0000', description: '' };
const fire = STARTER_LOOKS.find((l) => l.id === 'hw_fire')!;

const RED = '65535,0,0';
const GREEN = '0,65535,0';
const BLUE = '0,0,65535';
const WHITE = '65535,65535,65535';

// Installed: Ember in preset 1 blade 1, Fire in preset 2 blade 1.
const firmware: FirmwareManifest = {
  hash: 'fw', os: 'v8.10', at: '2026-10-01T00:00:00Z',
  looks: [{ id: ember.id, name: ember.name, args: ember.args, hash: lookFingerprint(ember) }, { id: fire.id, name: fire.name, args: fire.args, hash: lookFingerprint(fire) }],
  presets: [{ name: 'One', looks: [ember.id, ''] }, { name: 'Two', looks: [fire.id, ''] }, { name: 'Three', looks: [fire.id, ''] }],
};
const rec = (name: string, styles: string[]): PresetRecord => ({ name, font: 'A;common', track: '', styles, variation: 0 });
// What the saber reports: preset 2 runs Fire with the owner's own green base and arg 2 set; preset 1 runs Ember.
const saberPresets = [rec('One', [`builtin 0 1 ${RED}`, 'builtin 0 2']), rec('Two', [`builtin 1 1 ${GREEN} ${WHITE}`, 'builtin 0 2']), rec('Three', ['builtin 2 1', 'builtin 0 2'])];
const model: SaberConfigModel = { name: 'hiltwright_test', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263', blades: [main, crystal], presets: saberPresets.map((p) => ({ name: p.name, font: p.font, track: p.track })), looks: [ember] };

const input = (over: Partial<PutInInput> = {}): PutInInput => ({ model, firmware, saberPresets, live: true, locked: null, look: ember, preset: 1, blade: 1, tried: new Map(), ...over });

describe('ST3: a staged preset list', () => {
  // Staged: a different list, in a different order. Position 0 here is not the saber's preset 1.
  const staged: SaberConfigModel = { ...model, presets: [{ name: 'Loaded A', font: 'X', track: '' }, { name: 'Loaded B', font: 'Y', track: '' }], presetsFrom: { name: 'A set', at: '2026-10-02T00:00:00Z' } };

  it('stages the change instead of writing to the live saber by position', () => {
    const plan = planPutIn(input({ model: staged, preset: 0 }));
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    expect(plan.staged).toBe(true);
    const next = modelAfterPutIn(staged, plan, ember, 0, 1)!;
    expect(next.presets[0].looks).toEqual([ember.id, null]);
    expect(next.presets[0].name).toBe('Loaded A');
    expect(next.presetsFrom).toEqual(staged.presetsFrom);
  });

  it('does not take colours from the saber preset at the same position', () => {
    const plan = planPutIn(input({ model: staged, preset: 1 }));
    expect(plan.kind === 'plan' && plan.args).toBeNull();
  });

  it('says it goes into the staged preset', () => {
    const plan = planPutIn(input({ model: staged, preset: 0 }));
    const w = putInWords(plan, { saber: 'Hote', preset: 'Loaded A', blade: 1, queuedElsewhere: false, kb: null, tried: false });
    expect(w.button).toBe('Use it in Loaded A');
    expect(w.hint).toMatch(/staged Loaded A/);
    expect(putInResult(plan, { saber: 'Hote', preset: 'Loaded A', blade: 1, look: 'Ember', tried: false }, true)?.text).toMatch(/staged Loaded A.*next install/);
  });
});

describe('ST4: a live "Use it in" is recorded in the plan', () => {
  it('writes the installed slot now, and records the style in the target preset through withSlotChoice', () => {
    const plan = planPutIn(input({ preset: 2 }));
    expect(plan.kind).toBe('live');
    if (plan.kind !== 'live') return;
    expect(plan.style).toBe('builtin 0 1');
    const next = modelAfterPutIn(model, plan, ember, 2, 1)!;
    expect(next).toEqual(withSlotChoice(model, 2, 1, ember, null));
    // A rebuild compiles Ember into preset 3's own slot, so a later change to preset 1 cannot change it.
    expect(next.presets[2].looks).toEqual([ember.id, null]);
    expect(next.presets[2].lookArgs).toBeUndefined();
    expect(queuedLookIds(next, firmware)).toEqual([]);
  });

  it('replaces a choice queued earlier for that slot, with nothing left to write', () => {
    const queued = withSlotChoice(model, 2, 1, fire, BLUE);
    const plan = planPutIn(input({ model: queued, preset: 2 }));
    expect(plan.kind).toBe('live');
    const next = modelAfterPutIn(queued, plan, ember, 2, 1)!;
    expect(next.presets[2].looks).toEqual([ember.id, null]);
    expect(next.presets[2].lookArgs).toBeUndefined();
  });

  it('records nothing for a write the saber did not confirm', () => {
    const plan = planPutIn(input({ preset: 2 }));
    const r = putInResult(plan, { saber: 'Hote', preset: 'Three', blade: 1, look: 'Ember', tried: false }, false);
    expect(r?.tone).toBe('red');
    expect(r?.text).toMatch(/nothing was recorded/);
  });
});

describe('ST5: the blade\'s own colours', () => {
  it('keeps the blade\'s own colours the new style reads, and drops the ones it does not', () => {
    // Preset 2 blade 1 has base green and arg 2 (white); Ember reads 1, 9 and 10.
    const plan = planPutIn(input({ preset: 1, tried: new Map([[9, BLUE]]) }));
    expect(plan.kind).toBe('live');
    if (plan.kind !== 'live') return;
    expect(plan.style).toBe(`builtin 0 1 ${GREEN} ~ ~ ~ ~ ~ ~ ~ ${BLUE}`);
    expect(plan.kept).toEqual([1]);
    expect(plan.replaced).toEqual([]);
  });

  it('says before acting which of the blade\'s own colours a tried one replaces', () => {
    const plan = planPutIn(input({ preset: 1, tried: new Map([[1, BLUE]]) }));
    expect(plan.kind === 'live' && plan.replaced).toEqual([1]);
    const w = putInWords(plan, { saber: 'Hote', preset: 'Two', blade: 1, queuedElsewhere: false, kb: null, tried: true });
    expect(w.hint).toMatch(/Your base colour replaces the one blade 1 has now/);
  });

  it('prefers colours still waiting in the plan over the saber\'s', () => {
    const queued = withSlotChoice(model, 1, 1, fire, BLUE);
    const plan = planPutIn(input({ model: queued, preset: 1, live: false }));
    expect(plan.kind === 'plan' && plan.args).toBe(BLUE);
  });

  it('keeps them when queuing too', () => {
    const fresh: LookDef = { ...ember, id: 'look_new', name: 'New' };
    const plan = planPutIn(input({ look: fresh, preset: 1 }));
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    expect(plan.args).toBe(GREEN);
    expect(modelAfterPutIn(model, plan, fresh, 1, 1)!.presets[1].lookArgs).toEqual([GREEN, null]);
    expect(coloursText(plan, 1)).toBe('Blade 1 keeps its own base colour.');
  });

  it('merges by argument number', () => {
    expect(mergeArgs(ember, new Map([[1, RED], [2, WHITE], [10, GREEN]]), new Map([[10, BLUE]]))).toEqual({ args: `${RED} ~ ~ ~ ~ ~ ~ ~ ~ ${BLUE}`, kept: [1], replaced: [10] });
  });
});

describe('ST6: messages match the situation', () => {
  const names = { saber: 'Hote', preset: 'Two', blade: 1, queuedElsewhere: false, kb: 1.2, tried: false };

  it('an installed style while unplugged is not offered as a new one, and no hint asks to plug in while plugged in', () => {
    const off = planPutIn(input({ live: false }));
    expect(off.kind === 'plan' && off.installed).toBe(true);
    const w = putInWords(off, names);
    expect(w.button).toBe('Use it in Two');
    expect(w.hint).toMatch(/not plugged in/);
    expect(w.hint).not.toMatch(/New styles/);
    const live = putInWords(planPutIn(input()), names);
    expect(live.hint).toMatch(/written to Two now/);
    expect(live.hint).not.toMatch(/Plug/);
  });

  it('a style the firmware lacks is added, and is "Also used" when queued elsewhere', () => {
    const fresh: LookDef = { ...ember, id: 'look_new' };
    const plan = planPutIn(input({ look: fresh }));
    expect(putInWords(plan, names).button).toBe('Add to Two');
    expect(putInWords(plan, { ...names, queuedElsewhere: true }).button).toBe('Also use it in Two');
    expect(putInWords(plan, names).hint).toMatch(/next Build & Flash, and cost about 1.2 KB/);
  });

  it('nothing is sent while the card is out or shared', () => {
    for (const locked of ['no-card', 'card-shared'] as const) {
      const plan = planPutIn(input({ locked }));
      expect(plan).toEqual({ kind: 'blocked', reason: locked });
      const w = putInWords(plan, names);
      expect(w.enabled).toBe(false);
      expect(w.hint).toMatch(locked === 'no-card' ? /no readable SD card/ : /shared with this computer/);
      expect(modelAfterPutIn(model, plan, ember, 1, 1)).toBeNull();
    }
  });
});

describe('HW-2026-09-26a: where the style already is', () => {
  const names = { saber: 'Hote', preset: 'Preset: 4', blade: 1, queuedElsewhere: true, kb: null, tried: false };

  it('already queued for that preset: says so instead of "Also use it in"', () => {
    const fresh: LookDef = { ...ember, id: 'look_test', name: 'Test Style 1' };
    const queued = withSlotChoice(model, 2, 1, fresh, null);
    const plan = planPutIn(input({ model: queued, look: fresh, preset: 2 }));
    expect(plan).toEqual({ kind: 'already', where: 'queued' });
    const w = putInWords(plan, names);
    expect(w.button).toBe('Already in Preset: 4');
    expect(w.enabled).toBe(false);
    expect(w.hint).toMatch(/already queued for Preset: 4/);
  });

  it('already installed there: says so instead of "Use it in"', () => {
    const plan = planPutIn(input({ preset: 0 }));
    expect(plan).toEqual({ kind: 'already', where: 'installed' });
    expect(putInWords(plan, names).hint).toMatch(/already uses this style on blade 1, on Hote/);
    // As last read while unplugged, too.
    expect(planPutIn(input({ preset: 0, live: false }))).toEqual({ kind: 'already', where: 'installed' });
  });

  it('installed there and recorded in the plan after a live write', () => {
    const recorded = withSlotChoice(model, 0, 1, ember, null);
    expect(planPutIn(input({ model: recorded, preset: 0 }))).toEqual({ kind: 'already', where: 'installed' });
  });

  it('already in the staged preset', () => {
    const staged: SaberConfigModel = { ...withSlotChoice(model, 0, 1, ember, null), presetsFrom: { name: 'A set', at: '2026-10-02T00:00:00Z' } };
    expect(planPutIn(input({ model: staged, preset: 0 }))).toEqual({ kind: 'already', where: 'staged' });
  });

  it('there, but with other colours tried: offered, to write them', () => {
    expect(planPutIn(input({ preset: 0, tried: new Map([[1, BLUE]]) })).kind).toBe('live');
    // The same colour it already has is no change.
    expect(planPutIn(input({ preset: 0, tried: new Map([[1, RED]]) }))).toEqual({ kind: 'already', where: 'installed' });
  });

  it('another blade of that preset, or another preset, is not "already"', () => {
    expect(planPutIn(input({ preset: 0, blade: 2 })).kind).toBe('live');
    expect(planPutIn(input({ preset: 1 })).kind).toBe('live');
  });

  it('a style edited since the install is not "already" on the saber', () => {
    const edited: LookDef = { ...ember, code: 'StylePtr<Layers<RgbArg<BASE_COLOR_ARG,Blue>>>()' };
    const plan = planPutIn(input({ look: edited, preset: 0 }));
    expect(plan.kind === 'plan' && plan.installed).toBe(false);
  });
});
