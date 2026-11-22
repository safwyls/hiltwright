import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeStyleCode, generateConfig, validateModel, type LookDef, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { newBlade, withKind } from '../src/renderer/src/hardwareModel';
import { FLASH_BYTES, buildFirmware, configDefines, prepareSketch, propRuleProblems, translateErrors } from '../src/main/build';
import { toolchainPaths, toolchainStatus } from '../src/main/toolchain';
import { importPropFile } from '../src/main/customProps';

const root = process.env.HILTWRIGHT_TOOLCHAIN_DIR;

const hote2: SaberConfigModel = {
  name: 'hiltwright_hote2', board: 'V2', boardFrom: 'owner', buttons: 2, prop: 'fett263', generator: 'test',
  blades: [
    { id: 'main', role: 'main', type: 'pixel', pixels: 140, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } },
    { id: 'crystal', role: 'crystal', type: 'pixel', pixels: 2, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } },
    { id: 'accent', role: 'accent', type: 'pixel', pixels: 1, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'blade3Pin', powerPins: ['bladePowerPin5'] } },
  ],
  presets: [
    { font: 'Mara Jade Skywalker;common', track: 'Mara Jade Skywalker/tracks/The_Force.wav', name: 'Mara Jade Skywalker' },
    { font: 'Valkyrie;common', track: 'Valkyrie/tracks/battle_cry.wav', name: 'Valkyrie', looks: ['ember', null, null] },
  ],
  looks: [ember()],
};

/** A pasted library-style look, to prove inline emission into a preset slot compiles. */
function ember(): LookDef {
  const code = `// Hiltwright test look (header laid out like a library block)
// Copyright 2026 Hiltwright contributors
// Base Style: Fire Blade
StylePtr<Layers<
  StyleFire<RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>,RgbArg<ALT_COLOR_ARG, Rgb<255,255,0>>,0,6,FireConfig<10,1000,2>,FireConfig<2,1000,5>,FireConfig<0,0,10>,FireConfig<0,0,10>>,
  TransitionEffectL<TrConcat<TrInstant,AlphaL<White,Bump<Int<16384>,Int<16000>>>,TrFade<300>>,EFFECT_CLASH>,
  LockupTrL<AudioFlicker<RgbArg<LOCKUP_COLOR_ARG, Rgb<255,255,255>>,RgbArg<BASE_COLOR_ARG, Rgb<255,0,0>>>,TrInstant,TrFade<200>,SaberBase::LOCKUP_NORMAL>,
  InOutTrL<TrWipeX<IgnitionTime<300>>,TrWipeInX<RetractionTime<0>>>>>()`;
  const a = analyzeStyleCode(code);
  return { id: 'ember', name: 'Ember', source: 'pasted', by: 'Hiltwright', code: a.expression, header: a.header, roles: ['main'], args: a.args, preview: a.preview, defaults: a.defaults, description: 'fire' };
}

describe('translateErrors', () => {
  it('turns compiler output into owner language', () => {
    expect(translateErrors("region `FLASH' overflowed by 1234 bytes")[0]).toMatch(/too big/);
    expect(translateErrors('#error Please select Proffieboard V2 in Tools->Board')[0]).toMatch(/Proffieboard V2/);
    expect(translateErrors("error: cannot convert 'const char*' to 'StyleFactory*'")[0]).toMatch(/fewer styles/);
    expect(translateErrors("config.h:12:3: error: 'Layerz' was not declared in this scope")[0]).toMatch(/did not understand/);
    expect(translateErrors('C:/Users/x/AppData/Local/Hiltwright/toolchain/arduino-data/packages/proffieboard/tools/arm-none-eabi-gcc/14-2-rel1-xpack/arm-none-eabi/include/c++/14.2.1/system_error:41:10: fatal error: bits/error_constants.h: No such file or directory')[0]).toMatch(/its own files/);
    expect(translateErrors("arm-none-eabi-g++: fatal error: cannot execute 'cc1plus': CreateProcess: No such file or directory")[0]).toMatch(/its own files/);
  });
});

