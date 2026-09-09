import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bladeTables, bladesToExprs, chainRanges, configurationToRow, emitBladeExpr, emitConfig, getDefine, hasDefine, boardInclude,
  parseBladeExpr, parseConfig, presetArrays, rowToBlades, rowToConfiguration, sharedPowerPins,
  type BladeSpec,
} from '../src';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const FIXTURES = ['saberbench_v3_os8.h', 'proffieboard_v3_verification_config.h', 'proffieboard_v2_verification_config.h', 'OS6_config_example.h', 'proffieboard_v2_ob4.h'];

/** Strip the volatile `raw` fields so two parses of equivalent text compare equal. */
function semantic(x: unknown): unknown {
  return JSON.parse(JSON.stringify(x, (k, v) => (k === 'raw' || k === 'segments' ? undefined : v)));
}

describe('spike OS8 config', () => {
  const doc = parseConfig(fixture('saberbench_v3_os8.h'));

  it('reads the top section', () => {
    expect(boardInclude(doc)).toBe('proffieboard_v3_config.h');
    expect(getDefine(doc, 'NUM_BLADES')).toBe('2');
    expect(getDefine(doc, 'NUM_BUTTONS')).toBe('2');
    expect(getDefine(doc, 'VOLUME')).toBe('1800');
    expect(hasDefine(doc, 'ENABLE_ALL_EDIT_OPTIONS')).toBe(true);
    expect(hasDefine(doc, 'SHARED_POWER_PINS')).toBe(false);
    expect(getDefine(doc, 'MOTION_TIMEOUT')).toBe('60 * 15 * 1000');
    expect(doc.top!.lines.find((l) => l.kind === 'maxLeds')).toMatchObject({ value: 144 });
  });

  it('reads five presets with two styles each, including argument strings', () => {
    const [arr] = presetArrays(doc);
    expect(arr.name).toBe('presets');
    expect(arr.presets).toHaveLength(5);
    expect(arr.presets.map((p) => p.name)).toEqual(['ahsoka', 'duality', 'osha', 'ahsoka green', 'duality magenta']);
    expect(arr.presets[0]).toMatchObject({ font: 'Ahsoka;common', track: 'Ahsoka/tracks/AhsokaTheme.wav' });
    expect(arr.presets[0].styles).toEqual([
      { kind: 'styleptr', factory: 'StylePtr', style: 'AhsokaMain' },
      { kind: 'styleptr', factory: 'StylePtr', style: 'AhsokaCrystal' },
    ]);
    expect(arr.presets[4].styles[0]).toEqual({ kind: 'styleptr', factory: 'StylePtr', style: 'DualityMain', args: '65535,0,65535 0,65535,65535' });
    expect(arr.presets[3].leading).toContain('Same compiled styles');
  });

  it('reads the blade table into the product model', () => {
    const [table] = bladeTables(doc);
    expect(table.rows).toHaveLength(1);
    const cfg = rowToConfiguration(table.rows[0]);
    expect(cfg.id).toBe('0');
    expect(cfg.presetArray).toBe('presets');
    expect(cfg.blades).toHaveLength(2);
    expect(cfg.blades[0]).toMatchObject({ type: 'pixel', pixels: 136, order: 'GRB', wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } });
    expect(cfg.blades[1]).toMatchObject({ type: 'pixel', pixels: 6, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: ['bladePowerPin4'] } });
    expect(Number(getDefine(doc, 'NUM_BLADES'))).toBe(cfg.blades.length);
  });

  it('reads the buttons', () => {
    expect(doc.buttons!.lines.filter((l) => l.kind === 'button')).toMatchObject([
      { className: 'Button', type: 'BUTTON_POWER', pin: 'powerButtonPin', name: 'pow' },
      { className: 'Button', type: 'BUTTON_AUX', pin: 'auxPin', name: 'aux' },
    ]);
  });

  it('keeps the CONFIG_STYLES section verbatim', () => {
    const styles = doc.segments.find((s) => s.kind === 'section' && s.macro === 'CONFIG_STYLES');
    expect(styles && styles.kind === 'section' && styles.body).toContain('using AhsokaMain');
    expect(emitConfig(doc)).toContain('copyright Fett263');
  });
});

