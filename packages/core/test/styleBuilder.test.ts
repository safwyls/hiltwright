import { describe, expect, it } from 'vitest';
import { BASES, BladeSim, EFFECTS, TRANSITIONS, defaultStyle, generateConfig, isStyleDoc, newBlock, registerStyleSim, styleToCpp, styleToLook, styleToSim, type SaberConfigModel } from '../src';

const run = (sim: BladeSim, t0: number, t1: number) => { let f = sim.frame(t0); for (let t = t0; t <= t1; t += 1000 / 60) f = sim.frame(t); return f; };

describe('style editor model', () => {
  it('every base, effect and transition produces C++ and a simulator that runs', () => {
    for (const b of BASES) for (const tr of TRANSITIONS) {
      const doc = { ...defaultStyle('t'), base: newBlock(b), effects: EFFECTS.map(newBlock), ignition: newBlock(tr), retraction: newBlock(tr) };
      const cpp = styleToCpp(doc, 'HwT');
      expect(cpp).toMatch(/^using HwT = Layers<[\s\S]*>;$/);
      expect((cpp.match(/</g) ?? []).length).toBe((cpp.match(/>/g) ?? []).length);
      registerStyleSim('t', styleToSim(doc));
      const sim = new BladeSim('t', 40, 3);
      sim.setOn(true); sim.trigger('clash'); sim.trigger('blast'); sim.setLockup('lb');
      const f = run(sim, 0, 800);
      expect(f.every((v) => v >= 0 && v <= 1 && Number.isFinite(v)), `${b.kind} ${tr.kind}`).toBe(true);
    }
  });

  it('a built look carries its colours as live arguments, and its define reaches the config', () => {
    const doc = defaultStyle('Ember');
    doc.base = { kind: 'fire', params: { base: '#ff2000', alt: '#ffc800', speed: 7 } };
    const look = styleToLook(doc, 'look_ember');
    expect(look.code).toBe('StylePtr<Hw_look_ember>()');
    expect(look.args).toEqual(expect.arrayContaining([1, 2, 9, 10, 11, 13, 15, 16]));
    expect(look.defaults?.[1]).toBe('#ff2000');
    expect(look.preview2).toBe('#ffc800');
    expect(isStyleDoc(look.style)).toBe(true);
    const main = { id: 'b1', role: 'main' as const, type: 'pixel' as const, pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own' as const, dataPin: 'bladePin', powerPins: ['bladePowerPin2'] } };
    const model: SaberConfigModel = { name: 'hiltwright_t', board: 'V2', buttons: 2, prop: 'sa22c', blades: [main], presets: [{ font: 'A;common', track: '', name: 'One', looks: ['look_ember'] }], looks: [look] };
    const g = generateConfig(model);
    expect(g.text).toContain('using Hw_look_ember = Layers<');
    expect(g.text).toContain('StyleFire<RgbArg<BASE_COLOR_ARG, Rgb<255,32,0>>');
    expect(g.text).toContain('StylePtr<Hw_look_ember>()');
  });
});
