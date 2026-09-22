import { describe, expect, it } from 'vitest';
import { EFFECTS, TRANSITIONS, aliasFor, defaultStyle, newBlock, styleToLook, treeFromCpp, treeToLook, type ModelBlade, type SaberConfigModel } from '@hiltwright/core';
import { buildFirmware } from '../src/main/build';

// A style with every effect layer and the spark-tip ignition, through the real toolchain. Needs HILTWRIGHT_TOOLCHAIN_DIR.
const root = process.env.HILTWRIGHT_TOOLCHAIN_DIR;
const main: ModelBlade = { id: 'b1', role: 'main', type: 'pixel', pixels: 132, order: 'GRB', extra: [], leds: [], parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: ['bladePowerPin2', 'bladePowerPin3'] } };

describe.skipIf(!root)('a built style compiles', () => {
  it('every effect layer, lava base, spark ignition and centre retraction', async () => {
    const doc = defaultStyle('Everything');
    doc.base = { kind: 'lava', params: { base: '#ff1e00', alt: '#ffa000' } };
    doc.effects = EFFECTS.map(newBlock);
    doc.ignition = newBlock(TRANSITIONS.find((t) => t.kind === 'spark')!);
    doc.retraction = newBlock(TRANSITIONS.find((t) => t.kind === 'centre')!);
    const look = styleToLook(doc, 'look_everything');
    const model: SaberConfigModel = { name: 'hw_style_test', board: 'V2', buttons: 2, prop: 'sa22c', blades: [main], presets: [{ font: 'A;common', track: '', name: 'One', looks: ['look_everything'] }], looks: [look] };
    const r = await buildFirmware({ toolchainRoot: root!, saberId: 'style-test', model, force: true });
    expect(r.ok, r.problems.join(' ') + '\n' + r.output.slice(-2000)).toBe(true);
    console.log(`[style] everything: ${r.flashPct}% of V2 flash in ${(r.ms / 1000).toFixed(0)} s`);
  }, 10 * 60 * 1000);
});

describe.skipIf(!root)('a tree style compiles', () => {
  it('the responsive example from the official editor, pasted and saved as a look', async () => {
    const doc = treeFromCpp('Layers<Red, ResponsiveLockupL<White,TrInstant,TrFade<100>,Int<26000>>, ResponsiveLightningBlockL<White>, ResponsiveMeltL<Mix<TwistAngle<>,Red,Yellow>>, ResponsiveDragL<White>, ResponsiveClashL<White,TrInstant,TrFade<200>,Int<26000>>, ResponsiveBlastL<White>, ResponsiveBlastWaveL<White>, ResponsiveBlastFadeL<White>, ResponsiveStabL<White>, InOutTrL<TrWipe<300>,TrWipeIn<500>>>', 'Responsive');
    const look = treeToLook(doc, 'look_tree', aliasFor('look_tree'));
    const model: SaberConfigModel = { name: 'hw_tree_test', board: 'V2', buttons: 2, prop: 'sa22c', blades: [main], presets: [{ font: 'A;common', track: '', name: 'One', looks: ['look_tree'] }], looks: [look] };
    const r = await buildFirmware({ toolchainRoot: root!, saberId: 'tree-test', model, force: true });
    expect(r.ok, r.problems.join(' ') + '\n' + r.output.slice(-2000)).toBe(true);
    console.log(`[style] tree: ${r.flashPct}% of V2 flash in ${(r.ms / 1000).toFixed(0)} s`);
  }, 10 * 60 * 1000);
});