// Issue #19: a saber's ProffieOS copy follows the toolchain's source, and a copy cut short is never taken as complete.
describe('the private ProffieOS copy', () => {
  const tree = async (dir: string, stamp: string | null, ino: string) => {
    await mkdir(join(dir, 'props'), { recursive: true });
    await writeFile(join(dir, 'ProffieOS.ino'), ino, 'utf8');
    await writeFile(join(dir, 'props', 'saber_fett263_buttons.h'), `// ${ino}`, 'utf8');
    if (stamp) await writeFile(join(dir, '.hiltwright-source.json'), stamp, 'utf8');
  };

  it('is copied once, kept while the source is the same, and copied again when the pinned source changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-sketch-'));
    const osDir = join(dir, 'os');
    const saberDir = join(dir, 'saber');
    await tree(osDir, JSON.stringify({ tag: 'v8.10', sha256: 'a' }), 'const char version[] = "v8.10";');
    const lines: string[] = [];
    const sketch = await prepareSketch({ osDir }, saberDir, (l) => lines.push(l));
    expect(await readFile(join(sketch, 'ProffieOS.ino'), 'utf8')).toMatch(/v8\.10/);
    // A build edits the copy (its CONFIG_FILE line); the same source keeps it.
    await writeFile(join(sketch, 'ProffieOS.ino'), 'edited by a build', 'utf8');
    await prepareSketch({ osDir }, saberDir, (l) => lines.push(l));
    expect(await readFile(join(sketch, 'ProffieOS.ino'), 'utf8')).toBe('edited by a build');
    expect(lines).toEqual(['preparing a private copy of ProffieOS']);
    // A release pins a new ProffieOS: the toolchain unpacks it with a new stamp, and the copy follows.
    await rm(osDir, { recursive: true, force: true });
    await tree(osDir, JSON.stringify({ tag: 'v8.11', sha256: 'b' }), 'const char version[] = "v8.11";');
    await prepareSketch({ osDir }, saberDir, (l) => lines.push(l));
    expect(await readFile(join(sketch, 'ProffieOS.ino'), 'utf8')).toMatch(/v8\.11/);
    expect(await readFile(join(sketch, 'props', 'saber_fett263_buttons.h'), 'utf8')).toMatch(/v8\.11/);
    expect(lines.at(-1)).toBe('ProffieOS has changed: preparing a new private copy of it');
    expect(await readdir(saberDir)).toEqual(['ProffieOS']);
  });

  it('a copy cut short (no stamp of its own, from before this fix or interrupted) is copied again', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-sketch-'));
    const osDir = join(dir, 'os');
    const saberDir = join(dir, 'saber');
    await tree(osDir, JSON.stringify({ tag: 'v8.10', sha256: 'a' }), 'whole');
    // ProffieOS.ino sorts early, so a copy stopped part way has it, and the toolchain's stamp, but not every folder.
    await tree(join(saberDir, 'ProffieOS'), JSON.stringify({ tag: 'v8.10', sha256: 'a' }), 'whole');
    await rm(join(saberDir, 'ProffieOS', 'props'), { recursive: true, force: true });
    // A leftover from a copy stopped before its rename is cleared, not used.
    await tree(join(saberDir, 'ProffieOS.tmp'), null, 'half');
    const sketch = await prepareSketch({ osDir }, saberDir, () => undefined);
    expect(await readFile(join(sketch, 'props', 'saber_fett263_buttons.h'), 'utf8')).toBe('// whole');
    expect(await readdir(saberDir)).toEqual(['ProffieOS']);
  });

  it('a toolchain with no source stamp: a complete copy is still kept between builds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-sketch-'));
    const osDir = join(dir, 'os');
    const saberDir = join(dir, 'saber');
    await tree(osDir, null, 'unstamped');
    const sketch = await prepareSketch({ osDir }, saberDir, () => undefined);
    await writeFile(join(sketch, 'ProffieOS.ino'), 'edited by a build', 'utf8');
    await prepareSketch({ osDir }, saberDir, () => undefined);
    expect(await readFile(join(sketch, 'ProffieOS.ino'), 'utf8')).toBe('edited by a build');
  });
});