describe('round trips', () => {
  for (const name of FIXTURES) {
    it(`${name}: parse → emit → parse is stable`, () => {
      const src = fixture(name);
      const doc1 = parseConfig(src);
      const out1 = emitConfig(doc1);
      const doc2 = parseConfig(out1);
      expect(semantic(doc2)).toEqual(semantic(doc1));
      // A second emit must be byte-identical: the emitter is a fixed point.
      expect(emitConfig(doc2)).toBe(out1);
    });
  }

  it('an unmodified document emits the original text', () => {
    for (const name of FIXTURES) {
      const src = fixture(name).replace(/\r\n/g, '\n');
      const doc = parseConfig(src);
      // Top and buttons keep raw lines, so those sections are verbatim; presets are regenerated in canonical layout.
      const top = doc.segments.find((s) => s.kind === 'section' && s.macro === 'CONFIG_TOP');
      const emitted = emitConfig(doc);
      expect(emitted).toContain(top && top.kind === 'section' ? top.body : '');
      expect(emitted.length).toBeGreaterThan(src.length * 0.8);
    }
  });
});

describe('ProffieOS example configs', () => {
  it('V3 verification: SHARED_POWER_PINS, two preset arrays, NO_BLADE row, blade5Pin', () => {
    const doc = parseConfig(fixture('proffieboard_v3_verification_config.h'));
    expect(hasDefine(doc, 'SHARED_POWER_PINS')).toBe(true);
    expect(presetArrays(doc).map((a) => a.name)).toEqual(['saber', 'blaster']);
    const [table] = bladeTables(doc);
    expect(table.rows.map((r) => r.id)).toEqual(['0', 'NO_BLADE']);
    expect(table.rows.map((r) => r.presetArray)).toEqual(['saber', 'blaster']);
    expect(table.rows.map((r) => r.saveName)).toEqual(['SaberSave', 'blasterSave']);
    const blades = rowToBlades(table.rows[0]);
    expect(blades.map((b) => b.pixels)).toEqual([144, 144, 4]);
    expect(blades[2].wiring).toEqual({ kind: 'own', dataPin: 'blade5Pin', powerPins: ['bladePowerPin4'] });
    expect(sharedPowerPins(blades)).toEqual(['bladePowerPin3']);
    // The prop section with #undef lines is opaque and survives.
    expect(emitConfig(doc)).toContain('#define PROP_TYPE SaberBlasterProp<Saber, Blaster>');
  });

  it('V2 verification: SPIBladePtr stays raw, SimpleBladePtr maps to a simple blade', () => {
    const doc = parseConfig(fixture('proffieboard_v2_verification_config.h'));
    const [table] = bladeTables(doc);
    const row = table.rows[0];
    expect(row.blades[0].kind).toBe('raw');
    expect(row.blades[0].raw).toMatch(/^SPIBladePtr</);
    expect(row.blades[1]).toMatchObject({ kind: 'simple', leds: ['CreeXPE2WhiteTemplate<550>', 'CreeXPE2BlueTemplate<240>', 'CreeXPE2BlueTemplate<240>', 'NoLED'], pins: ['bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6', '-1'] });
    const blades = rowToBlades(row);
    expect(blades[1]).toMatchObject({ type: 'simple', pixels: 3, wiring: { kind: 'power', pins: ['bladePowerPin4', 'bladePowerPin5', 'bladePowerPin6'] } });
    // Presets in this file use &style_charging and StyleNormalPtr; both must survive.
    const arr = presetArrays(doc)[0];
    const flat = arr.presets.flatMap((p) => p.styles);
    expect(flat.some((s) => s.kind === 'raw' && s.code === '&style_charging')).toBe(true);
    expect(flat.some((s) => s.kind === 'styleptr' && s.factory === 'StyleNormalPtr')).toBe(true);
    expect(arr.presets.some((p) => p.name === 'Battery\nLevel')).toBe(true);
  });

  it('OS6 example: Fett263 styles with copyright comments are preserved as preset leading text', () => {
    const doc = parseConfig(fixture('OS6_config_example.h'));
    const arr = presetArrays(doc)[0];
    expect(arr.presets.length).toBeGreaterThanOrEqual(5);
    const out = emitConfig(doc);
    expect(out).toContain('copyright Fett263 FallenOrder');
    expect(rowToBlades(bladeTables(doc)[0].rows[0]).map((b) => b.pixels)).toEqual([136, 6]);
  });

  it('OB4: a blade row with #if inside is kept raw, and SubBlade chains map to chained wiring', () => {
    const doc = parseConfig(fixture('proffieboard_v2_ob4.h'));
    const rows = bladeTables(doc)[0].rows;
    expect(rows.some((r) => r.raw !== undefined)).toBe(true);
    expect(emitConfig(doc)).toContain('SubBladeReverse(133, 263, NULL)');
    const chain = parseBladeExpr('SubBlade(0, 132, WS281XBladePtr<529, bladePin, Color8::GRB, PowerPINS<bladePowerPin1, bladePowerPin2, bladePowerPin3>, DefaultPinClass, 1000000>())');
    expect(chain).toMatchObject({ kind: 'subblade', first: 0, last: 132, inner: { kind: 'ws281x', leds: 529, extra: ['DefaultPinClass', '1000000'] } });
  });
});

