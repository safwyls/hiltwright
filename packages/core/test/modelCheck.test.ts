import { describe, expect, it } from 'vitest';
import { STARTER_LOOKS, generateConfig, isTemplateToken, lookProblems, modelFormProblems, readSaberShare, validateModel, type LookDef, type SaberConfigModel } from '../src';

const blade = { id: 'b1', role: 'main', type: 'pixel', pixels: 144, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };
const good = (): SaberConfigModel => ({
  name: 'hiltwright_test', board: 'V3', boardFrom: 'owner', buttons: 2, prop: 'fett263',
  blades: [JSON.parse(JSON.stringify(blade))], presets: [{ font: 'Kylo;common', track: 'tracks/kylo.wav', name: 'Kylo' }], looks: [],
} as unknown as SaberConfigModel);
const pasted = (over: Partial<LookDef> = {}): LookDef => ({ id: 'pasted_1', name: 'Flame', source: 'pasted', by: 'Fett263', code: 'StylePtr<Layers<Red, /* a > b */ White>>()', header: '/* copyright Fett263\nline two */\n// more', roles: ['main'], args: [], preview: '#ff0000', description: '', ...over });

describe('the form of a saber model (issue #5)', () => {
  it('accepts what the pages make', () => {
    expect(modelFormProblems(good())).toEqual([]);
    expect(validateModel(good())).toEqual([]);
  });

  it('refuses a button count that is not 1, 2 or 3, and says so before anything is built', () => {
    const m = { ...good(), buttons: '2\n#define bladePowerPin2 bladePowerPin6' } as unknown as SaberConfigModel;
    expect(modelFormProblems(m)).toEqual(['The number of buttons must be 1, 2 or 3.']);
    expect(validateModel(m)).toEqual(['The number of buttons must be 1, 2 or 3.']);
  });

  it('refuses a colour order, extra setting or LED type that is more than one argument', () => {
    const withBlade = (over: Record<string, unknown>) => ({ ...good(), blades: [{ ...blade, ...over }] }) as unknown as SaberConfigModel;
    expect(modelFormProblems(withBlade({ order: 'GRB, PowerPINS<bladePowerPin1> >(), //' }))).toHaveLength(1);
    expect(modelFormProblems(withBlade({ extra: ['X>(), //'] }))).toHaveLength(1);
    expect(modelFormProblems(withBlade({ extra: ['a, b'] }))).toHaveLength(1);
    expect(modelFormProblems(withBlade({ type: 'simple', order: '', leds: ['CreeXPE2WhiteTemplate<550>\n#define x y'] }))).toHaveLength(1);
    expect(modelFormProblems(withBlade({ type: 'simple', order: '', leds: ['CreeXPE2WhiteTemplate<550>', 'NoLED', 'CH3LED', 'NoLED'], wiring: { kind: 'power', pins: ['bladePowerPin4', '-1', 'bladePowerPin6', '-1'] } }))).toEqual([]);
    expect(modelFormProblems(withBlade({ pixels: '144' }))).toHaveLength(1);
    expect(modelFormProblems(withBlade({ wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin9'] } }))).toHaveLength(1);
    expect(modelFormProblems(withBlade({ wiring: { kind: 'chain', after: 'nobody' } }))).toHaveLength(1);
  });

  it('refuses extra #define lines and a custom prop name that is not a file name', () => {
    expect(modelFormProblems({ ...good(), extraDefines: ['FETT263_TWIST_ON', 'ORIENTATION ORIENTATION_USB_TOWARDS_BLADE'] })).toEqual([]);
    // #14 board settings from the installer's config: only the listed defines, with values of their kind, each once.
    const settings = (boardDefines: unknown) => modelFormProblems({ ...good(), boardDefines });
    expect(settings(['ORIENTATION ORIENTATION_USB_TOWARDS_BLADE', 'ORIENTATION_ROTATION 0,-20,0', 'BLADE_DETECT_PIN blade4Pin', 'ENABLE_SSD1306', 'VOLUME 1000', 'CLASH_THRESHOLD_G 2.5'])).toEqual([]);
    for (const bad of [['NUM_BLADES 4'], ['FETT263_TWIST_ON'], ['ORIENTATION bladePin'], ['VOLUME loud'], ['ENABLE_SSD1306 1'], ['VOLUME 1000\n#define bladePin blade4Pin'], ['VOLUME 1000', 'VOLUME 900'], 'VOLUME 1000'])
      expect(settings(bad)).toEqual(["A board setting from the installer's config is not one Hiltwright accepts."]);
    // #16 a brightness limit is printed as DimBlade's percentage: a plain number above 0 and at most 100.
    const dimmed = (dim: unknown) => modelFormProblems({ ...good(), blades: good().blades.map((b) => ({ ...b, dim })) });
    expect(dimmed(20)).toEqual([]);
    expect(dimmed(12.5)).toEqual([]);
    for (const bad of [0, 150, -5, '20', '20, bladePin)', Number.NaN]) expect(dimmed(bad)).toEqual(["Blade 1's brightness limit must be a percentage above 0 and at most 100."]);
    expect(modelFormProblems({ ...good(), extraDefines: ['bladePowerPin2 bladePowerPin6'] })).toEqual(['An extra #define is not in the accepted form.']);
    expect(modelFormProblems({ ...good(), extraDefines: ['X 1\n#define bladePin blade4Pin'] })).toEqual(['An extra #define is not in the accepted form.']);
    expect(modelFormProblems({ ...good(), prop: 'custom', customProp: { file: '../x.h\n#define y', sha256: 'a'.repeat(64), propType: 'P', like: null } })).toEqual(['The custom prop file is not recorded properly.']);
  });

  it('accepts a pasted style with comments, and refuses one whose code, alias or header holds anything but a style', () => {
    expect(lookProblems(pasted())).toEqual([]);
    expect(lookProblems(pasted({ code: 'StylePtr<Red>();\n#define bladePin blade4Pin' }))).toHaveLength(1);
    expect(lookProblems(pasted({ header: '/* hi */\n#define bladePowerPin3 bladePowerPin5' }))).toHaveLength(1);
    expect(lookProblems(pasted({ source: 'built', define: '#define bladePin blade4Pin\nusing X = Red;' }))).toHaveLength(1);
    expect(lookProblems(pasted({ source: 'built', define: 'using HwMine = Layers<Red, White>;' }))).toEqual([]);
  });

  it('accepts every style that comes with Hiltwright', () => {
    expect(STARTER_LOOKS.flatMap((l) => lookProblems(l))).toEqual([]);
  });

  it('a template argument is one token', () => {
    expect(['NoLED', '-1', 'Color8::GRB', 'CreeXPE2WhiteTemplate<550>', 'Rgb<255,0,0>'].every(isTemplateToken)).toBe(true);
    expect(['', 'a b>', 'X // c', 'a;b', '#x', 'a, b', 'A>(), B<'].some(isTemplateToken)).toBe(false);
  });

  it('a crafted shared saber is refused on reading, and its text never reaches a config', () => {
    const crafted = { format: 'hiltwright-saber', version: 1, name: 'Evil', model: { ...good(), buttons: '2\n#define bladePowerPin2 bladePowerPin6' } };
    expect(() => readSaberShare(crafted)).toThrow('The number of buttons must be 1, 2 or 3.');
    const styled = { format: 'hiltwright-saber', version: 1, name: 'Evil', model: { ...good(), looks: [pasted({ source: 'built', define: '#define bladePin blade4Pin\nusing X = Red;' })] } };
    expect(() => readSaberShare(styled)).toThrow('holds more than a style');
    expect(() => generateConfig({ ...good(), buttons: '2\n#define x y' } as unknown as SaberConfigModel)).toThrow();
  });
});