describe.skipIf(!root)('buildFirmware with a real toolchain', () => {
  it('reports the toolchain as ready', async () => {
    const s = await toolchainStatus(root!);
    expect(s.ready).toBe(true);
  });

  it('compiles the generated hote2 config for a V2 and produces a .dfu', async () => {
    const lines: string[] = [];
    const r = await buildFirmware({ toolchainRoot: root!, saberId: 'test-hote2', model: hote2, onLine: (l) => lines.push(l), force: true });
    if (!r.ok) console.log(r.problems, r.output.slice(0, 4000));
    expect(r.ok).toBe(true);
    expect(r.manifest?.presets[1].looks).toEqual(['ember', 'hw_accent', 'hw_accent']);
    expect(r.dfuPath).toMatch(/\.dfu$/);
    expect(r.textBytes).toBeGreaterThan(150000);
    expect(r.flashPct).toBeLessThan(100);
    console.log(`build ${r.ms} ms, .text ${r.textBytes} bytes, ${r.flashPct}% of ${r.flashBytes}`);
    // Second build hits the cache.
    const again = await buildFirmware({ toolchainRoot: root!, saberId: 'test-hote2', model: hote2 });
    expect(again.cached).toBe(true);
  });
});

describe.skipIf(!root)('a custom prop file, with a real toolchain', () => {
  // Stock props loaded as custom files: their own #includes (prop_base.h and the rest) must resolve from where the build puts them.
  const asCustom = async (stock: string, saberId: string, model: Partial<SaberConfigModel> = {}) => {
    const src = await mkdtemp(join(tmpdir(), 'hw-customprop-'));
    const dir = await mkdtemp(join(tmpdir(), 'hw-props-'));
    await writeFile(join(src, `my_${stock}`), await readFile(join(toolchainPaths(root!).osDir, 'props', stock), 'utf8'));
    const customProp = await importPropFile(join(src, `my_${stock}`), dir);
    const lines: string[] = [];
    const m: SaberConfigModel = { ...hote2, name: `hiltwright_${saberId.replace(/-/g, '_')}`, prop: 'custom', customProp, ...model };
    const r = await buildFirmware({ toolchainRoot: root!, saberId, model: m, customPropsDir: dir, onLine: (l) => lines.push(l), force: true });
    if (!r.ok) console.log(r.problems, r.output.slice(0, 4000));
    return { r, lines, customProp };
  };

  it('a version of the Fett263 prop compiles, with the Fett263 options', async () => {
    const { r, lines, customProp } = await asCustom('saber_fett263_buttons.h', 'test-custom-fett');
    expect(customProp.like).toBe('fett263');
    expect(r.ok).toBe(true);
    expect(lines.some((l) => /using the custom prop file my_saber_fett263_buttons\.h as props\/hiltwright_custom_my_saber_fett263_buttons\.h/.test(l))).toBe(true);
    expect(configDefines(await readFile(r.configPath, 'utf8')).has('FETT263_EDIT_MODE_MENU')).toBe(true);
  });

  it('a prop Hiltwright does not know compiles with none of its options added', async () => {
    const { r, customProp } = await asCustom('saber_shtok_buttons.h', 'test-custom-shtok', { buttons: 2 });
    expect(customProp).toMatchObject({ propType: 'SaberShtokButtons', like: null });
    expect(r.ok).toBe(true);
    expect(configDefines(await readFile(r.configPath, 'utf8')).has('FETT263_EDIT_MODE_MENU')).toBe(false);
  });

  it('with its kept copy gone, the build stops before compiling and says so', async () => {
    const r = await buildFirmware({ toolchainRoot: root!, saberId: 'test-custom-gone', model: { ...hote2, prop: 'custom', customProp: { file: 'gone.h', sha256: 'd'.repeat(64), propType: 'X', like: null } }, customPropsDir: await mkdtemp(join(tmpdir(), 'hw-props-')) });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/gone\.h is not on this computer any more/);
  });
});

describe.skipIf(!root)('Blade ID build', () => {
  it('compiles a config with swappable blades: scanning defines and one row per measured blade', async () => {
    const m: SaberConfigModel = { ...hote2, name: 'hiltwright_hote2_id', prop: 'sa22c', looks: [], presets: hote2.presets.map((p) => ({ font: p.font, track: p.track, name: p.name })), bladeId: { variants: [
      { id: 'v1', name: 'Duel blade', pixels: 140, ohms: 916 },
      { id: 'v2', name: 'Short blade', pixels: 96, ohms: 22000 },
      { id: 'v0', name: 'No blade', pixels: 0, ohms: null, noBlade: true },
    ] } };
    const r = await buildFirmware({ toolchainRoot: root!, saberId: 'test-hote2-id', model: m, force: true });
    if (!r.ok) console.log(r.problems, r.output.slice(0, 3000));
    expect(r.ok).toBe(true);
    expect(r.manifest?.bladeId).toBe(true);
    console.log(`blade id build ${r.ms} ms, ${r.flashPct}% of flash`);
  });
});