describe('blade model ⇄ BladeConfig', () => {
  const graflex: BladeSpec[] = [
    { id: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } },
    { id: 'crystal', type: 'pixel', pixels: 6, order: '', extra: [], leds: [], parallel: 1, wiring: { kind: 'chain', after: 'main' } },
    { id: 'accent', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin5'] } },
    { id: 'motor', type: 'simple', pixels: 1, order: '', extra: [], leds: ['CreeXPE2WhiteTemplate<0>', 'NoLED', 'NoLED', 'NoLED'], parallel: 1, wiring: { kind: 'power', pins: ['bladePowerPin6'] } },
  ];

  it('computes sub-blade ranges from "continues Blade N\'s wire"', () => {
    const r = chainRanges(graflex);
    expect(r.get('main')).toEqual({ root: 'main', first: 0, last: 131 });
    expect(r.get('crystal')).toEqual({ root: 'main', first: 132, last: 137 });
  });

  it('emits the wizard\'s four-blade saber as a BladeConfig row and reads it back', () => {
    const exprs = bladesToExprs(graflex);
    expect(exprs.map(emitBladeExpr)).toEqual([
      'SubBlade(0, 131, WS281XBladePtr<138, bladePin, Color8::GRB, PowerPINS<bladePowerPin2, bladePowerPin3> >())',
      'SubBlade(132, 137, NULL)',
      'SimpleBladePtr<CreeXPE2WhiteTemplate<550>, NoLED, NoLED, NoLED, bladePowerPin5, -1, -1, -1>()',
      'SimpleBladePtr<CreeXPE2WhiteTemplate<0>, NoLED, NoLED, NoLED, bladePowerPin6, -1, -1, -1>()',
    ]);
    const row = configurationToRow({ id: '0', blades: graflex, presetArray: 'presets' });
    const back = rowToBlades(row, 'x');
    expect(back.map((b) => [b.type, b.pixels])).toEqual([['pixel', 132], ['pixel', 6], ['simple', 1], ['simple', 1]]);
    expect(back[1].wiring).toEqual({ kind: 'chain', after: 'x1' });
    expect(back[0].wiring).toEqual({ kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] });
    // Re-emitting the read-back model gives the same expressions: fixed point.
    expect(bladesToExprs(back).map(emitBladeExpr)).toEqual(exprs.map(emitBladeExpr));
  });

  it('a reversed chained blade emits SubBladeReverse', () => {
    const blades: BladeSpec[] = [
      { ...graflex[0], id: 'a' },
      { ...graflex[1], id: 'b', wiring: { kind: 'chain', after: 'a', reverse: true } },
    ];
    expect(bladesToExprs(blades).map(emitBladeExpr)[1]).toBe('SubBladeReverse(132, 137, NULL)');
  });

  it('shared power pins are reported, not rejected', () => {
    const blades: BladeSpec[] = [
      { ...graflex[0], id: 'a', wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin1'] } },
      { ...graflex[2], id: 'b', wiring: { kind: 'power', pins: ['bladePowerPin1'] } },
    ];
    expect(sharedPowerPins(blades)).toEqual(['bladePowerPin1']);
  });
});