describe('usbState', () => {
  it('reports the running firmware when a Proffieboard is plugged in (skips otherwise)', async () => {
    const { usbState } = await import('../src/main/flash');
    const s = await usbState();
    console.log('usb', JSON.stringify(s));
    expect(typeof s.runtimePresent).toBe('boolean');
    expect(s.bootloaderPresent).toBe(false);
  });
});

// Baseline finding FW20 (baseline-firmware): blade kinds and options the app offers but had never compiled. Two builds
// cover them all; if one fails, split it to find the part before filing anything.
const pixel = (id: string, role: ModelBlade['role'], pixels: number, order: string, wiring: ModelBlade['wiring']): ModelBlade => ({ id, role, type: 'pixel', pixels, order, extra: [], leds: [], parallel: 1, wiring });
const fw20V2: SaberConfigModel = {
  name: 'hiltwright_fw20_v2', board: 'V2', boardFrom: 'owner', buttons: 3, prop: 'fett263', generator: 'test',
  extraDefines: ['FETT263_TWIST_OFF', 'FETT263_TWIST_ON'],
  blades: [
    pixel('b1', 'main', 132, 'GRBW', { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] }),
    pixel('b2', 'crystal', 2, '', { kind: 'chain', after: 'b1' }),
    newBlade('b3', 'accent', 'V2', { data: ['bladePin'], power: ['bladePowerPin2', 'bladePowerPin3'] }),
    // The star's three channels on pins of their own (the app's default repeats one pin: FST-3, wiring-validation).
    { ...withKind(newBlade('b4', 'accent', 'V2', { data: ['bladePin'], power: [] }), 'star', 'V2'), wiring: { kind: 'power', pins: ['bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6'] } },
  ],
  presets: [{ font: 'TeensySF;common', track: '', name: 'One' }, { font: 'SmthJedi;common', track: '', name: 'Two' }],
};
const fw20V3: SaberConfigModel = {
  name: 'hiltwright_fw20_v3', board: 'V3', boardFrom: 'owner', buttons: 2, prop: 'sa22c', generator: 'test',
  blades: [
    pixel('b1', 'main', 144, 'RGBW', { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] }),
    pixel('b2', 'side', 10, '', { kind: 'chain', after: 'b1' }),
    withKind({ ...newBlade('b3', 'motor', 'V3', { data: ['bladePin'], power: ['bladePowerPin2', 'bladePowerPin3'] }), role: 'motor' }, 'motor', 'V3'),
  ],
  presets: [{ font: 'TeensySF;common', track: '', name: 'One' }],
};

describe('FW20 models', () => {
  it('are valid, so a compile failure is the firmware and not the model', () => {
    expect(validateModel(fw20V2)).toEqual([]);
    expect(validateModel(fw20V3)).toEqual([]);
    expect(fw20V2.blades.map((b) => b.type)).toEqual(['pixel', 'pixel', 'simple', 'simple']);
    // Each simple blade has pins of its own: three for the star, one for the single LED and the motor.
    const pinsOf = (b: ModelBlade) => (b.wiring.kind === 'power' ? b.wiring.pins : b.wiring.kind === 'own' ? b.wiring.powerPins : []);
    expect(pinsOf(fw20V2.blades[3])).toHaveLength(3);
    const all = fw20V2.blades.flatMap(pinsOf);
    expect(new Set(all).size).toBe(all.length);
    expect(fw20V3.blades[2]).toMatchObject({ role: 'motor', type: 'simple', wiring: { kind: 'power' } });
    expect(pinsOf(fw20V3.blades[2]).some((p) => ['bladePowerPin2', 'bladePowerPin3'].includes(p))).toBe(false);
  });
});

describe.skipIf(!root)('FW20: never-compiled blade kinds, with a real toolchain', () => {
  for (const [label, model] of [['a V2 with a GRBW main blade, a chained crystal, a single LED, a star LED, 3 buttons and extra defines', fw20V2], ['a V3 with an RGBW main blade, a chained sub-blade and a motor', fw20V3]] as const) {
    it(`compiles ${label}`, async () => {
      const r = await buildFirmware({ toolchainRoot: root!, saberId: `test-${model.name}`, model, onLine: () => undefined, force: true });
      if (!r.ok) console.log(r.problems, r.output.slice(0, 4000));
      expect(r.ok).toBe(true);
      expect(r.dfuPath).toMatch(/\.dfu$/);
      console.log(`${model.name}: build ${r.ms} ms, .text ${r.textBytes} bytes, ${r.flashPct}% of ${r.flashBytes}`);
    }, 10 * 60 * 1000);
  }
});

// build-correctness: every translated pattern, errors that name their preset slot, prop rules before compiling,
// nothing written before the model is checked, and the real V3 capacity.
describe('build-correctness', () => {
  it('FW14 the two patterns that had no test', () => {
    expect(translateErrors('#error FETT263_EDIT_SETTINGS_MENU cannot be combined with FETT263_EDIT_MODE_MENU')[0]).toBe('Two button options conflict: FETT263_EDIT_SETTINGS_MENU and FETT263_EDIT_MODE_MENU.');
    expect(translateErrors("error: cannot convert 'Preset*' to 'BladeBase*'")[0]).toMatch(/blade table and the presets do not line up/);
  });

  it('FW14 an error inside a preset slot names the preset, blade and style', () => {
    const gen = generateConfig(hote2);
    const slot = gen.slotLines.find((s) => s.preset === 1 && s.blade === 0)!;
    const ctx = { configFile: 'hiltwright_hote2.h', slotLines: gen.slotLines, presetNames: hote2.presets.map((p) => p.name) };
    const stderr = `C:\\b\\s1\\ProffieOS\\config\\hiltwright_hote2.h:${slot.line}:5: error: 'Layerz' was not declared in this scope`;
    expect(translateErrors(stderr, ctx)[0]).toBe(`In preset "Valkyrie", blade 1, style "${slot.lookName}": The compiler did not understand part of the config: error: 'Layerz' was not declared in this scope`);
    // An error outside every slot is explained as before, with no slot named.
    expect(translateErrors('C:/x/config/hiltwright_hote2.h:3:1: error: expected unqualified-id', ctx)[0]).toMatch(/^The compiler did not understand/);
  });

  it('FW14 the prop\'s own rules catch options it refuses together, and only when certain', () => {
    const prop = [
      '#if defined(FETT263_SPECIAL_ABILITIES) && defined(FETT263_MULTI_PHASE)',
      '#error FETT263_SPECIAL_ABILITIES cannot be used with FETT263_MULTI_PHASE',
      '#endif',
      '#if defined(FETT263_EDIT_MODE_MENU) && !defined(ENABLE_ALL_EDIT_OPTIONS)',
      '#error ENABLE_ALL_EDIT_OPTIONS must be defined to enable FETT263_EDIT_MODE_MENU',
      '#endif',
      '#if defined(FETT263_HOLD_BUTTON_LOCKUP) && NUM_BUTTONS == 1',
      '#error FETT263_HOLD_BUTTON_LOCKUP cannot be used with 1 Button Controls',
      '#endif',
      '#if NUM_BUTTONS < 1',
      '#error /props/saber_fett263_buttons.h requires 1, 2 or 3 Buttons for operation',
      '#endif',
      '#if defined(A) || defined(B)',
      '#error never evaluated',
      '#endif',
    ].join('\n');
    expect(propRuleProblems(prop, new Set(['FETT263_SPECIAL_ABILITIES', 'FETT263_MULTI_PHASE', 'ENABLE_ALL_EDIT_OPTIONS']), 2)).toEqual(['These options cannot be used together on this prop: FETT263_SPECIAL_ABILITIES cannot be used with FETT263_MULTI_PHASE']);
    expect(propRuleProblems(prop, new Set(['FETT263_EDIT_MODE_MENU']), 2)).toEqual(['These options cannot be used together on this prop: ENABLE_ALL_EDIT_OPTIONS must be defined to enable FETT263_EDIT_MODE_MENU']);
    // ProffieOS could define it itself: not certain, so not refused.
    expect(propRuleProblems(prop, new Set(['FETT263_EDIT_MODE_MENU']), 2, new Set(['ENABLE_ALL_EDIT_OPTIONS']))).toEqual([]);
    expect(propRuleProblems(prop, new Set(['FETT263_HOLD_BUTTON_LOCKUP']), 1)).toHaveLength(1);
    expect(propRuleProblems(prop, new Set(['FETT263_HOLD_BUTTON_LOCKUP']), 2)).toEqual([]);
    expect(propRuleProblems(prop, new Set(), 0)).toEqual(['These options cannot be used together on this prop: the prop requires 1, 2 or 3 Buttons for operation']);
    // The generated hote2 config (Fett263, 2 buttons) breaks none of the real prop's rules.
    expect(configDefines(generateConfig(hote2).text).has('FETT263_EDIT_MODE_MENU')).toBe(true);
  });

  it('FW16 a config name that points elsewhere is refused before anything is written', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'hw-b-'));
    const r = await buildFirmware({ toolchainRoot: join(buildRoot, 'no-toolchain'), buildRoot, saberId: 's1', model: { ...hote2, name: '../../x' } });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/Config name must be letters, digits and underscores/);
    expect(await readdir(buildRoot)).toEqual([]);
  });

  it('FW13 the V3 capacity is the board support\'s 507,904 bytes', () => {
    expect(FLASH_BYTES).toEqual({ V2: 262144, V3: 507904 });
  });
});

describe.skipIf(!root)('build-correctness with a real toolchain', () => {
  it('FW14 the real Fett263 prop refuses special abilities with multi-phase, before compiling', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'hw-b-'));
    const r = await buildFirmware({ toolchainRoot: root!, buildRoot, saberId: 'rules', model: { ...hote2, extraDefines: ['FETT263_SPECIAL_ABILITIES', 'FETT263_MULTI_PHASE'] }, force: true });
    expect(r.ok).toBe(false);
    expect(r.output).toBe('');
    expect(r.problems[0]).toBe('These options cannot be used together on this prop: FETT263_SPECIAL_ABILITIES cannot be used with FETT263_MULTI_PHASE');
  }, 5 * 60 * 1000);

  it('FW15 a style named like code, by an author ending in a backslash, compiles', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'hw-b-'));
    const nasty: LookDef = { ...ember(), id: 'lk_nasty', name: 'Fire */ Blade', by: 'Kyber\\' };
    const model: SaberConfigModel = { ...hote2, name: 'hiltwright_fw15', looks: [nasty], presets: hote2.presets.map((p, i) => (i === 1 ? { ...p, looks: ['lk_nasty', null, null] } : p)) };
    const r = await buildFirmware({ toolchainRoot: root!, buildRoot, saberId: 'fw15', model, force: true });
    if (!r.ok) console.log(r.problems, r.output.slice(0, 3000));
    expect(r.ok).toBe(true);
  }, 10 * 60 * 1000);

  it('FW13 a V3 build reports the capacity arduino-cli gives, and its percentage', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'hw-b-'));
    const lines: string[] = [];
    const r = await buildFirmware({ toolchainRoot: root!, buildRoot, saberId: 'v3cap', model: { ...hote2, name: 'hiltwright_v3cap', board: 'V3' }, force: true, onLine: (l) => lines.push(l) });
    expect(lines.some((l) => /of 507904 bytes \(capacity reported by arduino-cli\)/.test(l))).toBe(true);
    expect(r.ok).toBe(true);
    console.log(`[v3] .text ${r.textBytes} of ${r.flashBytes}: ${r.flashPct}%`);
    expect(r.flashBytes).toBe(507904);
    expect(r.flashPct).toBe(Math.round((r.textBytes! / 507904) * 100));
  }, 10 * 60 * 1000);

  it('FW14 a broken pasted style fails, naming its preset, blade and style', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'hw-b-'));
    const broken: LookDef = { ...ember(), id: 'lk_broken', name: 'Broken on purpose', code: 'StylePtr<Layerz<Red>>()', header: null };
    const model: SaberConfigModel = { ...hote2, name: 'hiltwright_broken', looks: [broken], presets: hote2.presets.map((p, i) => (i === 1 ? { ...p, looks: ['lk_broken', null, null] } : p)) };
    const r = await buildFirmware({ toolchainRoot: root!, buildRoot, saberId: 'broken', model, force: true });
    expect(r.ok).toBe(false);
    console.log(`[broken] ${r.problems[0]}`);
    expect(r.problems[0]).toMatch(/^In preset "Valkyrie", blade 1, style "Broken on purpose": /);
  }, 10 * 60 * 1000);
});
